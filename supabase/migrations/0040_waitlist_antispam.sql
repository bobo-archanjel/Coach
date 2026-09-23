-- FitPilot — čakacia listina proti spamu/botom (feature/wishlist).
--
-- Doteraz zapisoval anon kľúč PRIAMO do tabuľky (INSERT policy pre anon) —
-- ktokoľvek si vie prečítať anon kľúč zo zdrojáku stránky (má byť verejný,
-- to je v poriadku) a poslať request rovno na Supabase REST API, úplne mimo
-- HTML formulára, bez CAPTCHA, bez rate limitu, skriptom v slučke. RLS
-- chránilo len ČÍTANIE zoznamu, nie ZAPLAVENIE tabuľky spamom.
--
-- Riešenie: anon stráca INSERT úplne. Jediná cesta dnu je nová edge function
-- supabase/functions/submit-waitlist (service_role), ktorá pred zápisom overí
-- Cloudflare Turnstile (server-side, token sa nedá sfalšovať) + honeypot pole
-- + limit počtu zápisov z jednej IP adresy za 24h.
--
-- Spustiť v Supabase Dashboard → SQL Editor → New query → vložiť celý súbor → Run.
-- Idempotentné.

alter table public.waitlist_signups add column if not exists ip_hash text;

-- Rate limit v edge function počíta riadky s rovnakým ip_hash za posledných
-- 24h — bez indexu by to pri väčšom objeme bolo pomalé (sekvenčné skenovanie).
create index if not exists waitlist_signups_ip_hash_created_idx
  on public.waitlist_signups (ip_hash, created_at desc);

drop policy if exists "waitlist_signups_insert_anon" on public.waitlist_signups;
revoke insert on public.waitlist_signups from anon;

grant all on public.waitlist_signups to service_role;
