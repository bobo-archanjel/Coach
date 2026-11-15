-- FitPilot — kto vytvoril plán odcvičeného tréningu (feature/fixing).
-- Spustiť v Supabase Dashboard → SQL Editor → New query → vložiť celý súbor → Run.
-- Predpokladá 0048 (plan_snapshot + triggery). Idempotentné.
--
-- Tréner v „Posledná aktivita“ pri klientovi nemá vidieť tréningy z plánov, ktoré si
-- klient vytvoril sám. Vlastné plány klienta (trainer_id is null, 0010) tréner cez RLS
-- nevidí, takže po ich zmazaní by sa už nedalo zistiť, odkiaľ záznam pochádza. Snapshot
-- plánu (0048) si preto pamätá aj `plan_trainer_id` — vlastníka plánu v čase tréningu
-- (null = vlastný tréning klienta).

-- 1) Snapshot pri dokončení — rovnaký ako v 0048, navyše plan_trainer_id.
create or replace function public.workout_log_fill_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'completed' and (tg_op = 'INSERT' or old.status is distinct from 'completed') then
    new.completed_at := now();
    new.plan_snapshot := (
      select jsonb_build_object(
        'plan_id', wp.id,
        'plan_name', wp.name,
        'plan_trainer_id', wp.trainer_id,
        'day_id', wd.id,
        'day_name', wd.name,
        'exercises', coalesce(wd.exercises, '[]'::jsonb),
        'backfilled', false
      )
      from public.workout_days wd
      join public.workout_plans wp on wp.id = wd.plan_id
      where wd.id = new.workout_day_id
    );
  elsif tg_op = 'INSERT' then
    new.completed_at := null;
    new.plan_snapshot := null;
  end if;
  return new;
end;
$$;

revoke execute on function public.workout_log_fill_snapshot() from public, anon, authenticated;

-- 2) Doplnenie do existujúcich záznamov, ktorých plán ešte existuje. Dokončené záznamy
--    sú zamknuté (workout_logs_a_guard_completed) — na čas doplnenia sa zámok vypne.
--    Záznam zo zmazaného plánu vlastníka nezistí — appka ho vtedy ukazuje.
alter table public.workout_logs disable trigger workout_logs_a_guard_completed;

update public.workout_logs wl
set plan_snapshot = wl.plan_snapshot || jsonb_build_object('plan_trainer_id', wp.trainer_id)
from public.workout_plans wp
where wl.plan_snapshot is not null
  and not (wl.plan_snapshot ? 'plan_trainer_id')
  and wp.id = (wl.plan_snapshot ->> 'plan_id')::uuid;

alter table public.workout_logs enable trigger workout_logs_a_guard_completed;
