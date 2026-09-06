-- FitPilot — optimalizácia (feature/optimalizacia): chýbajúci index na ai_usage.
--
-- ai_usage má len index (trainer_id, created_at) z 0013 — pokrýva kartu "AI
-- náklady" v /dashboard/nastavenia. Rate-limit kontroly ale filtrujú inak:
-- isChatRateLimited a isProgressSummaryRateLimited (lib/ai/rateLimit.ts)
-- počítajú riadky podľa (client_id, kind, created_at >= dnes) — bez indexu
-- na túto kombináciu ide o sequential scan celej tabuľky. Táto kontrola beží
-- PRED KAŽDÝM volaním AI (chat aj progress summary), takže so stovkami/
-- tisíckami riadkov v tabuľke by sa postupne spomaľovala práve tá cesta,
-- ktorá má byť lacná a rýchla (rozhodnutie nevolať model).
--
-- Spustiť v Supabase Dashboard → SQL Editor → New query → vložiť celý súbor → Run.

create index if not exists ai_usage_client_kind_created_idx
  on public.ai_usage (client_id, kind, created_at desc);
