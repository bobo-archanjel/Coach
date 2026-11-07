-- FitPilot — feature/navod: interaktívny onboarding tour (spotlight po UI) pre
-- trénera aj klienta. Spustiť v Supabase Dashboard → SQL Editor → New query →
-- vložiť celý súbor → Run. Predpokladá 0001 (profiles). Idempotentné.
--
-- Jeden stĺpec na oboch rolách (tréner aj klient sú riadky v `profiles`) — na
-- rozdiel od notification_dismissals (0035, len tréner, kľúč-hodnota pre viacero
-- nezávislých upozornení) tu ide o JEDNU vec ("videl/preskočil návod"), takže
-- stačí jeden timestamp namiesto ďalšej tabuľky. NULL = ešte nevidel → layout
-- spustí tour automaticky pri prvom vstupe do /dashboard alebo /portal.
--
-- Appka sa pred spustením tejto migrácie správa, akoby stĺpec neexistoval
-- (getProfile select zlyhá na tomto stĺpci → tour sa nezobrazí, appka nespadne),
-- takže nasadenie kódu a migrácie nemusí byť naraz.

alter table public.profiles
  add column if not exists tour_completed_at timestamptz;

-- Existujúca politika "profiles_update_own" (0001, `auth.uid() = id`) už pokrýva
-- update tohto stĺpca cez RLS — ale migrácia 0036 (security hardening) navyše
-- obmedzila UPDATE na `profiles` na stĺpcovej úrovni len na `full_name`
-- (`grant update (full_name) on public.profiles to authenticated`). Bez tejto
-- ďalšej grant vety appka dostane "permission denied for table profiles" (nie
-- chybu RLS) pri každom pokuse uložiť tour_completed_at — nájdené manuálnym
-- testom po nasadení. `grant update` je kumulatívne (nie prepíše predošlý
-- zoznam stĺpcov), takže `full_name` zostáva zapisovateľné aj po tejto vete.
grant update (tour_completed_at) on public.profiles to authenticated;
