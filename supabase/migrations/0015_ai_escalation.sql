-- FitPilot — AI blok, Krok 4: eskalácia zdravotných tém z AI chatu do
-- SKUTOČNÉHO trénersko-klientského vlákna (`messages`, 0008).
-- Spustiť v Supabase Dashboard → SQL Editor → New query → vložiť celý súbor → Run.
-- Predpokladá 0008 (messages), 0014 (ai_conversations/ai_messages).
--
-- Pridáva sender = 'system' (automatická poznámka, nie tréner ani klient) a
-- SECURITY DEFINER funkciu, ktorou server action (bežiaca pod session klienta)
-- vloží systémovú správu do reálneho vlákna bez toho, aby jej RLS insert policy
-- (viazaná na sender='client'/'trainer' + sender_id = auth.uid()) musela byť
-- rozvoľnená pre bežné použitie.

alter table public.messages drop constraint if exists messages_sender_check;
alter table public.messages add constraint messages_sender_check
  check (sender in ('trainer', 'client', 'system'));

create or replace function public.insert_ai_escalation_message(p_client_id uuid, p_body text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- volajúci musí byť práve ten klient (server action beží pod jeho session) —
  -- inak by ktokoľvek mohol podvrhnúť systémovú správu do cudzieho vlákna.
  if not exists (select 1 from public.clients where id = p_client_id and user_id = auth.uid()) then
    raise exception 'insert_ai_escalation_message: caller is not the owning client';
  end if;

  insert into public.messages (client_id, sender, sender_id, body)
  values (p_client_id, 'system', null, p_body);
end;
$$;

revoke execute on function public.insert_ai_escalation_message(uuid, text) from public, anon;
grant execute on function public.insert_ai_escalation_message(uuid, text) to authenticated;
