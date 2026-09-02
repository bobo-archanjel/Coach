-- FitPilot — ukončenie spolupráce (NIE GDPR výmaz): tréner "vyradí" klienta bežným
-- spôsobom (rozišli sa, pauza), ale dáta ostávajú uložené a spolupráca sa dá kedykoľvek
-- obnoviť. Oddelené od 0013_client_deletion.sql, ktorý rieši skutočnú žiadosť o výmaz
-- (30-dňová lehota → hard delete) — ten flow ostáva nezmenený.
-- Spustiť v Supabase Dashboard → SQL Editor → New query → vložiť celý súbor → Run.
-- Predpokladá 0001 (clients), 0008 (messages), 0013 (deletion_requested_at), 0014
-- (sender='system'). Idempotentné.

alter table public.clients
  add column if not exists ended_at timestamptz,
  add column if not exists ended_notice_dismissed_at timestamptz;

create index if not exists clients_ended_at_idx
  on public.clients (ended_at)
  where ended_at is not null;

-- ---------- ukončenie spolupráce (len tréner — klient toto sám nevyvoláva) ----------
create or replace function public.end_client_cooperation(p_client_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.clients where id = p_client_id and trainer_id = auth.uid()
  ) then
    raise exception 'Nemáš prístup k tomuto klientovi.';
  end if;

  -- no-op ak je už ukončená, alebo ak beží žiadosť o výmaz (tam sa spolupráca
  -- neukončuje, klient smeruje k zmazaniu) — idempotentné, bez duplicitnej správy.
  update public.clients
    set ended_at = now()
    where id = p_client_id
      and ended_at is null
      and deletion_requested_at is null;

  if found then
    insert into public.messages (client_id, sender, sender_id, body)
    values (
      p_client_id,
      'system',
      null,
      'Tréner ukončil spoluprácu. Tvoje tréningy, výživa aj denník zostávajú uložené — spolupráca sa dá kedykoľvek obnoviť.'
    );
  end if;
end;
$$;

revoke execute on function public.end_client_cooperation(uuid) from public, anon;
grant execute on function public.end_client_cooperation(uuid) to authenticated;

-- ---------- obnovenie ukončenej spolupráce (len tréner) ----------
create or replace function public.resume_client_cooperation(p_client_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.clients where id = p_client_id and trainer_id = auth.uid()
  ) then
    raise exception 'Nemáš prístup k tomuto klientovi.';
  end if;

  update public.clients
    set ended_at = null
    where id = p_client_id
      and ended_at is not null;

  if found then
    insert into public.messages (client_id, sender, sender_id, body)
    values (p_client_id, 'system', null, 'Spolupráca s trénerom bola obnovená.');
  end if;
end;
$$;

revoke execute on function public.resume_client_cooperation(uuid) from public, anon;
grant execute on function public.resume_client_cooperation(uuid) to authenticated;

-- ---------- zatvorenie banneru na karte Dnes (len klient — jeho vlastný riadok) ----------
-- Klient nemá priamu UPDATE RLS na clients (0001, len tréner), preto RPC ako pri
-- 0006 claim_client_by_invite. Nová ended_at (po prípadnom ďalšom ukončení) je vždy
-- novšia než tento timestamp, takže banner sa korektne vráti, ak sa spolupráca
-- znova ukončí (lib/portal/data.ts porovnáva ended_at > ended_notice_dismissed_at).
create or replace function public.dismiss_cooperation_notice(p_client_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.clients
    set ended_notice_dismissed_at = now()
    where id = p_client_id and user_id = auth.uid();
end;
$$;

revoke execute on function public.dismiss_cooperation_notice(uuid) from public, anon;
grant execute on function public.dismiss_cooperation_notice(uuid) to authenticated;
