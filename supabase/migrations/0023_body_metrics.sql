-- FitPilot — Progres a analýza (feature/progress-analyst): nová tabuľka body_metrics
-- pre pravidelné meranie klienta (váha + obvody), základ pre graf váhy na
-- `/dashboard/klienti/[id]` a agregovaný prehľad `/dashboard/analytika`.
-- Zatiaľ len tréner zapisuje a vidí (klient dostane vlastný pohľad neskôr) — SELECT
-- policy pre klienta je pripravená rovno, nech sa pri tom nemusí robiť ďalšia migrácia.
-- Spustiť v Supabase Dashboard → SQL Editor → New query → vložiť celý súbor → Run.
-- Idempotentné.

create table if not exists public.body_metrics (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  trainer_id uuid not null references public.profiles (id) on delete cascade,
  measured_on date not null,
  weight_kg numeric(5, 1),
  waist_cm numeric(5, 1),
  chest_cm numeric(5, 1),
  hips_cm numeric(5, 1),
  arm_cm numeric(5, 1),
  thigh_cm numeric(5, 1),
  note text,
  created_at timestamptz not null default now(),
  -- jeden záznam na deň na klienta — druhé meranie ten istý deň prepíše prvé
  -- (UPSERT v actions.ts), nie duplicitný riadok.
  unique (client_id, measured_on)
);

create index if not exists body_metrics_client_id_idx on public.body_metrics (client_id, measured_on);

alter table public.body_metrics enable row level security;

create policy "body_metrics_all_own_trainer"
  on public.body_metrics for all
  using (trainer_id = auth.uid())
  with check (
    trainer_id = auth.uid()
    and exists (select 1 from public.clients c where c.id = client_id and c.trainer_id = auth.uid())
  );

-- Pripravené pre klientský pohľad (neskôr) — klient vidí vlastné merania.
create policy "body_metrics_select_own_client"
  on public.body_metrics for select
  using (
    exists (select 1 from public.clients c where c.id = client_id and c.user_id = auth.uid())
  );
