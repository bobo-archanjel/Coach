-- FitPilot — úpravy zverejneného tréningového plánu sa klientovi ukážu až po „Uložiť úpravy“
-- (feature/nahlad-analytika). Spustiť v Supabase Dashboard → SQL Editor → New query →
-- vložiť celý súbor → Run. Idempotentné, nemení existujúce dáta.
--
-- Doteraz builder trénera ukladal každú zmenu hneď (server akcia na každý klik) a pri
-- zverejnenom pláne ju klient okamžite videl. Teraz prvá úprava zverejneného plánu vytvorí
-- skrytú KÓPIU (workout_plans.edit_of = pôvodný plán, published = false → klient ju nevidí,
-- portál číta len published = true). Všetky ďalšie úpravy idú do kópie. „Uložiť úpravy“
-- (apply_plan_edits) ich v jednej transakcii prenesie do pôvodného plánu a kópiu zmaže,
-- „Zahodiť úpravy“ kópiu len zmaže (on delete cascade zmaže aj jej dni).
--
-- Dni kópie si pamätajú, ktorý deň pôvodného plánu nahrádzajú (source_day_id) — pri uložení
-- sa pôvodný deň UPRAVÍ na mieste (rovnaké id → zápisy tréningov, clients.active_day_id aj
-- entry_id cvikov ostanú platné). Deň, ktorý klient medzitým odcvičil, sa nemení ani nemaže.

alter table public.workout_plans
  add column if not exists edit_of uuid references public.workout_plans (id) on delete cascade;

-- najviac jedna rozpracovaná úprava na plán
create unique index if not exists workout_plans_edit_of_key
  on public.workout_plans (edit_of) where edit_of is not null;

alter table public.workout_days
  add column if not exists source_day_id uuid references public.workout_days (id) on delete set null;

-- ---------- začatie úpravy: vráti plán, do ktorého sa majú zmeny zapisovať ----------
-- Koncept (nezverejnený) alebo už kópia → vráti sám seba (ukladá sa hneď ako doteraz).
-- Zverejnený plán → existujúca kópia, inak ju vytvorí. security invoker = RLS trénera.
create or replace function public.start_plan_edit(p_plan uuid)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_plan public.workout_plans%rowtype;
  v_draft uuid;
begin
  select * into v_plan from public.workout_plans
  where id = p_plan and trainer_id = auth.uid()
  for update;
  if not found then
    raise exception 'plan_not_found';
  end if;
  if v_plan.edit_of is not null or not v_plan.published then
    return v_plan.id;
  end if;
  -- celý odcvičený plán (badge „Hotovo“) sa neupravuje — kópia netreba, akcia ho aj tak odmietne
  if exists (select 1 from public.workout_days d where d.plan_id = p_plan)
     and not exists (
       select 1 from public.workout_days d
       where d.plan_id = p_plan
         and not exists (select 1 from public.workout_logs l where l.workout_day_id = d.id)
     ) then
    return v_plan.id;
  end if;

  select id into v_draft from public.workout_plans where edit_of = p_plan;
  if v_draft is not null then
    return v_draft;
  end if;

  insert into public.workout_plans (client_id, trainer_id, name, published, edit_of)
  values (v_plan.client_id, v_plan.trainer_id, v_plan.name, false, p_plan)
  returning id into v_draft;

  insert into public.workout_days (plan_id, day_number, name, exercises, source_day_id)
  select v_draft, d.day_number, d.name, d.exercises, d.id
  from public.workout_days d
  where d.plan_id = p_plan;

  return v_draft;
end;
$$;

-- ---------- uloženie úprav do zverejneného plánu (jedna transakcia) ----------
create or replace function public.apply_plan_edits(p_plan uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_draft uuid;
  v_name text;
begin
  perform 1 from public.workout_plans
  where id = p_plan and trainer_id = auth.uid() and edit_of is null
  for update;
  if not found then
    raise exception 'plan_not_found';
  end if;

  select id, name into v_draft, v_name from public.workout_plans where edit_of = p_plan;
  if v_draft is null then
    return;
  end if;

  -- dni, ktoré tréner v úprave zmazal (a klient ich ešte neodcvičil)
  delete from public.workout_days d
  where d.plan_id = p_plan
    and not exists (select 1 from public.workout_days s where s.plan_id = v_draft and s.source_day_id = d.id)
    and not exists (select 1 from public.workout_logs l where l.workout_day_id = d.id);

  -- upravené dni — na mieste (rovnaké id); odcvičený deň ostáva tak, ako ho klient cvičil
  update public.workout_days d
  set name = s.name, day_number = s.day_number, exercises = s.exercises
  from public.workout_days s
  where s.plan_id = v_draft
    and s.source_day_id = d.id
    and d.plan_id = p_plan
    and not exists (select 1 from public.workout_logs l where l.workout_day_id = d.id);

  -- nové dni (pridané, skopírované)
  insert into public.workout_days (plan_id, day_number, name, exercises)
  select p_plan, s.day_number, s.name, s.exercises
  from public.workout_days s
  where s.plan_id = v_draft
    and (
      s.source_day_id is null
      or not exists (select 1 from public.workout_days d where d.id = s.source_day_id and d.plan_id = p_plan)
    );

  update public.workout_plans set name = v_name where id = p_plan;
  delete from public.workout_plans where id = v_draft;
end;
$$;

revoke all on function public.start_plan_edit(uuid) from public, anon;
revoke all on function public.apply_plan_edits(uuid) from public, anon;
grant execute on function public.start_plan_edit(uuid) to authenticated;
grant execute on function public.apply_plan_edits(uuid) to authenticated;
