-- FitPilot — feature/AIupgrade: AI Kouč vie k odpovedi priložiť odkaz na konkrétny
-- cvik z knižnice (klik otvorí detail s fotkami — rovnaký modal ako v builderi).
-- Zatiaľ len pri náhrade cviku (lib/ai/chat.ts už vtedy pozná reálne exercise_id
-- kandidátov z findExerciseAlternatives, inde model nedostáva štruktúrované ID).
-- Spustiť v Supabase Dashboard → SQL Editor → New query → vložiť celý súbor → Run.
-- Predpokladá 0014 (ai_messages). Idempotentné.
--
-- [{"id": "...", "name": "..."}] — appka ich zhodou mena v odpovedi modelu s
-- kandidátmi, ktorých mu poslala (žiadny cvik mimo zoznamu, rovnaký princíp ako
-- zvyšok AI bloku). Nullable — staršie správy aj bežné odpovede bez zhody ho
-- jednoducho nemajú.

alter table public.ai_messages
  add column if not exists exercise_refs jsonb;
