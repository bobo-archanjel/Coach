-- FitPilot — knižnica základných potravín: USDA preč, nahrádza ju CIQUAL (feature/FoodData).
-- Spustiť v Supabase Dashboard → SQL Editor → New query → vložiť celý súbor → Run.
-- Predpokladá 0005 (foods), 0012 (external_id + unique index), 0050 (source, created_by).
-- Idempotentné — dá sa spustiť opakovane (po importe CIQUAL riadky 'ciqual:*' nezmaže).
--
-- Prečo: pôvodná globálna knižnica (source = 'import') bola z USDA FoodData Central
-- (americké hodnoty, americké odrody) + 10 ručne zapísaných riadkov z 0005. Nahrádza ju
-- CIQUAL — oficiálna francúzska/EÚ tabuľka zloženia potravín (ANSES, Licence Ouverte /
-- Etalab, ciqual.anses.fr). Značkové produkty prichádzajú z Open Food Facts (source = 'off').
--
-- Čo 'import' znamená odteraz:
--   source = 'import' = základné suroviny z CIQUAL (kuracie prsia, ryža, jablko, ...),
--   vložené skriptom scripts/import-staples.mjs; trainer_id aj created_by sú null,
--   external_id = 'ciqual:<kód CIQUAL>' (unikátny, takže re-import je upsert).
--   Ručné položky, ktoré CIQUAL nemá (napr. tvaroh), majú external_id = 'fitpilot:<id>' a migrácia ich nemaže.
--
-- name_cs: české zobrazované meno (null = použije sa name, čo je slovenský názov).
--
-- Mazanie je bezpečné pre existujúce dáta: food_logs.food_id → foods ON DELETE SET NULL
-- (denník má vlastný snapshot názvu a makier) a jedálničky (meal_days.meals, jsonb)
-- držia snapshot potraviny, takže zmazaný riadok tolerujú.
--
-- PORADIE SPÚŠŤANIA:
--   1. táto migrácia (Supabase SQL Editor),
--   2. potom lokálne: node scripts/import-staples.mjs            (dry run — skontrolovať hodnoty)
--                     node scripts/import-staples.mjs --apply    (zápis CIQUAL potravín)
--   Medzi krokom 1 a 2 je globálna knižnica prázdna (zostanú len 'off' a 'user' potraviny),
--   preto kroky 1 a 2 spusti hneď po sebe.

alter table public.foods
  add column if not exists name_cs text;

-- Zmazať starú knižnicu: globálne 'import' riadky, ktoré nie sú z CIQUAL
-- (USDA — external_id je číselné fdcId; a seed z 0005 — external_id je null).
-- Riadky 'off' a 'user' sa nedotknú (source <> 'import'), CIQUAL riadky ('ciqual:...') tiež.
delete from public.foods
where source = 'import'
  and trainer_id is null
  and created_by is null
  and (external_id is null or (external_id not like 'ciqual:%' and external_id not like 'fitpilot:%'));
