-- FitPilot — verejná stránka trénera a záujemcovia (feature/Stripe, branding "bod 3", tarifa Business).
-- Spustiť v Supabase Dashboard → SQL Editor → New query → vložiť celý súbor → Run.
-- Predpokladá 0001 (profiles), 0073/0074 (billing_effective_tier, my_trainer_can_write),
-- 0075/0081 (trainer_branding + bucket `branding`). Neupravuje už nasadené migrácie.
-- Idempotentné (create ... if not exists / create or replace / drop policy if exists).
--
-- Čo to je: tréner s Business si zverejní stránku myfitpilot.sk/t/<handle> (bio, služby, galéria,
-- referencie, odkazy) s formulárom „Chcem trénovať s tebou“. Odoslané formuláre (záujemcovia)
-- vidí len on v dashboarde, pošle im pozvánku a po 12 mesiacoch sa automaticky mažú.
--
-- Bezpečnosť:
--  * VEREJNÉ čítanie stránky je len cez SECURITY DEFINER funkcie get_public_trainer_page() /
--    get_public_trainer_target() / list_public_trainer_pages() — vracajú len bezpečné polia, len keď je
--    stránka PUBLIKOVANÁ a tréner má Business. Execute majú VÝHRADNE service_role (volá ich server
--    po validácii tvaru handle); anon ani authenticated ich nevolajú → nedá sa vypísať nepublikované
--    stránky ani zisťovať tarify. Tabuľky samotné anon nevidí vôbec (žiadna politika, žiadny grant).
--  * trainer_leads: tréner číta, mení iba stav a poznámky (column grant) a maže VLASTNÝCH záujemcov
--    (GDPR — mazať smie aj read-only účet). INSERT politika NEEXISTUJE — záujemcu vloží výhradne
--    server action cez service role po validácii, overení Turnstile a limitoch (reserve_lead_submit).
--  * trainer_lead_attempts (limity odosielania): len service role; ukladá sa HMAC hash IP a e-mailu,
--    nikdy čitateľná adresa. Staré riadky sa čistia pri každom odoslaní.
--  * obrázky galérie idú do existujúceho verejného bucketu `branding` (len image/webp ≤ 1 MB, zápis
--    výhradne service role, názvy s UUID) — CHECK na cestu zaručí priečinok vlastného trénera.

-- ============================================================
--  1) profil verejnej stránky
-- ============================================================
create table if not exists public.trainer_public_profiles (
  trainer_id uuid primary key references public.profiles (id) on delete cascade,
  -- tvar zhodný s lib/publicPage/handle.ts (3–30 znakov, a-z 0-9 a „-“ vnútri)
  handle text not null
    check (handle = lower(handle) and char_length(handle) between 3 and 30 and handle ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  published boolean not null default false,
  headline text not null default '' check (char_length(headline) <= 120),
  bio text not null default '' check (char_length(bio) <= 1500),
  location text not null default '' check (char_length(location) <= 80),
  online boolean not null default false,
  specializations text[] not null default '{}'
    check (cardinality(specializations) <= 8 and char_length(array_to_string(specializations, '|')) <= 270),
  -- odkazy overuje aplikácia (https, povolené domény); DB drží len tvar a strop veľkosti
  socials jsonb not null default '{}'::jsonb
    check (jsonb_typeof(socials) = 'object' and octet_length(socials::text) <= 1500),
  updated_at timestamptz not null default now(),
  -- rezervované slová (zhodné s RESERVED_HANDLES v lib/publicPage/handle.ts) a „fitpilot“ kdekoľvek
  constraint trainer_public_profiles_handle_reserved check (
    handle <> all (array[
      'admin','administrator','api','app','assets','auth','billing','coach','contact','cookies','dashboard',
      'demo','email','faq','favicon','fitcoach','fitpilot','help','info','kontakt','login','logout','mail',
      'manifest','myfitpilot','nahlad','nastavenia','official','ochrana-sukromia','obchodne-podmienky','portal',
      'pomoc','pozvanka','predplatne','preview','prihlasenie','public','register','registracia','robots',
      'root','security','settings','sitemap','static','stripe','support','t','test','trainer','trener','www'
    ]) and handle not like '%fitpilot%'
  )
);

create unique index if not exists trainer_public_profiles_handle_key on public.trainer_public_profiles (lower(handle));
create index if not exists trainer_public_profiles_published_idx on public.trainer_public_profiles (published) where published;

alter table public.trainer_public_profiles enable row level security;
revoke all on public.trainer_public_profiles from public, anon, authenticated;
grant select, insert, update, delete on public.trainer_public_profiles to authenticated;

drop policy if exists "tpp_select_own" on public.trainer_public_profiles;
create policy "tpp_select_own" on public.trainer_public_profiles for select to authenticated
  using (auth.uid() = trainer_id);
drop policy if exists "tpp_insert_own" on public.trainer_public_profiles;
create policy "tpp_insert_own" on public.trainer_public_profiles for insert to authenticated
  with check (auth.uid() = trainer_id and public.my_trainer_can_write());
drop policy if exists "tpp_update_own" on public.trainer_public_profiles;
create policy "tpp_update_own" on public.trainer_public_profiles for update to authenticated
  using (auth.uid() = trainer_id)
  with check (auth.uid() = trainer_id and public.my_trainer_can_write());
drop policy if exists "tpp_delete_own" on public.trainer_public_profiles;
create policy "tpp_delete_own" on public.trainer_public_profiles for delete to authenticated
  using (auth.uid() = trainer_id and public.my_trainer_can_write());

-- ============================================================
--  2) služby, galéria, referencie (max. 6 každého — strop drží pozícia 0–5 + unikát)
-- ============================================================
create table if not exists public.trainer_services (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.profiles (id) on delete cascade,
  position smallint not null check (position between 0 and 5),
  name text not null check (char_length(name) between 1 and 60),
  description text not null default '' check (char_length(description) <= 300),
  price_text text not null default '' check (char_length(price_text) <= 40),
  unique (trainer_id, position)
);

