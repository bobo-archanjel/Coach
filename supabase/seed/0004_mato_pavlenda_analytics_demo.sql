-- FitPilot — demo dáta pre KOMPLETNÚ analytiku klienta "Mato Pavlenda" (DEV).
-- Spustiť v Supabase SQL Editore PO všetkých migráciách (najmä 0002_workout_builder,
-- 0003_portal_client, 0004_nutrition, 0005_meal_plans, 0007_food_logs, 0023_body_metrics).
-- Idempotentné: ak plán "Silový plán — chudnutie" pre Mata už existuje, seed sa preskočí
-- celý (rovnaký vzor ako 0001_portal_demo.sql) — bezpečné spúšťať opakovane.
--
-- Realistický 14-týždňový (98 dní) obraz klienta na chudnutí, ktorý drží tempo, ale nie
-- dokonale — presne to, čo /dashboard/analytika a /dashboard/klienti/[id] potrebujú
-- na zmysluplné percentá (nie 0 % ani 100 %):
--   • nutrition_profiles — makro cieľ na chudnutie
--   • workout_plan "Silový plán — chudnutie" (3 dni: Tlak / Ťah+Core / Nohy)
--   • workout_logs — Po/St/Pi za 14 týždňov, ~18 % dní vynechaných, progresívne
--     pribúdajúce váhy (surová báza pre "Posledné PR")
--   • body_metrics — 2× týždenne (Po/Št), váha aj obvody klesajú realisticky s šumom
--   • food_logs — posledných 30 dní, ~78 % dní zalogovaných, striedanie 4 jedálničkov
--     s jitrom v gramáži, občasný "cheat day" aj slabší deň
--   • jeden coach_note

do $$
declare
  v_trainer_id  uuid;
  v_client_id   uuid;
  v_plan_id     uuid;
  v_day_a       uuid; -- Po (weekday 1) — Tlak
  v_day_b       uuid; -- St (weekday 3) — Ťah + Core
  v_day_c       uuid; -- Pi (weekday 5) — Nohy

  v_body_start  date := current_date - interval '98 days';
  v_food_start  date := current_date - interval '30 days';
  v_end         date := current_date - interval '1 day';

  d             date;
  v_isodow      int;
  v_week_idx    int; -- 0 = najstarší týždeň … 13 = posledný

  -- per-cvik pomocné premenné pri stavbe workout_logs.entries
  v_w numeric;   -- váha na top sete
  v_r int;       -- opakovania na top sete
  v_entries jsonb;

  v_day_idx int; -- pre rotáciu jedálničkov (0..3)
  v_kcal_mult numeric; -- "cheat day" / slabý deň modifikátor gramáže
