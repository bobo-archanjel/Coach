-- FitPilot — odhlasovací token pre čakaciu listinu (feature/wishlist, právna oprava).
--
-- Potvrdzovací e-mail aj checkbox na waitlist/index.html sľubujú "kedykoľvek sa
-- môžeš odhlásiť", no doteraz to šlo len ručne (napísať na info@). Podľa § 116
-- zákona č. 452/2021 Z. z. (marketingové e-maily) a GDPR čl. 7 ods. 3 (odvolanie
-- súhlasu musí byť rovnako jednoduché ako jeho udelenie) to musí byť jeden klik.
--
-- Token je náhodný a nezávislý od e-mailu/id (nedá sa uhádnuť ani odvodiť),
-- edge funkcia waitlist-unsubscribe ho overuje cez service_role — anon k nemu
-- nemá (a nepotrebuje) žiadny priamy prístup.
--
-- Spustiť v Supabase Dashboard → SQL Editor → New query → vložiť celý súbor → Run.
-- Predpokladá 0038–0042. Idempotentné.

alter table public.waitlist_signups
  add column if not exists unsubscribe_token text;

update public.waitlist_signups
set unsubscribe_token = replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
where unsubscribe_token is null;

alter table public.waitlist_signups
  alter column unsubscribe_token set default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  alter column unsubscribe_token set not null;

create unique index if not exists waitlist_signups_unsubscribe_token_idx
  on public.waitlist_signups (unsubscribe_token);

-- Stĺpec je len na čítanie/mazanie cez service_role (edge funkcia) — anon ho
-- nesmie nikdy nastaviť ani čítať (rovnaký dvojitý zámok ako ostatné stĺpce, 0036/0038).
-- Existujúci `grant insert (...) to anon` z 0038 tento stĺpec neobsahuje, netreba meniť.
