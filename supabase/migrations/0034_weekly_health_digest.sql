-- FitPilot — feature/OnBoarding: weekly in-app digest o medzitýždennej zmene
-- portfolio-health ("3 klienti klesli zo 'Sleduj' do 'Riziko' tento týždeň").
-- Spustiť v Supabase Dashboard → SQL Editor → New query → vložiť celý súbor → Run.
-- Predpokladá 0001 (clients), 0004 (nutrition_profiles), 0007 (food_logs),
-- 0003 (workout_logs), 0018 (pg_cron extension už zapnutá).
--
-- Prečo nová tabuľka namiesto prepočtu naživo: banner na /dashboard by inak pri
-- KAŽDOM načítaní musel prepočítať portfolio-health dvakrát (dnes aj pred 7 dňami)
-- pre všetkých klientov — tabuľka + týždenný pg_cron snapshot je lacnejšie na
-- čítanie a funguje aj keď tréner appku medzitým vôbec neotvorí.
--
-- Bucket per klient (ok/watch/risk/none) je zámerná SQL kópia
-- portfolioHealth()/sortScore()/hasNoSignal() z app/dashboard/analytika/page.tsx
-- a nutritionPct30/trainingPct30 z lib/dashboard/analytics.ts — rovnaký vzor
-- duplikácie ako "meškanie" v migrácii 0033 (cron beží v Postgrese, nie v tomto
-- kóde). Pri zmene prahov/váh v analytics.ts uprav aj get_client_health_buckets().

create table if not exists public.client_health_snapshots (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.profiles (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  week_start date not null,
  bucket text not null check (bucket in ('ok', 'watch', 'risk', 'none')),
  created_at timestamptz not null default now(),
  unique (client_id, week_start)
);

create index if not exists client_health_snapshots_trainer_week_idx
  on public.client_health_snapshots (trainer_id, week_start desc);

alter table public.client_health_snapshots enable row level security;

-- Len SELECT pre vlastníka-trénera — zapisuje výhradne pg_cron (postgres,
-- BYPASSRLS, rovnako ako purge_deleted_clients/send_proactive_ai_checkins),
-- žiadna insert/update/delete policy pre authenticated netreba.
create policy "client_health_snapshots_select_own_trainer"
  on public.client_health_snapshots for select
  using (auth.uid() = trainer_id);

-- Bucket pre všetkých aktívnych klientov (má trénera, nie ukončený/na zmazanie) —
-- 30-dňové okno končiace dneškom, rovnaké prahy ako portfolioHealth() v appke.
create or replace function public.get_client_health_buckets()
returns table (client_id uuid, trainer_id uuid, bucket text)
language sql
stable
set search_path = public
as $$
  with active_clients as (
    select c.id, c.trainer_id
    from public.clients c
    where c.trainer_id is not null and c.ended_at is null and c.deletion_requested_at is null
  ),
  food_by_day as (
    select f.client_id, f.eaten_on, sum(f.grams * f.kcal_100g / 100.0) as kcal
    from public.food_logs f
    where f.client_id in (select id from active_clients)
      and f.eaten_on >= (current_date - 29)
    group by f.client_id, f.eaten_on
  ),
  nutrition_pct as (
    select
      ac.id as client_id,
      case
        when np.calories_target is null then null
        else round(100.0 * count(*) filter (
          where fbd.kcal is not null
            and fbd.kcal >= np.calories_target * 0.85
            and fbd.kcal <= np.calories_target * 1.15
        ) / 30.0)
      end as pct
    from active_clients ac
    left join public.nutrition_profiles np on np.client_id = ac.id
    left join food_by_day fbd on fbd.client_id = ac.id
    group by ac.id, np.calories_target
  ),
  trained as (
    select w.client_id, count(distinct w.performed_on) as trained_days, max(w.performed_on) as last_trained
    from public.workout_logs w
    where w.client_id in (select id from active_clients)
      and w.performed_on >= (current_date - 29)
    group by w.client_id
  ),
  training_pct as (
    select ac.id as client_id, round(100.0 * coalesce(t.trained_days, 0) / 30.0) as pct, t.last_trained
    from active_clients ac
    left join trained t on t.client_id = ac.id
  )
  select
    ac.id as client_id,
    ac.trainer_id,
    case
      when np.pct is null and tp.pct = 0 and tp.last_trained is null then 'none'
      when (case when np.pct is null then tp.pct else (np.pct + tp.pct) / 2.0 end) >= 70 then 'ok'
      when (case when np.pct is null then tp.pct else (np.pct + tp.pct) / 2.0 end) < 40 then 'risk'
      else 'watch'
    end as bucket
  from active_clients ac
  join nutrition_pct np on np.client_id = ac.id
  join training_pct tp on tp.client_id = ac.id;
$$;

-- Nikdy negrantované authenticated/anon — číta cez ňu len snapshot cron nižšie
-- (trénerova appka číta výsledok z client_health_snapshots, nikdy priamo túto funkciu).
revoke execute on function public.get_client_health_buckets() from public, anon, authenticated;

create or replace function public.snapshot_client_health_weekly()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_week_start date := date_trunc('week', now())::date; -- ISO týždeň (pondelok)
begin
  insert into public.client_health_snapshots (trainer_id, client_id, week_start, bucket)
  select trainer_id, client_id, v_week_start, bucket
  from public.get_client_health_buckets()
  on conflict (client_id, week_start) do update
    set bucket = excluded.bucket, trainer_id = excluded.trainer_id;
end;
$$;

revoke execute on function public.snapshot_client_health_weekly() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'snapshot-client-health-weekly') then
    perform cron.unschedule('snapshot-client-health-weekly');
  end if;
end $$;

-- Pondelok 6:00 (pred pracovnou dobou trénera) — banner potrebuje aspoň 2
-- odlišné week_start hodnoty, takže prvý zmysluplný digest príde v 2. týždni.
select cron.schedule(
  'snapshot-client-health-weekly',
  '0 6 * * 1',
  $$select public.snapshot_client_health_weekly();$$
);
