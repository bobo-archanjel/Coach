-- FitPilot — dátový model klientskeho portálu /portal:
--   workout_plans → workout_days → workout_exercises, workout_logs, coach_notes.
-- Zdroj tvaru: docs/projektbrief.md (riadky 85-88). Nadväzuje na 0001_profiles_clients.sql.
-- Spustiť v Supabase Dashboard → SQL Editor → New query → vložiť celý súbor → Run.
--
-- Ak predošlý pokus spadol v polovici a tabuľky ostali v zlom stave, najprv spusti
-- tento cleanup (tabuľky sú nové, dáta v nich nie sú), potom celý súbor odznova:
--   drop table if exists public.coach_notes, public.workout_logs, public.workout_exercises,
--     public.workout_days, public.workout_plans cascade;
--   drop function if exists public.is_own_client(uuid), public.is_trainer_of_client(uuid);

-- ============================================================
--  Pomocné funkcie pre RLS (SECURITY DEFINER → neobchádzajú RLS rekurzívne cez clients)
-- ============================================================

-- Je `cid` klient, ktorého účet práve beží (klient číta vlastné dáta)?
create or replace function public.is_own_client(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.clients
    where id = cid and user_id = auth.uid()
  );
$$;

-- Je `cid` klient patriaci prihlásenému trénerovi (tréner číta aj zapisuje)?
create or replace function public.is_trainer_of_client(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.clients
    where id = cid and trainer_id = auth.uid()
  );
$$;

-- SECURITY DEFINER funkcie sprístupniť len prihláseným — anon ich nepotrebuje.
revoke execute on function public.is_own_client(uuid) from public, anon;
revoke execute on function public.is_trainer_of_client(uuid) from public, anon;
grant execute on function public.is_own_client(uuid) to authenticated;
grant execute on function public.is_trainer_of_client(uuid) to authenticated;

