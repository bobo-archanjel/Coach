-- FitPilot — denné prstence klienta (gamifikácia: týždenné prstence → denné). Idempotentné.
-- Spustiť v Supabase Dashboard → SQL Editor → New query → vložiť celý súbor → Run.
-- Predpokladá 0001 (clients). Kód funguje aj PRED spustením (prstence Strava a Bielkoviny idú z existujúcich dát;
-- bez migrácie sa len nedá označiť „Dnes oddychujem“ a oslava sa pamätá v prehliadači, XP za deň sa nepripisuje).
--
-- Čo pribúda:
--  1. client_rest_days (client_id, day) — klient klikol „Dnes oddychujem“ (aktívny odpočinok). Zatvára LEN prstenec
--     Pohyb; nie je to tréning — nikde sa nepočíta do sérií, misií, odznakov ani reportov (tie čítajú výlučne
--     workout_logs, táto tabuľka sa tam nepoužíva),
--  2. client_ring_days (client_id, day) — deň, v ktorom boli uzavreté všetky viditeľné prstence a oslava sa už
--     ukázala (raz za deň). Z počtu riadkov sa deterministicky počíta XP (10 za deň, lib/gamification/xp.ts).
--
-- Bezpečnostný model (rovnaký ako 0078/0084): klient riadky len ČÍTA (RLS, vlastné). Žiadny INSERT/UPDATE/DELETE
-- pre authenticated ani anon — zapisuje výlučne server (service role) po overení session a po prepočte z dát
-- (klient si nemôže pripísať uzavretý deň ani XP). Jeden riadok na klienta a deň (PRIMARY KEY).

create table if not exists public.client_rest_days (
  client_id uuid not null references public.clients (id) on delete cascade,
  day date not null,
  created_at timestamptz not null default now(),
  primary key (client_id, day)
);

create table if not exists public.client_ring_days (
  client_id uuid not null references public.clients (id) on delete cascade,
  day date not null,
  closed_at timestamptz not null default now(),
  primary key (client_id, day)
);

alter table public.client_rest_days enable row level security;
alter table public.client_ring_days enable row level security;

drop policy if exists "client_rest_days_select_own_client" on public.client_rest_days;
create policy "client_rest_days_select_own_client"
  on public.client_rest_days for select
  using (exists (select 1 from public.clients c where c.id = client_rest_days.client_id and c.user_id = auth.uid()));

drop policy if exists "client_ring_days_select_own_client" on public.client_ring_days;
create policy "client_ring_days_select_own_client"
  on public.client_ring_days for select
  using (exists (select 1 from public.clients c where c.id = client_ring_days.client_id and c.user_id = auth.uid()));

revoke all on public.client_rest_days from anon, authenticated;
revoke all on public.client_ring_days from anon, authenticated;
grant select on public.client_rest_days to authenticated;
grant select on public.client_ring_days to authenticated;
