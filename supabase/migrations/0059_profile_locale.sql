-- FitPilot — jazyk appky v profile (feature/cestina).
-- Spustiť v Supabase Dashboard → SQL Editor → New query → vložiť celý súbor → Run.
-- Predpokladá 0032 (handle_new_user so "self" klientom). Idempotentné.
--
-- Jazyk sa číta z cookie `fp-locale` (rýchle, bez dotazu do DB pri každej stránke);
-- profil je zdroj pravdy naprieč zariadeniami — po prihlásení sa cookie nastaví
-- podľa neho. Zápis ide cez RPC (security definer, len vlastný riadok), nie cez
-- stĺpcový grant — ten na cloud DB pri 0053 chýbal (viď 0057).

alter table public.profiles
  add column if not exists locale text not null default 'sk';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_locale_check' and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_locale_check check (locale in ('sk', 'cs'));
  end if;
end $$;

-- ============================================================
--  set_my_locale — zmena jazyka v Nastaveniach / Profile
-- ============================================================
create or replace function public.set_my_locale(p_locale text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if p_locale is null or p_locale not in ('sk', 'cs') then
    raise exception 'invalid_locale';
  end if;
  update public.profiles set locale = p_locale where id = auth.uid();
end;
$$;

revoke execute on function public.set_my_locale(text) from public, anon;
grant execute on function public.set_my_locale(text) to authenticated;

-- ============================================================
--  handle_new_user — jazyk z registrácie (raw_user_meta_data.locale)
-- ============================================================
-- Rovnaké ako 0032, navyše profil dostane jazyk, v ktorom sa používateľ registroval
-- (neplatná / chýbajúca hodnota = slovenčina).
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
  v_display text;
  v_try int := 0;
begin
  insert into public.profiles (id, role, full_name, email, locale)
  values (new.id, v_role, v_name, new.email, v_locale)
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
