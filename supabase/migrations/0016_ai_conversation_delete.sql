-- FitPilot — AI blok, doladenie: klient smie vymazať vlastnú AI konverzáciu
-- ("Začať odznova" v /portal/ai-kouc + GDPR právo na vymazanie, Art. 17).
-- 0014 obsahovala len select/insert — chýbal delete. Spustiť v Supabase
-- Dashboard → SQL Editor → New query → vložiť celý súbor → Run.
-- Cascade na ai_messages (conversation_id → ai_conversations, on delete cascade
-- z 0014) zmaže aj celú históriu správ.

drop policy if exists "ai_conversations_delete" on public.ai_conversations;

create policy "ai_conversations_delete"
  on public.ai_conversations for delete
  using (exists (
    select 1 from public.clients c
    where c.id = ai_conversations.client_id
      and c.user_id = auth.uid()
  ));
