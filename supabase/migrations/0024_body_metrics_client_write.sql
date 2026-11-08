-- FitPilot — Progres a analýza: telesné merania (váha, obvody) odteraz zapisuje
-- klient sám v /portal ("Dnes"), nie tréner. 0023_body_metrics.sql mal pre klienta
-- pripravenú len SELECT policy — tu dopĺňame INSERT/UPDATE. Tréner v
-- /dashboard/klienti/[id] merania naďalej vidí (jeho "all" policy z 0023 ostáva
-- nezmenená, kvôli prípadnému budúcemu zápisu), len appka mu už neponúka formulár.
-- Spustiť v Supabase Dashboard → SQL Editor → New query → vložiť celý súbor → Run.
-- Idempotentné.

drop policy if exists "body_metrics_insert_own_client" on public.body_metrics;
create policy "body_metrics_insert_own_client"
  on public.body_metrics for insert
  with check (
    exists (
      select 1 from public.clients c
      where c.id = client_id and c.user_id = auth.uid() and c.trainer_id = trainer_id
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
      where c.id = client_id and c.user_id = auth.uid() and c.trainer_id = trainer_id
    )
  );
