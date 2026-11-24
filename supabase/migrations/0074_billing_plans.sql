-- FitPilot — varianty tarif a limit klientov per tréner (feature/Stripe). Nadväzuje na 0073.
-- Spustiť v Supabase Dashboard → SQL Editor → New query → vložiť celý súbor → Run.
-- Idempotentné (dá sa spustiť opakovane). 0073 sa NEUPRAVUJE — táto migrácia ju dopĺňa.
-- DÔLEŽITÉ: spustiť PRED nasadením kódu, ktorý číta nové stĺpce (inak sa čítanie predplatného
-- nepodarí a účet by bol read-only — fail-closed).
--
-- Zmeny:
--  1) trainer_subscriptions.client_limit — limit aktívnych klientov uložený webhookom z ceny
--     (Starter 5 = 5, Starter 10 = 10, Pro = 30, Business = bez limitu). NULL = predvolený limit
--     tarify (starter 10, pro 30, business bez limitu) — chýbajúca hodnota u Starter/Pro nikdy
--     neznamená „bez limitu“. Zrkadlo v TS: lib/billing/plans.ts (clientLimitFor).
--  2) scheduled_tier / scheduled_client_limit / scheduled_change_at — naplánovaný downgrade na
--     konci zaplateného obdobia (webhook ich plní zo Stripe subscription schedule; slúžia len na
--     zobrazenie — tarifa sa mení až keď Stripe zmení cenu predplatného).
--  3) billing_client_limit() používa uložený limit namiesto pevných čísel (Pro už 30, nie 50).
--  4) skúška nových trénerov dostane client_limit = 10.

-- ============================================================
--  1) stĺpce
-- ============================================================
alter table public.trainer_subscriptions
  add column if not exists client_limit integer check (client_limit is null or client_limit >= 0),
  add column if not exists scheduled_tier text check (scheduled_tier is null or scheduled_tier in ('starter', 'pro', 'business')),
  add column if not exists scheduled_client_limit integer check (scheduled_client_limit is null or scheduled_client_limit >= 0),
  add column if not exists scheduled_change_at timestamptz;

-- ============================================================
--  2) backfill: existujúce riadky dostanú explicitný limit
-- ============================================================
-- Komped (Business zadarmo) zostáva NULL = bez limitu. Skúška a platené Starter/Pro dostanú
-- limit podľa tarify (Starter 10 — skúška aj predchádzajúca jediná cena; Pro 30).
update public.trainer_subscriptions
set client_limit = case tier when 'starter' then 10 when 'pro' then 30 else null end
where client_limit is null and comped = false and tier in ('starter', 'pro');

-- ============================================================
--  3) limit klientov z uloženej hodnoty
-- ============================================================
-- Limit aktívnych klientov: null = bez limitu; 0 = žiadny prístup (read-only).
-- Zrkadlí lib/billing/plans.ts → clientLimitFor (predvolené: starter 10, pro 30, business bez limitu).
create or replace function public.billing_client_limit(p_trainer uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tier text;
  v_limit integer;
begin
  v_tier := public.billing_effective_tier(p_trainer);
  if v_tier is null then return 0; end if;
  select client_limit into v_limit from public.trainer_subscriptions where trainer_id = p_trainer;
  if v_limit is not null then return v_limit; end if;
  return case v_tier when 'starter' then 10 when 'pro' then 30 else null end;
end;
$$;

revoke execute on function public.billing_client_limit(uuid) from public, anon, authenticated;

-- ============================================================
--  4) skúška nových trénerov: Starter s limitom 10 klientov
-- ============================================================
create or replace function public.billing_profile_trial()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role = 'trainer' then
    insert into public.trainer_subscriptions (trainer_id, tier, status, trial_ends_at, client_limit)
    values (new.id, 'starter', 'app_trial', new.created_at + interval '14 days', 10)
    on conflict (trainer_id) do nothing;
  elsif new.role = 'client' then
    delete from public.trainer_subscriptions
    where trainer_id = new.id and stripe_customer_id is null and comped = false;
  end if;
  return new;
end;
$$;