-- ============================================================
--  workout_plans — jeden plán priradený klientovi, spravidla jeden aktívny
-- ============================================================
create table if not exists public.workout_plans (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  created_by uuid references public.profiles (id) on delete set null,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Doplniť stĺpce, ak `workout_plans` ostala z čiastočne prebehnutého pokusu (create table sa preskočil).
alter table public.workout_plans add column if not exists created_by uuid references public.profiles (id) on delete set null;
alter table public.workout_plans add column if not exists name text;
alter table public.workout_plans add column if not exists is_active boolean not null default true;
alter table public.workout_plans add column if not exists created_at timestamptz not null default now();

create index if not exists workout_plans_client_id_idx on public.workout_plans (client_id);
-- Najviac jeden aktívny plán na klienta.
create unique index if not exists workout_plans_one_active_per_client
  on public.workout_plans (client_id) where is_active;

-- ============================================================
--  workout_days — tréningový deň v pláne (Deň A/B/C …), voliteľne pripnutý na deň týždňa
-- ============================================================
create table if not exists public.workout_days (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.workout_plans (id) on delete cascade,
  day_number smallint not null,          -- poradie v pláne
  weekday smallint check (weekday between 1 and 7),  -- 1 = Po … 7 = Ne; null = nezaradený
  name text not null,                    -- "Deň C — Nohy"
  focus text,                            -- "Dolná časť tela + core"
  duration_min smallint,                 -- odhad trvania
  created_at timestamptz not null default now()
);

create index if not exists workout_days_plan_id_idx on public.workout_days (plan_id);
create unique index if not exists workout_days_plan_weekday_idx
  on public.workout_days (plan_id, weekday) where weekday is not null;

-- ============================================================
--  workout_exercises — cviky v rámci dňa (série/opakovania/záťaž/tempo/pauza)
-- ============================================================
create table if not exists public.workout_exercises (
  id uuid primary key default gen_random_uuid(),
  day_id uuid not null references public.workout_days (id) on delete cascade,
  position smallint not null,             -- poradie v dni
  label text,                             -- "A1", "A2" (superset skupiny); voliteľné
  name text not null,
  sets smallint,
  reps text,                              -- "6", "8-10", "45 s"
  load text,                              -- "90 kg", "vlastná váha"
  rest_seconds smallint,
  tempo text,                             -- "3-0-1"
  note text
);

create index if not exists workout_exercises_day_id_idx on public.workout_exercises (day_id);

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
  entries jsonb not null default '[]'::jsonb,  -- [{exercise_id, sets:[{reps,weight}]}]
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
--  RLS
-- ============================================================
alter table public.workout_plans     enable row level security;
alter table public.workout_days      enable row level security;
alter table public.workout_exercises enable row level security;
alter table public.workout_logs      enable row level security;
alter table public.coach_notes       enable row level security;

-- ---------- workout_plans ----------
drop policy if exists "workout_plans_select"        on public.workout_plans;
drop policy if exists "workout_plans_write_trainer" on public.workout_plans;

create policy "workout_plans_select"
  on public.workout_plans for select
  to authenticated
  using (public.is_own_client(client_id) or public.is_trainer_of_client(client_id));

create policy "workout_plans_write_trainer"
  on public.workout_plans for all
  to authenticated
  using (public.is_trainer_of_client(client_id))
  with check (public.is_trainer_of_client(client_id));

-- ---------- workout_days ----------
drop policy if exists "workout_days_select"        on public.workout_days;
drop policy if exists "workout_days_write_trainer" on public.workout_days;

create policy "workout_days_select"
  on public.workout_days for select
  to authenticated
  using (exists (
    select 1 from public.workout_plans p
    where p.id = plan_id
      and (public.is_own_client(p.client_id) or public.is_trainer_of_client(p.client_id))
  ));

create policy "workout_days_write_trainer"
  on public.workout_days for all
  to authenticated
  using (exists (
    select 1 from public.workout_plans p
    where p.id = plan_id and public.is_trainer_of_client(p.client_id)
  ))
  with check (exists (
    select 1 from public.workout_plans p
    where p.id = plan_id and public.is_trainer_of_client(p.client_id)
  ));

-- ---------- workout_exercises ----------
drop policy if exists "workout_exercises_select"        on public.workout_exercises;
drop policy if exists "workout_exercises_write_trainer" on public.workout_exercises;

create policy "workout_exercises_select"
  on public.workout_exercises for select
  to authenticated
  using (exists (
    select 1 from public.workout_days d
    join public.workout_plans p on p.id = d.plan_id
    where d.id = day_id
      and (public.is_own_client(p.client_id) or public.is_trainer_of_client(p.client_id))
  ));

create policy "workout_exercises_write_trainer"
  on public.workout_exercises for all
  to authenticated
  using (exists (
    select 1 from public.workout_days d
    join public.workout_plans p on p.id = d.plan_id
    where d.id = day_id and public.is_trainer_of_client(p.client_id)
  ))
  with check (exists (
    select 1 from public.workout_days d
    join public.workout_plans p on p.id = d.plan_id
    where d.id = day_id and public.is_trainer_of_client(p.client_id)
  ));

-- ---------- workout_logs ----------
drop policy if exists "workout_logs_select"        on public.workout_logs;
drop policy if exists "workout_logs_insert_client" on public.workout_logs;
drop policy if exists "workout_logs_update_client" on public.workout_logs;
drop policy if exists "workout_logs_delete"        on public.workout_logs;

create policy "workout_logs_select"
  on public.workout_logs for select
  to authenticated
  using (public.is_own_client(client_id) or public.is_trainer_of_client(client_id));

create policy "workout_logs_insert_client"
  on public.workout_logs for insert
  to authenticated
  with check (public.is_own_client(client_id));

create policy "workout_logs_update_client"
  on public.workout_logs for update
  to authenticated
  using (public.is_own_client(client_id))
  with check (public.is_own_client(client_id));

create policy "workout_logs_delete"
  on public.workout_logs for delete
  to authenticated
  using (public.is_own_client(client_id) or public.is_trainer_of_client(client_id));

-- ---------- coach_notes ----------
drop policy if exists "coach_notes_select"        on public.coach_notes;
drop policy if exists "coach_notes_write_trainer" on public.coach_notes;

create policy "coach_notes_select"
  on public.coach_notes for select
  to authenticated
  using (public.is_own_client(client_id) or public.is_trainer_of_client(client_id));

create policy "coach_notes_write_trainer"
  on public.coach_notes for all
  to authenticated
  using (public.is_trainer_of_client(client_id))
  with check (public.is_trainer_of_client(client_id));
