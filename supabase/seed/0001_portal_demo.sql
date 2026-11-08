-- FitPilot — demo dáta pre klientský portál /portal (DEV).
-- Spustiť v Supabase SQL Editore PO migráciách 0001, 0002_workout_builder, 0003_portal_client.
-- Idempotentné: opakované spustenie nič nezduplikuje.
--
-- Čo vytvorí:
--   • demo klienta "Ján Novák" u prvého trénera v DB (ak existuje profil s rolou
--     'client', prepojí ho cez clients.user_id — potom sa tento účet po prihlásení
--     dostane na reálny obsah /portal);
--   • plán "Silový 3× týždenne" s 3 dňami (Po / St / Pi, weekday nastavený) a cvikmi
--     (JSONB v workout_days.exercises, ako ich píše builder);
--   • odkaz trénera;
--   • workout_logs pre všetky Po/St/Pi za posledné 3 týždne (okrem dneška) → séria.

do $$
declare
  v_trainer_id  uuid;
  v_client_user uuid;
  v_client_id   uuid;
  v_plan_id     uuid;
  v_day_a       uuid;
  v_day_b       uuid;
  v_day_c       uuid;
begin
  select id into v_trainer_id from public.profiles where role = 'trainer' order by created_at limit 1;
  if v_trainer_id is null then
    raise notice 'Preskočené: v DB nie je žiadny profil s rolou trainer. Zaregistruj trénera a spusti znova.';
    return;
  end if;

  select id into v_client_user from public.profiles where role = 'client' order by created_at limit 1;

  -- ---------- demo klient ----------
  select id into v_client_id
  from public.clients
  where trainer_id = v_trainer_id and full_name = 'Ján Novák'
  limit 1;

  if v_client_id is null then
    insert into public.clients (trainer_id, user_id, full_name, goal, notes, invite_code)
    values (v_trainer_id, v_client_user, 'Ján Novák', 'Nabrať silu a 3 kg svalov', 'Demo klient (seed).', 'DEMO-JN01')
    returning id into v_client_id;
  else
    update public.clients set user_id = coalesce(user_id, v_client_user) where id = v_client_id;
  end if;

  -- ---------- plán ----------
  if exists (select 1 from public.workout_plans where client_id = v_client_id and name = 'Silový 3× týždenne') then
    raise notice 'Demo plán už existuje — seed preskočený.';
    return;
  end if;

  insert into public.workout_plans (client_id, trainer_id, name)
  values (v_client_id, v_trainer_id, 'Silový 3× týždenne')
  returning id into v_plan_id;

  insert into public.workout_days (plan_id, day_number, weekday, name, exercises)
  values (v_plan_id, 1, 1, 'Deň A — Tlak', jsonb_build_array(
    jsonb_build_object('entry_id', gen_random_uuid()::text, 'exercise_id',
      (select id from public.exercises where name = 'Bench press' and trainer_id is null limit 1),
      'exercise_name', 'Bench press', 'sets', 4, 'reps', '6', 'load_kg', 80, 'tempo', '3-0-1', 'rest_seconds', 150),
    jsonb_build_object('entry_id', gen_random_uuid()::text, 'exercise_id',
      (select id from public.exercises where name = 'Veslovanie v predklone' and trainer_id is null limit 1),
      'exercise_name', 'Veslovanie v predklone', 'sets', 4, 'reps', '8', 'load_kg', 65, 'tempo', null, 'rest_seconds', 120),
    jsonb_build_object('entry_id', gen_random_uuid()::text, 'exercise_id',
      (select id from public.exercises where name = 'Tlaky nad hlavu' and trainer_id is null limit 1),
      'exercise_name', 'Tlaky nad hlavu', 'sets', 3, 'reps', '10', 'load_kg', 40, 'tempo', null, 'rest_seconds', 90),
    jsonb_build_object('entry_id', gen_random_uuid()::text, 'exercise_id',
      (select id from public.exercises where name = 'Zhyby' and trainer_id is null limit 1),
      'exercise_name', 'Zhyby', 'sets', 3, 'reps', '8', 'load_kg', null, 'tempo', null, 'rest_seconds', 90)
  ))
  returning id into v_day_a;

  insert into public.workout_days (plan_id, day_number, weekday, name, exercises)
  values (v_plan_id, 2, 3, 'Deň B — Ťah', jsonb_build_array(
    jsonb_build_object('entry_id', gen_random_uuid()::text, 'exercise_id',
      (select id from public.exercises where name = 'Rumunský mŕtvy ťah' and trainer_id is null limit 1),
      'exercise_name', 'Rumunský mŕtvy ťah', 'sets', 3, 'reps', '8', 'load_kg', 100, 'tempo', null, 'rest_seconds', 150),
    jsonb_build_object('entry_id', gen_random_uuid()::text, 'exercise_id',
      (select id from public.exercises where name = 'Zhyby' and trainer_id is null limit 1),
      'exercise_name', 'Zhyby', 'sets', 4, 'reps', '6', 'load_kg', null, 'tempo', null, 'rest_seconds', 120),
    jsonb_build_object('entry_id', gen_random_uuid()::text, 'exercise_id',
      (select id from public.exercises where name = 'Veslovanie v predklone' and trainer_id is null limit 1),
      'exercise_name', 'Veslovanie v predklone', 'sets', 3, 'reps', '10', 'load_kg', 55, 'tempo', null, 'rest_seconds', 90)
  ))
  returning id into v_day_b;

  insert into public.workout_days (plan_id, day_number, weekday, name, exercises)
  values (v_plan_id, 3, 5, 'Deň C — Nohy', jsonb_build_array(
    jsonb_build_object('entry_id', gen_random_uuid()::text, 'exercise_id',
      (select id from public.exercises where name = 'Drep s činkou' and trainer_id is null limit 1),
      'exercise_name', 'Drep s činkou', 'sets', 4, 'reps', '6', 'load_kg', 90, 'tempo', '3-0-1', 'rest_seconds', 150),
    jsonb_build_object('entry_id', gen_random_uuid()::text, 'exercise_id',
      (select id from public.exercises where name = 'Rumunský mŕtvy ťah' and trainer_id is null limit 1),
      'exercise_name', 'Rumunský mŕtvy ťah', 'sets', 3, 'reps', '8', 'load_kg', 100, 'tempo', null, 'rest_seconds', 120),
    jsonb_build_object('entry_id', gen_random_uuid()::text, 'exercise_id',
      (select id from public.exercises where name = 'Leg extension' and trainer_id is null limit 1),
      'exercise_name', 'Leg extension', 'sets', 3, 'reps', '12', 'load_kg', 45, 'tempo', null, 'rest_seconds', 75),
    jsonb_build_object('entry_id', gen_random_uuid()::text, 'exercise_id',
      (select id from public.exercises where name = 'Bulharský drep' and trainer_id is null limit 1),
      'exercise_name', 'Bulharský drep', 'sets', 3, 'reps', '10', 'load_kg', 20, 'tempo', null, 'rest_seconds', 75),
    jsonb_build_object('entry_id', gen_random_uuid()::text, 'exercise_id',
      (select id from public.exercises where name = 'Lýtka v stoji' and trainer_id is null limit 1),
      'exercise_name', 'Lýtka v stoji', 'sets', 4, 'reps', '15', 'load_kg', 60, 'tempo', null, 'rest_seconds', 60),
    jsonb_build_object('entry_id', gen_random_uuid()::text, 'exercise_id',
      (select id from public.exercises where name = 'Plank' and trainer_id is null limit 1),
      'exercise_name', 'Plank', 'sets', 3, 'reps', '45 s', 'load_kg', null, 'tempo', null, 'rest_seconds', 45)
  ))
  returning id into v_day_c;

  -- ---------- odkaz trénera ----------
  insert into public.coach_notes (client_id, trainer_id, body)
  values (v_client_id, v_trainer_id,
    'Dnes ide o techniku, nie o váhu — pri drepe drž tempo 3 s dole a kontrolu v spodnej polohe. Ak koleno pri RDL tlačí, zníž záťaž o 10 kg a napíš mi.');

  -- ---------- história tréningov → séria ----------
  insert into public.workout_logs (client_id, workout_day_id, performed_on, rpe)
  select
    v_client_id,
    case extract(isodow from g)::int when 1 then v_day_a when 3 then v_day_b when 5 then v_day_c end,
    g::date,
    7
  from generate_series(current_date - interval '21 days', current_date - interval '1 day', interval '1 day') g
  where extract(isodow from g)::int in (1, 3, 5);

  raise notice 'Demo dáta pre /portal vytvorené (klient %, plán %).', v_client_id, v_plan_id;
end $$;
