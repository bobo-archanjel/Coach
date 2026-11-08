-- FitPilot — voľba aktívneho tréningového plánu (feature/active-training).
-- Spustiť v Supabase Dashboard → SQL Editor → New query → vložiť celý súbor → Run.
-- Predpokladá 0010 (clients.active_plan_id), 0021 (workout_plans.published),
-- 0022 (clients.active_day_id, set_active_plan). Idempotentné.
--
-- Kartu Dnes v portáli riadi clients.active_plan_id (inak najnovší zverejnený plán).
-- Doteraz sa aktívny plán prepínal sám na každý nový vlastný plán klienta a meniť ho
-- vedel len klient (set_active_plan). Odteraz:
--   1. aktívny plán vie zvoliť aj tréner svojmu klientovi (set_client_active_plan),
--   2. nový zverejnený plán už zvolený aktívny plán neprebije — aktívnym sa stane sám
--      len vtedy, keď klient platný aktívny plán nemá (trigger nižšie).

-- ---------- RPC: tréner nastaví aktívny plán svojmu klientovi ----------
-- Tréner nemá UPDATE na clients.active_plan_id (stĺpcové granty, 0036) — preto
-- security definer s vlastnou kontrolou: klient musí patriť trénerovi a plán klientovi,
-- a plán musí byť zverejnený (koncept klient nevidí, na karte Dnes by nebol).
-- active_day_id sa vynuluje — výber konkrétneho dňa patril predošlému plánu.
create or replace function public.set_client_active_plan(p_client_id uuid, p_plan_id uuid)
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

  if not exists (
    select 1 from public.clients c
    where c.id = p_client_id and c.trainer_id = v_uid
  ) then
    raise exception 'client_not_found';
  end if;

  if not exists (
    select 1 from public.workout_plans wp
    where wp.id = p_plan_id and wp.client_id = p_client_id and wp.published
  ) then
    raise exception 'plan_not_found';
  end if;

  update public.clients
  set active_plan_id = p_plan_id,
      active_day_id = null
  where id = p_client_id;
end;
$$;

revoke execute on function public.set_client_active_plan(uuid, uuid) from public, anon;
grant execute on function public.set_client_active_plan(uuid, uuid) to authenticated;

-- ---------- trigger: nový plán neprebije zvolený aktívny plán ----------
-- Spustí sa, keď plán práve začína byť zverejnený: INSERT už zverejneného plánu
-- (vlastný plán klienta, kópia pre ďalšieho príjemcu 0052, …) alebo UPDATE konceptu
-- trénera na zverejnený. Ak klient platný aktívny plán NEMÁ (null, alebo ukazuje na
-- nezverejnený), pripne doterajší najnovší zverejnený plán — teda presne ten, ktorý
-- karta Dnes doteraz ukazovala ako "najnovší" — a karta Dnes sa novým plánom nezmení.
-- Až keď iný zverejnený plán nie je (prvý plán klienta), aktívnym sa stane nový.
-- security definer: zverejňuje aj klient (vlastný plán), ktorý UPDATE na clients nemá.
create or replace function public.pin_active_plan_on_publish()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current uuid;
  v_previous uuid;
begin
  if new.published is not true then
    return null;
  end if;
  if tg_op = 'UPDATE' and old.published is true then
    return null;
  end if;

  select c.active_plan_id into v_current
  from public.clients c
  where c.id = new.client_id
  for update;
  if not found then
    return null;
  end if;

  if v_current is not null and exists (
    select 1 from public.workout_plans wp
    where wp.id = v_current and wp.client_id = new.client_id and wp.published
  ) then
    return null;
  end if;

  select wp.id into v_previous
  from public.workout_plans wp
  where wp.client_id = new.client_id and wp.published and wp.id <> new.id
  order by wp.created_at desc
  limit 1;

  update public.clients
  set active_plan_id = coalesce(v_previous, new.id)
  where id = new.client_id;

  return null;
end;
$$;

revoke execute on function public.pin_active_plan_on_publish() from public, anon, authenticated;

drop trigger if exists workout_plans_pin_active on public.workout_plans;
create trigger workout_plans_pin_active
  after insert or update of published on public.workout_plans
  for each row execute function public.pin_active_plan_on_publish();
