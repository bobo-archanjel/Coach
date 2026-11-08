-- FitPilot — feature/ai-plan-zameranie: štruktúrovaný `equipment` na cvikoch.
--
-- Free Exercise DB (scripts/import-exercises.mjs) equipment pole doteraz končilo
-- ako voľný text v `description` ("Vybavenie: barbell") a nikde sa nečítalo. AI
-- generátor plánu preto spoliehal na to, že model uhádne vybavenie z názvu cviku
-- — žiadny skutočný filter. Tento stĺpec umožní appke filtrovať kandidátov podľa
-- dostupného vybavenia klienta PRED odoslaním do promptu.
--
-- Aditívny nullable stĺpec, žiadny breaking change. Hodnoty doplní re-spustenie
-- `node scripts/import-exercises.mjs` (idempotentný upsert podľa external_id) —
-- kým sa nespustí, `equipment` je NULL na všetkých riadkoch a planGenerator.ts
-- structural filter automaticky vypne (fallback na doterajšie správanie).
--
-- Pozn.: číslo 0030 je rezervované pre feature/analytika-v2 (ešte nezmergované
-- do dev v čase písania) — táto vetva berie 0031.
--
-- Spustiť v Supabase Dashboard → SQL Editor → New query → vložiť celý súbor → Run.
-- Idempotentné.

alter table public.exercises
  add column if not exists equipment text;
