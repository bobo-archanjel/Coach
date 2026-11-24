-- FitPilot — predplatné trénerov cez Stripe (feature/Stripe).
-- Spustiť v Supabase Dashboard → SQL Editor → New query → vložiť celý súbor → Run.
-- Predpokladá 0001 (profiles, clients), 0018/0020/0062 (clients.ended_at, deletion_requested_at)
-- a existenciu tabuliek plánov/šablón (0002–0066). Idempotentné (dá sa spustiť opakovane).
--
-- Model: platí LEN tréner (klienti nikdy). Stav predplatného drží tabuľka
-- trainer_subscriptions — píše do nej VÝHRADNE server (service role: webhook + checkout akcia),
-- tréner si svoj riadok môže len prečítať. Skutočný prístup sa počíta z riadku:
--   comped = true                          → natrvalo zadarmo (tier z riadku)
--   status 'app_trial'  (14 dní, bez karty) → tier starter, kým neuplynie trial_ends_at
--   status 'trialing' / 'active'            → tier z riadku (tier mapuje server z cenového ID)
--   status 'past_due'                       → tier z riadku ešte 7 dní od past_due_since (odklad)
--   všetko ostatné (canceled, unpaid, …)    → žiadny prístup = len na čítanie (read-only)
-- Rovnakú logiku zrkadlí lib/billing/entitlements.ts — pri zmene upraviť OBE miesta.
--
-- DB stráž (nad rámec kontrol v server actions — chráni pred priamymi volaniami PostgREST):
--  1) trigger na clients: nový/obnovený aktívny klient nad limit tarify sa nedá pridať,
--  2) trigger na tabuľkách plánov/šablón/termínov/poznámok: tréner bez aktívneho prístupu
--     do nich nezapíše (rola klient a service role sa nedotknú).

