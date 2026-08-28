-- FitPilot — tréningový builder: knižnica cvikov + plány + dni s cvikmi.
-- Spustiť v Supabase Dashboard → SQL Editor → New query → vložiť celý súbor → Run.
-- Predpokladá migráciu 0001_profiles_clients.sql (profiles, clients).

-- ---------- exercises ----------
-- trainer_id = null → globálna knižnica (viditeľná pre všetkých trénerov, needitovateľná nimi).
-- trainer_id vyplnené → vlastný cvik toho trénera.
create table if not exists public.exercises (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid references public.profiles (id) on delete cascade,
  name text not null,
  muscle_group text,
  video_url text,
  description text,
  created_at timestamptz not null default now()
);

create index if not exists exercises_trainer_id_idx on public.exercises (trainer_id);

-- ---------- workout_plans ----------
create table if not exists public.workout_plans (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  trainer_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create index if not exists workout_plans_client_id_idx on public.workout_plans (client_id);
create index if not exists workout_plans_trainer_id_idx on public.workout_plans (trainer_id);

-- ---------- workout_days ----------
-- exercises: jsonb pole [{ exercise_id, exercise_name, sets, reps, load_kg, tempo, rest_seconds }, ...]
-- (denormalizované exercise_name kvôli jednoduchému zobrazeniu bez ďalšieho joinu).
create table if not exists public.workout_days (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.workout_plans (id) on delete cascade,
  day_number int not null,
  name text not null,
  exercises jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists workout_days_plan_id_idx on public.workout_days (plan_id);

-- ---------- RLS: exercises ----------
alter table public.exercises enable row level security;

create policy "exercises_select_global_or_own"
  on public.exercises for select
  using (trainer_id is null or trainer_id = auth.uid());

create policy "exercises_insert_own"
  on public.exercises for insert
  with check (trainer_id = auth.uid());

create policy "exercises_update_own"
  on public.exercises for update
  using (trainer_id = auth.uid());

create policy "exercises_delete_own"
  on public.exercises for delete
  using (trainer_id = auth.uid());

-- ---------- RLS: workout_plans ----------
alter table public.workout_plans enable row level security;

create policy "workout_plans_select_own_trainer"
  on public.workout_plans for select
  using (auth.uid() = trainer_id);

-- Vopred pripravené pre klientský portál (Track "Klient") — klient vidí vlastné plány.
create policy "workout_plans_select_own_client"
  on public.workout_plans for select
  using (
    exists (
      select 1 from public.clients c
      where c.id = workout_plans.client_id
        and c.user_id = auth.uid()
    )
  );

create policy "workout_plans_insert_own_trainer"
  on public.workout_plans for insert
  with check (auth.uid() = trainer_id);

create policy "workout_plans_update_own_trainer"
  on public.workout_plans for update
  using (auth.uid() = trainer_id);

create policy "workout_plans_delete_own_trainer"
  on public.workout_plans for delete
  using (auth.uid() = trainer_id);

-- ---------- RLS: workout_days ----------
alter table public.workout_days enable row level security;

create policy "workout_days_select_own_trainer"
  on public.workout_days for select
  using (
    exists (
      select 1 from public.workout_plans wp
      where wp.id = workout_days.plan_id
        and wp.trainer_id = auth.uid()
    )
  );

create policy "workout_days_select_own_client"
  on public.workout_days for select
  using (
    exists (
      select 1 from public.workout_plans wp
      join public.clients c on c.id = wp.client_id
      where wp.id = workout_days.plan_id
        and c.user_id = auth.uid()
    )
  );

create policy "workout_days_insert_own_trainer"
  on public.workout_days for insert
  with check (
    exists (
      select 1 from public.workout_plans wp
      where wp.id = workout_days.plan_id
        and wp.trainer_id = auth.uid()
    )
  );

create policy "workout_days_update_own_trainer"
  on public.workout_days for update
  using (
    exists (
      select 1 from public.workout_plans wp
      where wp.id = workout_days.plan_id
        and wp.trainer_id = auth.uid()
    )
  );

create policy "workout_days_delete_own_trainer"
  on public.workout_days for delete
  using (
    exists (
      select 1 from public.workout_plans wp
      where wp.id = workout_days.plan_id
        and wp.trainer_id = auth.uid()
    )
  );

-- ---------- základná globálna knižnica cvikov ----------
insert into public.exercises (trainer_id, name, muscle_group)
values
  (null, 'Drep s činkou', 'nohy'),
  (null, 'Bulharský drep', 'nohy'),
  (null, 'Rumunský mŕtvy ťah', 'zadné stehná/zadok'),
  (null, 'Bench press', 'hrudník'),
  (null, 'Tlaky nad hlavu', 'ramená'),
  (null, 'Zhyby', 'chrbát'),
  (null, 'Veslovanie v predklone', 'chrbát'),
  (null, 'Lýtka v stoji', 'lýtka'),
  (null, 'Leg extension', 'nohy'),
  (null, 'Plank', 'core')
on conflict do nothing;
