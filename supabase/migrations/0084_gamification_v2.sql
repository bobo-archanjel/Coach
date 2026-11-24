-- FitPilot — gamifikácia klienta v2 (feature/gamifikacia).
-- Spustiť v Supabase Dashboard → SQL Editor → New query → vložiť celý súbor → Run.
-- Predpokladá 0078 (client_achievements) a 0079 (gamification_settings). Idempotentné.
--
-- Čo pribúda:
--  1. weekly_missions + mission_weeks — 3 osobné misie klienta na týždeň (generuje server deterministicky,
--     pri prvom zobrazení týždňa ich uloží) a bonus za splnenie všetkých troch,
--  2. streak_freezes — zmrazenia série (odmena za úroveň / týždeň misií; použitie je zaznamenané),
--  3. client_streak_cache — agregovaná séria týždňov klienta pre celoappkový rebríček
--     (poradie podľa série sa nedá lacno spočítať v SQL nad celou históriou všetkých klientov),
--  4. gamification_settings: prezývka v rebríčku, aktívny rámik a téma, naposledy oslávená úroveň,
--  5. client_achievements.kind rozšírené o 'level' (oslava postupu na vyššiu úroveň),
--  6. indexy pre rebríček a funkcia gamification_global_leaderboard (SECURITY DEFINER, len service role).
--
-- Rozhodnutie k rebríčku (vlastník): rebríček je CELOAPPKOVÝ — poradie pre všetkých klientov s účtom.
-- Nastavenie trénera „rebríček zap/vyp“ (trainer_gamification_settings, 0079) sa už nečíta ani nezobrazuje;
-- tabuľka ostáva (nič sa nemaže). Rozhoduje len opt-out klienta (gamification_settings.leaderboard_visible).
--
-- Bezpečnostný model (rovnaký ako 0078/0079):
--  - Nové tabuľky sa z klienta len ČÍTAJÚ (RLS, vlastné riadky). Žiadny INSERT/UPDATE/DELETE pre
--    authenticated ani anon — zapisuje výlučne server (service role) po vlastnom overení session.
--    Klient si teda nemôže pripísať misiu, zmrazenie, úroveň ani miesto v rebríčku.
--  - Rebríček: funkcia vracia len id klienta, poradie a hodnotu metriky; server z nej poskladá verejný tvar
--    („prezývka + číslo“) a id klientovi nikdy neposiela. Skrytí klienti (opt-out) sa vyfiltrujú v SQL PRED
--    poradím. Funkcia je dostupná IBA service role.
--  - Rámik, téma a prezývku nastavuje server po validácii (úroveň odomyká rámik/tému; prezývka 2–20 znakov
--    + filter); DB má poistku cez CHECK.

-- ============================================================
--  1. týždenné misie
-- ============================================================
create table if not exists public.weekly_missions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  -- pondelok týždňa misií
  week_start date not null,
  slot smallint not null check (slot between 1 and 3),
  kind text not null check (kind in ('workouts', 'food_days', 'pr_exercise', 'protein_days', 'workout_by_wed', 'volume', 'measurement', 'sets')),
  target integer not null check (target between 1 and 1000000),
  xp integer not null check (xp between 0 and 500),
  -- pr_exercise: {"exerciseKey": "...", "exerciseName": "..."}; ostatné druhy {}
  params jsonb not null default '{}'::jsonb,
  -- NULL = ešte nesplnené; nastaví výlučne server (idempotentne) pri splnení podľa skutočných dát
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  -- jedna sada na klienta a týždeň: opakované generovanie (súbeh dvoch požiadaviek) nič nezdvojí
  constraint weekly_missions_slot_unique unique (client_id, week_start, slot)
);

create index if not exists weekly_missions_client_week_idx on public.weekly_missions (client_id, week_start desc);

create table if not exists public.mission_weeks (
  client_id uuid not null references public.clients (id) on delete cascade,
  week_start date not null,
  -- kedy boli splnené všetky tri misie týždňa (bonus XP + zmrazenie); server zapisuje raz
  completed_at timestamptz not null default now(),
  primary key (client_id, week_start)
);

alter table public.weekly_missions enable row level security;
alter table public.mission_weeks enable row level security;

