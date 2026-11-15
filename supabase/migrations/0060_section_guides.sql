-- FitPilot — sprievodcovia hlbších okien (feature/sprievodca-sekcii).
-- Spustiť v Supabase Dashboard → SQL Editor → New query → vložiť celý súbor → Run.
-- Predpokladá 0001 (profiles). Idempotentné.
--
-- Plynulý sprievodca (0053, tour_completed_at) prejde sekcie z menu. Na okná, ktoré
-- potrebujú konkrétny plán alebo klienta (builder tréningu, detail klienta, builder
-- jedálnička, zapisovanie tréningu), sa sám nedostane — tie majú vlastného krátkeho
-- sprievodcu pri prvom otvorení, každý raz. Zoznam videných je v účte, takže platí
-- na všetkých zariadeniach.
--
-- Prístup len cez RPC (security definer, vždy len vlastný riadok) — rovnako ako
-- complete_onboarding_tour (0057): nezávisí od stĺpcových grantov na profiles (0036).
-- Appka sa pred spustením tejto migrácie správa, akoby zoznam nebol známy: sprievodcovia
-- sa sami nespúšťajú.

alter table public.profiles
  add column if not exists guides_seen text[] not null default '{}';

-- Zoznam videných sprievodcov prihláseného používateľa.
create or replace function public.get_guides_seen()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select guides_seen from public.profiles where id = auth.uid()), '{}');
$$;

-- Označí sprievodcu ako videného (bez duplicít) a vráti aktuálny zoznam.
create or replace function public.mark_guide_seen(p_guide text)
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seen text[];
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if p_guide is null or p_guide !~ '^[a-z0-9-]{1,40}$' then
    raise exception 'invalid_guide';
  end if;
  update public.profiles
  set guides_seen = case
    when p_guide = any (guides_seen) or cardinality(guides_seen) >= 100 then guides_seen
    else guides_seen || p_guide
  end
  where id = auth.uid()
  returning guides_seen into v_seen;
  return coalesce(v_seen, '{}');
end;
$$;

-- „Spustiť návod znova“ (Nastavenia / Profil) vráti aj týchto sprievodcov.
create or replace function public.reset_guides_seen()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  update public.profiles set guides_seen = '{}' where id = auth.uid();
end;
$$;

revoke execute on function public.get_guides_seen() from public, anon;
revoke execute on function public.mark_guide_seen(text) from public, anon;
revoke execute on function public.reset_guides_seen() from public, anon;
grant execute on function public.get_guides_seen() to authenticated;
grant execute on function public.mark_guide_seen(text) to authenticated;
grant execute on function public.reset_guides_seen() to authenticated;
