-- FitPilot — klientský portál /portal: čo klient odcvičil + odkaz trénera + rozvrh dní.
-- Spustiť v Supabase Dashboard → SQL Editor → New query → vložiť celý súbor → Run.
-- Predpokladá 0001_profiles_clients.sql a 0002_workout_builder.sql (workout_plans, workout_days).
--
-- Čisto aditívne k builderu: pridáva workout_days.weekday a dve nové tabuľky.
-- Idempotentné — dá sa spustiť opakovane.

-- ============================================================
--  workout_days.weekday — pripnutie dňa plánu na deň v týždni (portál "Dnes")
-- ============================================================
-- 1 = pondelok … 7 = nedeľa; null = deň nie je zaradený do fixného dňa v týždni.
-- Builder trénera ho zatiaľ nenastavuje (follow-up) — kým je null, portál pre daný
-- deň týždňa ukáže "voľno".
alter table public.workout_days
  add column if not exists weekday smallint check (weekday between 1 and 7);

-- ============================================================
--  workout_logs — čo klient reálne odcvičil (Fáza A: existencia záznamu = deň splnený)
-- ============================================================
create table if not exists public.workout_logs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  workout_day_id uuid references public.workout_days (id) on delete set null,
  performed_on date not null default (now() at time zone 'Europe/Bratislava')::date,
  rpe smallint check (rpe between 1 and 10),
  note text,
  entries jsonb not null default '[]'::jsonb,  -- [{entry_id, sets:[{reps,weight}]}]
  created_at timestamptz not null default now()
);

create index if not exists workout_logs_client_id_idx on public.workout_logs (client_id);
create unique index if not exists workout_logs_client_day_date_idx
  on public.workout_logs (client_id, workout_day_id, performed_on);

-- ============================================================
--  coach_notes — odkaz trénera klientovi (portál zobrazuje najnovší)
-- ============================================================
create table if not exists public.coach_notes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  trainer_id uuid references public.profiles (id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists coach_notes_client_created_idx
  on public.coach_notes (client_id, created_at desc);

-- ============================================================
--  RLS — v štýle 0002_workout_builder (inline exists, auth.uid())
-- ============================================================
alter table public.workout_logs enable row level security;
alter table public.coach_notes  enable row level security;

-- ---------- workout_logs ----------
drop policy if exists "workout_logs_select_own_trainer" on public.workout_logs;
drop policy if exists "workout_logs_select_own_client"  on public.workout_logs;
drop policy if exists "workout_logs_insert_own_client"  on public.workout_logs;
drop policy if exists "workout_logs_update_own_client"  on public.workout_logs;
drop policy if exists "workout_logs_delete"             on public.workout_logs;

create policy "workout_logs_select_own_trainer"
  on public.workout_logs for select
  using (
    exists (
      select 1 from public.clients c
      where c.id = workout_logs.client_id and c.trainer_id = auth.uid()
    )
  );

create policy "workout_logs_select_own_client"
  on public.workout_logs for select
  using (
    exists (
      select 1 from public.clients c
      where c.id = workout_logs.client_id and c.user_id = auth.uid()
    )
  );

create policy "workout_logs_insert_own_client"
  on public.workout_logs for insert
  with check (
    exists (
      select 1 from public.clients c
      where c.id = workout_logs.client_id and c.user_id = auth.uid()
    )
  );

create policy "workout_logs_update_own_client"
  on public.workout_logs for update
  using (
    exists (
      select 1 from public.clients c
      where c.id = workout_logs.client_id and c.user_id = auth.uid()
    )
  );

create policy "workout_logs_delete"
  on public.workout_logs for delete
  using (
    exists (
      select 1 from public.clients c
      where c.id = workout_logs.client_id
        and (c.user_id = auth.uid() or c.trainer_id = auth.uid())
    )
  );

-- ---------- coach_notes ----------
drop policy if exists "coach_notes_select_own_trainer" on public.coach_notes;
drop policy if exists "coach_notes_select_own_client"  on public.coach_notes;
drop policy if exists "coach_notes_insert_own_trainer" on public.coach_notes;
drop policy if exists "coach_notes_update_own_trainer" on public.coach_notes;
drop policy if exists "coach_notes_delete_own_trainer" on public.coach_notes;

create policy "coach_notes_select_own_trainer"
  on public.coach_notes for select
  using (auth.uid() = trainer_id);

create policy "coach_notes_select_own_client"
  on public.coach_notes for select
  using (
    exists (
      select 1 from public.clients c
      where c.id = coach_notes.client_id and c.user_id = auth.uid()
    )
  );

create policy "coach_notes_insert_own_trainer"
  on public.coach_notes for insert
  with check (
    auth.uid() = trainer_id
    and exists (
      select 1 from public.clients c
      where c.id = coach_notes.client_id and c.trainer_id = auth.uid()
    )
  );

create policy "coach_notes_update_own_trainer"
  on public.coach_notes for update
  using (auth.uid() = trainer_id);

create policy "coach_notes_delete_own_trainer"
  on public.coach_notes for delete
  using (auth.uid() = trainer_id);
