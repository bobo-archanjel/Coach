-- FitPilot — publikovanie jedálnička (QA nález 2026-09-23): portál klientovi
-- ukazoval vždy NAJNOVŠÍ jedálniček, takže rozpracovaný (aj prázdny) alebo práve
-- vytvorený zo šablóny sa mu zobrazil okamžite. Rovnaký model ako tréningové
-- plány (0021): koncept vidí len tréner, klient až po potvrdení.
-- Default `true` kvôli existujúcim jedálničkom (klient ich už vidí — nemá zmysel
-- ich spätne skryť). Koncept nastavuje výslovne createMealPlanAction a
-- applyMealTemplateToClient.
-- Spustiť v Supabase Dashboard → SQL Editor → New query → vložiť celý súbor → Run.
-- Predpokladá 0001–0043. Idempotentné.

alter table public.meal_plans
  add column if not exists published boolean not null default true;
