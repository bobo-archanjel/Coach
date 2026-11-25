-- FitPilot — výzvy sa počítajú až od svojho vytvorenia (hotfix).
-- Spustiť v Supabase Dashboard → SQL Editor → New query → vložiť celý súbor → Run.
-- Predpokladá 0079 (challenges, challenge_food_days). Idempotentné; NEMAŽE ani nemení žiadne dáta.
--
-- Chyba: výzva sa dala splniť dátami spred jej vytvorenia (okno bolo len po dňoch). Teraz server
-- počíta len aktivitu po okamihu max(challenges.created_at, začiatok dňa starts_on), preto potrebuje
-- aj čas posledného zápisu jedla v danom dni.
--
-- Čo pribúda: funkcia challenge_food_days_at — ako challenge_food_days, ale s časom posledného zápisu
-- (food_logs.created_at) za klienta a deň. SECURITY INVOKER (RLS volajúceho rozhoduje).
--
-- Opravu už nesprávne splnených výziev (zápis do dát) NEspúšťa táto migrácia — je v samostatnom
-- skripte supabase/scripts/reopen_challenges_completed_by_bug.sql, ktorý owner spúšťa vedome.

create or replace function public.challenge_food_days_at(p_client_ids uuid[], p_from date, p_to date)
returns table (client_id uuid, eaten_on date, last_logged_at timestamptz)
language sql
stable
security invoker
set search_path = public
as $$
  select fl.client_id, fl.eaten_on, max(fl.created_at) as last_logged_at
  from public.food_logs fl
  where cardinality(p_client_ids) <= 300
    and fl.client_id = any (p_client_ids)
    and fl.eaten_on between p_from and p_to
    and p_to - p_from <= 130
  group by fl.client_id, fl.eaten_on
  limit 40000;
$$;

revoke execute on function public.challenge_food_days_at(uuid[], date, date) from public, anon;
grant execute on function public.challenge_food_days_at(uuid[], date, date) to authenticated, service_role;
