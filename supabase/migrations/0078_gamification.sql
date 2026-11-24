-- FitPilot — gamifikácia klienta, fáza A (feature/Stripe).
-- Spustiť v Supabase Dashboard → SQL Editor → New query → vložiť celý súbor → Run.
-- Predpokladá 0001 (clients), 0007 (food_logs), 0003/0048 (workout_logs). Idempotentné.
--
-- Čo pribúda:
--  1. client_gamification   — stav po klientovi (kedy prebehol tichý backfill histórie).
--  2. client_achievements   — udalosti: osobné rekordy (kind 'pr') a odznaky (kind 'badge').
--  3. high_fives            — „high five“ od trénera k jednému úspechu (max. jeden na úspech).
--  4. gamification_totals() a gamification_food_daily() — lacné agregáty pre kartu Dnes.
--
-- Bezpečnostný model (štýl 0036/0070):
--  - Klient aj tréner tieto tabuľky len ČÍTAJÚ (RLS). Žiadny INSERT/UPDATE/DELETE pre
--    authenticated ani anon — zápis robí výlučne server (service role) po vlastnom
--    overení session a vlastníctva. Klient si teda nemôže pripísať odznak, rekord ani XP.
--  - XP sa NEukladá nikam: počíta sa deterministicky z dát (tréningy, dni so zápisom
--    jedla) a z udalostí v client_achievements, takže sa dá kedykoľvek prepočítať.
--  - Agregačné funkcie sú SECURITY INVOKER (platí RLS volajúceho), search_path je
--    zafixovaný, anon nemá EXECUTE.
--
-- Návrh pre fázu B (výzvy, rebríček, týždenný súhrn, zdieľacie karty): `kind` a `meta`
-- v client_achievements sa dajú rozšíriť bez zmeny tvaru (nová hodnota v CHECK, údaje do
-- `meta`), high_fives sa viaže na achievement_id, takže reakcie fungujú aj pre nové druhy.

