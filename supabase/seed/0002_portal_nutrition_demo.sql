-- FitPilot — demo dáta pre výživu klientského portálu (DEV).
-- Spustiť v Supabase SQL Editore PO migráciách 0004_nutrition, 0005_meal_plans, 0007_food_logs
-- a PO seede 0001_portal_demo.sql (potrebuje demo klienta "Ján Novák").
-- Idempotentné: makro cieľ a jedálniček sa nepridajú druhýkrát, dnešný denník sa prepíše.
--
-- Čo vytvorí pre demo klienta:
--   • makro cieľ (nutrition_profiles) — aby /portal/strava aj /portal/dennik mali oproti čomu merať;
--   • malý jedálniček (meal_plans/meal_days) — položky sa dajú rýchlo pridať do denníka;
--   • pár dnešných záznamov v food_logs — aby /portal/dennik nebol prázdny.

do $$
declare
  v_trainer_id uuid;
  v_client_id  uuid;
  v_meal_plan  uuid;
begin
  select id into v_client_id
  from public.clients
  where full_name = 'Ján Novák'
  order by created_at limit 1;

  if v_client_id is null then
    raise notice 'Preskočené: demo klient "Ján Novák" neexistuje — spusti najprv 0001_portal_demo.sql.';
    return;
  end if;

  select trainer_id into v_trainer_id from public.clients where id = v_client_id;

  -- ---------- makro cieľ ----------
  if not exists (select 1 from public.nutrition_profiles where client_id = v_client_id) then
    insert into public.nutrition_profiles (
      client_id, trainer_id, sex, age, weight_kg, height_cm, activity_level, goal,
      bmr, tdee, calories_target, protein_g, carbs_g, fat_g, notes
    ) values (
      v_client_id, v_trainer_id, 'muz', 29, 82, 182, 'stredna', 'naberanie',
      1820, 2820, 3050, 180, 340, 85, 'Demo cieľ (seed).'
    );
  end if;

  -- ---------- jedálniček (1 deň, na rýchle pridanie do denníka) ----------
  if not exists (select 1 from public.meal_plans where client_id = v_client_id) then
    insert into public.meal_plans (client_id, trainer_id, name)
    values (v_client_id, v_trainer_id, 'Naberací jedálniček')
    returning id into v_meal_plan;

    insert into public.meal_days (plan_id, day_number, name, meals)
    values (v_meal_plan, 1, 'Deň 1', jsonb_build_array(
      jsonb_build_object('entry_id', gen_random_uuid()::text, 'food_id',
        (select id from public.foods where name = 'Ovsené vločky' and trainer_id is null limit 1),
        'food_name', 'Ovsené vločky', 'meal_slot', 'ranajky', 'grams', 90,
        'kcal_100g', 375, 'protein_100g', 13, 'carbs_100g', 60, 'fat_100g', 7),
      jsonb_build_object('entry_id', gen_random_uuid()::text, 'food_id',
        (select id from public.foods where name = 'Grécky jogurt (0-2 %)' and trainer_id is null limit 1),
        'food_name', 'Grécky jogurt (0-2 %)', 'meal_slot', 'ranajky', 'grams', 200,
        'kcal_100g', 60, 'protein_100g', 9, 'carbs_100g', 4, 'fat_100g', 0.5),
      jsonb_build_object('entry_id', gen_random_uuid()::text, 'food_id',
        (select id from public.foods where name = 'Kuracie prsia (surové)' and trainer_id is null limit 1),
        'food_name', 'Kuracie prsia (surové)', 'meal_slot', 'obed', 'grams', 200,
        'kcal_100g', 110, 'protein_100g', 23, 'carbs_100g', 0, 'fat_100g', 1.5),
      jsonb_build_object('entry_id', gen_random_uuid()::text, 'food_id',
        (select id from public.foods where name = 'Ryža basmati (varená)' and trainer_id is null limit 1),
        'food_name', 'Ryža basmati (varená)', 'meal_slot', 'obed', 'grams', 250,
        'kcal_100g', 130, 'protein_100g', 2.7, 'carbs_100g', 28, 'fat_100g', 0.3),
      jsonb_build_object('entry_id', gen_random_uuid()::text, 'food_id',
        (select id from public.foods where name = 'Losos (surový)' and trainer_id is null limit 1),
        'food_name', 'Losos (surový)', 'meal_slot', 'vecera', 'grams', 180,
        'kcal_100g', 208, 'protein_100g', 20, 'carbs_100g', 0, 'fat_100g', 13),
      jsonb_build_object('entry_id', gen_random_uuid()::text, 'food_id',
        (select id from public.foods where name = 'Tvaroh (polotučný)' and trainer_id is null limit 1),
        'food_name', 'Tvaroh (polotučný)', 'meal_slot', 'vecera', 'grams', 250,
        'kcal_100g', 98, 'protein_100g', 12, 'carbs_100g', 3.5, 'fat_100g', 4.3)
    ));
  end if;

  -- ---------- dnešný denník (prepíše demo záznamy dneška, nie ručne pridané) ----------
  delete from public.food_logs
  where client_id = v_client_id
    and eaten_on = (now() at time zone 'Europe/Bratislava')::date
    and food_name in ('Ovsené vločky', 'Grécky jogurt (0-2 %)', 'Banán', 'Kuracie prsia (surové)', 'Ryža basmati (varená)', 'Brokolica (varená)');

  insert into public.food_logs (client_id, meal_slot, food_id, food_name, grams, kcal_100g, protein_100g, carbs_100g, fat_100g)
  values
    (v_client_id, 'ranajky', (select id from public.foods where name = 'Ovsené vločky' and trainer_id is null limit 1),
      'Ovsené vločky', 80, 375, 13, 60, 7),
    (v_client_id, 'ranajky', (select id from public.foods where name = 'Grécky jogurt (0-2 %)' and trainer_id is null limit 1),
      'Grécky jogurt (0-2 %)', 200, 60, 9, 4, 0.5),
    (v_client_id, 'ranajky', (select id from public.foods where name = 'Banán' and trainer_id is null limit 1),
      'Banán', 110, 89, 1.1, 23, 0.3),
    (v_client_id, 'obed', (select id from public.foods where name = 'Kuracie prsia (surové)' and trainer_id is null limit 1),
      'Kuracie prsia (surové)', 200, 110, 23, 0, 1.5),
    (v_client_id, 'obed', (select id from public.foods where name = 'Ryža basmati (varená)' and trainer_id is null limit 1),
      'Ryža basmati (varená)', 250, 130, 2.7, 28, 0.3),
    (v_client_id, 'obed', (select id from public.foods where name = 'Brokolica (varená)' and trainer_id is null limit 1),
      'Brokolica (varená)', 200, 35, 2.4, 7, 0.4);

  raise notice 'Demo výživa pre /portal vytvorená (klient %).', v_client_id;
end $$;
