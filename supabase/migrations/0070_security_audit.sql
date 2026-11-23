-- FitPilot — bezpečnostný audit (fix/mail).
-- Spustiť v Supabase Dashboard → SQL Editor → New query → vložiť celý súbor → Run.
-- Predpokladá 0002, 0003, 0005, 0007, 0010, 0021, 0044, 0048, 0049, 0061. Idempotentné.
--
-- 1) Čakacia listina (waitlist) sa ruší úplne — maže sa tabuľka waitlist_signups
--    (0038/0039/0040/0055) vrátane indexov, politík a prípadných triggerov
--    (Database Webhook na edge function send-waitlist-confirmation je trigger na tejto
--    tabuľke, takže zmizne spolu s ňou). Edge functions samotné treba zmazať ručne
--    v Supabase Dashboard → Edge Functions.
-- 2) Snapshot tréningu (workout_log_fill_snapshot) smie skopírovať len deň z plánu
--    toho istého klienta — inak klient so známym workout_day_id cudzieho plánu
--    prečítal jeho cviky z plan_snapshot.
-- 3) workout_logs: workout_day_id (ak nie je null) musí patriť plánu toho istého klienta.
-- 4) Klient vidí cez RLS len zverejnené plány (published = true) alebo vlastné
--    (trainer_id is null) — koncept trénera (0021 / 0044) sa predtým dal prečítať
--    priamo cez REST API.
-- 5) Voliteľné CHECK-y na hodnoty (NOT VALID — existujúce riadky sa nekontrolujú,
--    platia pre nové a menené).

-- ============================================================
--  1) Zrušenie čakacej listiny
-- ============================================================
drop table if exists public.waitlist_signups cascade;

-- ============================================================
--  2) Snapshot len z plánu toho istého klienta
-- ============================================================
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
        'plan_trainer_id', wp.trainer_id,
        'day_id', wd.id,
        'day_name', wd.name,
        'exercises', coalesce(wd.exercises, '[]'::jsonb),
        'backfilled', false
      )
      from public.workout_days wd
      join public.workout_plans wp on wp.id = wd.plan_id
      where wd.id = new.workout_day_id
        and wp.client_id = new.client_id
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
--  3) workout_logs.workout_day_id patrí plánu toho istého klienta
-- ============================================================
-- SECURITY DEFINER, aby kontrola nezávisela od RLS (zverejnenie plánu, krok 4) —
-- klient smie aj ďalej upraviť záznam z plánu, ktorý tréner medzitým skryl.
create or replace function public.workout_day_belongs_to_client(p_day_id uuid, p_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_day_id is null
    or exists (
      select 1
      from public.workout_days wd
      join public.workout_plans wp on wp.id = wd.plan_id
      where wd.id = p_day_id
        and wp.client_id = p_client_id
    );
$$;

revoke execute on function public.workout_day_belongs_to_client(uuid, uuid) from public, anon;
grant execute on function public.workout_day_belongs_to_client(uuid, uuid) to authenticated;

drop policy if exists "workout_logs_insert_own_client" on public.workout_logs;
create policy "workout_logs_insert_own_client"
  on public.workout_logs for insert
  with check (
    exists (
      select 1 from public.clients c
      where c.id = workout_logs.client_id and c.user_id = auth.uid()
    )
    and public.workout_day_belongs_to_client(workout_logs.workout_day_id, workout_logs.client_id)
  );

-- UPDATE: rovnaké okno ako v 0049, navyše kontrola dňa vo WITH CHECK.
drop policy if exists "workout_logs_update_own_client" on public.workout_logs;
create policy "workout_logs_update_own_client"
  on public.workout_logs for update
  using (
    (
      workout_logs.status <> 'completed'
      or workout_logs.completed_at > now() - interval '24 hours'
    )
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
    and public.workout_day_belongs_to_client(workout_logs.workout_day_id, workout_logs.client_id)
  );

-- ============================================================
--  4) Klient nevidí koncepty trénera
-- ============================================================
-- Vlastné plány klienta (trainer_id is null — 0010 / 0067) sú vždy viditeľné.
drop policy if exists "workout_plans_select_own_client" on public.workout_plans;
create policy "workout_plans_select_own_client"
  on public.workout_plans for select
  using (
    (workout_plans.published = true or workout_plans.trainer_id is null)
    and exists (
      select 1 from public.clients c
      where c.id = workout_plans.client_id
        and c.user_id = auth.uid()
    )
  );

drop policy if exists "workout_days_select_own_client" on public.workout_days;
create policy "workout_days_select_own_client"
  on public.workout_days for select
  using (
    exists (
      select 1 from public.workout_plans wp
      join public.clients c on c.id = wp.client_id
      where wp.id = workout_days.plan_id
        and (wp.published = true or wp.trainer_id is null)
        and c.user_id = auth.uid()
    )
  );

drop policy if exists "meal_plans_select_own_client" on public.meal_plans;
create policy "meal_plans_select_own_client"
  on public.meal_plans for select
  using (
    (meal_plans.published = true or meal_plans.trainer_id is null)
    and exists (
      select 1 from public.clients c
      where c.id = meal_plans.client_id
        and c.user_id = auth.uid()
    )
  );

drop policy if exists "meal_days_select_own_client" on public.meal_days;
create policy "meal_days_select_own_client"
  on public.meal_days for select
  using (
    exists (
      select 1 from public.meal_plans mp
      join public.clients c on c.id = mp.client_id
      where mp.id = meal_days.plan_id
        and (mp.published = true or mp.trainer_id is null)
        and c.user_id = auth.uid()
    )
  );

-- ============================================================
--  5) CHECK-y na rozumné hodnoty (NOT VALID)
-- ============================================================
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'clients_weight_kg_max' and conrelid = 'public.clients'::regclass) then
    alter table public.clients add constraint clients_weight_kg_max check (weight_kg is null or weight_kg <= 500) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'clients_height_cm_max' and conrelid = 'public.clients'::regclass) then
    alter table public.clients add constraint clients_height_cm_max check (height_cm is null or height_cm <= 300) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'nutrition_profiles_weight_kg_max' and conrelid = 'public.nutrition_profiles'::regclass) then
    alter table public.nutrition_profiles add constraint nutrition_profiles_weight_kg_max check (weight_kg <= 500) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'nutrition_profiles_height_cm_max' and conrelid = 'public.nutrition_profiles'::regclass) then
    alter table public.nutrition_profiles add constraint nutrition_profiles_height_cm_max check (height_cm <= 300) not valid;
  end if;
  -- food_logs.kcal_100g: aplikácia povoľuje max 900, DB necháva rezervu na zaokrúhlenie.
  if not exists (select 1 from pg_constraint where conname = 'food_logs_kcal_100g_max' and conrelid = 'public.food_logs'::regclass) then
    alter table public.food_logs add constraint food_logs_kcal_100g_max check (kcal_100g <= 1000) not valid;
  end if;
end $$;
