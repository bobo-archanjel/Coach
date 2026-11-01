-- FitPilot — ďalší príjemcovia konceptu plánu (šablóna pre viacerých klientov naraz,
-- feature/barcode-scanner). Spustiť v Supabase Dashboard → SQL Editor → New query →
-- vložiť celý súbor → Run. Predpokladá 0001 (clients), 0002 (workout_plans), 0005
-- (meal_plans). Idempotentné — dá sa spustiť opakovane.
--
-- Tréner použije šablónu pre viacerých klientov → vznikne JEDEN koncept (pre prvého
-- klienta), ostatní sa uložia sem. Tréner koncept upraví v builderi a pri odoslaní
-- (publish) dostane každý príjemca vlastnú kópiu plánu (lib/planRecipients.ts) — riadky
-- sa potom zmažú. Zmazanie konceptu zmaže aj príjemcov (on delete cascade).
-- Vidí ich len tréner — klient nesmie vedieť, komu inému tréner plán posiela.

create table if not exists public.plan_recipients (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  workout_plan_id uuid references public.workout_plans (id) on delete cascade,
  meal_plan_id uuid references public.meal_plans (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint plan_recipients_one_plan check (num_nonnulls(workout_plan_id, meal_plan_id) = 1)
);

create unique index if not exists plan_recipients_workout_uidx
  on public.plan_recipients (workout_plan_id, client_id) where workout_plan_id is not null;
create unique index if not exists plan_recipients_meal_uidx
  on public.plan_recipients (meal_plan_id, client_id) where meal_plan_id is not null;
create index if not exists plan_recipients_trainer_idx on public.plan_recipients (trainer_id);

alter table public.plan_recipients enable row level security;

-- Len tréner: vlastné riadky; pri zápise musí byť jeho aj klient, aj plán.
drop policy if exists "plan_recipients_trainer_all" on public.plan_recipients;
create policy "plan_recipients_trainer_all"
  on public.plan_recipients for all
  using (trainer_id = auth.uid())
  with check (
    trainer_id = auth.uid()
    and exists (select 1 from public.clients c where c.id = client_id and c.trainer_id = auth.uid())
    and (workout_plan_id is null
      or exists (select 1 from public.workout_plans p where p.id = workout_plan_id and p.trainer_id = auth.uid()))
    and (meal_plan_id is null
      or exists (select 1 from public.meal_plans p where p.id = meal_plan_id and p.trainer_id = auth.uid()))
  );

-- anon nemá prístup k žiadnym tabuľkám (0036) — pre istotu aj tu
revoke all on public.plan_recipients from anon;
