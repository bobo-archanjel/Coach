-- FitPilot — publikovanie tréningového plánu: tréner rozostavaný plán (dni, cviky)
-- vidí len on, kým ho výslovne nepotvrdí. Klientovi (portál, karta Dnes) sa zobrazí
-- až po potvrdení. Default `true` kvôli existujúcim plánom (tie už klient vidí —
-- nemá zmysel ich spätne skryť) aj vlastným plánom klienta (tam koncept flow
-- neexistuje, vytvoria sa rovno hotové). Draft nastavuje výslovne len
-- createPlanAction (tréner) pri vytvorení nového plánu.
-- Spustiť v Supabase Dashboard → SQL Editor → New query → vložiť celý súbor → Run.
-- Idempotentné.

alter table public.workout_plans
  add column if not exists published boolean not null default true;
