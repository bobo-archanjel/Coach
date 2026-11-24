-- FitPilot — gamifikácia klienta, fáza B (feature/Stripe).
-- Spustiť v Supabase Dashboard → SQL Editor → New query → vložiť celý súbor → Run.
-- Predpokladá 0078 (client_achievements, high_fives). Idempotentné (dá sa spustiť opakovane).
--
-- Čo pribúda:
--  1. challenges / challenge_participants — výzvy trénera (Pro, Business),
--  2. trainer_gamification_settings — tréner vie vypnúť rebríček pre všetkých svojich klientov,
--  3. gamification_settings — nastavenie klienta (viditeľnosť v rebríčku, naposledy videný týždenný súhrn),
--  4. client_achievements.kind rozšírené o 'challenge' (odznak za dokončenú výzvu, údaje v meta),
--  5. agregačné funkcie: challenge_food_days, team_week_summary (invoker), gamification_group_weeks
--     a gamification_group_period (len service role — rebríček).
--
-- Bezpečnostný model (rovnaký ako 0078, štýl 0036/0070):
--  - Všetky nové tabuľky sa z klienta len ČÍTAJÚ (RLS). Žiadny INSERT/UPDATE/DELETE pre
--    authenticated ani anon — zápis robí výlučne server (service role) po vlastnom overení
--    session, vlastníctva a TARIFY trénera (Pro/Business: lib/billing/plans.ts, príznaky
--    `challenges` a `leaderboard`). Tarifu preto SQL nevynucuje (rovnako ako pri AI funkciách) —
--    zrkadlenie v SQL nie je potrebné, lebo cez PostgREST sa do týchto tabuliek nedá zapísať.
--  - Klient číta len výzvy, ktorých je účastníkom; tréner len svoje výzvy a ich účastníkov
--    (a po odpojení klienta ho už nevidí — porovnáva sa clients.trainer_id).
--  - Rebríček nerozširuje RLS na tabuľky klientov: agregáty pre skupinu trénera vracia funkcia
--    dostupná IBA service role; server po overení session/tarify/nastavení z nej poskladá
--    len „meno + iniciála + číslo“.
--  - Progres výziev sa nikdy neukladá ani neposiela od klienta — server ho dopočíta z tréningov,
--    zápisov jedla a rekordov; do DB sa zapíše len moment dokončenia (idempotentne).

-- ============================================================
--  1. výzvy
-- ============================================================
create table if not exists public.challenges (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  description text not null default '' check (char_length(description) <= 300),
  -- workouts = dokončené tréningy v období, food_days = dni so zápisom jedla, streak_weeks =
  -- po sebe idúce týždne s ≥ 2 tréningami, prs = osobné rekordy, volume_kg = zdvihnutý objem
  metric text not null check (metric in ('workouts', 'food_days', 'streak_weeks', 'prs', 'volume_kg')),
  target integer not null check (target between 1 and 1000000),
  starts_on date not null,
  ends_on date not null,
  -- true = všetci súčasní aj budúci klienti trénera sa pridajú automaticky
  all_clients boolean not null default false,
  status text not null default 'active' check (status in ('active', 'ended')),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  constraint challenges_period check (ends_on >= starts_on and ends_on - starts_on <= 120)
);

create index if not exists challenges_trainer_status_idx on public.challenges (trainer_id, status, ends_on desc);

create table if not exists public.challenge_participants (
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  -- NULL = ešte nesplnené; nastaví výlučne server pri dokončení (idempotentné)
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (challenge_id, client_id)
);

-- „moje aktívne výzvy“ klienta
create index if not exists challenge_participants_client_idx on public.challenge_participants (client_id);

alter table public.challenges enable row level security;
alter table public.challenge_participants enable row level security;

-- Max. 20 aktívnych výziev na trénera (DB poistka popri kontrole v akcii).
create or replace function public.challenges_limit_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'active'
     and (select count(*) from public.challenges c where c.trainer_id = new.trainer_id and c.status = 'active') >= 20 then
    raise exception 'challenge_limit' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists challenges_limit_trg on public.challenges;
create trigger challenges_limit_trg
  before insert on public.challenges
  for each row execute function public.challenges_limit_guard();

-- Účastník musí byť súčasný klient autora výzvy (poistka popri kontrole v akcii).
create or replace function public.challenge_participants_same_trainer()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.challenges ch
    join public.clients c on c.trainer_id = ch.trainer_id
    where ch.id = new.challenge_id and c.id = new.client_id
  ) then
    raise exception 'participant_not_of_trainer' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists challenge_participants_trainer_trg on public.challenge_participants;
