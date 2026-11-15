-- FitPilot — GDPR: tréner si zmaže celý účet (feature/fixing).
-- Spustiť v Supabase Dashboard → SQL Editor → New query → vložiť celý súbor → Run.
-- Predpokladá 0018 (pg_cron, purge_deleted_clients), 0032/0036 (klient s vlastným
-- účtom = `clients` riadok s user_id), 0042 (body_metrics.trainer_id nullable). Idempotentné.
--
-- Politika (odsúhlasené 2026-11-15):
--  - tréner požiada v Nastaveniach, 30-dňová lehota, dá sa zrušiť (ako u klienta, 0018),
--  - po lehote sa zmaže CELÝ účet trénera (auth.users → profiles → všetko jeho),
--  - klienti s vlastným FitPilot účtom sa odpoja (ako leave_trainer) a ZOSTANÚ im
--    zverejnené tréningové plány a jedálničky od trénera (prevedú sa na klienta ako jeho
--    vlastné), makro cieľ aj merania; správy s trénerom sa zmažú,
--  - klienti bez účtu (záznam, ktorý vytvoril tréner) sa zmažú spolu s trénerom,
--  - koncepty (nezverejnené plány), šablóny, termíny, poznámky trénera sa zmažú.
--
-- Prečo prevod pred zmazaním: viaceré stĺpce trainer_id majú `on delete cascade` —
-- zmazanie profilu trénera by inak zmazalo aj klientov riadok (denník, tréningy),
-- jeho makro cieľ, jedálničky a plány.

alter table public.profiles
  add column if not exists deletion_requested_at timestamptz;

-- Prevod na klienta: jedálniček a makro cieľ bez trénera (ako plán bez trénera, 0010).
alter table public.meal_plans alter column trainer_id drop not null;
alter table public.nutrition_profiles alter column trainer_id drop not null;

-- ---------- systémová správa klientom trénera (text = messages/sk/system.json) ----------
create or replace function public.notify_trainer_clients(p_trainer uuid, p_body text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.messages (client_id, sender, sender_id, body)
  select c.id, 'system', null, p_body
  from public.clients c
  where c.trainer_id = p_trainer and c.user_id is not null;
$$;

revoke execute on function public.notify_trainer_clients(uuid, text) from public, anon, authenticated;

-- ---------- žiadosť o zmazanie účtu trénera ----------
create or replace function public.request_trainer_deletion()
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_name text;
  v_at timestamptz;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select role, deletion_requested_at, coalesce(nullif(btrim(full_name), ''), 'Tréner')
    into v_role, v_at, v_name
    from public.profiles where id = v_uid;
  if v_role is distinct from 'trainer' then raise exception 'not_a_trainer'; end if;

  -- idempotentné — opakovaná žiadosť lehotu nezresetuje ani znova neupozorní klientov
  if v_at is not null then return v_at; end if;

  update public.profiles set deletion_requested_at = now() where id = v_uid
    returning deletion_requested_at into v_at;

  perform public.notify_trainer_clients(
    v_uid,
    v_name || ' si o 30 dní zmaže účet vo FitPilot. Tréningové plány a jedálničky od neho ti ostanú, správy s ním sa zmažú.'
  );
  return v_at;
end;
$$;

revoke execute on function public.request_trainer_deletion() from public, anon;
grant execute on function public.request_trainer_deletion() to authenticated;

-- ---------- zrušenie žiadosti ----------
create or replace function public.cancel_trainer_deletion()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_at timestamptz;
  v_name text;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select deletion_requested_at, coalesce(nullif(btrim(full_name), ''), 'Tréner')
    into v_at, v_name
    from public.profiles where id = v_uid and role = 'trainer';
  if v_at is null then return; end if;

  update public.profiles set deletion_requested_at = null where id = v_uid;
  perform public.notify_trainer_clients(v_uid, v_name || ' zrušil/-a zmazanie účtu — spolupráca pokračuje.');
end;
$$;

revoke execute on function public.cancel_trainer_deletion() from public, anon;
grant execute on function public.cancel_trainer_deletion() to authenticated;

-- ---------- zmazanie jedného trénera (po lehote; volá purge) ----------
create or replace function public.purge_trainer(p_trainer uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  -- klienti s vlastným účtom, ktorým od trénera niečo patrí (aj tí, čo sa už odpojili)
  v_clients uuid[];
begin
  select coalesce(array_agg(c.id), '{}') into v_clients
  from public.clients c
  where c.user_id is not null
    and (
      c.trainer_id = p_trainer
      or exists (select 1 from public.workout_plans wp where wp.client_id = c.id and wp.trainer_id = p_trainer)
      or exists (select 1 from public.meal_plans mp where mp.client_id = c.id and mp.trainer_id = p_trainer)
    );

  -- 1) zverejnené plány a jedálničky → klientovi ako vlastné; koncepty zmizne kaskáda
  update public.workout_plans set trainer_id = null
    where trainer_id = p_trainer and published and client_id = any (v_clients);
  update public.meal_plans set trainer_id = null
    where trainer_id = p_trainer and published and client_id = any (v_clients);
  update public.nutrition_profiles set trainer_id = null
    where trainer_id = p_trainer and client_id = any (v_clients);
  update public.body_metrics set trainer_id = null
    where trainer_id = p_trainer and client_id = any (v_clients);

  -- 2) správy s trénerom preč (vlákno patrí klientovmu riadku, nie trénerovi)
  delete from public.messages
    where client_id in (select id from public.clients where trainer_id = p_trainer and user_id is not null);
  delete from public.coach_notes where trainer_id = p_trainer;

  -- 3) odpojenie klientov s účtom (ako leave_trainer — nový kód pre ďalšieho trénera).
  --    Žiadosť o zmazanie, ktorú podal tréner (0018), padá — inak by nočné čistenie
  --    zmazalo klientovi jeho vlastný riadok aj s denníkom a prevedenými plánmi.
  update public.clients
    set trainer_id = null,
        ended_at = null,
        invite_code = public.gen_client_code(),
        deletion_requested_at = case when deletion_requested_by = 'trainer' then null else deletion_requested_at end,
        deletion_requested_by = case when deletion_requested_by = 'trainer' then null else deletion_requested_by end
    where trainer_id = p_trainer and user_id is not null;

  -- 4) účet trénera: auth.users → profiles → kaskádou všetko ostatné trénerovo
  --    (klienti bez účtu, koncepty, šablóny, termíny, cviky, poznámky, …)
  delete from auth.users where id = p_trainer;
end;
$$;

revoke execute on function public.purge_trainer(uuid) from public, anon, authenticated;
-- E2E test (service role, len na serveri) zmaže dočasného trénera hneď, bez čakania na lehotu
grant execute on function public.purge_trainer(uuid) to service_role;

-- ---------- denné čistenie po lehote ----------
create or replace function public.purge_deleted_trainers()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  for v_id in
    select id from public.profiles
    where role = 'trainer'
      and deletion_requested_at is not null
      and deletion_requested_at < now() - interval '30 days'
  loop
    perform public.purge_trainer(v_id);
  end loop;
end;
$$;

revoke execute on function public.purge_deleted_trainers() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'purge-deleted-trainers-daily') then
    perform cron.unschedule('purge-deleted-trainers-daily');
  end if;
end $$;

select cron.schedule(
  'purge-deleted-trainers-daily',
  '15 3 * * *',
  $$select public.purge_deleted_trainers();$$
);
