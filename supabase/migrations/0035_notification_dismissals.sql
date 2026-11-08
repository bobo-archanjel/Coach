-- FitPilot — feature/funkcionalita: skrývanie upozornení v zvončeku a na hlavnej
-- ploche trénera ("nech to tam vždy nesvieti").
-- Spustiť v Supabase Dashboard → SQL Editor → New query → vložiť celý súbor → Run.
-- Predpokladá 0001 (profiles). Idempotentné.
--
-- Uložené v DB (nie v prehliadači), aby skrytie platilo rovnako na mobile aj
-- desktope. Kľúč nesie IDENTITU situácie (viď lib/dashboard/attention.ts):
--   late:<clientId>:<since>   meškajúci klient (skryté na 7 dní, `dismissed_until`)
--   digest:<weekStart>        týždenný digest (nový týždeň = nový kľúč)
--   onboarding                checklist prvých krokov
-- Vďaka tomu skrytie nikdy nezatieni NOVÚ situáciu (klient po tréningu znova
-- zmešká = iný `since` = upozornenie svieti znova).
--
-- Appka sa pred spustením tejto migrácie správa ako bez skrytí (dopyt zlyhá →
-- prázdna množina), takže nasadenie kódu a migrácie nemusí byť naraz.

create table if not exists public.notification_dismissals (
  trainer_id uuid not null references public.profiles (id) on delete cascade,
  key text not null check (char_length(key) between 1 and 120),
  -- null = kým sa nezmení situácia (kľúč to rieši sám); inak skrytie vyprší
  dismissed_until timestamptz,
  created_at timestamptz not null default now(),
  primary key (trainer_id, key)
);

alter table public.notification_dismissals enable row level security;

-- Tréner spravuje výhradne vlastné skrytia. Upsert v akcii potrebuje insert aj update.
drop policy if exists "notification_dismissals_select_own" on public.notification_dismissals;
drop policy if exists "notification_dismissals_insert_own" on public.notification_dismissals;
drop policy if exists "notification_dismissals_update_own" on public.notification_dismissals;
drop policy if exists "notification_dismissals_delete_own" on public.notification_dismissals;

create policy "notification_dismissals_select_own"
  on public.notification_dismissals for select
  using (auth.uid() = trainer_id);

create policy "notification_dismissals_insert_own"
  on public.notification_dismissals for insert
  with check (auth.uid() = trainer_id);

create policy "notification_dismissals_update_own"
  on public.notification_dismissals for update
  using (auth.uid() = trainer_id)
  with check (auth.uid() = trainer_id);

-- Mazanie starých kľúčov robí appka pri každom skrytí (riadky staršie než 90 dní).
create policy "notification_dismissals_delete_own"
  on public.notification_dismissals for delete
  using (auth.uid() = trainer_id);
