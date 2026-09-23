-- FitPilot — QA nález (test/qa-dual-agent, finding #2): klient nevidel meno svojho
-- trénera v Chate ani v Profile (zobrazovalo sa "Tréner tréner" / "tvoj tréner").
--
-- Skutočná príčina NEBOLA chýbajúce profiles.full_name (to je vyplnené správne),
-- ale chýbajúca RLS politika: "profiles_select_own_clients" (0001) dovoľuje
-- TRÉNEROVI čítať profil SVOJHO klienta, ale neexistuje opačná politika, ktorá by
-- dovolila KLIENTOVI čítať profil svojho trénera. `lib/portal/data.ts` teda pri
-- pokuse o `supabase.from("profiles").select("full_name").eq("id", trainer_id)`
-- z klientskej session dostal (kvôli RLS ticho) 0 riadkov, nie chybu — kód to
-- interpretoval ako "meno neznáme" a použil fallback text.
--
-- Spustiť v Supabase Dashboard → SQL Editor → New query → vložiť celý súbor → Run.
-- Predpokladá 0001–0040. Idempotentné.
-- Pôvodne 0038 na vetve qa-dual-agent — prečíslované kvôli kolízii s waitlist
-- migráciami 0038–0040 v dev. V DB už môže byť spustená pod starým číslom (idempotentné).

drop policy if exists "profiles_select_own_trainer" on public.profiles;

-- Symetrická obdoba "profiles_select_own_clients" (0001): klient smie čítať profil
-- trénera, KÝM vzťah trvá (clients.trainer_id ukazuje naň) — rovnaký vzorec ako
-- ostatné "vzťah pri čítaní" politiky z 0036 (trainer_id sa vynuluje pri odpojení,
-- takže po leave_trainer() prístup sám zanikne).
create policy "profiles_select_own_trainer"
  on public.profiles for select
  using (
    exists (
      select 1 from public.clients c
      where c.trainer_id = profiles.id
        and c.user_id = auth.uid()
    )
  );
