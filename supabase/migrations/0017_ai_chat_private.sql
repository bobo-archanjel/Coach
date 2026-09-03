-- FitPilot — AI blok, oprava: AI Kouč je súkromná konverzácia klient↔AI,
-- tréner k nej nemá prístup ani na úrovni RLS (nielen skryté v UI).
-- Spustiť v Supabase Dashboard → SQL Editor → New query → vložiť celý súbor → Run.
--
-- Pôvodné rozhodnutie v 0014 (tréner vidí read-only, "transparentnosť") bolo
-- prehodnotené — tréner naďalej dostáva upozornenie pri zdravotnej téme alebo
-- žiadosti o náhradu cviku, ale IBA cez krátku správu v skutočnom `messages`
-- vlákne (insert_ai_escalation_message, 0015), nie cez prístup k celému AI
-- chatu. Toto zúži SELECT policy len na vlastníka-klienta.

drop policy if exists "ai_conversations_select" on public.ai_conversations;
drop policy if exists "ai_messages_select" on public.ai_messages;

create policy "ai_conversations_select"
  on public.ai_conversations for select
  using (exists (
    select 1 from public.clients c
    where c.id = ai_conversations.client_id
      and c.user_id = auth.uid()
  ));

create policy "ai_messages_select"
  on public.ai_messages for select
  using (exists (
    select 1 from public.ai_conversations conv
    join public.clients c on c.id = conv.client_id
    where conv.id = ai_messages.conversation_id
      and c.user_id = auth.uid()
  ));
