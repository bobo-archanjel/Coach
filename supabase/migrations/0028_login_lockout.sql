-- FitPilot — feature/optimalizacia (security audit): account lockout po
-- opakovaných zlyhaniach prihlásenia. Predtým prihlásenie išlo priamo z
-- prehliadača na Supabase Auth API (supabase.auth.signInWithPassword) — náš
-- server request vôbec nevidel, takže sme nemali kde počítať pokusy. Tréner
-- teraz prechádza cez Server Action (app/prihlasenie/actions.ts), ktorá pred
-- KAŽDÝM pokusom zavolá check_login_lockout a po zlyhaní record_failed_login.
--
-- Tabuľka nemá RLS policy vôbec (= nikto, ani authenticated, sa k nej nedostane
-- priamo) — jediný prístup je cez tri `security definer` funkcie nižšie, rovnaký
-- vzor ako mark_messages_read (0019) či claim_client_by_invite. Dôvod: počítadlo
-- pokusov beží ešte PRED prihlásením (anon rola), takže bežná RLS by musela byť
-- otvorená pre anon — cez funkciu vieme presne obmedziť, čo sa dá spraviť
-- (len insert vlastného pokusu + count pre KONKRÉTNY e-mail, nikdy čítanie
-- cudzích záznamov).
--
-- Spustiť v Supabase Dashboard → SQL Editor → New query → vložiť celý súbor → Run.

create table if not exists public.login_attempts (
  id uuid primary key default gen_random_uuid(),
  identifier text not null, -- lowercased e-mail
  created_at timestamptz not null default now()
);

create index if not exists login_attempts_identifier_created_idx
  on public.login_attempts (identifier, created_at desc);

alter table public.login_attempts enable row level security;
-- Žiadne policy = žiadny priamy prístup pre anon/authenticated. Len security
-- definer funkcie nižšie (bežia ako vlastník tabuľky) môžu čítať/zapisovať.

-- True = identifikátor (e-mail) je momentálne uzamknutý, appka nemá volať
-- signInWithPassword vôbec (šetrí aj vlastnú kvótu Supabase Auth rate limitu).
create or replace function public.check_login_lockout(p_identifier text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  select count(*) into v_count
  from public.login_attempts
  where identifier = lower(p_identifier)
    and created_at > now() - interval '15 minutes';
  return v_count >= 5;
end;
$$;

-- Zapíše jeden neúspešný pokus. Priebežne zmaže záznamy staršie ako deň (lacné —
-- beží len pri zlyhaní, nie pri každom requeste), nech tabuľka nerastie donekonečna.
create or replace function public.record_failed_login(p_identifier text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.login_attempts (identifier) values (lower(p_identifier));
  delete from public.login_attempts where created_at < now() - interval '1 day';
end;
$$;

-- Po úspešnom prihlásení vynuluje počítadlo pre daný e-mail.
create or replace function public.clear_login_attempts(p_identifier text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.login_attempts where identifier = lower(p_identifier);
end;
$$;

revoke all on public.login_attempts from public, anon, authenticated;

revoke execute on function public.check_login_lockout(text) from public;
grant execute on function public.check_login_lockout(text) to anon, authenticated;

revoke execute on function public.record_failed_login(text) from public;
grant execute on function public.record_failed_login(text) to anon, authenticated;

revoke execute on function public.clear_login_attempts(text) from public;
grant execute on function public.clear_login_attempts(text) to anon, authenticated;
