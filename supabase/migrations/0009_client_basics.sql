-- FitPilot — základné telesné údaje klienta (vek/váha/výška) priamo na `clients`.
-- Spustiť v Supabase Dashboard → SQL Editor → New query → vložiť celý súbor → Run.
-- Predpokladá migráciu 0001_profiles_clients.sql (clients).
--
-- Voliteľné polia vypĺňané už pri "Pridať klienta" (rýchly základ, bez nutnosti
-- prejsť celý nutričný formulár) — nenahrádzajú `nutrition_profiles`
-- (0004_nutrition.sql), ktorý má vlastné age/weight_kg/height_cm potrebné pre
-- BMR/TDEE výpočet spolu s pohlavím/aktivitou/cieľom a je striktne povinný a
-- validovaný. Tu sú polia voliteľné a slúžia len ako základný prehľad o klientovi.

alter table public.clients
  add column if not exists age int check (age is null or (age > 0 and age < 120)),
  add column if not exists weight_kg numeric check (weight_kg is null or weight_kg > 0),
  add column if not exists height_cm numeric check (height_cm is null or height_cm > 0);
