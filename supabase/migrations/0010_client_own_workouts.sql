-- FitPilot — klient si vytvára vlastné tréningy (aj bez trénera).
-- Spustiť v Supabase Dashboard → SQL Editor → New query → vložiť celý súbor → Run.
-- Predpokladá 0001_profiles_clients.sql, 0002_workout_builder.sql, 0003_portal_client.sql.
-- Idempotentné — dá sa spustiť opakovane.
--
-- Doteraz platilo: workout_plans MUSEL mať trénera (trainer_id not null) a klient
-- MUSEL byť v databáze trénera (clients.trainer_id not null). Táto migrácia to
-- uvoľňuje pre "self" klienta bez trénera a dáva klientovi CUD práva na jeho
-- vlastné plány/dni. Trénerská strana je nezmenená (trainer_id vyplnené = plán
-- trénera, RLS politiky trénera po starom).

-- ============================================================
--  clients — self klient bez trénera + ukazovateľ na aktívny plán
-- ============================================================
alter table public.clients
  alter column trainer_id drop not null;

-- Ktorý plán klienta je "aktívny" (riadi kartu Dnes). null → najnovší plán
-- (spätne kompatibilné s pôvodným správaním v lib/portal/data.ts).
alter table public.clients
  add column if not exists active_plan_id uuid references public.workout_plans (id) on delete set null;

-- ============================================================
--  workout_plans — plán bez trénera (vytvoril klient)
-- ============================================================
alter table public.workout_plans
  alter column trainer_id drop not null;

-- Zdroj plánu je odvoditeľný: trainer_id is null  ⇔  plán vytvoril klient.

-- ---------- RLS: workout_plans — CUD vlastných klientskych plánov ----------
-- SELECT klient už má z 0002 (workout_plans_select_own_client).
drop policy if exists "workout_plans_insert_own_client" on public.workout_plans;
drop policy if exists "workout_plans_update_own_client" on public.workout_plans;
drop policy if exists "workout_plans_delete_own_client" on public.workout_plans;

create policy "workout_plans_insert_own_client"
  on public.workout_plans for insert
  with check (
    trainer_id is null
    and exists (
      select 1 from public.clients c
      where c.id = workout_plans.client_id and c.user_id = auth.uid()
    )
  );

create policy "workout_plans_update_own_client"
  on public.workout_plans for update
  using (
    trainer_id is null
    and exists (
      select 1 from public.clients c
      where c.id = workout_plans.client_id and c.user_id = auth.uid()
    )
  );

create policy "workout_plans_delete_own_client"
  on public.workout_plans for delete
  using (
    trainer_id is null
    and exists (
      select 1 from public.clients c
      where c.id = workout_plans.client_id and c.user_id = auth.uid()
    )
  );

-- ---------- RLS: workout_days — CUD dní vlastných klientskych plánov ----------
-- SELECT klient už má z 0002 (workout_days_select_own_client).
drop policy if exists "workout_days_insert_own_client" on public.workout_days;
drop policy if exists "workout_days_update_own_client" on public.workout_days;
drop policy if exists "workout_days_delete_own_client" on public.workout_days;

create policy "workout_days_insert_own_client"
  on public.workout_days for insert
  with check (
    exists (
      select 1 from public.workout_plans wp
      join public.clients c on c.id = wp.client_id
      where wp.id = workout_days.plan_id
        and wp.trainer_id is null
        and c.user_id = auth.uid()
    )
  );

create policy "workout_days_update_own_client"
  on public.workout_days for update
  using (
    exists (
      select 1 from public.workout_plans wp
      join public.clients c on c.id = wp.client_id
      where wp.id = workout_days.plan_id
        and wp.trainer_id is null
        and c.user_id = auth.uid()
    )
  );

create policy "workout_days_delete_own_client"
  on public.workout_days for delete
  using (
    exists (
      select 1 from public.workout_plans wp
      join public.clients c on c.id = wp.client_id
      where wp.id = workout_days.plan_id
        and wp.trainer_id is null
        and c.user_id = auth.uid()
    )
  );

-- ============================================================
--  RPC: ensure_self_client() → id "self" clients riadku klienta
-- ============================================================
-- Klient bez trénera nemá žiadny clients riadok (a nevie si ho vytvoriť — INSERT
-- policy dovoľuje len trénerovi). Táto funkcia mu vytvorí "self" riadok
-- (trainer_id null, user_id = on) alebo vráti existujúci (napr. keď klient
-- trénera má — použije sa ten istý riadok, vlastné aj trénerove plány tak visia
-- na jednom clients.id).
create or replace function public.ensure_self_client()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_client_id uuid;
  v_role text;
  v_name text;
  v_email text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select role, full_name, email into v_role, v_name, v_email
  from public.profiles where id = v_uid;

  if v_role is distinct from 'client' then
    raise exception 'not_a_client';
  end if;

  select id into v_client_id
  from public.clients
  where user_id = v_uid
  order by created_at asc
  limit 1;

  if v_client_id is not null then
    return v_client_id;
  end if;

  insert into public.clients (trainer_id, user_id, full_name)
  values (null, v_uid, coalesce(nullif(trim(v_name), ''), split_part(coalesce(v_email, 'Ja'), '@', 1)))
  returning id into v_client_id;

  return v_client_id;
end;
$$;

grant execute on function public.ensure_self_client() to authenticated;

-- ============================================================
--  RPC: set_active_plan(p_plan_id) → prepne aktívny plán klienta
-- ============================================================
-- p_plan_id null → zruší voľbu (Dnes spadne na najnovší plán).
create or replace function public.set_active_plan(p_plan_id uuid)
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

  update public.clients
  set active_plan_id = p_plan_id
  where user_id = v_uid;
end;
$$;

grant execute on function public.set_active_plan(uuid) to authenticated;