create table if not exists public.trainer_gallery (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.profiles (id) on delete cascade,
  position smallint not null check (position between 0 and 5),
  -- <trainer_id>/gallery-<uuid>.webp (generuje server; check = len priečinok vlastného trénera)
  path text not null check (path ~ '^[0-9a-f-]{36}/gallery-[0-9a-f-]{36}\.webp$' and path like trainer_id::text || '/gallery-%'),
  unique (trainer_id, position)
);

create table if not exists public.trainer_testimonials (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.profiles (id) on delete cascade,
  position smallint not null check (position between 0 and 5),
  author text not null check (char_length(author) between 1 and 40),
  body text not null check (char_length(body) between 1 and 400),
  unique (trainer_id, position)
);

do $$
declare
  t text;
begin
  foreach t in array array['trainer_services', 'trainer_gallery', 'trainer_testimonials'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('drop policy if exists "%s_select_own" on public.%I', t, t);
    execute format('create policy "%s_select_own" on public.%I for select to authenticated using (auth.uid() = trainer_id)', t, t);
    execute format('drop policy if exists "%s_insert_own" on public.%I', t, t);
    execute format('create policy "%s_insert_own" on public.%I for insert to authenticated with check (auth.uid() = trainer_id and public.my_trainer_can_write())', t, t);
    execute format('drop policy if exists "%s_update_own" on public.%I', t, t);
    execute format('create policy "%s_update_own" on public.%I for update to authenticated using (auth.uid() = trainer_id) with check (auth.uid() = trainer_id and public.my_trainer_can_write())', t, t);
    execute format('drop policy if exists "%s_delete_own" on public.%I', t, t);
    execute format('create policy "%s_delete_own" on public.%I for delete to authenticated using (auth.uid() = trainer_id and public.my_trainer_can_write())', t, t);
  end loop;
end $$;

-- ============================================================
--  3) záujemcovia (leady)
-- ============================================================
create table if not exists public.trainer_leads (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  email text not null check (char_length(email) <= 254),
  phone text check (phone is null or char_length(phone) <= 25),
  goal text not null check (goal in ('weight_loss', 'muscle_gain', 'fitness', 'health', 'other')),
  experience text not null check (experience in ('beginner', 'intermediate', 'advanced')),
  availability text not null default '' check (char_length(availability) <= 120),
  message text not null default '' check (char_length(message) <= 1000),
  status text not null default 'new' check (status in ('new', 'contacted', 'invited', 'closed')),
  notes text not null default '' check (char_length(notes) <= 2000),
  -- súhlas so spracovaním údajov (verzia podmienok/zásad + čas)
  consent_version text not null,
  consent_at timestamptz not null default now(),
  -- HMAC hash IP (nie čitateľná adresa) — len na vyšetrovanie zneužitia
  ip_hash text,
  status_changed_at timestamptz not null default now(),
  invited_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists trainer_leads_trainer_created_idx on public.trainer_leads (trainer_id, created_at desc);
create index if not exists trainer_leads_trainer_status_idx on public.trainer_leads (trainer_id, status);
create index if not exists trainer_leads_created_idx on public.trainer_leads (created_at);

alter table public.trainer_leads enable row level security;
revoke all on public.trainer_leads from public, anon, authenticated;
grant select, delete on public.trainer_leads to authenticated;
-- tréner smie meniť len stav a poznámky (obsah formulára je nemenný)
grant update (status, notes, status_changed_at, invited_at) on public.trainer_leads to authenticated;

drop policy if exists "leads_select_own" on public.trainer_leads;
create policy "leads_select_own" on public.trainer_leads for select to authenticated
  using (auth.uid() = trainer_id);
drop policy if exists "leads_update_own" on public.trainer_leads;
create policy "leads_update_own" on public.trainer_leads for update to authenticated
  using (auth.uid() = trainer_id)
  with check (auth.uid() = trainer_id and public.my_trainer_can_write());
-- mazanie (GDPR) smie aj účet bez prístupu na zápis
drop policy if exists "leads_delete_own" on public.trainer_leads;
create policy "leads_delete_own" on public.trainer_leads for delete to authenticated
  using (auth.uid() = trainer_id);
-- INSERT politika zámerne NIE JE: záujemcu sa vkladá len cez service role (server action).

-- ============================================================
--  4) limity odosielania formulára
-- ============================================================
create table if not exists public.trainer_lead_attempts (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.profiles (id) on delete cascade,
  ip_hash text not null,
  email_hash text not null,
  created_at timestamptz not null default now()
);
create index if not exists trainer_lead_attempts_trainer_idx on public.trainer_lead_attempts (trainer_id, created_at desc);
create index if not exists trainer_lead_attempts_ip_idx on public.trainer_lead_attempts (ip_hash, created_at desc);

