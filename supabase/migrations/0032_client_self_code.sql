-- FitPilot — feature/registracia-update: obrátený model pripojenia klient↔tréner.
--
-- Doteraz: tréner vytvoril `clients` riadok a dal klientovi kód, klient si ním
-- pri registrácii "nárokoval" ten riadok (claim_client_by_invite). Klient bez
-- trénera nemal ako začať — registrácia vyžadovala kód.
--
-- Nový model: KAŽDÝ klient dostane pri registrácii vlastný `clients` riadok +
-- dlhý náhodný kód. Kód ukáže trénerovi; tréner ho zadá v "Pridať klienta"
-- (add_client_by_code) a tým sa napojí. Klient sa vie kedykoľvek odpojiť
-- (leave_trainer) bez straty vlastných dát.
--
-- Spätná kompatibilita: existujúce trénerom vytvorené riadky (majú `invite_code`
-- aj `trainer_id`) sa nemenia; starý claim_client_by_invite (0006/0029) ostáva
-- funkčný pre prípadné rozrobené registrácie.
--
-- Spustiť v Supabase Dashboard → SQL Editor → New query → vložiť celý súbor → Run.
-- Idempotentné.

-- ============================================================
--  gen_client_code() — dlhý náhodný kód, ktorý klient dáva trénerovi
-- ============================================================
-- FP-XXXXXXXXXXXXXXXXXXXX (20 hex znakov = 80 bitov). gen_random_uuid() je v
-- Supabase CSPRNG-backed; spolu s rate limitom v add_client_by_code (8 pokusov /
-- 15 min per tréner) je vyskúšanie kódov náhodne prakticky nemožné.
create or replace function public.gen_client_code()
returns text
language sql
volatile
as $$
  select 'FP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 20));
$$;

-- ============================================================
--  handle_new_user — po profile vytvorí aj "self" clients riadok pre klienta
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := coalesce(new.raw_user_meta_data ->> 'role', 'trainer');
  v_name text := new.raw_user_meta_data ->> 'full_name';
  v_display text;
  v_try int := 0;
begin
  insert into public.profiles (id, role, full_name, email)
  values (new.id, v_role, v_name, new.email)
  on conflict (id) do nothing;

  -- Klient dostane hneď vlastný riadok + kód (ak ho ešte nemá — napr. z paralelnej
  -- starej vetvy, kde ho vytvoril tréner a klient si ho nárokoval).
  if v_role = 'client' and not exists (select 1 from public.clients where user_id = new.id) then
    v_display := coalesce(nullif(btrim(v_name), ''), split_part(coalesce(new.email, 'Ja'), '@', 1));
    loop
      v_try := v_try + 1;
      begin
        insert into public.clients (trainer_id, user_id, full_name, invite_code)
        values (null, new.id, v_display, public.gen_client_code());
        exit;
      exception when unique_violation then
        if v_try >= 5 then raise; end if;
      end;
    end loop;
  end if;

  return new;
end;
$$;
-- trigger on_auth_user_created (0001) beží ďalej, netreba ho znovu vytvárať.

-- ============================================================
--  ensure_self_client — bezpečnostná sieť, teraz aj s kódom
-- ============================================================
-- Volá sa z app kódu (napr. prvý vlastný tréning). Po novom model už riadok
-- takmer vždy existuje z triggera; ak nie (starý účet), vytvorí sa aj s kódom.
create or replace function public.ensure_self_client()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_client_id uuid;
  v_role text;
  v_name text;
  v_email text;
  v_try int := 0;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select role, full_name, email into v_role, v_name, v_email from public.profiles where id = v_uid;
  if v_role is distinct from 'client' then raise exception 'not_a_client'; end if;

  select id into v_client_id from public.clients where user_id = v_uid order by created_at asc limit 1;
  if v_client_id is not null then
    -- riadok existuje, ale mohol vzniknúť pred týmto modelom bez kódu — doplň
    update public.clients set invite_code = public.gen_client_code()
    where id = v_client_id and invite_code is null;
    return v_client_id;
  end if;

  loop
    v_try := v_try + 1;
    begin
      insert into public.clients (trainer_id, user_id, full_name, invite_code)
      values (null, v_uid, coalesce(nullif(btrim(v_name), ''), split_part(coalesce(v_email, 'Ja'), '@', 1)), public.gen_client_code())
      returning id into v_client_id;
      exit;
    exception when unique_violation then
      if v_try >= 5 then raise; end if;
    end;
  end loop;

  return v_client_id;
