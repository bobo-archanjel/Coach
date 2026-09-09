-- FitPilot — feature/analytika-v2: nový druh AI volania `roster_summary`.
--
-- Bod 5 analytiky: rovnaký vzor ako progress_summary (on-demand AI zhrnutie,
-- appka spočíta čísla, Haiku ich sformuluje), ale za celé portfólio klientov
-- naraz — "na koho sa tento týždeň zamerať a prečo". Volá ho tréner priamo,
-- usage sa pripíše jemu (`client_id` je null — nejde o konkrétneho klienta),
-- vlastný denný rate-limit per tréner (lib/ai/rateLimit.ts).
--
-- Jediná zmena je rozšírenie CHECK constraintu na `ai_usage.kind` (0013) —
-- žiadna nová tabuľka ani stĺpec. RLS `ai_usage_insert_own_trainer_or_client`
-- (0013) už pokrýva priamy insert trénerom, netreba ju meniť.
--
-- Spustiť v Supabase Dashboard → SQL Editor → New query → vložiť celý súbor → Run.
-- Idempotentné.

alter table public.ai_usage drop constraint if exists ai_usage_kind_check;

alter table public.ai_usage
  add constraint ai_usage_kind_check
  check (kind in ('plan_gen', 'meal_gen', 'progress_summary', 'roster_summary', 'chat'));
