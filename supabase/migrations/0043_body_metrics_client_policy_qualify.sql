-- FitPilot — oprava 0042 (a pôvodne už 0024): v klientskych INSERT/UPDATE
-- politikách na body_metrics bol v poddotaze `from public.clients c` použitý
-- nekvalifikovaný `trainer_id`. Keďže aj clients má stĺpec trainer_id, Postgres
-- ho naviazal na c.trainer_id — podmienka bola v skutočnosti
-- `c.trainer_id = c.trainer_id`, teda nikdy neporovnávala trainer_id zapisovaného
-- riadku:
--   - v 0024 (`=`) to pri klientovi bez trénera dalo NULL → zápis odmietnutý
--     (skutočná príčina QA nálezu "Na túto akciu nemáš oprávnenie"),
--   - v 0042 (`is not distinct from`) to je vždy true → spárovaný klient mohol
--     zapísať meranie s ľubovoľným trainer_id (overené: trainer_id=null prijaté).
-- Tu sú stĺpce zapisovaného riadku kvalifikované cez `body_metrics.`.
--
-- Spustiť v Supabase Dashboard → SQL Editor → New query → vložiť celý súbor → Run.
-- Predpokladá 0001–0042. Idempotentné.
-- Pôvodne 0040 na vetve qa-dual-agent — prečíslované kvôli kolízii s waitlist
-- migráciami 0038–0040 v dev. V DB už môže byť spustená pod starým číslom (idempotentné).

drop policy if exists "body_metrics_insert_own_client" on public.body_metrics;
create policy "body_metrics_insert_own_client"
  on public.body_metrics for insert
  with check (
    exists (
      select 1 from public.clients c
      where c.id = body_metrics.client_id and c.user_id = auth.uid()
        and c.trainer_id is not distinct from body_metrics.trainer_id
    )
  );

drop policy if exists "body_metrics_update_own_client" on public.body_metrics;
create policy "body_metrics_update_own_client"
  on public.body_metrics for update
  using (
    exists (select 1 from public.clients c where c.id = body_metrics.client_id and c.user_id = auth.uid())
  )
  with check (
    exists (
      select 1 from public.clients c
      where c.id = body_metrics.client_id and c.user_id = auth.uid()
        and c.trainer_id is not distinct from body_metrics.trainer_id
    )
  );