end;
$$;

grant execute on function public.ensure_self_client() to authenticated;

-- ============================================================
--  Backfill existujúcich účtov
-- ============================================================
-- 1. klient-role profily bez žiadneho clients riadku → self riadok + kód
insert into public.clients (trainer_id, user_id, full_name, invite_code)
select null, p.id,
       coalesce(nullif(btrim(p.full_name), ''), split_part(coalesce(p.email, 'Ja'), '@', 1)),
       public.gen_client_code()
from public.profiles p
where p.role = 'client'
  and not exists (select 1 from public.clients c where c.user_id = p.id);

-- 2. ktorýkoľvek clients riadok bez kódu → doplň (staré self riadky z ensure_self_client)
update public.clients set invite_code = public.gen_client_code() where invite_code is null;

-- ============================================================
--  add_client_by_code(p_code) — tréner sa napojí na klienta podľa jeho kódu
-- ============================================================
create or replace function public.add_client_by_code(p_code text)
returns table (client_id uuid, client_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_client public.clients%rowtype;
  v_recent int;
  v_trainer_name text;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select role into v_role from public.profiles where id = v_uid;
  if v_role is distinct from 'trainer' then raise exception 'not_a_trainer'; end if;

  -- Rate limit — zdieľané počítadlo invite_claim_attempts (0029), per tréner.
  select count(*) into v_recent from public.invite_claim_attempts
  where user_id = v_uid and created_at > now() - interval '15 minutes';
  if v_recent >= 8 then raise exception 'too_many_attempts'; end if;

  select * into v_client from public.clients where invite_code = upper(btrim(p_code));

  if not found or v_client.user_id is null then
    -- neexistuje, alebo je to starý trénerom predvytvorený prázdny riadok (nie reálny účet)
    insert into public.invite_claim_attempts (user_id) values (v_uid);
    delete from public.invite_claim_attempts where created_at < now() - interval '1 day';
    raise exception 'invalid_code';
  end if;

  if v_client.trainer_id = v_uid then
    raise exception 'already_your_client';
  end if;

  if v_client.trainer_id is not null then
    raise exception 'already_has_trainer';
  end if;

  update public.clients
    set trainer_id = v_uid, ended_at = null
    where id = v_client.id;

  select full_name into v_trainer_name from public.profiles where id = v_uid;

  -- Notifikácia klientovi — systémová správa vo vlákne (jediný live kanál, appka
  -- nemá e-mail/push; rovnaký vzor ako 0019). Klient dostane aj červenú bodku na
  -- tabe Chat (portal layout počíta unread sender in ('trainer','system')).
  insert into public.messages (client_id, sender, sender_id, body)
  values (
    v_client.id, 'system', null,
    coalesce(nullif(btrim(v_trainer_name), ''), 'Tréner')
      || ' ťa pridal/-a ako svojho klienta. Ak si to neželáš, prepojenie zrušíš v Profile.'
  );

  delete from public.invite_claim_attempts where user_id = v_uid;

  return query select v_client.id, v_client.full_name;
end;
$$;

revoke execute on function public.add_client_by_code(text) from public, anon;
grant execute on function public.add_client_by_code(text) to authenticated;

-- ============================================================
--  leave_trainer() — klient sa odpojí od trénera (dáta ostávajú)
-- ============================================================
create or replace function public.leave_trainer()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_client public.clients%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select * into v_client from public.clients where user_id = v_uid order by created_at asc limit 1;
  if not found then raise exception 'no_client'; end if;
  if v_client.trainer_id is null then return; end if; -- už bez trénera, no-op

  -- Len odpojenie — vlastné plány (trainer_id null), workout_logs, body_metrics,
  -- food_logs klienta ostávajú. Trénerove plány riadok ponecháva (klient si ich
  -- drží ako históriu; tréner ich po odpojení už nevidí cez clients RLS).
  update public.clients
    set trainer_id = null, ended_at = null
    where id = v_client.id;
end;
$$;

revoke execute on function public.leave_trainer() from public, anon;
grant execute on function public.leave_trainer() to authenticated;