create trigger challenge_participants_trainer_trg
  before insert on public.challenge_participants
  for each row execute function public.challenge_participants_same_trainer();

-- ============================================================
--  2. + 3. nastavenia
-- ============================================================
create table if not exists public.trainer_gamification_settings (
  trainer_id uuid primary key references public.profiles (id) on delete cascade,
  -- tréner môže rebríček vypnúť všetkým svojim klientom
  leaderboard_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

-- Samostatná tabuľka (nie client_gamification z 0078): jej existencia tam znamená
-- „backfill histórie už prebehol“, takže do nej nesmieme zapisovať nič iné.
create table if not exists public.gamification_settings (
  client_id uuid primary key references public.clients (id) on delete cascade,
  -- opt-out: predvolene viditeľný (rozhodnutie vlastníka: „rebríček s možnosťou vypnutia“)
  leaderboard_visible boolean not null default true,
  -- pondelok týždňa, ktorého súhrn klient už videl (karta „Tvoj týždeň“ sa ukáže raz)
  summary_seen_week date,
  updated_at timestamptz not null default now()
);

alter table public.trainer_gamification_settings enable row level security;
alter table public.gamification_settings enable row level security;

-- ============================================================
--  4. odznak za výzvu v client_achievements
-- ============================================================
alter table public.client_achievements drop constraint if exists client_achievements_kind_check;
alter table public.client_achievements
  add constraint client_achievements_kind_check check (kind in ('pr', 'badge', 'challenge'));

alter table public.client_achievements drop constraint if exists client_achievements_shape;
alter table public.client_achievements
  add constraint client_achievements_shape check (
    (kind = 'badge' and badge_id is not null)
    or (kind = 'pr' and exercise_key is not null and exercise_name is not null
        and pr_type is not null and value is not null and source_log_id is not null)
    or (kind = 'challenge' and meta ? 'challenge_id')
  );

-- jedna výzva = najviac jeden odznak na klienta (idempotentné dokončenie)
create unique index if not exists client_achievements_challenge_unique
  on public.client_achievements (client_id, (meta ->> 'challenge_id'))
  where kind = 'challenge';

-- ============================================================
--  RLS: len čítanie
-- ============================================================
drop policy if exists "challenges_select_own_trainer" on public.challenges;
create policy "challenges_select_own_trainer"
  on public.challenges for select
  using (trainer_id = auth.uid());

-- Klient vidí výzvu, ktorej je účastníkom. Politika účastníkov nižšie siaha len do `clients`
-- (nie späť do `challenges`), takže medzi politikami nevzniká rekurzia.
drop policy if exists "challenges_select_participant" on public.challenges;
create policy "challenges_select_participant"
  on public.challenges for select
  using (exists (
    select 1
    from public.challenge_participants p
    join public.clients c on c.id = p.client_id
    where p.challenge_id = challenges.id and c.user_id = auth.uid()
  ));

drop policy if exists "challenge_participants_select_own_client" on public.challenge_participants;
create policy "challenge_participants_select_own_client"
  on public.challenge_participants for select
  using (exists (select 1 from public.clients c where c.id = challenge_participants.client_id and c.user_id = auth.uid()));

drop policy if exists "challenge_participants_select_own_trainer" on public.challenge_participants;
create policy "challenge_participants_select_own_trainer"
  on public.challenge_participants for select
  using (exists (select 1 from public.clients c where c.id = challenge_participants.client_id and c.trainer_id = auth.uid()));

drop policy if exists "trainer_gamification_settings_select_own" on public.trainer_gamification_settings;
create policy "trainer_gamification_settings_select_own"
  on public.trainer_gamification_settings for select
  using (trainer_id = auth.uid());

drop policy if exists "gamification_settings_select_own_client" on public.gamification_settings;
create policy "gamification_settings_select_own_client"
  on public.gamification_settings for select
  using (exists (select 1 from public.clients c where c.id = gamification_settings.client_id and c.user_id = auth.uid()));

revoke all on public.challenges from anon, authenticated;
revoke all on public.challenge_participants from anon, authenticated;
revoke all on public.trainer_gamification_settings from anon, authenticated;
revoke all on public.gamification_settings from anon, authenticated;
grant select on public.challenges to authenticated;
grant select on public.challenge_participants to authenticated;
grant select on public.trainer_gamification_settings to authenticated;
grant select on public.gamification_settings to authenticated;

-- ============================================================
--  5. agregáty
-- ============================================================
-- Dni so zápisom jedla pre viac klientov naraz (progres výziev). SECURITY INVOKER — RLS
-- volajúceho rozhodne, čie riadky vidí (klient svoje, tréner svojich klientov).
create or replace function public.challenge_food_days(p_client_ids uuid[], p_from date, p_to date)
returns table (client_id uuid, eaten_on date)
language sql
stable
security invoker
set search_path = public
as $$
  select distinct fl.client_id, fl.eaten_on
  from public.food_logs fl
  where cardinality(p_client_ids) <= 300
    and fl.client_id = any (p_client_ids)
    and fl.eaten_on between p_from and p_to
    and p_to - p_from <= 130
  limit 40000;
$$;

-- Súhrn tímu trénera za obdobie (dashboard „Tím tento týždeň“). Len o prihlásenom trénerovi
-- (auth.uid()), len jeho aktívni klienti; invoker + RLS ako druhá vrstva.
create or replace function public.team_week_summary(p_from date, p_to date)
returns table (workouts bigint, active_clients bigint, prs bigint, badges bigint, challenges_done bigint)
language sql
stable
security invoker
set search_path = public
as $$
  with my as (
    select c.id
    from public.clients c
    where c.trainer_id = auth.uid() and c.ended_at is null and c.deletion_requested_at is null
  ),
  wl as (
    select l.client_id
    from public.workout_logs l
    where l.client_id in (select id from my) and l.status = 'completed'
      and l.performed_on between p_from and p_to and p_to - p_from <= 14
  ),
  ach as (
    select a.kind
    from public.client_achievements a
    where a.client_id in (select id from my) and a.backfilled = false
      and a.achieved_at >= p_from::timestamptz and a.achieved_at < (p_to + 1)::timestamptz
      and p_to - p_from <= 14
  )
  select
    (select count(*) from wl),
    (select count(distinct client_id) from wl),
    (select count(*) from ach where kind = 'pr'),
    (select count(*) from ach where kind = 'badge'),
    (select count(*) from ach where kind = 'challenge');
$$;

-- Týždenné počty tréningových dní po klientoch skupiny trénera — vstup série týždňov v rebríčku.
-- LEN service role (server po overení session, tarify a nastavení). Zahŕňa len aktívnych klientov.
create or replace function public.gamification_group_weeks(p_trainer_id uuid, p_since date)
returns table (client_id uuid, week_start date, trained_days integer)
language sql
stable
security definer
set search_path = public
as $$
  select l.client_id,
         date_trunc('week', l.performed_on::timestamp)::date as week_start,
         count(distinct l.performed_on)::integer as trained_days
  from public.workout_logs l
  join public.clients c on c.id = l.client_id
  where c.trainer_id = p_trainer_id and c.ended_at is null and c.deletion_requested_at is null
    and l.status = 'completed'
    and l.performed_on >= greatest(p_since, current_date - 400)
  group by 1, 2
  limit 40000;
$$;

-- Tréningy tento týždeň / mesiac a rekordy tento mesiac po klientoch skupiny. LEN service role.
create or replace function public.gamification_group_period(p_trainer_id uuid, p_week_from date, p_month_from date, p_to date)
returns table (client_id uuid, workouts_week bigint, workouts_month bigint, prs_month bigint)
language sql
stable
security definer
set search_path = public
as $$
  with grp as (
    select c.id
    from public.clients c
    where c.trainer_id = p_trainer_id and c.ended_at is null and c.deletion_requested_at is null
  ),
  w as (
    select l.client_id,
           count(*) filter (where l.performed_on >= p_week_from) as wk,
           count(*) as mo
    from public.workout_logs l
    where l.client_id in (select id from grp) and l.status = 'completed'
      and l.performed_on between p_month_from and p_to and p_to - p_month_from <= 31
    group by l.client_id
  ),
  p as (
    select a.client_id, count(*) as prs
    from public.client_achievements a
    where a.client_id in (select id from grp) and a.kind = 'pr'
      and a.achieved_on between p_month_from and p_to
    group by a.client_id
  )
  select g.id, coalesce(w.wk, 0), coalesce(w.mo, 0), coalesce(p.prs, 0)
  from grp g
  left join w on w.client_id = g.id
  left join p on p.client_id = g.id;
$$;

revoke execute on function public.challenge_food_days(uuid[], date, date) from public, anon;
revoke execute on function public.team_week_summary(date, date) from public, anon;
revoke execute on function public.gamification_group_weeks(uuid, date) from public, anon, authenticated;
revoke execute on function public.gamification_group_period(uuid, date, date, date) from public, anon, authenticated;
grant execute on function public.challenge_food_days(uuid[], date, date) to authenticated, service_role;
grant execute on function public.team_week_summary(date, date) to authenticated, service_role;
grant execute on function public.gamification_group_weeks(uuid, date) to service_role;
grant execute on function public.gamification_group_period(uuid, date, date, date) to service_role;
