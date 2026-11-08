-- FitPilot — obojsmerný chat tréner ↔ klient (Track "Klient" bod 2 z ROADMAP).
-- Spustiť v Supabase Dashboard → SQL Editor → New query → vložiť celý súbor → Run.
-- Predpokladá 0001 (profiles, clients). Idempotentné.
--
-- coach_notes (0003) ostáva samostatný — "dnešný odkaz" pripnutý na karte Dnes.
-- Toto je konverzačné vlákno (jedno na klienta), refresh-based (poll + revalidácia),
-- bez Realtime — dá sa neskôr upgradovať bez zmeny schémy.

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  sender text not null check (sender in ('trainer', 'client')),
  sender_id uuid references public.profiles (id) on delete set null,
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists messages_client_created_idx on public.messages (client_id, created_at);
create index if not exists messages_unread_idx on public.messages (client_id, sender) where read_at is null;

-- ---------- RLS (štýl 0005 — inline exists, auth.uid()) ----------
alter table public.messages enable row level security;

drop policy if exists "messages_select" on public.messages;
drop policy if exists "messages_insert" on public.messages;

create policy "messages_select"
  on public.messages for select
  using (exists (
    select 1 from public.clients c
    where c.id = messages.client_id
      and (c.user_id = auth.uid() or c.trainer_id = auth.uid())
  ));

-- Klient smie písať len ako 'client' a len do vlastného vlákna; tréner len ako
-- 'trainer' a len k vlastnému klientovi. Žiadny UPDATE/DELETE — vlákno je append-only,
-- read_at sa mení výhradne cez mark_messages_read().
create policy "messages_insert"
  on public.messages for insert
  with check (
    sender_id = auth.uid()  -- audit stĺpec sa nedá podvrhnúť
    and (
      (
        sender = 'client'
        and exists (select 1 from public.clients c where c.id = messages.client_id and c.user_id = auth.uid())
      )
      or (
        sender = 'trainer'
        and exists (select 1 from public.clients c where c.id = messages.client_id and c.trainer_id = auth.uid())
      )
    )
  );

-- ---------- označenie prečítaného ----------
-- Označí ako prečítané všetky správy od PROTISTRANY v danom vlákne. Rolu čitateľa
-- (trainer/client) odvodí z clients podľa auth.uid(). SECURITY DEFINER, aby to
-- nešlo cez UPDATE policy (tá by musela dovoliť meniť riadok = riziko prepisu body).
create or replace function public.mark_messages_read(p_client_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reader text;
begin
  select case
    when exists (select 1 from public.clients where id = p_client_id and user_id = auth.uid()) then 'client'
    when exists (select 1 from public.clients where id = p_client_id and trainer_id = auth.uid()) then 'trainer'
    else null
  end into v_reader;

  if v_reader is null then
    return;  -- nie je účastník tohto vlákna
  end if;

  update public.messages
    set read_at = now()
    where client_id = p_client_id
      and sender <> v_reader
      and read_at is null;
end;
$$;

revoke execute on function public.mark_messages_read(uuid) from public, anon;
grant execute on function public.mark_messages_read(uuid) to authenticated;
