-- FitPilot — rozšírenie globálnej knižnice potravín (USDA FoodData Central import,
-- surové/nespracované potraviny — makrá univerzálne, netýka sa ich fortifikácia
-- ani značkové rozdiely medzi trhmi). Značkové SK/CZ produkty rieši Fáza C
-- (Open Food Facts live search), tá tabuľku foods vôbec nepoužíva.
-- Spustiť v Supabase Dashboard → SQL Editor → New query → vložiť celý súbor → Run.
-- Predpokladá migráciu 0005_meal_plans.sql (tabuľka foods).
--
-- external_id: fdc_id z USDA FoodData Central (ako text), na idempotentný re-import.
-- Obyčajný (nie čiastočný) unique index — Supabase upsert(onConflict) to vyžaduje
-- (viď 0011_exercise_images.sql, kde bol s čiastočným indexom pôvodne bug).

alter table public.foods
  add column if not exists external_id text;

create unique index if not exists foods_external_id_idx
  on public.foods (external_id);
