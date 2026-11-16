-- FitPilot — história súhlasov s obchodnými podmienkami (feature/fixing).
-- Spustiť v Supabase Dashboard → SQL Editor → New query → vložiť celý súbor → Run.
-- Predpokladá 0063 (profiles.terms_version / terms_accepted_at, accept_terms,
-- handle_new_user so súhlasom). Idempotentné.
--
-- Problém: 0063 drží len POSLEDNÝ súhlas (accept_terms prepíše profiles.terms_version)
-- a pri zmazaní účtu zmizne s profilom aj on. Pri spore však treba vedieť preukázať, s
-- ktorou verziou podmienok používateľ súhlasil v danom období — aj po zmazaní účtu.
--
-- Teraz:
--  - public.terms_acceptances — každý súhlas jeden riadok, len pribúdajú (append-only),
--    bez FK na profiles, takže prežijú zmazanie účtu; e-mail sa ukladá ako snímka,
--  - zápis: registrácia (handle_new_user, source 'signup') a brána po prihlásení
--    (accept_terms, source 'gate'); profiles.terms_version ostáva ako rýchly „aktuálny stav“,
--  - existujúce súhlasy z profilov sa prenesú ako source 'backfill' (pre verziu 2026-09-22
--    ide o predpoklad z 0063 k dátumu registrácie, nie o zaznamenaný súhlas),
--  - pri zmazaní profilu sa záznamom nastaví account_deleted_at a po uplynutí lehoty
--    uchovania (4 roky — premlčanie v obchodných vzťahoch; overiť s právnikom) ich denný
--    cron zmaže (GDPR: obmedzenie uchovávania, čl. 17 ods. 3 písm. e) — obhajoba nárokov).
--  - tabuľka nie je prístupná z appky (žiadne RLS politiky, odobraté práva) — číta sa len
--    v SQL Editore / service_role.

create table if not exists public.terms_acceptances (
  id bigint generated always as identity primary key,
  user_id uuid not null,               -- zámerne bez FK: záznam prežije zmazanie účtu
  email text,                          -- snímka e-mailu v čase súhlasu
  version text not null check (version ~ '^\d{4}-\d{2}-\d{2}$'),
  accepted_at timestamptz not null default now(),
  source text not null check (source in ('signup', 'gate', 'backfill')),
  account_deleted_at timestamptz,      -- kedy bol účet zmazaný (od toho beží lehota uchovania)
  unique (user_id, version)            -- prvý súhlas s danou verziou je dôkaz, opakovaný netreba
);

create index if not exists terms_acceptances_deleted_idx
  on public.terms_acceptances (account_deleted_at) where account_deleted_at is not null;

alter table public.terms_acceptances enable row level security;
revoke all on public.terms_acceptances from public, anon, authenticated;

-- ---------- prenos existujúcich súhlasov ----------
insert into public.terms_acceptances (user_id, email, version, accepted_at, source)
select p.id, p.email, p.terms_version, coalesce(p.terms_accepted_at, now()), 'backfill'
from public.profiles p
where p.terms_version is not null
on conflict (user_id, version) do nothing;

-- ---------- registrácia: súhlas z metadát aj do histórie ----------
-- Celé telo z 0063 + zápis do terms_acceptances.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := coalesce(new.raw_user_meta_data ->> 'role', 'trainer');
  v_name text := new.raw_user_meta_data ->> 'full_name';
  v_locale text := case
    when new.raw_user_meta_data ->> 'locale' in ('sk', 'cs') then new.raw_user_meta_data ->> 'locale'
    else 'sk'
  end;
  -- verzia podmienok, s ktorou používateľ súhlasil pri registrácii (null = bez súhlasu, napr. Google)
  v_terms text := case
    when new.raw_user_meta_data ->> 'terms_version' ~ '^\d{4}-\d{2}-\d{2}$' then new.raw_user_meta_data ->> 'terms_version'
    else null
  end;
  v_display text;
  v_try int := 0;
begin
  insert into public.profiles (id, role, full_name, email, locale, terms_version, terms_accepted_at)
  values (new.id, v_role, v_name, new.email, v_locale, v_terms, case when v_terms is not null then now() end)
  on conflict (id) do nothing;

  if v_terms is not null then
    insert into public.terms_acceptances (user_id, email, version, source)
    values (new.id, new.email, v_terms, 'signup')
    on conflict (user_id, version) do nothing;
  end if;

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

-- ---------- súhlas po prihlásení: aktuálny stav do profilu + záznam do histórie ----------
create or replace function public.accept_terms(p_version text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if p_version is null or p_version !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'invalid_version';
  end if;

  update public.profiles
  set terms_version = p_version, terms_accepted_at = now()
  where id = auth.uid()
  returning email into v_email;

  if found then
    insert into public.terms_acceptances (user_id, email, version, source)
    values (auth.uid(), v_email, p_version, 'gate')
    on conflict (user_id, version) do nothing;
  end if;
end;
$$;

revoke execute on function public.accept_terms(text) from public, anon;
grant execute on function public.accept_terms(text) to authenticated;

-- ---------- zmazanie účtu: od tejto chvíle beží lehota uchovania ----------
create or replace function public.mark_terms_acceptances_deleted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.terms_acceptances
  set account_deleted_at = now()
  where user_id = old.id and account_deleted_at is null;
  return old;
end;
$$;

revoke execute on function public.mark_terms_acceptances_deleted() from public, anon, authenticated;

drop trigger if exists on_profile_deleted_terms on public.profiles;
create trigger on_profile_deleted_terms
  after delete on public.profiles
  for each row execute function public.mark_terms_acceptances_deleted();

-- ---------- denné čistenie po uplynutí lehoty uchovania ----------
do $$
begin
  if exists (select 1 from cron.job where jobname = 'purge-terms-acceptances-daily') then
    perform cron.unschedule('purge-terms-acceptances-daily');
  end if;
end $$;

select cron.schedule(
  'purge-terms-acceptances-daily',
  '40 3 * * *',
  $$delete from public.terms_acceptances where account_deleted_at < now() - interval '4 years'$$
);
