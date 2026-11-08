-- FitPilot — feature/AIupgrade: zvonček upozornení pre KLIENTA (doteraz mal len
-- tréner, 0035). Rovnaký vzor — kľúč nesie identitu situácie, takže skrytie nikdy
-- nezatieni novú situáciu (nový plán toho istého trénera = iný `plan:<id>`).
-- Spustiť v Supabase Dashboard → SQL Editor → New query → vložiť celý súbor → Run.
-- Predpokladá 0001 (clients). Idempotentné.
--
-- Kľúče (viď lib/portal/attention.ts):
--   plan:<workoutPlanId>       nový/zverejnený tréningový plán
--   meal:<mealPlanId>          nový/zverejnený jedálniček
--   appt:<appointmentId>       blížiaci sa termín
-- Appka sa pred spustením tejto migrácie správa ako bez skrytí (dopyt zlyhá →
-- prázdna množina), takže nasadenie kódu a migrácie nemusí byť naraz.

create table if not exists public.client_notification_dismissals (
  client_id uuid not null references public.clients (id) on delete cascade,
  key text not null check (char_length(key) between 1 and 120),
  dismissed_until timestamptz,
  created_at timestamptz not null default now(),
  primary key (client_id, key)
);

alter table public.client_notification_dismissals enable row level security;

-- Klient spravuje výhradne vlastné skrytia (c.user_id = auth.uid() — rovnaká
-- väzba klient↔účet ako všade inde, napr. messages_select v 0008).
drop policy if exists "client_notification_dismissals_select_own" on public.client_notification_dismissals;
drop policy if exists "client_notification_dismissals_insert_own" on public.client_notification_dismissals;
drop policy if exists "client_notification_dismissals_update_own" on public.client_notification_dismissals;
drop policy if exists "client_notification_dismissals_delete_own" on public.client_notification_dismissals;

create policy "client_notification_dismissals_select_own"
  on public.client_notification_dismissals for select
  using (exists (
    select 1 from public.clients c where c.id = client_notification_dismissals.client_id and c.user_id = auth.uid()
  ));

create policy "client_notification_dismissals_insert_own"
  on public.client_notification_dismissals for insert
  with check (exists (
    select 1 from public.clients c where c.id = client_notification_dismissals.client_id and c.user_id = auth.uid()
  ));

create policy "client_notification_dismissals_update_own"
  on public.client_notification_dismissals for update
  using (exists (
    select 1 from public.clients c where c.id = client_notification_dismissals.client_id and c.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.clients c where c.id = client_notification_dismissals.client_id and c.user_id = auth.uid()
  ));

-- Mazanie starých kľúčov robí appka pri každom skrytí (riadky staršie než 90 dní).
create policy "client_notification_dismissals_delete_own"
  on public.client_notification_dismissals for delete
  using (exists (
    select 1 from public.clients c where c.id = client_notification_dismissals.client_id and c.user_id = auth.uid()
  ));
