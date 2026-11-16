-- FitPilot — porcie: množstvo × jednotka (g/ml, kus, porcia, balenie) namiesto len gramov.
-- Spustiť v Supabase Dashboard → SQL Editor → New query → vložiť celý súbor → Run.
-- Predpokladá 0005 (foods, food_logs), 0050 (source), serving_g na foods.
-- Idempotentné — dá sa spustiť opakovane (add column if not exists).
--
-- foods:
--   unit_base  — základná jednotka hodnôt na 100: 'g' (default) alebo 'ml' (nápoje, oleje).
--                Pri 'ml' sú kcal_100g/makrá na 100 ml a 1 ml sa v počítaní berie ako 1 "gram"
--                (bez prepočtu hustoty) — food_logs.grams teda pri ml potravinách nesie mililitre.
--   piece_g    — typická hmotnosť jedného kusu (jedlá časť), napr. vajce ~55, jablko ~150;
--                null = kus nedáva zmysel (mäso, ryža, múka ...). Max 5000.
--   package_g  — veľkosť celého balenia z etikety v g/ml (v jednotke unit_base), null = neznáme.
--   serving_g  — porcia z etikety (už existuje), tiež v jednotke unit_base.
--
-- food_logs:
--   portion_unit — v čom používateľ zadal množstvo: 'g' | 'ml' | 'piece' | 'serving' | 'package';
--   portion_qty  — koľko tých jednotiek (napr. 2 kusy). Null = starý záznam (zobrazí sa len grams).
--   Zdrojom pravdy ostáva food_logs.grams (kcal/makrá sa rátajú z gramov); unit/qty slúžia
--   len na zobrazenie ("2 ks" namiesto "110 g").
--
-- Jedálničky (meal_days.meals, jsonb, pozri 0005 a actions jedálnička): položky jedla majú
-- voliteľné kľúče `portion_unit`, `portion_qty` a `portion_base` s rovnakým významom. Netreba žiadne SQL —
-- chýbajúce kľúče = starý záznam (zobrazia sa gramy).
--
-- PORADIE: najprv táto migrácia, potom `node scripts/import-staples.mjs --apply`
-- (zapíše unit_base/piece_g pre základné potraviny).

alter table public.foods
  add column if not exists unit_base text not null default 'g',
  add column if not exists piece_g numeric,
  add column if not exists package_g numeric;

alter table public.foods drop constraint if exists foods_unit_base_check;
alter table public.foods add constraint foods_unit_base_check
  check (unit_base in ('g', 'ml'));

alter table public.foods drop constraint if exists foods_piece_g_check;
alter table public.foods add constraint foods_piece_g_check
  check (piece_g is null or (piece_g > 0 and piece_g <= 5000));

alter table public.foods drop constraint if exists foods_package_g_check;
alter table public.foods add constraint foods_package_g_check
  check (package_g is null or (package_g > 0 and package_g <= 5000));

alter table public.food_logs
  add column if not exists portion_unit text,
  add column if not exists portion_qty numeric,
  -- základná jednotka potraviny v čase zápisu ('g' | 'ml') — nápoj sa tak zobrazí ako
  -- "1 balenie (330 ml)", nie "(330 g)", aj keď potravina nemá riadok vo foods (offline balík)
  add column if not exists portion_base text;

alter table public.food_logs drop constraint if exists food_logs_portion_base_check;
alter table public.food_logs add constraint food_logs_portion_base_check
  check (portion_base is null or portion_base in ('g', 'ml'));

alter table public.food_logs drop constraint if exists food_logs_portion_unit_check;
alter table public.food_logs add constraint food_logs_portion_unit_check
  check (portion_unit is null or portion_unit in ('g', 'ml', 'piece', 'serving', 'package'));

alter table public.food_logs drop constraint if exists food_logs_portion_qty_check;
alter table public.food_logs add constraint food_logs_portion_qty_check
  check (portion_qty is null or (portion_qty > 0 and portion_qty <= 1000));
