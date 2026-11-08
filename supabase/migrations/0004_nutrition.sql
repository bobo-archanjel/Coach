-- FitPilot — nutričný modul: BMR/TDEE výpočet + makro cieľ priradený klientovi.
-- Spustiť v Supabase Dashboard → SQL Editor → New query → vložiť celý súbor → Run.
-- Predpokladá migráciu 0001_profiles_clients.sql (profiles, clients).
-- Číslovanie: 0003 je rezervované pre klientský portál (Track "Klient", kolega).

-- ---------- nutrition_profiles ----------
-- Jeden aktuálny profil na klienta (unique client_id) — tréner ho prepočíta/upraví
-- podľa potreby, história zmien sa zatiaľ nesleduje (updated_at stačí pre MVP).
-- bmr/tdee/calories_target/makrá sú dopočítané v aplikácii (Mifflin-St Jeor) a uložené
-- spolu so vstupmi, aby tréner videl výsledok bez prepočtu a mohol si ho ručne prebiť.
create table if not exists public.nutrition_profiles (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null unique references public.clients (id) on delete cascade,
  trainer_id uuid not null references public.profiles (id) on delete cascade,
  sex text not null check (sex in ('muz', 'zena')),
  age int not null check (age > 0 and age < 120),
  weight_kg numeric not null check (weight_kg > 0),
  height_cm numeric not null check (height_cm > 0),
  activity_level text not null check (
    activity_level in ('sedavy', 'lahka', 'stredna', 'vysoka', 'velmi_vysoka')
  ),
  goal text not null check (goal in ('chudnutie', 'udrzanie', 'naberanie')),
  bmr numeric not null,
  tdee numeric not null,
  calories_target numeric not null,
  protein_g numeric not null,
  carbs_g numeric not null,
  fat_g numeric not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists nutrition_profiles_trainer_id_idx on public.nutrition_profiles (trainer_id);

-- ---------- updated_at trigger ----------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists nutrition_profiles_set_updated_at on public.nutrition_profiles;
create trigger nutrition_profiles_set_updated_at
  before update on public.nutrition_profiles
  for each row execute function public.set_updated_at();

-- ---------- RLS: nutrition_profiles ----------
alter table public.nutrition_profiles enable row level security;

create policy "nutrition_profiles_select_own_trainer"
  on public.nutrition_profiles for select
  using (auth.uid() = trainer_id);

-- Vopred pripravené pre klientský portál (Track "Klient") — klient vidí vlastný profil.
create policy "nutrition_profiles_select_own_client"
  on public.nutrition_profiles for select
  using (
    exists (
      select 1 from public.clients c
      where c.id = nutrition_profiles.client_id
        and c.user_id = auth.uid()
    )
  );

create policy "nutrition_profiles_insert_own_trainer"
  on public.nutrition_profiles for insert
  with check (auth.uid() = trainer_id);

create policy "nutrition_profiles_update_own_trainer"
  on public.nutrition_profiles for update
  using (auth.uid() = trainer_id);

create policy "nutrition_profiles_delete_own_trainer"
  on public.nutrition_profiles for delete
  using (auth.uid() = trainer_id);