alter table public.trainer_lead_attempts enable row level security;
revoke all on public.trainer_lead_attempts from public, anon, authenticated;
grant select, insert, update, delete on public.trainer_lead_attempts to service_role;

-- Atómová rezervácia odoslania formulára: v jednej kritickej sekcii (advisory lock na trénera) skontroluje
-- limity a vloží záznam. Vracia 'ok' + id záznamu, inak dôvod odmietnutia ('duplicate' | 'ip_hour' |
-- 'ip_day' | 'trainer_hour' | 'trainer_day'). Limity zadáva server.
-- Zrkadlo: lib/publicPage/leads.ts (decideLeadSubmit) — pri zmene pravidiel upraviť OBE miesta.
create or replace function public.reserve_lead_submit(
  p_trainer uuid,
  p_ip_hash text,
  p_email_hash text,
  p_ip_hour_limit int,
  p_ip_day_limit int,
  p_trainer_hour_limit int,
  p_trainer_day_limit int,
  p_email_cooldown_hours int
)
returns table (status text, attempt_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ip_hour int;
  v_ip_day int;
  v_tr_hour int;
  v_tr_day int;
  v_email int;
  v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('lead_submit:' || p_trainer::text));

  -- údržba: záznamy limitov staršie ako 2 dni netreba
  delete from public.trainer_lead_attempts where created_at < now() - interval '2 days';

  select count(*) filter (where created_at > now() - interval '1 hour'),
         count(*)
    into v_ip_hour, v_ip_day
  from public.trainer_lead_attempts
  where ip_hash = p_ip_hash and created_at > now() - interval '24 hours';

  select count(*) filter (where created_at > now() - interval '1 hour'),
         count(*),
         count(*) filter (where email_hash = p_email_hash and created_at > now() - make_interval(hours => greatest(p_email_cooldown_hours, 1)))
    into v_tr_hour, v_tr_day, v_email
  from public.trainer_lead_attempts
  where trainer_id = p_trainer and created_at > now() - interval '24 hours';

  if v_email > 0 then return query select 'duplicate'::text, null::uuid; return; end if;
  if v_ip_hour >= p_ip_hour_limit then return query select 'ip_hour'::text, null::uuid; return; end if;
  if v_ip_day >= p_ip_day_limit then return query select 'ip_day'::text, null::uuid; return; end if;
  if v_tr_hour >= p_trainer_hour_limit then return query select 'trainer_hour'::text, null::uuid; return; end if;
  if v_tr_day >= p_trainer_day_limit then return query select 'trainer_day'::text, null::uuid; return; end if;

  insert into public.trainer_lead_attempts (trainer_id, ip_hash, email_hash)
  values (p_trainer, p_ip_hash, p_email_hash)
  returning id into v_id;
  return query select 'ok'::text, v_id;
