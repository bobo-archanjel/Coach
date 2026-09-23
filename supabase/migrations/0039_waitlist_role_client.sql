-- FitPilot — čakacia listina: tretia rola vo formulári (feature/wishlist).
--
-- waitlist/index.html teraz ponúka 3 možnosti v "Som" (predtým 2): tréner,
-- klient bez trénera (self-coaching) a klient, ktorý trénera hľadá — táto
-- tretia je odlišný prípad od "koučoval by som sám seba" (opačný zámer:
-- chce trénera, nie sám seba), preto dostáva vlastnú hodnotu 'client', nie
-- zdieľanú so 'solo'.
--
-- Spustiť v Supabase Dashboard → SQL Editor → New query → vložiť celý súbor → Run.
-- Idempotentné.

alter table public.waitlist_signups drop constraint if exists waitlist_signups_role_check;
alter table public.waitlist_signups add constraint waitlist_signups_role_check
  check (role in ('trainer', 'solo', 'client'));
