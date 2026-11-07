-- FitPilot — adresát systémových správ v chate tréner ↔ klient (QA 2026-09-23).
--
-- Systémové správy (sender='system') sú jedno vlákno pre oboch, ale väčšina z nich
-- je písaná pre jednu stranu:
--   - AI upozornenia trénerovi (0015/0036, "⚠️ AI asistent upozorňuje: klient…",
--     "ℹ️ AI Kouč: klient…") citujú klientovu správu a pri kríze ho opisujú —
--     messages_select (0008) ich pritom ukazoval aj KLIENTOVI v jeho chate,
--   - "X ťa pridal/-a ako svojho klienta…", "Tréner ukončil spoluprácu. Tvoje…",
--     správy o zmazaní dát ("Tréner ťa odstránil…", "Požiadal/a si o zmazanie…")
--     oslovujú klienta, tréner ich videl vo svojom vlákne (pri každom spárovaní znova).
--
-- Riešenie: messages.audience (both / client / trainer) + SELECT RLS podľa neho
-- (platí aj pre Supabase Realtime, ktorý vyhodnocuje tú istú policy). Adresáta
-- systémovej správy určí trigger podľa začiatku textu — DB funkcie, ktoré správy
-- vkladajú (add_client_by_code, end_client_cooperation, request_client_deletion,
-- insert_ai_escalation_message…), sa preto nemusia prepisovať. Neutrálne správy
-- ("Spolupráca s trénerom bola obnovená.", "Zmazanie bolo zrušené…") ostávajú pre oboch.
--
-- Spustiť v Supabase Dashboard → SQL Editor → New query → vložiť celý súbor → Run.
-- Predpokladá 0001–0045. Idempotentné.

alter table public.messages
  add column if not exists audience text not null default 'both';

alter table public.messages drop constraint if exists messages_audience_check;
alter table public.messages
  add constraint messages_audience_check check (audience in ('both', 'client', 'trainer'));

-- Klasifikácia systémovej správy podľa textu — jeden zdroj pre trigger aj backfill.
create or replace function public.system_message_audience(p_body text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when p_body ~ '^\S{1,4} AI asistent upozorňuje: ' or p_body ~ '^\S{1,4} AI Kouč: ' then 'trainer'
    when p_body like '% ťa pridal/-a ako svojho klienta.%'
      or p_body like 'Tréner ukončil spoluprácu.%'
      or p_body like 'Tréner ťa odstránil z portfólia.%'
      or p_body like 'Požiadal/a si o zmazanie svojich dát.%' then 'client'
    else 'both'
  end;
$$;

create or replace function public.messages_set_system_audience()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Len systémové správy s neurčeným adresátom; správy trénera/klienta ostávajú 'both'.
  if new.sender = 'system' and new.audience = 'both' then
    new.audience := public.system_message_audience(new.body);
  end if;
  return new;
end;
$$;

drop trigger if exists messages_set_system_audience on public.messages;
create trigger messages_set_system_audience
  before insert on public.messages
  for each row execute function public.messages_set_system_audience();

-- Backfill existujúcich systémových správ.
update public.messages
  set audience = public.system_message_audience(body)
  where sender = 'system' and audience = 'both';

-- SELECT: vzťah ako v 0008, navyše klient nevidí správy len pre trénera a naopak.
-- Stĺpce riadku správy sú kvalifikované (`messages.`), viď poučenie z 0043.
drop policy if exists "messages_select" on public.messages;
create policy "messages_select"
  on public.messages for select
  using (exists (
    select 1 from public.clients c
    where c.id = messages.client_id
      and (
        (c.user_id = auth.uid() and messages.audience <> 'trainer')
        or (c.trainer_id = auth.uid() and messages.audience <> 'client')
      )
  ));