-- ============================================================
--  2. zmrazenia série
-- ============================================================
create table if not exists public.streak_freezes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  -- odkiaľ zmrazenie je: 'level:4' (úroveň) alebo 'mission_week:2026-11-23' (týždeň misií); UNIQUE = raz za zdroj
  source text not null check (char_length(source) between 1 and 60),
  earned_at timestamptz not null default now(),
  -- použitie: 'week' = chráni tréningový týždeň (pondelok), 'day' = chráni deň zápisu jedla
  used_kind text check (used_kind is null or used_kind in ('week', 'day')),
  used_for date,
  used_at timestamptz,
  constraint streak_freezes_source_unique unique (client_id, source),
  constraint streak_freezes_use_shape check (
    (used_at is null and used_kind is null and used_for is null)
    or (used_at is not null and used_kind is not null and used_for is not null)
  )
);

create index if not exists streak_freezes_client_idx on public.streak_freezes (client_id, used_at);
-- jednu jednotku (týždeň/deň) chráni najviac jedno zmrazenie
create unique index if not exists streak_freezes_unit_unique
  on public.streak_freezes (client_id, used_kind, used_for) where used_at is not null;

alter table public.streak_freezes enable row level security;

-- ============================================================
--  3. agregovaná séria týždňov (rebríček)
-- ============================================================
create table if not exists public.client_streak_cache (
  client_id uuid primary key references public.clients (id) on delete cascade,
  streak_weeks integer not null check (streak_weeks >= 0 and streak_weeks <= 60),
  -- pondelok týždňa, od ktorého by séria bez nového tréningu už bola 0 (server ho vypočíta simuláciou);
  -- rebríček berie len riadky s expires_week > aktuálny pondelok, takže nečinný klient so starou sériou v poradí nie je
  expires_week date not null,
  computed_at timestamptz not null default now()
);

create index if not exists client_streak_cache_rank_idx on public.client_streak_cache (streak_weeks desc) where streak_weeks > 0;

alter table public.client_streak_cache enable row level security;

-- ============================================================
--  4. nastavenia klienta: prezývka, rámik, téma, naposledy oslávená úroveň
-- ============================================================
alter table public.gamification_settings
  add column if not exists nickname text check (nickname is null or char_length(nickname) between 2 and 20),
  add column if not exists avatar_frame text check (avatar_frame is null or avatar_frame in ('none', 'ember', 'mint', 'steel', 'gold', 'aurora', 'prism', 'olympus')),
  add column if not exists portal_theme text check (portal_theme is null or portal_theme in ('default', 'ocean', 'forest', 'sunset', 'violet', 'graphite')),
  add column if not exists level_seen smallint check (level_seen is null or level_seen between 1 and 60);

-- ============================================================
--  5. oslava úrovne v client_achievements
-- ============================================================
alter table public.client_achievements drop constraint if exists client_achievements_kind_check;
alter table public.client_achievements
  add constraint client_achievements_kind_check check (kind in ('pr', 'badge', 'challenge', 'level'));

alter table public.client_achievements drop constraint if exists client_achievements_shape;
alter table public.client_achievements
  add constraint client_achievements_shape check (
    (kind = 'badge' and badge_id is not null)
    or (kind = 'pr' and exercise_key is not null and exercise_name is not null
        and pr_type is not null and value is not null and source_log_id is not null)
    or (kind = 'challenge' and meta ? 'challenge_id')
    or (kind = 'level' and meta ? 'level')
  );

-- jedna úroveň = najviac jedna oslava na klienta (idempotentné)
create unique index if not exists client_achievements_level_unique
  on public.client_achievements (client_id, (meta ->> 'level'))
  where kind = 'level';

-- ============================================================
--  RLS: len čítanie vlastných riadkov
-- ============================================================
drop policy if exists "weekly_missions_select_own_client" on public.weekly_missions;
create policy "weekly_missions_select_own_client"
  on public.weekly_missions for select
  using (exists (select 1 from public.clients c where c.id = weekly_missions.client_id and c.user_id = auth.uid()));

drop policy if exists "mission_weeks_select_own_client" on public.mission_weeks;
create policy "mission_weeks_select_own_client"
  on public.mission_weeks for select
  using (exists (select 1 from public.clients c where c.id = mission_weeks.client_id and c.user_id = auth.uid()));

drop policy if exists "streak_freezes_select_own_client" on public.streak_freezes;
create policy "streak_freezes_select_own_client"
  on public.streak_freezes for select
  using (exists (select 1 from public.clients c where c.id = streak_freezes.client_id and c.user_id = auth.uid()));

-- client_streak_cache nemá žiadnu politiku: číta a zapisuje ju len server (service role obchádza RLS)