-- ============================================================
--  1) tabuľky
-- ============================================================
create table if not exists public.trainer_subscriptions (
  trainer_id uuid primary key references public.profiles (id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text,
  tier text not null default 'starter' check (tier in ('starter', 'pro', 'business')),
  -- 'app_trial' = naša 14-dňová skúška bez karty (zámerne NIE Stripe 'trialing')
  status text not null default 'app_trial' check (status in (
    'app_trial', 'trialing', 'active', 'past_due', 'canceled', 'unpaid',
    'incomplete', 'incomplete_expired', 'paused'
  )),
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  -- od kedy je predplatné past_due (odklad 7 dní); null mimo past_due
  past_due_since timestamptz,
  -- ručne (SQL) zadarmo: existujúci tréneri a beta testeri
  comped boolean not null default false,
  updated_at timestamptz not null default now()
);

create index if not exists trainer_subscriptions_sub_idx on public.trainer_subscriptions (stripe_subscription_id);

alter table public.trainer_subscriptions enable row level security;

drop policy if exists "trainer_subscriptions_select_own" on public.trainer_subscriptions;
create policy "trainer_subscriptions_select_own"
  on public.trainer_subscriptions for select
  using (auth.uid() = trainer_id);

-- zápis len service role (obchádza RLS) — žiadne insert/update/delete práva pre appku
revoke all on public.trainer_subscriptions from public, anon, authenticated;
grant select on public.trainer_subscriptions to authenticated;

-- idempotencia webhooku: jedno Stripe event ID = jeden riadok
create table if not exists public.stripe_events (
  id text primary key,
  type text not null,
  status text not null default 'processing' check (status in ('processing', 'done')),
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

alter table public.stripe_events enable row level security;
revoke all on public.stripe_events from public, anon, authenticated;

-- ============================================================
--  2) zdieľané SQL funkcie (interné — nie sú volateľné z API)
-- ============================================================
-- Efektívna tarifa trénera teraz; null = žiadny prístup (read-only).
create or replace function public.billing_effective_tier(p_trainer uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s public.trainer_subscriptions%rowtype;
begin
  select * into s from public.trainer_subscriptions where trainer_id = p_trainer;
  if not found then return null; end if;
  if s.comped then return s.tier; end if;
  if s.status = 'app_trial' then
    return case when s.trial_ends_at is not null and s.trial_ends_at > now() then s.tier end;
  end if;
  if s.status in ('trialing', 'active') then return s.tier; end if;
  if s.status = 'past_due' then
    -- odklad 7 dní od prvého zlyhania platby
    return case when s.past_due_since is null or s.past_due_since + interval '7 days' > now() then s.tier end;
  end if;
  return null;
end;
$$;

-- Limit aktívnych klientov: null = bez limitu; 0 = žiadny prístup.
create or replace function public.billing_client_limit(p_trainer uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case public.billing_effective_tier(p_trainer)
    when 'starter' then 10
    when 'pro' then 50
    when 'business' then null
    else 0
  end;
$$;

revoke execute on function public.billing_effective_tier(uuid) from public, anon, authenticated;
revoke execute on function public.billing_client_limit(uuid) from public, anon, authenticated;

-- Verejná verzia pre RLS/RPC: vždy len o prihlásenom používateľovi (žiadny parameter,
-- teda nedá sa nad ňou zisťovať stav cudzích trénerov).
create or replace function public.my_trainer_can_write()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and public.billing_effective_tier(auth.uid()) is not null;
$$;

revoke execute on function public.my_trainer_can_write() from public, anon;
grant execute on function public.my_trainer_can_write() to authenticated;

-- ============================================================
--  3) trigger: limit aktívnych klientov
-- ============================================================
-- Spúšťa sa len keď sa riadok STANE aktívnym pod trénerom (insert, nový trainer_id,
-- obnovenie spolupráce). Ukončenie/zmazanie/odchod klienta ani úpravy iných stĺpcov
-- sa nikdy neblokujú — tréner nad limitom sa musí vedieť dostať pod limit.
-- Bez session používateľa (SQL Editor, service role) sa stráž nepoužije.
create or replace function public.billing_clients_limit_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer;
  v_active integer;
  v_becomes_active boolean;
begin
  -- stráž sa týka len krokov samotného trénera (pridanie klienta, obnovenie spolupráce);
  -- klient, ktorý napr. zruší vlastnú žiadosť o zmazanie, nikdy nenarazí na stav trénera
  if auth.uid() is null or new.trainer_id is null or auth.uid() is distinct from new.trainer_id then
    return new;
  end if;
  if new.ended_at is not null or new.deletion_requested_at is not null then return new; end if;

  if tg_op = 'INSERT' then
    v_becomes_active := true;
  else
    v_becomes_active := old.trainer_id is distinct from new.trainer_id
      or old.ended_at is not null
      or old.deletion_requested_at is not null;
  end if;
  if not v_becomes_active then return new; end if;

  -- súbežné pridávania toho istého trénera sa serializujú (inak by obe videli count < limit)
  perform pg_advisory_xact_lock(hashtext('billing_clients:' || new.trainer_id::text));

  if public.billing_effective_tier(new.trainer_id) is null then
    raise exception 'billing_read_only' using errcode = 'P0001';
  end if;

  v_limit := public.billing_client_limit(new.trainer_id);
  if v_limit is not null then
    select count(*) into v_active
    from public.clients c
    where c.trainer_id = new.trainer_id
      and c.id <> new.id
      and c.ended_at is null
      and c.deletion_requested_at is null;
    if v_active >= v_limit then
      raise exception 'client_limit_reached' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists clients_billing_limit on public.clients;
create trigger clients_billing_limit
  before insert or update of trainer_id, ended_at, deletion_requested_at on public.clients
  for each row execute function public.billing_clients_limit_guard();

-- ============================================================
--  4) trigger: read-only tréner nezapisuje do trénerských tabuliek
-- ============================================================
-- Kaskádové mazania (zmazanie klienta → jeho plány) bežia v hĺbke triggera > 1 a prejdú —
-- inak by tréner v read-only režime nevedel odstrániť klienta. Rola klient (vlastné
-- plány klienta) a service role (auth.uid() null) sa tu nedotknú.
create or replace function public.billing_write_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  if auth.uid() is null or pg_trigger_depth() > 1 then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  select role into v_role from public.profiles where id = auth.uid();
  if v_role = 'trainer' and public.billing_effective_tier(auth.uid()) is null then
    raise exception 'billing_read_only' using errcode = 'P0001';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'workout_plans', 'workout_days', 'meal_plans', 'meal_days',
    'plan_templates', 'plan_template_days', 'meal_templates', 'meal_template_days',
    'appointments', 'trainer_private_notes', 'nutrition_profiles', 'plan_recipients', 'coach_notes'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists billing_write_guard on public.%I', t);
      execute format(
        'create trigger billing_write_guard before insert or update or delete on public.%I
           for each row execute function public.billing_write_guard()', t);
    end if;
  end loop;
end $$;

-- ============================================================
--  5) backfill existujúcich trénerov: natrvalo zadarmo (comped, business)
-- ============================================================
-- Beží PRED vytvorením triggera nižšie, takže existujúci tréneri nedostanú 14-dňovú skúšku.
insert into public.trainer_subscriptions (trainer_id, tier, status, comped)
select p.id, 'business', 'active', true
from public.profiles p
where p.role = 'trainer'
on conflict (trainer_id) do nothing;

-- ============================================================
--  6) noví tréneri: 14-dňová skúška tarify starter bez karty
-- ============================================================
-- Trigger na profiles (nie priamo v handle_new_user) — pokryje e-mail aj OAuth, a aj
-- prípadné neskoršie nastavenie roly. Skúška sa nikdy neresetuje (on conflict do nothing).
-- Keď účet z OAuth prejde na rolu klient (claim_client_role, 0068), nepoužitý riadok sa zmaže.
create or replace function public.billing_profile_trial()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role = 'trainer' then
    insert into public.trainer_subscriptions (trainer_id, tier, status, trial_ends_at)
    values (new.id, 'starter', 'app_trial', new.created_at + interval '14 days')
    on conflict (trainer_id) do nothing;
  elsif new.role = 'client' then
    delete from public.trainer_subscriptions
    where trainer_id = new.id and stripe_customer_id is null and comped = false;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_billing_trial on public.profiles;
create trigger profiles_billing_trial
  after insert or update of role on public.profiles
  for each row execute function public.billing_profile_trial();
