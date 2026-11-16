-- FitPilot — tréner klienta s vlastným účtom nezmaže, len odstráni z portfólia
-- (feature/premenovanie-sekcii). Spustiť v Supabase Dashboard → SQL Editor → New query →
-- vložiť celý súbor → Run. Predpokladá 0019 (request_client_deletion so správou),
-- 0020 (ended_at / ended_notice_dismissed_at), 0062 (meal_plans / nutrition_profiles
-- trainer_id nullable). Idempotentné.
--
-- Problém: zmazanie klienta (0018) maže celý `clients` riadok. Od 0032 si však klient
-- zakladá účet sám a v tom istom riadku sú JEHO dáta — zápis jedla, vlastné tréningy,
-- merania. Tréner tak vedel klientovi vymazať jeho vlastné dáta (právo na výmaz patrí
-- klientovi, nie trénerovi).
--
-- Teraz (odsúhlasené 2026-11-16):
--  - klient BEZ účtu (záznam trénera): zmazanie ako doteraz (30 dní, dá sa zrušiť),
--  - klient S účtom: tréner ho len odstráni z portfólia (remove_client_from_portfolio) —
--    klient sa odpojí a zostanú mu zverejnené plány a jedálničky (prevedené na neho),
--    makro cieľ, merania, zápis jedla aj vlastné tréningy; zmažú sa len trénerove veci k
--    nemu (koncepty, poznámky, správy, termíny). Na karte Dnes uvidí upozornenie.
--  - Klient si svoje dáta zmaže sám v Profile (request_client_deletion ako klient — bez zmeny).

-- ---------- odstránenie z portfólia (tréner, klient s účtom) ----------
create or replace function public.remove_client_from_portfolio(p_client_id uuid)
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
  select * into v_client from public.clients where id = p_client_id and trainer_id = v_uid;
  if not found then raise exception 'not_your_client'; end if;
  if v_client.user_id is null then raise exception 'client_has_no_account'; end if;

  -- zverejnené plány a jedálničky → klientovi ako vlastné (ako pri zmazaní účtu trénera, 0062)
  update public.workout_plans set trainer_id = null
    where client_id = p_client_id and trainer_id = v_uid and published;
  update public.meal_plans set trainer_id = null
    where client_id = p_client_id and trainer_id = v_uid and published;
  update public.nutrition_profiles set trainer_id = null
    where client_id = p_client_id and trainer_id = v_uid;
  update public.body_metrics set trainer_id = null
    where client_id = p_client_id and trainer_id = v_uid;

  -- trénerove veci k tomuto klientovi
  delete from public.workout_plans where client_id = p_client_id and trainer_id = v_uid;  -- koncepty
  delete from public.meal_plans where client_id = p_client_id and trainer_id = v_uid;     -- koncepty
  delete from public.messages where client_id = p_client_id;
  delete from public.coach_notes where client_id = p_client_id and trainer_id = v_uid;
  delete from public.trainer_private_notes where client_id = p_client_id and trainer_id = v_uid;
  delete from public.appointments where client_id = p_client_id and trainer_id = v_uid;
  delete from public.plan_recipients where client_id = p_client_id and trainer_id = v_uid;
  delete from public.client_health_snapshots where client_id = p_client_id and trainer_id = v_uid;

  -- odpojenie (ako leave_trainer — nový kód pre ďalšieho trénera); ended_at zobrazí
  -- klientovi na karte Dnes upozornenie „Tréner ťa odstránil zo svojho portfólia“
  update public.clients
    set trainer_id = null,
        ended_at = now(),
        ended_notice_dismissed_at = null,
        invite_code = public.gen_client_code(),
        deletion_requested_at = null,
        deletion_requested_by = null
    where id = p_client_id;
end;
$$;

revoke execute on function public.remove_client_from_portfolio(uuid) from public, anon;
grant execute on function public.remove_client_from_portfolio(uuid) to authenticated;

-- ---------- žiadosť o zmazanie: tréner len pri klientovi bez účtu ----------
create or replace function public.request_client_deletion(p_client_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  select case
    when exists (select 1 from public.clients where id = p_client_id and trainer_id = auth.uid()) then 'trainer'
    when exists (select 1 from public.clients where id = p_client_id and user_id = auth.uid()) then 'client'
    else null
  end into v_role;

  if v_role is null then
    raise exception 'Nemáš prístup k tomuto klientovi.';
  end if;

  -- klient s vlastným účtom: jeho dáta môže zmazať len on sám (Profil) — tréner ho
  -- odstráni z portfólia (remove_client_from_portfolio)
  if v_role = 'trainer' and exists (select 1 from public.clients where id = p_client_id and user_id is not null) then
    raise exception 'client_has_account';
  end if;

  -- idempotentné — ak už žiadosť beží, nezresetuje sa 30-dňová lehota druhou stranou
  -- (a nepošle sa duplicitná správa)
  update public.clients
    set deletion_requested_at = now(), deletion_requested_by = v_role
    where id = p_client_id
      and deletion_requested_at is null;

  if found then
    insert into public.messages (client_id, sender, sender_id, body)
    values (
      p_client_id,
      'system',
      null,
      case v_role
        when 'trainer' then 'Tréner ťa odstránil z portfólia. Tvoje tréningy, výživa, denník aj správy sa natrvalo vymažú o 30 dní, pokiaľ zmazanie nezruší.'
        else 'Požiadal/a si o zmazanie svojich dát. Vymažú sa o 30 dní, pokiaľ zmazanie nezrušíš v Profile.'
      end
    );
  end if;
end;
$$;

revoke execute on function public.request_client_deletion(uuid) from public, anon;
grant execute on function public.request_client_deletion(uuid) to authenticated;

-- ---------- nočné čistenie: nikdy nezmaže riadok klienta s účtom na žiadosť trénera ----------
create or replace function public.purge_deleted_clients()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.clients
  where deletion_requested_at is not null
    and deletion_requested_at < now() - interval '30 days'
    and (user_id is null or deletion_requested_by = 'client');
end;
$$;

revoke execute on function public.purge_deleted_clients() from public, anon, authenticated;

-- ---------- čakajúce žiadosti trénera pri klientoch s účtom: zrušiť ----------
-- (pri spustení 2026-11-16 jedna — testovací klient bez tréningov a zápisov jedla).
-- Dáta ostanú, tréner môže klienta odstrániť z portfólia novým tlačidlom. Do vlákna
-- rovnaká správa ako pri zrušení (system.json deletionCancelled), nech v chate neostane
-- zastarané „vymažú sa o 30 dní“.
insert into public.messages (client_id, sender, sender_id, body)
select id, 'system', null, 'Zmazanie bolo zrušené — dáta ostávajú zachované.'
from public.clients
where deletion_requested_by = 'trainer' and user_id is not null;

update public.clients
  set deletion_requested_at = null, deletion_requested_by = null
  where deletion_requested_by = 'trainer' and user_id is not null;
