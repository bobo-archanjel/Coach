-- FitPilot — food diary (Track "Klient"): čo klient reálne zjedol.
-- Spustiť v Supabase Dashboard → SQL Editor → New query → vložiť celý súbor → Run.
-- Predpokladá 0001 (clients) a 0005 (foods). Idempotentné — dá sa spustiť opakovane.
--
-- Protikus k trénerovmu jedálničku (0005: čo MÁ klient jesť) — tu je čo SKUTOČNE zjedol.
-- Makrá na 100 g sú snapshot z foods v čase zápisu (rovnaký dôvod ako food_name /
-- exercise_name v jsonb poliach: potravina sa môže neskôr zmeniť/zmazať, denník ostáva
-- historicky presný). Absolútne kcal/makrá pre gramáž sa dopočítavajú v appke (lib/meals.ts).

create table if not exists public.food_logs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  eaten_on date not null default (now() at time zone 'Europe/Bratislava')::date,
  meal_slot text not null check (meal_slot in ('ranajky', 'desiata', 'obed', 'olovrant', 'vecera', 'ine')),
  food_id uuid references public.foods (id) on delete set null,
  food_name text not null,
  grams numeric not null check (grams > 0 and grams <= 5000),
  kcal_100g numeric not null default 0 check (kcal_100g >= 0),
  protein_100g numeric not null default 0 check (protein_100g >= 0),
  carbs_100g numeric not null default 0 check (carbs_100g >= 0),
  fat_100g numeric not null default 0 check (fat_100g >= 0),
  created_at timestamptz not null default now()
);

create index if not exists food_logs_client_date_idx on public.food_logs (client_id, eaten_on desc);

-- ---------- RLS (štýl 0005_meal_plans — inline exists, auth.uid()) ----------
alter table public.food_logs enable row level security;

drop policy if exists "food_logs_select_own_client"  on public.food_logs;
drop policy if exists "food_logs_select_own_trainer" on public.food_logs;
drop policy if exists "food_logs_insert_own_client"  on public.food_logs;
drop policy if exists "food_logs_update_own_client"  on public.food_logs;
drop policy if exists "food_logs_delete_own_client"  on public.food_logs;

-- klient spravuje vlastné záznamy. Bez UPDATE policy zámerne — appka záznam nemení,
-- len pridáva/odoberá (a UPDATE bez with-check by dovolil prepísať client_id na cudzí).
create policy "food_logs_select_own_client"
  on public.food_logs for select
  using (exists (select 1 from public.clients c where c.id = food_logs.client_id and c.user_id = auth.uid()));

create policy "food_logs_insert_own_client"
  on public.food_logs for insert
  with check (exists (select 1 from public.clients c where c.id = food_logs.client_id and c.user_id = auth.uid()));

create policy "food_logs_delete_own_client"
  on public.food_logs for delete
  using (exists (select 1 from public.clients c where c.id = food_logs.client_id and c.user_id = auth.uid()));

-- tréner vidí denník svojich klientov (kontrola adherencie — read-only)
create policy "food_logs_select_own_trainer"
  on public.food_logs for select
  using (exists (select 1 from public.clients c where c.id = food_logs.client_id and c.trainer_id = auth.uid()));

-- ---------- foods: klient vidí aj vlastnú knižnicu svojho trénera ----------
-- 0005 dovoľuje vidieť len globálne (trainer_id is null) + vlastné. Klient v portáli
-- potrebuje vyhľadávať aj v potravinách, ktoré si pridal jeho tréner.
drop policy if exists "foods_select_client_of_trainer" on public.foods;
create policy "foods_select_client_of_trainer"
  on public.foods for select
  using (exists (
    select 1 from public.clients c
    where c.trainer_id = foods.trainer_id and c.user_id = auth.uid()
  ));
