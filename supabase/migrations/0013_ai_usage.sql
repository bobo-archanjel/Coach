-- FitPilot — AI blok, spoločný základ: log volaní Claude API.
-- Spustiť v Supabase Dashboard → SQL Editor → New query → vložiť celý súbor → Run.
--
-- Účel: (1) audit trail čo/kedy/koľko tokenov, (2) základ pre budúci rate-limit
-- podľa monetizačného plánu ("AI ako prémiová úroveň s limitom requestov",
-- PRODUCT.md) — bez potreby dorábať schému, keď príde billing.
-- Insert robí server-side kód (Server Actions) pod session volajúceho (trénera
-- pri generátoroch/summary, klienta pri chate) — nie service role — preto
-- insert policy pokrýva oba prípady.

create table if not exists public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.profiles (id) on delete cascade,
  client_id uuid references public.clients (id) on delete cascade, -- null = generovanie bez konkrétneho klienta
  kind text not null check (kind in ('plan_gen', 'meal_gen', 'progress_summary', 'chat')),
  model text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_trainer_created_idx on public.ai_usage (trainer_id, created_at desc);

alter table public.ai_usage enable row level security;

create policy "ai_usage_select_own_trainer"
  on public.ai_usage for select
  using (auth.uid() = trainer_id);

-- Insert: buď priamo tréner (generátor plánov/jedálničkov, progress summary),
-- alebo klient patriaci danému trénerovi (chat — usage sa pripíše trénerovi,
-- ktorý za AI funkcie platí, nie klientovi).
create policy "ai_usage_insert_own_trainer_or_client"
  on public.ai_usage for insert
  with check (
    auth.uid() = trainer_id
    or exists (
      select 1 from public.clients c
      where c.trainer_id = ai_usage.trainer_id
        and c.user_id = auth.uid()
    )
  );
