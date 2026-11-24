-- FitPilot — vlastné udalosti klienta v kalendári na karte Dnes (feature/kalendar-klient).
-- Spustiť v Supabase Dashboard → SQL Editor → New query → vložiť celý súbor → Run.
-- Idempotentné, nemení existujúce dáta.
--
-- Klient si ťukom na deň v 2-týždňovom kalendári vytvorí vlastnú udalosť (oranžová bodka).
-- Termíny od trénera ostávajú v `appointments` (červená bodka, klient ich len číta).
-- Vlastné udalosti sú SÚKROMNÉ — vidí, mení a maže ich len klient; tréner k nim prístup nemá.

create table if not exists public.client_events (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  starts_at timestamptz not null,
  ends_at timestamptz,
  note text check (note is null or char_length(note) <= 1000),
  created_at timestamptz not null default now(),
  constraint client_events_end_after_start check (ends_at is null or ends_at > starts_at)
);

create index if not exists client_events_client_starts_idx on public.client_events (client_id, starts_at);

alter table public.client_events enable row level security;

drop policy if exists "client_events_all_own_client" on public.client_events;
create policy "client_events_all_own_client"
  on public.client_events for all
  using (exists (select 1 from public.clients c where c.id = client_events.client_id and c.user_id = auth.uid()))
  with check (exists (select 1 from public.clients c where c.id = client_events.client_id and c.user_id = auth.uid()));

revoke all on public.client_events from anon;
grant select, insert, update, delete on public.client_events to authenticated;
