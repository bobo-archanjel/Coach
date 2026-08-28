-- FitPilot — demo dáta pre klientsky portál /portal (DEV).
-- Spustiť v Supabase SQL Editore PO migráciách 0001 + 0002.
-- Idempotentné: opakované spustenie nič nezduplikuje.
--
-- Čo vytvorí:
--   • demo klienta "Ján Novák" u prvého trénera v DB
--     (ak existuje profil s rolou 'client', prepojí ho cez clients.user_id — potom
--      sa tento účet po prihlásení dostane na reálny obsah /portal);
--   • aktívny plán "Silový 3× týždenne" s 3 dňami (Po / St / Pi) a cvikmi;
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
    -- doplniť prepojenie účtu, ak medzičasom pribudol klientsky profil
    update public.clients set user_id = coalesce(user_id, v_client_user) where id = v_client_id;
  end if;

  -- ---------- plán ----------
  if exists (select 1 from public.workout_plans where client_id = v_client_id and name = 'Silový 3× týždenne') then
    raise notice 'Demo plán už existuje — seed preskočený.';
    return;
  end if;

  insert into public.workout_plans (client_id, created_by, name, is_active)
  values (v_client_id, v_trainer_id, 'Silový 3× týždenne', true)
  returning id into v_plan_id;

  insert into public.workout_days (plan_id, day_number, weekday, name, focus, duration_min) values
    (v_plan_id, 1, 1, 'Deň A — Tlak', 'Horná časť — tlakové vzory', 55) returning id into v_day_a;
  insert into public.workout_days (plan_id, day_number, weekday, name, focus, duration_min) values
    (v_plan_id, 2, 3, 'Deň B — Ťah', 'Horná časť — ťahové vzory', 55) returning id into v_day_b;
  insert into public.workout_days (plan_id, day_number, weekday, name, focus, duration_min) values
    (v_plan_id, 3, 5, 'Deň C — Nohy', 'Dolná časť tela + core', 55) returning id into v_day_c;

  insert into public.workout_exercises (day_id, position, label, name, sets, reps, load, rest_seconds, tempo) values
    (v_day_a, 1, 'A1', 'Tlak s veľkou činkou v ľahu', 4, '6',  '80 kg', 150, '3-0-1'),
    (v_day_a, 2, 'A2', 'Príťahy v predklone',          4, '8',  '65 kg', 120, null),
    (v_day_a, 3, 'B1', 'Tlak jednoručiek nad hlavu',    3, '10', '22 kg', 90,  null),
    (v_day_a, 4, 'B2', 'Zhyby s dopomocou',             3, '8',  'guma',  90,  null),
    (v_day_a, 5, 'C1', 'Bicepsový zdvih',               3, '12', '14 kg', 60,  null),
    (v_day_a, 6, 'C2', 'Tricepsové sťahovanie kladky',  3, '12', '25 kg', 60,  null);

  insert into public.workout_exercises (day_id, position, label, name, sets, reps, load, rest_seconds, tempo) values
    (v_day_b, 1, 'A1', 'Mŕtvy ťah',                     3, '5',  '120 kg', 180, null),
    (v_day_b, 2, 'A2', 'Zhyby nadhmatom',               4, '6',  'vlastná váha', 120, null),
    (v_day_b, 3, 'B1', 'Veslovanie na T-tyči',          3, '10', '50 kg', 90,  null),
    (v_day_b, 4, 'B2', 'Sťahovanie hornej kladky',      3, '12', '55 kg', 75,  null),
    (v_day_b, 5, 'C1', 'Face pull',                     3, '15', '20 kg', 60,  null),
    (v_day_b, 6, 'C2', 'Kladivový zdvih',               3, '12', '12 kg', 60,  null);

  insert into public.workout_exercises (day_id, position, label, name, sets, reps, load, rest_seconds, tempo) values
    (v_day_c, 1, 'A1', 'Drep s veľkou činkou',          4, '6',  '90 kg', 150, '3-0-1'),
    (v_day_c, 2, 'A2', 'Rumunský mŕtvy ťah',            3, '8',  '100 kg', 120, null),
    (v_day_c, 3, 'B1', 'Predkopávanie na stroji',       3, '12', '45 kg', 75,  null),
    (v_day_c, 4, 'B2', 'Zakopávanie v ľahu',            3, '12', '35 kg', 75,  null),
    (v_day_c, 5, 'C1', 'Výpony na lýtka v stoji',       4, '15', '60 kg', 60,  null),
    (v_day_c, 6, 'C2', 'Plank s výdržou',               3, '45 s', 'vlastná váha', 45, null);

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
