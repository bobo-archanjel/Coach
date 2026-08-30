-- FitPilot — jedálničky: knižnica potravín + plány + dni s jedlami.
-- Spustiť v Supabase Dashboard → SQL Editor → New query → vložiť celý súbor → Run.
-- Predpokladá migrácie 0001 (profiles, clients) a 0004 (nutrition_profiles, len kontextovo).
-- Architektúra 1:1 kopíruje 0002_workout_builder.sql (knižnica + plány + dni s jsonb poľom),
-- len pre potraviny namiesto cvikov.

-- ---------- foods ----------
-- trainer_id = null → globálna knižnica potravín (rovnaké pravidlo ako exercises).
-- Makrá sú na 100 g, aby sa dali prepočítať na ľubovoľnú gramáž pri pridaní do dňa.
create table if not exists public.foods (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid references public.profiles (id) on delete cascade,
  name text not null,
  kcal_100g numeric not null check (kcal_100g >= 0),
  protein_100g numeric not null check (protein_100g >= 0),
  carbs_100g numeric not null check (carbs_100g >= 0),
  fat_100g numeric not null check (fat_100g >= 0),
  created_at timestamptz not null default now()
);

create index if not exists foods_trainer_id_idx on public.foods (trainer_id);

-- ---------- meal_plans ----------
create table if not exists public.meal_plans (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  trainer_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create index if not exists meal_plans_client_id_idx on public.meal_plans (client_id);
create index if not exists meal_plans_trainer_id_idx on public.meal_plans (trainer_id);

-- ---------- meal_days ----------
-- meals: jsonb pole [{ entry_id, food_id, food_name, meal_slot, grams,
--   kcal_100g, protein_100g, carbs_100g, fat_100g }, ...]
-- Makrá na 100g sú snapshot z foods v čase pridania (rovnaký dôvod ako exercise_name
-- vo workout_days — food sa môže neskôr zmeniť/zmazať, plán ostáva historicky presný).
-- Absolútne kcal/makrá pre danú gramáž sa dopočítavajú v aplikácii (lib/meals.ts),
-- nie sú duplicitne uložené.
create table if not exists public.meal_days (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.meal_plans (id) on delete cascade,
  day_number int not null,
  name text not null,
  meals jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists meal_days_plan_id_idx on public.meal_days (plan_id);

-- ---------- RLS: foods ----------
alter table public.foods enable row level security;

create policy "foods_select_global_or_own"
  on public.foods for select
  using (trainer_id is null or trainer_id = auth.uid());

create policy "foods_insert_own"
  on public.foods for insert
  with check (trainer_id = auth.uid());

create policy "foods_update_own"
  on public.foods for update
  using (trainer_id = auth.uid());

create policy "foods_delete_own"
  on public.foods for delete
  using (trainer_id = auth.uid());

-- ---------- RLS: meal_plans ----------
alter table public.meal_plans enable row level security;

create policy "meal_plans_select_own_trainer"
  on public.meal_plans for select
  using (auth.uid() = trainer_id);

-- Vopred pripravené pre klientský portál (Track "Klient") — klient vidí vlastné plány.
create policy "meal_plans_select_own_client"
  on public.meal_plans for select
  using (
    exists (
      select 1 from public.clients c
      where c.id = meal_plans.client_id
        and c.user_id = auth.uid()
    )
  );

create policy "meal_plans_insert_own_trainer"
  on public.meal_plans for insert
  with check (auth.uid() = trainer_id);

create policy "meal_plans_update_own_trainer"
  on public.meal_plans for update
  using (auth.uid() = trainer_id);

create policy "meal_plans_delete_own_trainer"
  on public.meal_plans for delete
  using (auth.uid() = trainer_id);

-- ---------- RLS: meal_days ----------
alter table public.meal_days enable row level security;

create policy "meal_days_select_own_trainer"
  on public.meal_days for select
  using (
    exists (
      select 1 from public.meal_plans mp
      where mp.id = meal_days.plan_id
        and mp.trainer_id = auth.uid()
    )
  );

create policy "meal_days_select_own_client"
  on public.meal_days for select
  using (
    exists (
      select 1 from public.meal_plans mp
      join public.clients c on c.id = mp.client_id
      where mp.id = meal_days.plan_id
        and c.user_id = auth.uid()
    )
  );

create policy "meal_days_insert_own_trainer"
  on public.meal_days for insert
  with check (
    exists (
      select 1 from public.meal_plans mp
      where mp.id = meal_days.plan_id
        and mp.trainer_id = auth.uid()
    )
  );

create policy "meal_days_update_own_trainer"
  on public.meal_days for update
  using (
    exists (
      select 1 from public.meal_plans mp
      where mp.id = meal_days.plan_id
        and mp.trainer_id = auth.uid()
    )
  );

create policy "meal_days_delete_own_trainer"
  on public.meal_days for delete
  using (
    exists (
      select 1 from public.meal_plans mp
      where mp.id = meal_days.plan_id
        and mp.trainer_id = auth.uid()
    )
  );

-- ---------- základná globálna knižnica potravín (makrá na 100 g) ----------
insert into public.foods (trainer_id, name, kcal_100g, protein_100g, carbs_100g, fat_100g)
values
  (null, 'Kuracie prsia (surové)', 110, 23, 0, 1.5),
  (null, 'Ryža basmati (varená)', 130, 2.7, 28, 0.3),
  (null, 'Ovsené vločky', 375, 13, 60, 7),
  (null, 'Vajcia (celé)', 155, 13, 1.1, 11),
  (null, 'Grécky jogurt (0-2 %)', 60, 9, 4, 0.5),
  (null, 'Banán', 89, 1.1, 23, 0.3),
  (null, 'Olivový olej', 884, 0, 0, 100),
  (null, 'Tvaroh (polotučný)', 98, 12, 3.5, 4.3),
  (null, 'Brokolica (varená)', 35, 2.4, 7, 0.4),
  (null, 'Losos (surový)', 208, 20, 0, 13)
on conflict do nothing;