begin
  select id into v_trainer_id from public.profiles where role = 'trainer' order by created_at limit 1;
  if v_trainer_id is null then
    raise notice 'Preskočené: v DB nie je žiadny profil s rolou trainer. Zaregistruj trénera a spusti znova.';
    return;
  end if;

  -- ---------- klient ----------
  select id into v_client_id
  from public.clients
  where trainer_id = v_trainer_id and full_name = 'Mato Pavlenda'
  limit 1;

  if v_client_id is null then
    insert into public.clients (trainer_id, full_name, goal, notes, invite_code)
    values (v_trainer_id, 'Mato Pavlenda', 'Schudnúť ~5 kg a spevniť core do leta', 'Demo klient — kompletná analytika (seed).', 'DEMO-MP01')
    returning id into v_client_id;
  end if;

  if exists (select 1 from public.workout_plans where client_id = v_client_id and name = 'Silový plán — chudnutie') then
    raise notice 'Demo dáta pre Mata Pavlendu už existujú — seed preskočený.';
    return;
  end if;

  -- ---------- makro cieľ (chudnutie, Mifflin-St Jeor) ----------
  insert into public.nutrition_profiles (
    client_id, trainer_id, sex, age, weight_kg, height_cm, activity_level, goal,
    bmr, tdee, calories_target, protein_g, carbs_g, fat_g, notes
  ) values (
    v_client_id, v_trainer_id, 'muz', 34, 89, 178, 'stredna', 'chudnutie',
    1838, 2850, 2350, 180, 250, 70, 'Demo makro cieľ (seed) — deficit ~500 kcal.'
  );

  -- ---------- tréningový plán ----------
  insert into public.workout_plans (client_id, trainer_id, name)
  values (v_client_id, v_trainer_id, 'Silový plán — chudnutie')
  returning id into v_plan_id;

  insert into public.workout_days (plan_id, day_number, weekday, name, exercises)
  values (v_plan_id, 1, 1, 'Deň A — Tlak', jsonb_build_array(
    jsonb_build_object('entry_id', gen_random_uuid()::text, 'exercise_id',
      (select id from public.exercises where name = 'Bench press' and trainer_id is null limit 1),
      'exercise_name', 'Bench press', 'sets', 4, 'reps', '8', 'load_kg', 55, 'tempo', null, 'rest_seconds', 120),
    jsonb_build_object('entry_id', gen_random_uuid()::text, 'exercise_id',
      (select id from public.exercises where name = 'Veslovanie v predklone' and trainer_id is null limit 1),
      'exercise_name', 'Veslovanie v predklone', 'sets', 4, 'reps', '10', 'load_kg', 45, 'tempo', null, 'rest_seconds', 90),
    jsonb_build_object('entry_id', gen_random_uuid()::text, 'exercise_id',
      (select id from public.exercises where name = 'Tlaky nad hlavu' and trainer_id is null limit 1),
      'exercise_name', 'Tlaky nad hlavu', 'sets', 3, 'reps', '10', 'load_kg', 28, 'tempo', null, 'rest_seconds', 90),
    jsonb_build_object('entry_id', gen_random_uuid()::text, 'exercise_id',
      (select id from public.exercises where name = 'Zhyby' and trainer_id is null limit 1),
      'exercise_name', 'Zhyby', 'sets', 3, 'reps', '8', 'load_kg', null, 'tempo', null, 'rest_seconds', 90)
  ))
  returning id into v_day_a;

  insert into public.workout_days (plan_id, day_number, weekday, name, exercises)
  values (v_plan_id, 2, 3, 'Deň B — Ťah + Core', jsonb_build_array(
    jsonb_build_object('entry_id', gen_random_uuid()::text, 'exercise_id',
      (select id from public.exercises where name = 'Rumunský mŕtvy ťah' and trainer_id is null limit 1),
      'exercise_name', 'Rumunský mŕtvy ťah', 'sets', 3, 'reps', '8', 'load_kg', 75, 'tempo', null, 'rest_seconds', 120),
    jsonb_build_object('entry_id', gen_random_uuid()::text, 'exercise_id',
      (select id from public.exercises where name = 'Zhyby' and trainer_id is null limit 1),
      'exercise_name', 'Zhyby', 'sets', 4, 'reps', '6', 'load_kg', null, 'tempo', null, 'rest_seconds', 90),
    jsonb_build_object('entry_id', gen_random_uuid()::text, 'exercise_id',
      (select id from public.exercises where name = 'Veslovanie v predklone' and trainer_id is null limit 1),
      'exercise_name', 'Veslovanie v predklone', 'sets', 3, 'reps', '10', 'load_kg', 40, 'tempo', null, 'rest_seconds', 75),
    jsonb_build_object('entry_id', gen_random_uuid()::text, 'exercise_id',
      (select id from public.exercises where name = 'Plank' and trainer_id is null limit 1),
      'exercise_name', 'Plank', 'sets', 3, 'reps', '40 s', 'load_kg', null, 'tempo', null, 'rest_seconds', 45)
  ))
  returning id into v_day_b;

  insert into public.workout_days (plan_id, day_number, weekday, name, exercises)
  values (v_plan_id, 3, 5, 'Deň C — Nohy', jsonb_build_array(
    jsonb_build_object('entry_id', gen_random_uuid()::text, 'exercise_id',
      (select id from public.exercises where name = 'Drep s činkou' and trainer_id is null limit 1),
      'exercise_name', 'Drep s činkou', 'sets', 4, 'reps', '8', 'load_kg', 65, 'tempo', null, 'rest_seconds', 120),
    jsonb_build_object('entry_id', gen_random_uuid()::text, 'exercise_id',
      (select id from public.exercises where name = 'Rumunský mŕtvy ťah' and trainer_id is null limit 1),
      'exercise_name', 'Rumunský mŕtvy ťah', 'sets', 3, 'reps', '8', 'load_kg', 75, 'tempo', null, 'rest_seconds', 120),
    jsonb_build_object('entry_id', gen_random_uuid()::text, 'exercise_id',
      (select id from public.exercises where name = 'Leg extension' and trainer_id is null limit 1),
      'exercise_name', 'Leg extension', 'sets', 3, 'reps', '12', 'load_kg', 32, 'tempo', null, 'rest_seconds', 60),
    jsonb_build_object('entry_id', gen_random_uuid()::text, 'exercise_id',
      (select id from public.exercises where name = 'Bulharský drep' and trainer_id is null limit 1),
      'exercise_name', 'Bulharský drep', 'sets', 3, 'reps', '10', 'load_kg', 14, 'tempo', null, 'rest_seconds', 60),
    jsonb_build_object('entry_id', gen_random_uuid()::text, 'exercise_id',
      (select id from public.exercises where name = 'Lýtka v stoji' and trainer_id is null limit 1),
      'exercise_name', 'Lýtka v stoji', 'sets', 4, 'reps', '15', 'load_kg', 45, 'tempo', null, 'rest_seconds', 45),
    jsonb_build_object('entry_id', gen_random_uuid()::text, 'exercise_id',
      (select id from public.exercises where name = 'Plank' and trainer_id is null limit 1),
      'exercise_name', 'Plank', 'sets', 3, 'reps', '40 s', 'load_kg', null, 'tempo', null, 'rest_seconds', 45)
  ))
  returning id into v_day_c;

  -- ---------- odkaz trénera ----------
  insert into public.coach_notes (client_id, trainer_id, body)
  values (v_client_id, v_trainer_id,
    'Posledné 3 týždne vidím pekný posun na drepe aj mŕtvom ťahu — pokojne pridaj 2,5 kg budúci týždeň. Na jedálniček sa drž aj cez víkend, cez sobotu-nedeľu to zvykneš pustiť.');

  -- ---------- workout_logs: Po/St/Pi za 14 týždňov, ~18 % dní vynechaných ----------
  d := v_body_start;
  while d <= v_end loop
    v_isodow := extract(isodow from d)::int;
    if v_isodow in (1, 3, 5) and random() > 0.18 then
      v_week_idx := floor((d - v_body_start) / 7)::int;
      v_entries := '[]'::jsonb;

      if v_isodow = 1 then
        -- Deň A — Tlak
        v_w := round((55 + v_week_idx * 1.0 + (random() * 4 - 2))::numeric, 1);
        v_r := greatest(8 - (case when random() < 0.2 then 1 else 0 end), 5);
        v_entries := v_entries || jsonb_build_object('name', 'Bench press', 'sets',
          (select jsonb_agg(jsonb_build_object('reps', greatest(v_r - (case when gs > 2 then 1 else 0 end), 4), 'weight', v_w)) from generate_series(1, 4) gs));

        v_w := round((45 + v_week_idx * 0.8 + (random() * 4 - 2))::numeric, 1);
        v_entries := v_entries || jsonb_build_object('name', 'Veslovanie v predklone', 'sets',
          (select jsonb_agg(jsonb_build_object('reps', 10, 'weight', v_w)) from generate_series(1, 4) gs));

        v_w := round((28 + v_week_idx * 0.6 + (random() * 3 - 1.5))::numeric, 1);
        v_entries := v_entries || jsonb_build_object('name', 'Tlaky nad hlavu', 'sets',
          (select jsonb_agg(jsonb_build_object('reps', 10, 'weight', v_w)) from generate_series(1, 3) gs));

        v_r := 6 + least(v_week_idx / 2, 4);
        v_entries := v_entries || jsonb_build_object('name', 'Zhyby', 'sets',
          (select jsonb_agg(jsonb_build_object('reps', v_r, 'weight', null)) from generate_series(1, 3) gs));

      elsif v_isodow = 3 then
        -- Deň B — Ťah + Core
        v_w := round((75 + v_week_idx * 1.2 + (random() * 4 - 2))::numeric, 1);
        v_entries := v_entries || jsonb_build_object('name', 'Rumunský mŕtvy ťah', 'sets',
          (select jsonb_agg(jsonb_build_object('reps', 8, 'weight', v_w)) from generate_series(1, 3) gs));

        v_r := 5 + least(v_week_idx / 2, 3);
        v_entries := v_entries || jsonb_build_object('name', 'Zhyby', 'sets',
          (select jsonb_agg(jsonb_build_object('reps', v_r, 'weight', null)) from generate_series(1, 4) gs));

        v_w := round((40 + v_week_idx * 0.7 + (random() * 3 - 1.5))::numeric, 1);
        v_entries := v_entries || jsonb_build_object('name', 'Veslovanie v predklone', 'sets',
          (select jsonb_agg(jsonb_build_object('reps', 10, 'weight', v_w)) from generate_series(1, 3) gs));

        v_r := 40 + v_week_idx * 2; -- sekundy výdrže
        v_entries := v_entries || jsonb_build_object('name', 'Plank', 'sets',
          (select jsonb_agg(jsonb_build_object('reps', v_r, 'weight', null)) from generate_series(1, 3) gs));

      else
        -- Deň C — Nohy
        v_w := round((65 + v_week_idx * 1.3 + (random() * 4 - 2))::numeric, 1);
        v_entries := v_entries || jsonb_build_object('name', 'Drep s činkou', 'sets',
          (select jsonb_agg(jsonb_build_object('reps', greatest(8 - (case when random() < 0.2 then 1 else 0 end), 5), 'weight', v_w)) from generate_series(1, 4) gs));

        v_w := round((75 + v_week_idx * 1.2 + (random() * 4 - 2))::numeric, 1);
        v_entries := v_entries || jsonb_build_object('name', 'Rumunský mŕtvy ťah', 'sets',
          (select jsonb_agg(jsonb_build_object('reps', 8, 'weight', v_w)) from generate_series(1, 3) gs));

        v_w := round((32 + v_week_idx * 0.5 + (random() * 3 - 1.5))::numeric, 1);
        v_entries := v_entries || jsonb_build_object('name', 'Leg extension', 'sets',
          (select jsonb_agg(jsonb_build_object('reps', 12, 'weight', v_w)) from generate_series(1, 3) gs));

        v_w := round((14 + v_week_idx * 0.4 + (random() * 2 - 1))::numeric, 1);
        v_entries := v_entries || jsonb_build_object('name', 'Bulharský drep', 'sets',
          (select jsonb_agg(jsonb_build_object('reps', 10, 'weight', v_w)) from generate_series(1, 3) gs));

        v_w := round((45 + v_week_idx * 0.5 + (random() * 3 - 1.5))::numeric, 1);
        v_entries := v_entries || jsonb_build_object('name', 'Lýtka v stoji', 'sets',
          (select jsonb_agg(jsonb_build_object('reps', 15, 'weight', v_w)) from generate_series(1, 4) gs));

        v_r := 40 + v_week_idx * 2;
        v_entries := v_entries || jsonb_build_object('name', 'Plank', 'sets',
          (select jsonb_agg(jsonb_build_object('reps', v_r, 'weight', null)) from generate_series(1, 3) gs));
      end if;

      insert into public.workout_logs (client_id, workout_day_id, performed_on, rpe, entries)
      values (
        v_client_id,
        case v_isodow when 1 then v_day_a when 3 then v_day_b else v_day_c end,
        d,
        (6 + floor(random() * 4))::smallint, -- RPE 6-9
        v_entries
      );
    end if;
    d := d + interval '1 day';
  end loop;

  -- ---------- body_metrics: Po + Št, 98 dní, váha aj obvody klesajú s realistickým šumom ----------
  d := v_body_start;
  while d <= v_end loop
    v_isodow := extract(isodow from d)::int;
    if v_isodow in (1, 4) then
      v_week_idx := floor((d - v_body_start) / 7)::int;
      insert into public.body_metrics (client_id, trainer_id, measured_on, weight_kg, waist_cm, chest_cm, hips_cm, arm_cm, thigh_cm)
      values (
        v_client_id, v_trainer_id, d,
        round((92.5 - v_week_idx * 0.42 + (random() * 0.6 - 0.3))::numeric, 1),
        round((98 - v_week_idx * 0.5 + (random() * 0.8 - 0.4))::numeric, 1),
        round((104 - v_week_idx * 0.22 + (random() * 0.6 - 0.3))::numeric, 1),
        round((102 - v_week_idx * 0.22 + (random() * 0.6 - 0.3))::numeric, 1),
        round((38 - v_week_idx * 0.04 + (random() * 0.4 - 0.2))::numeric, 1),
        round((60 - v_week_idx * 0.15 + (random() * 0.5 - 0.25))::numeric, 1)
      )
      on conflict (client_id, measured_on) do nothing;
    end if;
    d := d + interval '1 day';
  end loop;

  -- ---------- food_logs: posledných 30 dní, ~78 % dní zalogovaných, 4 rotujúce jedálničky ----------
  d := v_food_start;
  while d <= v_end loop
    if random() > 0.22 then
      v_day_idx := extract(day from d)::int % 4;
      -- občasný slabší/silnejší deň v gramáži (realistický rozptyl, nie robotické presné čísla)
      v_kcal_mult := case
        when random() < 0.08 then 1.35  -- cheat day
        when random() < 0.15 then 0.78  -- slabší/zabudnutý obed deň
        else 0.92 + random() * 0.16
      end;

      if v_day_idx = 0 then
        -- ~2060 kcal base (pred v_kcal_mult) — ranajky+obed+večera, cieľ 2350 kcal
        insert into public.food_logs (client_id, eaten_on, meal_slot, food_id, food_name, grams, kcal_100g, protein_100g, carbs_100g, fat_100g) values
          (v_client_id, d, 'ranajky', (select id from public.foods where name = 'Ovsené vločky' and trainer_id is null limit 1), 'Ovsené vločky', round(150 * v_kcal_mult), 375, 13, 60, 7),
          (v_client_id, d, 'ranajky', (select id from public.foods where name = 'Grécky jogurt (0-2 %)' and trainer_id is null limit 1), 'Grécky jogurt (0-2 %)', round(220 * v_kcal_mult), 60, 9, 4, 0.5),
          (v_client_id, d, 'obed', (select id from public.foods where name = 'Kuracie prsia (surové)' and trainer_id is null limit 1), 'Kuracie prsia (surové)', round(260 * v_kcal_mult), 110, 23, 0, 1.5),
          (v_client_id, d, 'obed', (select id from public.foods where name = 'Ryža basmati (varená)' and trainer_id is null limit 1), 'Ryža basmati (varená)', round(320 * v_kcal_mult), 130, 2.7, 28, 0.3),
          (v_client_id, d, 'obed', (select id from public.foods where name = 'Olivový olej' and trainer_id is null limit 1), 'Olivový olej', round(12 * v_kcal_mult), 884, 0, 0, 100),
          (v_client_id, d, 'vecera', (select id from public.foods where name = 'Losos (surový)' and trainer_id is null limit 1), 'Losos (surový)', round(230 * v_kcal_mult), 208, 20, 0, 13),
          (v_client_id, d, 'vecera', (select id from public.foods where name = 'Brokolica (varená)' and trainer_id is null limit 1), 'Brokolica (varená)', round(220 * v_kcal_mult), 35, 2.4, 7, 0.4);
      elsif v_day_idx = 1 then
        -- ~2170 kcal base
        insert into public.food_logs (client_id, eaten_on, meal_slot, food_id, food_name, grams, kcal_100g, protein_100g, carbs_100g, fat_100g) values
          (v_client_id, d, 'ranajky', (select id from public.foods where name = 'Vajcia (celé)' and trainer_id is null limit 1), 'Vajcia (celé)', round(180 * v_kcal_mult), 155, 13, 1.1, 11),
          (v_client_id, d, 'ranajky', (select id from public.foods where name = 'Ovsené vločky' and trainer_id is null limit 1), 'Ovsené vločky', round(90 * v_kcal_mult), 375, 13, 60, 7),
          (v_client_id, d, 'desiata', (select id from public.foods where name = 'Banán' and trainer_id is null limit 1), 'Banán', round(180 * v_kcal_mult), 89, 1.1, 23, 0.3),
          (v_client_id, d, 'obed', (select id from public.foods where name = 'Kuracie prsia (surové)' and trainer_id is null limit 1), 'Kuracie prsia (surové)', round(300 * v_kcal_mult), 110, 23, 0, 1.5),
          (v_client_id, d, 'obed', (select id from public.foods where name = 'Ryža basmati (varená)' and trainer_id is null limit 1), 'Ryža basmati (varená)', round(450 * v_kcal_mult), 130, 2.7, 28, 0.3),
          (v_client_id, d, 'obed', (select id from public.foods where name = 'Olivový olej' and trainer_id is null limit 1), 'Olivový olej', round(15 * v_kcal_mult), 884, 0, 0, 100),
          (v_client_id, d, 'vecera', (select id from public.foods where name = 'Tvaroh (polotučný)' and trainer_id is null limit 1), 'Tvaroh (polotučný)', round(350 * v_kcal_mult), 98, 12, 3.5, 4.3);
      elsif v_day_idx = 2 then
        -- ~2080 kcal base
        insert into public.food_logs (client_id, eaten_on, meal_slot, food_id, food_name, grams, kcal_100g, protein_100g, carbs_100g, fat_100g) values
          (v_client_id, d, 'ranajky', (select id from public.foods where name = 'Ovsené vločky' and trainer_id is null limit 1), 'Ovsené vločky', round(130 * v_kcal_mult), 375, 13, 60, 7),
          (v_client_id, d, 'ranajky', (select id from public.foods where name = 'Banán' and trainer_id is null limit 1), 'Banán', round(150 * v_kcal_mult), 89, 1.1, 23, 0.3),
          (v_client_id, d, 'obed', (select id from public.foods where name = 'Losos (surový)' and trainer_id is null limit 1), 'Losos (surový)', round(220 * v_kcal_mult), 208, 20, 0, 13),
          (v_client_id, d, 'obed', (select id from public.foods where name = 'Ryža basmati (varená)' and trainer_id is null limit 1), 'Ryža basmati (varená)', round(320 * v_kcal_mult), 130, 2.7, 28, 0.3),
          (v_client_id, d, 'olovrant', (select id from public.foods where name = 'Grécky jogurt (0-2 %)' and trainer_id is null limit 1), 'Grécky jogurt (0-2 %)', round(220 * v_kcal_mult), 60, 9, 4, 0.5),
          (v_client_id, d, 'vecera', (select id from public.foods where name = 'Kuracie prsia (surové)' and trainer_id is null limit 1), 'Kuracie prsia (surové)', round(250 * v_kcal_mult), 110, 23, 0, 1.5),
          (v_client_id, d, 'vecera', (select id from public.foods where name = 'Brokolica (varená)' and trainer_id is null limit 1), 'Brokolica (varená)', round(250 * v_kcal_mult), 35, 2.4, 7, 0.4);
      else
        -- ~2020 kcal base
        insert into public.food_logs (client_id, eaten_on, meal_slot, food_id, food_name, grams, kcal_100g, protein_100g, carbs_100g, fat_100g) values
          (v_client_id, d, 'ranajky', (select id from public.foods where name = 'Vajcia (celé)' and trainer_id is null limit 1), 'Vajcia (celé)', round(150 * v_kcal_mult), 155, 13, 1.1, 11),
          (v_client_id, d, 'ranajky', (select id from public.foods where name = 'Ovsené vločky' and trainer_id is null limit 1), 'Ovsené vločky', round(100 * v_kcal_mult), 375, 13, 60, 7),
          (v_client_id, d, 'obed', (select id from public.foods where name = 'Kuracie prsia (surové)' and trainer_id is null limit 1), 'Kuracie prsia (surové)', round(330 * v_kcal_mult), 110, 23, 0, 1.5),
          (v_client_id, d, 'obed', (select id from public.foods where name = 'Ryža basmati (varená)' and trainer_id is null limit 1), 'Ryža basmati (varená)', round(400 * v_kcal_mult), 130, 2.7, 28, 0.3),
          (v_client_id, d, 'obed', (select id from public.foods where name = 'Olivový olej' and trainer_id is null limit 1), 'Olivový olej', round(15 * v_kcal_mult), 884, 0, 0, 100),
          (v_client_id, d, 'vecera', (select id from public.foods where name = 'Tvaroh (polotučný)' and trainer_id is null limit 1), 'Tvaroh (polotučný)', round(330 * v_kcal_mult), 98, 12, 3.5, 4.3),
          (v_client_id, d, 'vecera', (select id from public.foods where name = 'Brokolica (varená)' and trainer_id is null limit 1), 'Brokolica (varená)', round(150 * v_kcal_mult), 35, 2.4, 7, 0.4);
      end if;
    end if;
    d := d + interval '1 day';
  end loop;

  raise notice 'Kompletné demo dáta pre Mata Pavlendu vytvorené (klient %, plán %).', v_client_id, v_plan_id;
end $$;
