-- FitPilot — GDPR: právo na výmaz pre chat + všetky klientske dáta.
-- Spustiť v Supabase Dashboard → SQL Editor → New query → vložiť celý súbor → Run.
-- Predpokladá 0001 (clients). Idempotentné.
--
-- Rozsah: zmazanie VZŤAHU klient↔tréner a všetkých naň naviazaných dát (workout_plans,
-- nutrition_profiles, food_logs, meal_plans, messages, coach_notes — všetky už majú
-- `on delete cascade` na clients.id, viď 0002/0003/0004/0005/0007/0008). NEmaže
-- prihlasovací účet (`profiles`/auth.users) — `clients.user_id` je `on delete set null`,
-- klient môže mať self-client dáta alebo prejsť k inému trénerovi.
--
-- Politika (odsúhlasené 2026-09-01): žiadosť o zmazanie môže podať tréner AJ klient
-- (obaja sú účastníci vzťahu); 30-dňová grace period (dá sa zrušiť); po lehote
-- HARD DELETE (nie anonymizácia) cez denný pg_cron job.

alter table public.clients
  add column if not exists deletion_requested_at timestamptz,
  add column if not exists deletion_requested_by text
    check (deletion_requested_by in ('trainer', 'client'));

create index if not exists clients_deletion_pending_idx
  on public.clients (deletion_requested_at)
  where deletion_requested_at is not null;

-- ---------- žiadosť o zmazanie (tréner alebo klient, security definer —
-- klient nemá priamu UPDATE RLS na clients, viď 0001) ----------
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
  update public.clients
    set deletion_requested_at = now(), deletion_requested_by = v_role
    where id = p_client_id
      and deletion_requested_at is null;
end;
$$;

revoke execute on function public.request_client_deletion(uuid) from public, anon;
grant execute on function public.request_client_deletion(uuid) to authenticated;

-- ---------- zrušenie žiadosti (poistka pred omylom počas grace period) ----------
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
    where id = p_client_id;
end;
$$;

revoke execute on function public.cancel_client_deletion(uuid) from public, anon;
grant execute on function public.cancel_client_deletion(uuid) to authenticated;

-- ---------- denné čistenie po lehote (HARD DELETE, cascade zmaže všetko naviazané) ----------
-- Nikdy negrantované authenticated/anon — spúšťa len pg_cron ako vlastník joby (postgres).
create or replace function public.purge_deleted_clients()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.clients
  where deletion_requested_at is not null
    and deletion_requested_at < now() - interval '30 days';
end;
$$;

revoke execute on function public.purge_deleted_clients() from public, anon, authenticated;

-- pg_cron: na Supabase cloude zvyčajne treba najprv zapnúť v Dashboard → Database →
-- Extensions ("pg_cron"), potom tento CREATE EXTENSION prejde bez chyby (no-op).
-- Na self-hosted (nexus, budúci presun) treba pg_cron povolený v postgresql.conf
-- (shared_preload_libraries) — mimo rozsahu tejto migrácie, rieši sa pri presune.
create extension if not exists pg_cron;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'purge-deleted-clients-daily') then
    perform cron.unschedule('purge-deleted-clients-daily');
  end if;
end $$;

select cron.schedule(
  'purge-deleted-clients-daily',
  '0 3 * * *',
  $$select public.purge_deleted_clients();$$
);
