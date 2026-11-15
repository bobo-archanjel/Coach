-- FitPilot — súhlas s obchodnými podmienkami v účte (feature/obchodne-podmienky).
-- Spustiť v Supabase Dashboard → SQL Editor → New query → vložiť celý súbor → Run.
-- Predpokladá 0059 (handle_new_user s jazykom). Idempotentné.
--
-- Doteraz sa súhlas kontroloval len v prehliadači a nikde sa neukladal; registrácia aj
-- prihlásenie cez Google ho obchádzali úplne. Teraz:
--  - profiles.terms_accepted_at / terms_version — kedy a s ktorou verziou podmienok
--    (verzia = dátum poslednej podstatnej zmeny, lib/legal/terms.ts TERMS_VERSION),
--  - registrácia e-mailom: server overí zaškrtnutý súhlas a pošle verziu v metadátach,
--    trigger ju zapíše,
--  - účet bez súhlasu (napr. nový z Google) alebo so staršou verziou uvidí pred vstupom do
--    appky stránku so súhlasom (/prihlasenie/suhlas) → RPC accept_terms.
--
-- Existujúce účty (odsúhlasené 2026-11-15): rátajú sa ako súhlasiace s aktuálnou verziou
-- k dátumu registrácie — bránu neuvidia, kým sa podmienky podstatne nezmenia.

alter table public.profiles
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists terms_version text;

-- Verzia podmienok platná pri spustení tejto migrácie (obchodne-podmienky: 22. 9. 2026).
update public.profiles p
set terms_accepted_at = coalesce(u.created_at, now()),
    terms_version = '2026-09-22'
from auth.users u
where u.id = p.id
  and p.terms_version is null;

-- ---------- registrácia: súhlas z metadát (server ho posiela len po zaškrtnutí) ----------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := coalesce(new.raw_user_meta_data ->> 'role', 'trainer');
  v_name text := new.raw_user_meta_data ->> 'full_name';
  v_locale text := case
    when new.raw_user_meta_data ->> 'locale' in ('sk', 'cs') then new.raw_user_meta_data ->> 'locale'
    else 'sk'
  end;
  -- verzia podmienok, s ktorou používateľ súhlasil pri registrácii (null = bez súhlasu, napr. Google)
  v_terms text := case
    when new.raw_user_meta_data ->> 'terms_version' ~ '^\d{4}-\d{2}-\d{2}$' then new.raw_user_meta_data ->> 'terms_version'
    else null
  end;
  v_display text;
  v_try int := 0;
begin
  insert into public.profiles (id, role, full_name, email, locale, terms_version, terms_accepted_at)
  values (new.id, v_role, v_name, new.email, v_locale, v_terms, case when v_terms is not null then now() end)
  on conflict (id) do nothing;

  -- Klient dostane hneď vlastný riadok + kód (ak ho ešte nemá — napr. z paralelnej
  -- starej vetvy, kde ho vytvoril tréner a klient si ho nárokoval).
  if v_role = 'client' and not exists (select 1 from public.clients where user_id = new.id) then
    v_display := coalesce(nullif(btrim(v_name), ''), split_part(coalesce(new.email, 'Ja'), '@', 1));
    loop
      v_try := v_try + 1;
      begin
        insert into public.clients (trainer_id, user_id, full_name, invite_code)
        values (null, new.id, v_display, public.gen_client_code());
        exit;
      exception when unique_violation then
        if v_try >= 5 then raise; end if;
      end;
    end loop;
  end if;

  return new;
end;
$$;
-- trigger on_auth_user_created (0001) beží ďalej, netreba ho znovu vytvárať.

-- ---------- súhlas po prihlásení (stránka /prihlasenie/suhlas) ----------
create or replace function public.accept_terms(p_version text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if p_version is null or p_version !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'invalid_version';
  end if;
  update public.profiles
  set terms_version = p_version, terms_accepted_at = now()
  where id = auth.uid();
end;
$$;

revoke execute on function public.accept_terms(text) from public, anon;
grant execute on function public.accept_terms(text) to authenticated;
