-- FitPilot — vlastný jedálniček klienta (feature/vlastny-jedalnicek).
-- Spustiť v Supabase Dashboard → SQL Editor → New query → vložiť celý súbor → Run.
-- Predpokladá 0005 (meal_plans / meal_days), 0010 (ensure_self_client), 0044 (published),
-- 0062 (meal_plans.trainer_id nullable). Idempotentné.
--
-- Vzor: vlastný tréning (0010). Vlastný jedálniček = meal_plans.trainer_id IS NULL
-- (rovnako vznikne aj prevzatím po odchode trénera — 0062 / 0064; aj ten si klient
-- odteraz môže upraviť). Tréner ho nevidí — jeho politiky (0036) žiadajú
-- trainer_id = auth.uid().
--
-- Aktívny jedálniček (sekcia Strava): clients.active_meal_plan_id, nastavuje ho klient
-- cez set_active_meal_plan (klient nemá UPDATE na clients). NULL = ako doteraz najnovší
-- zverejnený; zvolený platí, kým je zverejnený (nový jedálniček od trénera voľbu neprepíše).

-- ---------- RLS: meal_plans — CUD vlastných jedálničkov klienta ----------
-- SELECT klient už má z 0005 (meal_plans_select_own_client).
drop policy if exists "meal_plans_insert_own_client" on public.meal_plans;
drop policy if exists "meal_plans_update_own_client" on public.meal_plans;
drop policy if exists "meal_plans_delete_own_client" on public.meal_plans;

create policy "meal_plans_insert_own_client"
  on public.meal_plans for insert
  with check (
    trainer_id is null
    and exists (
      select 1 from public.clients c
      where c.id = meal_plans.client_id and c.user_id = auth.uid()
    )
  );

create policy "meal_plans_update_own_client"
  on public.meal_plans for update
  using (
    trainer_id is null
    and exists (
      select 1 from public.clients c
      where c.id = meal_plans.client_id and c.user_id = auth.uid()
    )
  )
  with check (
    trainer_id is null
    and exists (
      select 1 from public.clients c
      where c.id = meal_plans.client_id and c.user_id = auth.uid()
    )
  );

create policy "meal_plans_delete_own_client"
  on public.meal_plans for delete
  using (
    trainer_id is null
    and exists (
      select 1 from public.clients c
      where c.id = meal_plans.client_id and c.user_id = auth.uid()
    )
  );

-- ---------- RLS: meal_days — CUD dní vlastných jedálničkov ----------
-- SELECT klient už má z 0005 (meal_days_select_own_client).
drop policy if exists "meal_days_insert_own_client" on public.meal_days;
drop policy if exists "meal_days_update_own_client" on public.meal_days;
drop policy if exists "meal_days_delete_own_client" on public.meal_days;

create policy "meal_days_insert_own_client"
  on public.meal_days for insert
  with check (
    exists (
      select 1 from public.meal_plans mp
      join public.clients c on c.id = mp.client_id
      where mp.id = meal_days.plan_id
        and mp.trainer_id is null
        and c.user_id = auth.uid()
    )
  );

create policy "meal_days_update_own_client"
  on public.meal_days for update
  using (
    exists (
      select 1 from public.meal_plans mp
      join public.clients c on c.id = mp.client_id
      where mp.id = meal_days.plan_id
        and mp.trainer_id is null
        and c.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.meal_plans mp
      join public.clients c on c.id = mp.client_id
      where mp.id = meal_days.plan_id
        and mp.trainer_id is null
        and c.user_id = auth.uid()
    )
  );

create policy "meal_days_delete_own_client"
  on public.meal_days for delete
  using (
    exists (
      select 1 from public.meal_plans mp
      join public.clients c on c.id = mp.client_id
      where mp.id = meal_days.plan_id
        and mp.trainer_id is null
        and c.user_id = auth.uid()
    )
  );

-- ---------- aktívny jedálniček ----------
alter table public.clients
  add column if not exists active_meal_plan_id uuid references public.meal_plans (id) on delete set null;

create or replace function public.set_active_meal_plan(p_plan_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_client_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  -- len zverejnený jedálniček vlastného klienta (koncept trénera klient nevidí)
  select mp.client_id into v_client_id
  from public.meal_plans mp
  join public.clients c on c.id = mp.client_id
  where mp.id = p_plan_id and mp.published and c.user_id = v_uid;

  if v_client_id is null then
    raise exception 'plan_not_found';
  end if;

  update public.clients
  set active_meal_plan_id = p_plan_id
  where id = v_client_id and user_id = v_uid;
end;
$$;

revoke execute on function public.set_active_meal_plan(uuid) from public, anon;
grant execute on function public.set_active_meal_plan(uuid) to authenticated;
