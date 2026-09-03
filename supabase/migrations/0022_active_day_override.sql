-- FitPilot — bug: "Začať tréning" pre konkrétny deň v /portal/trening (0021/deň-list
-- prepracovanie) len aktivovalo plán; karta Dnes si aj tak sama dopočítala "ďalší
-- deň v rotácii" (lib/portal/data.ts), takže sa dokopy zalogoval iný deň, než ktorý
-- si klient v zozname vybral a odcvičil — vybraný deň potom v zozname nikdy nedostal
-- badge "Hotovo". Táto migrácia pridáva explicitný "aktívny deň" override, ktorý má
-- prednosť pred automatickou rotáciou, kým sa nespotrebuje (zaloguje).
-- Spustiť v Supabase Dashboard → SQL Editor → New query → vložiť celý súbor → Run.
-- Idempotentné.

alter table public.clients
  add column if not exists active_day_id uuid references public.workout_days (id) on delete set null;

-- ---------- RPC: set_active_plan — rozšírené o voliteľný p_day_id ----------
-- Pôvodná 1-argumentová verzia (0010) sa musí zrušiť, inak by volanie s jedným
-- argumentom bolo nejednoznačné medzi starou a novou (defaultnou) signatúrou.
drop function if exists public.set_active_plan(uuid);

create or replace function public.set_active_plan(p_plan_id uuid, p_day_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_plan_id is not null then
    if not exists (
      select 1 from public.workout_plans wp
      join public.clients c on c.id = wp.client_id
      where wp.id = p_plan_id and c.user_id = v_uid
    ) then
      raise exception 'plan_not_found';
    end if;
  end if;

  if p_day_id is not null then
    if not exists (
      select 1 from public.workout_days wd
      where wd.id = p_day_id and wd.plan_id = p_plan_id
    ) then
      raise exception 'day_not_found';
    end if;
  end if;

  update public.clients
  set active_plan_id = p_plan_id,
      active_day_id = p_day_id
  where user_id = v_uid;
end;
$$;

revoke execute on function public.set_active_plan(uuid, uuid) from public, anon;
grant execute on function public.set_active_plan(uuid, uuid) to authenticated;

-- ---------- RPC: spotrebovanie active_day_id po zalogovaní ----------
-- Klient nemá priamu UPDATE RLS na `clients` (len tréner, 0001) — rovnaký dôvod
-- ako existujúce dismiss_cooperation_notice/set_active_plan. Podmienka na p_day_id
-- je len poistka proti pretretiu novšieho výberu (napr. súbežná zmena dňa).
create or replace function public.clear_active_day_if_matches(p_day_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.clients
  set active_day_id = null
  where user_id = auth.uid() and active_day_id = p_day_id;
end;
$$;

revoke execute on function public.clear_active_day_if_matches(uuid) from public, anon;
grant execute on function public.clear_active_day_if_matches(uuid) to authenticated;
