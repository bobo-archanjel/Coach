-- FitPilot — správy patria spolupráci tréner ↔ klient, nie celému riadku klienta
-- (feature/spravy-gdpr). Spustiť v Supabase Dashboard → SQL Editor → New query →
-- vložiť celý súbor → Run. Predpokladá 0046 (messages.audience + messages_select),
-- 0047 (clients.paired_at), 0019 (mark_messages_read). Idempotentné.
--
-- Problém (GDPR — únik osobných údajov medzi trénermi): vlákno správ visí na
-- clients.id a RLS messages_select pustí každého, kto je AKTUÁLNE trénerom klienta.
-- Keď klient odíde od trénera A (leave_trainer) a pripojí sa k trénerovi B, B videl
-- celú jeho konverzáciu s A (vrátane zdravotných vecí) a vedel jeho neprečítané správy
-- trénerovi A označiť ako prečítané. Overené regresným testom H7.
--
-- Teraz:
--  - messages.trainer_id = tréner spolupráce, v ktorej správa vznikla. Pri vložení ho
--    vždy nastaví trigger podľa clients.trainer_id (nedá sa podvrhnúť z API).
--    Zámerne bez FK na profiles: atribúcia ostane aj po zmazaní účtu trénera a druhý FK
--    messages → profiles by rozbil PostgREST embedy (popri sender_id).
--  - tréner vidí (aj cez Realtime, ktorý vyhodnocuje tú istú policy) a označuje ako
--    prečítané len správy svojej spolupráce; klient vidí celú svoju históriu ako doteraz.
--  - backfill existujúcich správ: správa trénera → jej autor; ostatné od začiatku
--    aktuálnej spolupráce (paired_at) → aktuálny tréner; staršie → tréner poslednej
--    trénerovej správy pred ňou (inak najbližšej po nej). Čo sa priradiť nedá, ostane
--    NULL = neuvidí to žiadny tréner (radšej skryť než ukázať cudziemu).

alter table public.messages add column if not exists trainer_id uuid;

create index if not exists messages_client_trainer_idx
  on public.messages (client_id, trainer_id, created_at);

-- ---------- pri vložení: tréner aktuálnej spolupráce ----------
create or replace function public.messages_set_trainer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.trainer_id := (select c.trainer_id from public.clients c where c.id = new.client_id);
  return new;
end;
$$;

revoke execute on function public.messages_set_trainer() from public, anon, authenticated;

drop trigger if exists messages_set_trainer_trg on public.messages;
create trigger messages_set_trainer_trg
  before insert on public.messages
  for each row execute function public.messages_set_trainer();

-- ---------- backfill ----------
-- 1) správy trénera = ich autor
update public.messages
  set trainer_id = sender_id
  where trainer_id is null and sender = 'trainer' and sender_id is not null;

-- 2) od začiatku aktuálnej spolupráce = aktuálny tréner
update public.messages m
  set trainer_id = c.trainer_id
  from public.clients c
  where m.trainer_id is null
    and c.id = m.client_id
    and c.trainer_id is not null
    and m.created_at >= coalesce(c.paired_at, '-infinity'::timestamptz);

-- 3) staršie správy: tréner najbližšej predchádzajúcej trénerovej správy vo vlákne
update public.messages m
  set trainer_id = (
    select t.sender_id from public.messages t
    where t.client_id = m.client_id and t.sender = 'trainer' and t.sender_id is not null
      and t.created_at <= m.created_at
    order by t.created_at desc
    limit 1
  )
  where m.trainer_id is null;

-- 4) … alebo nasledujúcej (napr. klient napísal prvý), no len pred aktuálnou spoluprácou
update public.messages m
  set trainer_id = (
    select t.sender_id from public.messages t
    join public.clients c on c.id = t.client_id
    where t.client_id = m.client_id and t.sender = 'trainer' and t.sender_id is not null
      and t.created_at > m.created_at
      and t.created_at < coalesce(c.paired_at, 'infinity'::timestamptz)
    order by t.created_at asc
    limit 1
  )
  where m.trainer_id is null;

-- ---------- SELECT: tréner len správy svojej spolupráce ----------
drop policy if exists "messages_select" on public.messages;
create policy "messages_select"
  on public.messages for select
  using (exists (
    select 1 from public.clients c
    where c.id = messages.client_id
      and (
        (c.user_id = auth.uid() and messages.audience <> 'trainer')
        or (c.trainer_id = auth.uid() and messages.trainer_id = auth.uid() and messages.audience <> 'client')
      )
  ));

-- ---------- prečítané: tréner len správy svojej spolupráce ----------
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
    return;
  end if;

  update public.messages
    set read_at = now()
    where client_id = p_client_id
      and read_at is null
      and (
        (v_reader = 'client' and sender in ('trainer', 'system'))
        or (v_reader = 'trainer' and sender = 'client' and trainer_id = auth.uid())
      );
end;
$$;

revoke execute on function public.mark_messages_read(uuid) from public, anon;
grant execute on function public.mark_messages_read(uuid) to authenticated;
