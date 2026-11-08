-- FitPilot — Kalendár (feature/planing-groupMessage): voľné termíny (konzultácie/
-- tréningy) medzi trénerom a klientom, nezávislé od tréningového plánu/buildera.
-- Agenda zoznam (nie mesačná mriežka) na /dashboard/kalendar, malá karta
-- "Najbližší termín" v klientskom portáli (karta Dnes).
--
-- Spustiť v Supabase Dashboard → SQL Editor → New query → vložiť celý súbor → Run.
-- Idempotentné.

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.profiles (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists appointments_trainer_starts_idx on public.appointments (trainer_id, starts_at);
create index if not exists appointments_client_starts_idx on public.appointments (client_id, starts_at);

alter table public.appointments enable row level security;

-- Tréner má plný prístup k vlastným termínom.
create policy "appointments_all_own_trainer"
  on public.appointments for all
  using (trainer_id = auth.uid())
  with check (
    trainer_id = auth.uid()
    and exists (select 1 from public.clients c where c.id = client_id and c.trainer_id = auth.uid())
  );

-- Klient vidí len vlastné termíny (read-only — termín zapisuje tréner).
create policy "appointments_select_own_client"
  on public.appointments for select
  using (
    exists (select 1 from public.clients c where c.id = appointments.client_id and c.user_id = auth.uid())
  );
