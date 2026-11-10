-- FitPilot — onboarding sprievodca len pri prvom prihlásení (feature/login-adjustment).
-- Spustiť v Supabase Dashboard → SQL Editor → New query → vložiť celý súbor → Run.
-- Predpokladá 0053 (profiles.tour_completed_at). Idempotentné.
--
-- Chyba: na cloud DB chýbal `grant update (tour_completed_at)` z 0053 — každý zápis
-- „sprievodca videný“ skončil „permission denied for table profiles“, v DB ostalo null
-- a po odhlásení (cookie sa maže) sa sprievodca spustil pri každom ďalšom prihlásení.
-- Oprava nezávisí od stĺpcových grantov: zápis ide cez RPC (security definer, len
-- vlastný riadok), rovnako ako ostatné zápisy klienta/trénera do chránených tabuliek.

create or replace function public.complete_onboarding_tour()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  update public.profiles
  set tour_completed_at = coalesce(tour_completed_at, now())
  where id = auth.uid();
end;
$$;

revoke execute on function public.complete_onboarding_tour() from public, anon;
grant execute on function public.complete_onboarding_tour() to authenticated;

-- Kto sa už niekedy prihlásil, prvé prihlásenie má za sebou — sprievodcu už nedostane
-- (kvôli chybe vyššie ho videli opakovane, v DB to nie je zapísané). Nový používateľ
-- (ešte bez prihlásenia) ho uvidí raz. auth.users.last_sign_in_at existuje len v Supabase
-- (lokálny test v supabase/tests má zjednodušenú auth schému), preto podmienka.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'auth' and table_name = 'users' and column_name = 'last_sign_in_at'
  ) then
    update public.profiles p
    set tour_completed_at = now()
    from auth.users u
    where u.id = p.id
      and p.tour_completed_at is null
      and u.last_sign_in_at is not null;
  end if;
end $$;
