-- FitPilot — notifikácia klienta o GDPR zmazaní (0018_client_deletion.sql).
-- Spustiť v Supabase Dashboard → SQL Editor → New query → vložiť celý súbor → Run.
-- Predpokladá 0008 (messages) a 0018 (request_client_deletion/cancel_client_deletion). Idempotentné.
--
-- Riešenie: banner na karte Dnes (lib/portal/data.ts → PortalData.deletionNotice, žiadna
-- DB zmena) + automatická systémová správa vo vlákne /portal/chat — vlákno je jediný
-- "live" doručovací kanál medzi trénerom a klientom (appka nemá e-mail/push), takže
-- klient dostane aj červenú notifikačnú bodku na tabe Chat, nielen tichý banner.

-- 'system' — automatická správa, nepatrí ani trénerovi ani klientovi (sender_id ostáva
-- NULL, nikto ju "nenapísal"). RLS messages_insert (0008) nemá vetvu pre 'system' —
-- vloží ju výhradne SECURITY DEFINER funkcia nižšie, nikdy priamy insert od používateľa.
alter table public.messages drop constraint if exists messages_sender_check;
alter table public.messages add constraint messages_sender_check
  check (sender in ('trainer', 'client', 'system'));

-- mark_messages_read (0008) pôvodne predpokladalo presne 2 strany vo vlákne
-- ("sender <> v_reader" = od tej druhej strany). S 'system' by to trénerovi pri
-- otvorení vlastného chatu s klientom omylom označilo systémovú správu — adresovanú
-- KLIENTOVI — ako prečítanú skôr, než ju klient vôbec videl, a červená bodka na jeho
-- tabe Chat by nikdy nenaskočila. Explicitný zoznam podľa role namiesto negácie.
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
        or (v_reader = 'trainer' and sender = 'client')
      );
end;
$$;

revoke execute on function public.mark_messages_read(uuid) from public, anon;
grant execute on function public.mark_messages_read(uuid) to authenticated;

-- request_client_deletion: po úspešnej (prvej) žiadosti pošle systémovú správu do vlákna.
create or replace function public.request_client_deletion(p_client_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  select case
    when exists (select 1 from public.clients where id = p_client_id and trainer_id = auth.uid()) then 'trainer'
    when exists (select 1 from public.clients where id = p_client_id and user_id = auth.uid()) then 'client'
    else null
  end into v_role;

  if v_role is null then
    raise exception 'Nemáš prístup k tomuto klientovi.';
  end if;

  -- idempotentné — ak už žiadosť beží, nezresetuje sa 30-dňová lehota druhou stranou
  -- (a nepošle sa duplicitná správa)
  update public.clients
    set deletion_requested_at = now(), deletion_requested_by = v_role
    where id = p_client_id
      and deletion_requested_at is null;

  if found then
    insert into public.messages (client_id, sender, sender_id, body)
    values (
      p_client_id,
      'system',
      null,
      case v_role
        when 'trainer' then 'Tréner ťa odstránil z portfólia. Tvoje tréningy, výživa, denník aj správy sa natrvalo vymažú o 30 dní, pokiaľ zmazanie nezruší.'
        else 'Požiadal/a si o zmazanie svojich dát. Vymažú sa o 30 dní, pokiaľ zmazanie nezrušíš v Profile.'
      end
    );
  end if;
end;
$$;

revoke execute on function public.request_client_deletion(uuid) from public, anon;
grant execute on function public.request_client_deletion(uuid) to authenticated;

-- cancel_client_deletion: rovnako ohlási zrušenie, nech vlákno nezostane so zastaranou
-- "zmažeme ťa" správou bez vysvetlenia, že to už neplatí.
create or replace function public.cancel_client_deletion(p_client_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.clients
    where id = p_client_id
      and (trainer_id = auth.uid() or user_id = auth.uid())
  ) then
    raise exception 'Nemáš prístup k tomuto klientovi.';
  end if;

  update public.clients
    set deletion_requested_at = null, deletion_requested_by = null
    where id = p_client_id
      and deletion_requested_at is not null;

  if found then
    insert into public.messages (client_id, sender, sender_id, body)
    values (p_client_id, 'system', null, 'Zmazanie bolo zrušené — dáta ostávajú zachované.');
  end if;
end;
$$;

revoke execute on function public.cancel_client_deletion(uuid) from public, anon;
grant execute on function public.cancel_client_deletion(uuid) to authenticated;
