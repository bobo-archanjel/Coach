-- FitPilot — AI blok, Krok 2: schéma pre AI chat klienta ("AI Kouč").
-- Spustiť v Supabase Dashboard → SQL Editor → New query → vložiť celý súbor → Run.
-- Predpokladá 0001 (profiles, clients), 0013 (ai_usage). Idempotentné.
--
-- Vedomé rozhodnutie: samostatné ai_conversations/ai_messages, NIE rozšírenie
-- existujúcej `messages` (0008) — tá má vlastnú sémantiku (unread badge, sender
-- dôveryhodnosť medzi dvoma ľuďmi), AI transkript sa s tým nesmie miešať.
--
-- GDPR: tréner má read-only prístup (transparentnosť podľa Product Principle #1,
-- musí byť viditeľne oznámené v UI chatu). Cascade delete na clients zaisťuje
-- právo na vymazanie (Art. 17) — zmazaním klienta zmizne aj celá AI história.
-- Aplikácia pri stavbe promptu posiela modelu len posledné N správ (minimalizácia
-- dát, nie celú históriu donekonečna) — vynucuje kód v lib/ai/, nie táto schéma.

create table if not exists public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null unique references public.clients (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(btrim(content)) between 1 and 4000),
  escalated boolean not null default false, -- true = zdravotný pre-filter/model eskaloval trénerovi (viď Krok 4)
  created_at timestamptz not null default now()
);

create index if not exists ai_messages_conversation_created_idx
  on public.ai_messages (conversation_id, created_at);

-- ---------- RLS ----------
alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;

drop policy if exists "ai_conversations_select" on public.ai_conversations;
drop policy if exists "ai_conversations_insert" on public.ai_conversations;
drop policy if exists "ai_messages_select" on public.ai_messages;
drop policy if exists "ai_messages_insert" on public.ai_messages;

-- Konverzáciu vidí klient sám (vlastník) aj jeho tréner (read-only transparentnosť).
create policy "ai_conversations_select"
  on public.ai_conversations for select
  using (exists (
    select 1 from public.clients c
    where c.id = ai_conversations.client_id
      and (c.user_id = auth.uid() or c.trainer_id = auth.uid())
  ));

-- Založiť konverzáciu smie len klient sám sebe (server ju vytvorí lazy, pri prvej správe).
create policy "ai_conversations_insert"
  on public.ai_conversations for insert
  with check (exists (
    select 1 from public.clients c
    where c.id = ai_conversations.client_id
      and c.user_id = auth.uid()
  ));

-- Správy vidí ten istý okruh ako konverzáciu (klient-vlastník alebo jeho tréner).
create policy "ai_messages_select"
  on public.ai_messages for select
  using (exists (
    select 1 from public.ai_conversations conv
    join public.clients c on c.id = conv.client_id
    where conv.id = ai_messages.conversation_id
      and (c.user_id = auth.uid() or c.trainer_id = auth.uid())
  ));

-- Zapisovať (user aj assistant riadok) smie len session vlastníka-klienta —
-- server action vloží obe strany (otázku aj odpoveď modelu) pod jeho vlastnou
-- session, tréner do AI chatu nikdy nepíše (read-only).
create policy "ai_messages_insert"
  on public.ai_messages for insert
  with check (exists (
    select 1 from public.ai_conversations conv
    join public.clients c on c.id = conv.client_id
    where conv.id = ai_messages.conversation_id
      and c.user_id = auth.uid()
  ));