revoke all on public.weekly_missions from anon, authenticated;
revoke all on public.mission_weeks from anon, authenticated;
revoke all on public.streak_freezes from anon, authenticated;
revoke all on public.client_streak_cache from anon, authenticated;
grant select on public.weekly_missions to authenticated;
grant select on public.mission_weeks to authenticated;
grant select on public.streak_freezes to authenticated;

-- ============================================================
--  6. indexy a funkcia celoappkového rebríčka
-- ============================================================
-- Rebríček skenuje tréningy a rekordy v ohraničenom období (týždeň / mesiac) cez všetkých klientov —
-- čiastočné indexy podľa dátumu (INCLUDE client_id = index-only scan) sú pre to potrebné.
create index if not exists workout_logs_completed_on_idx
  on public.workout_logs (performed_on) include (client_id) where status = 'completed';
create index if not exists client_achievements_pr_on_idx
  on public.client_achievements (achieved_on) include (client_id) where kind = 'pr';

-- Poradie klientov pre jednu metriku. Vracia riadky 'top' (najlepších p_top podľa poradia) a, ak je volajúci
-- v poradí, jeden riadok 'me'; place = súťažné poradie (1, 1, 3), member_total = koľko klientov je v poradí.
-- Do poradia idú len klienti s účtom, nie ukončení ani žiadajúci o vymazanie a nie skrytí (opt-out);
-- len kladné hodnoty. Obdobia určuje server (dnešok v časovom pásme appky); funkcia ich len ohraničí,
-- aby sa nedala zneužiť na sken celej histórie.
create or replace function public.gamification_global_leaderboard(
  p_metric text,
  p_client_id uuid,
  p_week_from date,
  p_month_from date,
  p_to date,
  p_week_now date,
  p_top integer default 10
)
returns table (row_kind text, place bigint, member_id uuid, member_value bigint, member_total bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_metric not in ('workoutsWeek', 'workoutsMonth', 'streakWeeks', 'prsMonth') then
    raise exception 'bad_metric' using errcode = 'P0001';
  end if;
  if p_top is null or p_top < 1 or p_top > 50 then
    raise exception 'bad_top' using errcode = 'P0001';
  end if;
  if p_to - p_week_from not between 0 and 7 or p_to - p_month_from not between 0 and 31 then
    raise exception 'bad_range' using errcode = 'P0001';
  end if;

  return query
  with elig as (
    select c.id
    from public.clients c
    left join public.gamification_settings gs on gs.client_id = c.id
    where c.user_id is not null
      and c.ended_at is null
      and c.deletion_requested_at is null
      and coalesce(gs.leaderboard_visible, true)
  ),
  raw as (
    select l.client_id as cid, count(*)::bigint as val
    from public.workout_logs l
    where p_metric = 'workoutsWeek' and l.status = 'completed' and l.performed_on between p_week_from and p_to
    group by l.client_id
    union all
    select l.client_id, count(*)::bigint
    from public.workout_logs l
    where p_metric = 'workoutsMonth' and l.status = 'completed' and l.performed_on between p_month_from and p_to
    group by l.client_id
    union all
    select a.client_id, count(*)::bigint
    from public.client_achievements a
    where p_metric = 'prsMonth' and a.kind = 'pr' and a.achieved_on between p_month_from and p_to
    group by a.client_id
    union all
    select s.client_id, s.streak_weeks::bigint
    from public.client_streak_cache s
    where p_metric = 'streakWeeks' and s.streak_weeks > 0 and s.expires_week > p_week_now
  ),
  vals as (
    select r.cid, r.val
    from raw r
    join elig e on e.id = r.cid
    where r.val > 0
  ),
  ranked as (
    select v.cid,
           v.val,
           rank() over (order by v.val desc) as rnk,
           row_number() over (order by v.val desc, v.cid) as rn
    from vals v
  ),
  tot as (
    select count(*)::bigint as n from ranked
  )
  select 'top'::text, r.rnk, r.cid, r.val, t.n
  from ranked r cross join tot t
  where r.rn <= p_top
  union all
  select 'me'::text, r.rnk, r.cid, r.val, t.n
  from ranked r cross join tot t
  where r.cid = p_client_id;
end;
$$;

revoke execute on function public.gamification_global_leaderboard(text, uuid, date, date, date, date, integer) from public, anon, authenticated;
grant execute on function public.gamification_global_leaderboard(text, uuid, date, date, date, date, integer) to service_role;