end;
$$;

revoke execute on function public.reserve_lead_submit(uuid, text, text, int, int, int, int, int) from public, anon, authenticated;
grant execute on function public.reserve_lead_submit(uuid, text, text, int, int, int, int, int) to service_role;

-- ============================================================
--  5) verejné čítanie stránky (len service role, len publikované + Business)
-- ============================================================
-- Vráti jedno jsonb s bezpečnými poľami alebo NULL (neexistuje / nepublikované / bez Business —
-- rovnaká odpoveď, nič sa nedá rozlíšiť). Zrkadlo: lib/publicPage/visibility.ts (isPageVisible).
create or replace function public.get_public_trainer_page(p_handle text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'handle', p.handle,
    'headline', p.headline,
    'bio', p.bio,
    'location', p.location,
    'online', p.online,
    'specializations', to_jsonb(p.specializations),
    'socials', p.socials,
    'updated_at', p.updated_at,
    'display_name', coalesce(nullif(b.brand_name, ''), pr.full_name, ''),
    'accent_color', b.accent_color,
    'logo_path', b.logo_path,
    'logo_dark_path', b.logo_dark_path,
    'photo_path', b.photo_path,
    'services', coalesce((
      select jsonb_agg(jsonb_build_object('name', s.name, 'description', s.description, 'price_text', s.price_text) order by s.position)
      from public.trainer_services s where s.trainer_id = p.trainer_id
    ), '[]'::jsonb),
    'gallery', coalesce((
      select jsonb_agg(g.path order by g.position)
      from public.trainer_gallery g where g.trainer_id = p.trainer_id
    ), '[]'::jsonb),
    'testimonials', coalesce((
      select jsonb_agg(jsonb_build_object('author', t.author, 'body', t.body) order by t.position)
      from public.trainer_testimonials t where t.trainer_id = p.trainer_id
    ), '[]'::jsonb)
  )
  from public.trainer_public_profiles p
  join public.profiles pr on pr.id = p.trainer_id
  left join public.trainer_branding b on b.trainer_id = p.trainer_id
  where p_handle ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    and p.handle = lower(p_handle)
    and p.published
    and public.billing_effective_tier(p.trainer_id) = 'business'
  limit 1;
$$;

revoke execute on function public.get_public_trainer_page(text) from public, anon, authenticated;
grant execute on function public.get_public_trainer_page(text) to service_role;

-- Komu patrí viditeľná stránka (na zápis záujemcu): trainer_id alebo NULL. Rovnaké podmienky ako vyššie.
create or replace function public.get_public_trainer_target(p_handle text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.trainer_id
  from public.trainer_public_profiles p
  where p_handle ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    and p.handle = lower(p_handle)
    and p.published
    and public.billing_effective_tier(p.trainer_id) = 'business'
  limit 1;
$$;

revoke execute on function public.get_public_trainer_target(text) from public, anon, authenticated;
grant execute on function public.get_public_trainer_target(text) to service_role;

-- Zoznam viditeľných stránok pre sitemap.
create or replace function public.list_public_trainer_pages()
returns table (handle text, updated_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select p.handle, p.updated_at
  from public.trainer_public_profiles p
  where p.published
    and public.billing_effective_tier(p.trainer_id) = 'business'
  order by p.updated_at desc
  limit 5000;
$$;

revoke execute on function public.list_public_trainer_pages() from public, anon, authenticated;
grant execute on function public.list_public_trainer_pages() to service_role;

-- ============================================================
--  6) automatické mazanie starých záujemcov (GDPR)
-- ============================================================
-- Maže záujemcov starších ako p_months mesiacov (predvolene 12) a staré záznamy limitov. Volá ju
-- server cez cron (app/api/cron/leads-purge, vercel.json) pod service role; vracia počet zmazaných.
create or replace function public.purge_old_leads(p_months int default 12)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  delete from public.trainer_leads where created_at < now() - make_interval(months => greatest(p_months, 1));
  get diagnostics v_deleted = row_count;
  delete from public.trainer_lead_attempts where created_at < now() - interval '2 days';
  return v_deleted;
end;
$$;

revoke execute on function public.purge_old_leads(int) from public, anon, authenticated;
grant execute on function public.purge_old_leads(int) to service_role;
