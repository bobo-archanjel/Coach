-- FitPilot — dokončený tréning je nemenný záznam (feature/training-done).
-- Spustiť v Supabase Dashboard → SQL Editor → New query → vložiť celý súbor → Run.
-- Predpokladá 0002/0003 (workout_plans, workout_days, workout_logs). Idempotentné.
--
-- Problém: workout_logs držal len skutočné hodnoty klienta a na plán sa odkazoval
-- cez entryId do workout_days.exercises. Keď tréner deň neskôr upravil (iná váha,
-- zmazaný cvik), porovnanie plán vs. realita pre už odcvičené tréningy sa stratilo
-- a klient aj tréner mohli zapísané výsledky ďalej meniť/mazať.
--
-- Riešenie: zamyká sa ODCVIČENÝ ZÁZNAM, nie opakujúci sa plán (deň plánu sa cvičí
-- v rotácii každý týždeň a tréner ho progresívne upravuje):
--   * status + completed_at — stav tréningu (dnes sa riadok vkladá až pri
--     "Ukončiť tréning", takže všetky existujúce záznamy sú dokončené),
--   * plan_snapshot — kópia plánu dňa v čase ukončenia (plánované hodnoty pre
--     porovnanie), vyplnená v DB triggerom, nie klientom,
--   * trigger, ktorý dokončenému záznamu zakáže UPDATE aj DELETE pre každého
--     (aj priame volanie cez Supabase / service role).

-- ============================================================
--  stĺpce
-- ============================================================
alter table public.workout_logs
  add column if not exists status text not null default 'completed',
  add column if not exists completed_at timestamptz,
  add column if not exists plan_snapshot jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'workout_logs_status_check') then
    alter table public.workout_logs
      add constraint workout_logs_status_check check (status in ('in_progress', 'completed'));
  end if;
end $$;

-- Pre porovnanie plán/realita aj zoznam "Odcvičené" v builderi (filter podľa plánu).
create index if not exists workout_logs_snapshot_plan_idx
  on public.workout_logs ((plan_snapshot ->> 'plan_id'));

-- ============================================================
--  backfill existujúcich dát (pred zapnutím zámku)
-- ============================================================
drop trigger if exists workout_logs_a_guard_completed on public.workout_logs;
drop trigger if exists workout_logs_b_snapshot on public.workout_logs;

update public.workout_logs
set completed_at = created_at
where status = 'completed' and completed_at is null;

-- Pôvodná podoba plánu sa už zistiť nedá — najlepší odhad je aktuálna verzia dňa.
-- `backfilled: true` → UI zobrazí "plán podľa aktuálnej verzie".
update public.workout_logs wl
set plan_snapshot = jsonb_build_object(
  'plan_id', wp.id,
  'plan_name', wp.name,
  'day_id', wd.id,
  'day_name', wd.name,
  'exercises', coalesce(wd.exercises, '[]'::jsonb),
  'backfilled', true
)
from public.workout_days wd
join public.workout_plans wp on wp.id = wd.plan_id
where wl.workout_day_id = wd.id
  and wl.plan_snapshot is null;

-- ============================================================
--  trigger: snapshot plánu pri dokončení
-- ============================================================
-- security definer: snapshot musí vzniknúť z autoritatívneho plánu, nie z toho,
-- čo pošle klient. Pri INSERT/prechode na 'completed' sa klientom poslaný
-- plan_snapshot aj completed_at vždy prepíšu.
create or replace function public.workout_log_fill_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'completed' and (tg_op = 'INSERT' or old.status is distinct from 'completed') then
    new.completed_at := now();
    new.plan_snapshot := (
      select jsonb_build_object(
        'plan_id', wp.id,
        'plan_name', wp.name,
        'day_id', wd.id,
        'day_name', wd.name,
        'exercises', coalesce(wd.exercises, '[]'::jsonb),
        'backfilled', false
      )
      from public.workout_days wd
      join public.workout_plans wp on wp.id = wd.plan_id
      where wd.id = new.workout_day_id
    );
  elsif tg_op = 'INSERT' then
    new.completed_at := null;
    new.plan_snapshot := null;
  end if;
  return new;
end;
$$;

revoke execute on function public.workout_log_fill_snapshot() from public, anon, authenticated;

-- ============================================================
--  trigger: dokončený záznam je nemenný
-- ============================================================
-- Dve výnimky, bez ktorých by sa rozbili existujúce toky:
--   1. zmazanie dňa/plánu → FK `on delete set null` nastaví workout_day_id na null
--      (UPDATE, pri ktorom sa nič iné nemení) — záznam aj snapshot ostávajú,
--   2. zmazanie klienta (0018 purge_deleted_clients, GDPR) → kaskádový DELETE
--      z RI triggera; pg_trigger_depth() > 1 = nie priamy príkaz používateľa.
create or replace function public.workout_log_guard_completed()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status is distinct from 'completed' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'DELETE' then
    if pg_trigger_depth() > 1 then
      return old;
    end if;
  elsif new.workout_day_id is null
    and old.workout_day_id is not null
    and (to_jsonb(new) - 'workout_day_id') = (to_jsonb(old) - 'workout_day_id') then
    return new;
  end if;

  raise exception 'locked: Dokončený tréning sa už nedá upraviť ani zmazať.'
    using errcode = '42501';
end;
$$;

revoke execute on function public.workout_log_guard_completed() from public, anon, authenticated;

-- Poradie BEFORE triggerov je abecedné: najprv zámok (a_), potom snapshot (b_).
create trigger workout_logs_a_guard_completed
  before update or delete on public.workout_logs
  for each row execute function public.workout_log_guard_completed();

create trigger workout_logs_b_snapshot
  before insert or update on public.workout_logs
  for each row execute function public.workout_log_fill_snapshot();

-- ============================================================
--  RLS — druhá vrstva: politiky na úpravu/mazanie len pre nedokončené záznamy
-- ============================================================
drop policy if exists "workout_logs_update_own_client" on public.workout_logs;
drop policy if exists "workout_logs_delete" on public.workout_logs;

create policy "workout_logs_update_own_client"
  on public.workout_logs for update
  using (
    workout_logs.status <> 'completed'
    and exists (
      select 1 from public.clients c
      where c.id = workout_logs.client_id and c.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.clients c
      where c.id = workout_logs.client_id and c.user_id = auth.uid()
    )
  );

create policy "workout_logs_delete"
  on public.workout_logs for delete
  using (
    workout_logs.status <> 'completed'
    and exists (
      select 1 from public.clients c
      where c.id = workout_logs.client_id
        and (c.user_id = auth.uid() or c.trainer_id = auth.uid())
    )
  );
