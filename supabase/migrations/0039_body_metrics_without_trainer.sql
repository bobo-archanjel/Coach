-- FitPilot — QA nález (qa-dual-agent, verifikačný beh 2026-09-23): klient BEZ
-- trénera (samostatná registrácia z 0032 alebo po leave_trainer) si nevedel
-- zapísať telesné meranie — "Na túto akciu nemáš oprávnenie."
--
-- Príčina: body_metrics z 0023/0024 predpokladá, že klient má vždy trénera.
--   1. trainer_id je NOT NULL, hoci addOwnBodyMetricAction posiela
--      clients.trainer_id, čo je u klienta bez trénera null.
--   2. klientske INSERT/UPDATE politiky porovnávajú c.trainer_id = trainer_id,
--      a NULL = NULL v SQL neplatí → zápis odmietnutý.
--   3. Tréner číta merania len cez trainer_id = auth.uid() (0036), takže by po
--      (znovu)spárovaní nevidel merania zapísané, kým bol klient sám (alebo u
--      predošlého trénera). Doplnená SELECT politika podľa vzťahu — rovnaký vzor
--      ako workout_logs_select_own_trainer (0003): aktuálny tréner vidí celú
--      históriu svojho klienta.
--
-- Spustiť v Supabase Dashboard → SQL Editor → New query → vložiť celý súbor → Run.
-- Predpokladá 0001–0038. Idempotentné.

alter table public.body_metrics alter column trainer_id drop not null;

drop policy if exists "body_metrics_insert_own_client" on public.body_metrics;
create policy "body_metrics_insert_own_client"
  on public.body_metrics for insert
  with check (
    exists (
      select 1 from public.clients c
      where c.id = client_id and c.user_id = auth.uid()
        and c.trainer_id is not distinct from trainer_id
    )
  );

drop policy if exists "body_metrics_update_own_client" on public.body_metrics;
create policy "body_metrics_update_own_client"
  on public.body_metrics for update
  using (
    exists (select 1 from public.clients c where c.id = client_id and c.user_id = auth.uid())
  )
  with check (
    exists (
      select 1 from public.clients c
      where c.id = client_id and c.user_id = auth.uid()
        and c.trainer_id is not distinct from trainer_id
    )
  );

drop policy if exists "body_metrics_select_current_trainer" on public.body_metrics;
create policy "body_metrics_select_current_trainer"
  on public.body_metrics for select
  using (
    exists (
      select 1 from public.clients c
      where c.id = body_metrics.client_id and c.trainer_id = auth.uid()
    )
  );