-- ============================================================
--  1. stav gamifikácie klienta
-- ============================================================
create table if not exists public.client_gamification (
  client_id uuid primary key references public.clients (id) on delete cascade,
  -- kedy sa spätne dopočítala história (odznaky/rekordy bez notifikácií)
  backfilled_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- ============================================================
--  2. úspechy (rekordy a odznaky)
-- ============================================================
create table if not exists public.client_achievements (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  kind text not null check (kind in ('pr', 'badge')),
  -- odznak: id z katalógu v kóde (lib/gamification/badges.ts)
  badge_id text check (badge_id is null or char_length(badge_id) between 1 and 60),
  -- rekord: normalizovaný kľúč cviku (zhoda bez ohľadu na veľkosť písmen), zobrazený názov,
  -- čo rekord spôsobilo ('weight' = najťažšia séria, 'e1rm' = odhad 1RM podľa Epleyho)
  exercise_key text check (exercise_key is null or char_length(exercise_key) between 1 and 200),
  exercise_name text check (exercise_name is null or char_length(exercise_name) between 1 and 200),
  pr_type text check (pr_type is null or pr_type in ('weight', 'e1rm')),
  value numeric check (value is null or (value >= 0 and value <= 5000)),   -- kg najťažšej série
  reps integer check (reps is null or (reps >= 0 and reps <= 1000)),       -- opakovania na tej sérii
  e1rm numeric check (e1rm is null or (e1rm >= 0 and e1rm <= 10000)),      -- odhad 1RM (kg)
  source_log_id uuid,                                                      -- tréning (workout_logs.id), v ktorom rekord padol
  achieved_on date not null,
  achieved_at timestamptz not null default now(),
  -- NULL = klient ešte nevidel oslavu (modal/toast sa ukáže raz)
  seen_at timestamptz,
  -- dopočítané spätne z histórie — tiché (bez oslavy, bez „high five“ výzvy pre trénera)
  backfilled boolean not null default false,
  -- rezerva pre fázu B (výzvy, sezóny…), dnes prázdne
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint client_achievements_shape check (
    (kind = 'badge' and badge_id is not null)
    or (kind = 'pr' and exercise_key is not null and exercise_name is not null
        and pr_type is not null and value is not null and source_log_id is not null)
  ),
  -- idempotentné pripisovanie: jeden odznak na klienta, jeden rekord na cvik a tréning
  -- (NULL v stĺpcoch druhého druhu sa v UNIQUE nepočíta, takže sa druhy nebijú)
  constraint client_achievements_badge_unique unique (client_id, badge_id),
  constraint client_achievements_pr_unique unique (client_id, exercise_key, source_log_id)
);

-- feed trénera a história klienta (najnovšie prvé)
create index if not exists client_achievements_client_time_idx
  on public.client_achievements (client_id, achieved_at desc);
-- nezobrazené oslavy (layout portálu pri každej navigácii) — malý čiastočný index
create index if not exists client_achievements_unseen_idx
  on public.client_achievements (client_id) where seen_at is null;

alter table public.client_gamification enable row level security;
alter table public.client_achievements enable row level security;

-- ============================================================
--  3. high five od trénera
-- ============================================================
create table if not exists public.high_fives (
  id uuid primary key default gen_random_uuid(),
  -- UNIQUE = jeden high five na úspech
  achievement_id uuid not null unique references public.client_achievements (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  trainer_id uuid not null references public.profiles (id) on delete cascade,
  emoji text not null default '🙌' check (emoji in ('🙌')),
  created_at timestamptz not null default now()
);

create index if not exists high_fives_client_time_idx on public.high_fives (client_id, created_at desc);
create index if not exists high_fives_trainer_time_idx on public.high_fives (trainer_id, created_at desc);

alter table public.high_fives enable row level security;

-- ============================================================
--  RLS: len čítanie
-- ============================================================
drop policy if exists "client_gamification_select_own_client" on public.client_gamification;
create policy "client_gamification_select_own_client"
  on public.client_gamification for select
  using (exists (select 1 from public.clients c where c.id = client_gamification.client_id and c.user_id = auth.uid()));

drop policy if exists "client_achievements_select_own_client" on public.client_achievements;
create policy "client_achievements_select_own_client"
  on public.client_achievements for select
  using (exists (select 1 from public.clients c where c.id = client_achievements.client_id and c.user_id = auth.uid()));

-- tréner vidí úspechy len súčasných klientov (po odpojení klienta trainer_id nesedí)
drop policy if exists "client_achievements_select_own_trainer" on public.client_achievements;
create policy "client_achievements_select_own_trainer"
  on public.client_achievements for select
  using (exists (select 1 from public.clients c where c.id = client_achievements.client_id and c.trainer_id = auth.uid()));

drop policy if exists "high_fives_select_own_client" on public.high_fives;
create policy "high_fives_select_own_client"
  on public.high_fives for select
  using (exists (select 1 from public.clients c where c.id = high_fives.client_id and c.user_id = auth.uid()));

drop policy if exists "high_fives_select_own_trainer" on public.high_fives;
create policy "high_fives_select_own_trainer"
  on public.high_fives for select
  using (
    high_fives.trainer_id = auth.uid()
    and exists (select 1 from public.clients c where c.id = high_fives.client_id and c.trainer_id = auth.uid())
  );

-- žiadne write politiky a žiadne write práva: zapisuje len service role (server)
revoke all on public.client_gamification from anon, authenticated;
revoke all on public.client_achievements from anon, authenticated;
revoke all on public.high_fives from anon, authenticated;
grant select on public.client_gamification to authenticated;
grant select on public.client_achievements to authenticated;
grant select on public.high_fives to authenticated;

-- ============================================================
--  4. agregáty pre kartu Dnes (jeden round-trip namiesto skenovania histórie v appke)
-- ============================================================
-- Počet dokončených tréningov a dní so zapísaným jedlom — vstup pre XP. SECURITY INVOKER:
-- RLS volajúceho určí, či klient vidí svoje riadky (cudzie dáta nevráti).
create or replace function public.gamification_totals(p_client_id uuid)
returns table (workouts bigint, food_days bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select
    (select count(*) from public.workout_logs wl where wl.client_id = p_client_id and wl.status = 'completed'),
    (select count(distinct fl.eaten_on) from public.food_logs fl where fl.client_id = p_client_id);
$$;

-- Súčet bielkovín po dňoch od zadaného dátumu — séria zápisov jedla a dni s cieľom bielkovín.
create or replace function public.gamification_food_daily(p_client_id uuid, p_since date)
returns table (eaten_on date, protein_g numeric)
language sql
stable
security invoker
set search_path = public
as $$
  select fl.eaten_on, coalesce(sum(fl.grams * fl.protein_100g / 100.0), 0)::numeric
  from public.food_logs fl
  where fl.client_id = p_client_id and fl.eaten_on >= p_since
  group by fl.eaten_on
  order by fl.eaten_on desc
  limit 800;
$$;

revoke execute on function public.gamification_totals(uuid) from public, anon;
revoke execute on function public.gamification_food_daily(uuid, date) from public, anon;
grant execute on function public.gamification_totals(uuid) to authenticated, service_role;
grant execute on function public.gamification_food_daily(uuid, date) to authenticated, service_role;
