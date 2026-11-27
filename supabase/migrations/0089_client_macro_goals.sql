-- FitPilot — klient si nastaví vlastný makro cieľ (feature/fixies). Idempotentné.
-- Spustiť v Supabase Dashboard → SQL Editor → New query → vložiť celý súbor → Run.
-- Predpokladá 0001 (clients), 0004 (set_updated_at, nutrition_profiles), 0032/0036 (leave_trainer).
-- Appka funguje aj PRED spustením: bez tabuľky platí len trénerov cieľ a „Nastaviť makrá“ vráti
-- hlášku, že funkcia ešte nie je pripravená.
--
-- Čo pribúda:
--  1. client_macro_goals (client_id PK) — vlastné makrá klienta: vstupy (pohlavie, vek, váha, výška,
--     aktivita, cieľ) + výsledok (BMR, TDEE, kcal, B/S/T; kcal aj makrá môžu byť upravené ručne).
--     `active` = podľa nich sa momentálne počíta (prstence, misie, denník, adherencia, reporty, AI).
--     Prepnutie späť na trénerove makrá = active=false (vlastné hodnoty ostávajú uložené).
--  2. RLS: klient svoj riadok číta/zakladá/mení/maže; tréner len ČÍTA riadok SVOJHO aktuálneho klienta
--     (vidí odznak „Klient používa vlastné makrá“). Po odpojení klienta (clients.trainer_id null)
--     prístup trénera sám zanikne. anon nemá nič.
--  3. leave_trainer(): navyše odpojí nutrition_profiles od trénera (trainer_id = null) — rovnako ako
--     to robia 0062 (zmazanie trénera) a 0064 (odstránenie z portfólia). Bez toho nový tréner klienta
--     nemohol uložiť makrá (upsert narážal na riadok starého trénera). Makrá ostávajú klientovi.

create table if not exists public.client_macro_goals (
  client_id uuid primary key references public.clients (id) on delete cascade,
  sex text not null check (sex in ('muz', 'zena')),
  age int not null check (age >= 10 and age < 120),
  weight_kg numeric not null check (weight_kg >= 20 and weight_kg <= 500),
  height_cm numeric not null check (height_cm >= 80 and height_cm <= 300),
  activity_level text not null check (
    activity_level in ('sedavy', 'lahka', 'stredna', 'vysoka', 'velmi_vysoka')
  ),
  goal text not null check (goal in ('chudnutie', 'udrzanie', 'naberanie')),
  bmr numeric not null,
  tdee numeric not null,
  calories_target numeric not null,
  protein_g numeric not null,
  carbs_g numeric not null,
  fat_g numeric not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- updated_at (funkcia z 0004; pre istotu aj tu, ak by sa migrácie púšťali mimo poradia)
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists client_macro_goals_set_updated_at on public.client_macro_goals;
create trigger client_macro_goals_set_updated_at
  before update on public.client_macro_goals
  for each row execute function public.set_updated_at();

-- ---------- RLS ----------
alter table public.client_macro_goals enable row level security;

drop policy if exists "client_macro_goals_select_own_client" on public.client_macro_goals;
create policy "client_macro_goals_select_own_client"
  on public.client_macro_goals for select
  using (exists (select 1 from public.clients c where c.id = client_macro_goals.client_id and c.user_id = auth.uid()));

drop policy if exists "client_macro_goals_insert_own_client" on public.client_macro_goals;
create policy "client_macro_goals_insert_own_client"
  on public.client_macro_goals for insert
  with check (exists (select 1 from public.clients c where c.id = client_macro_goals.client_id and c.user_id = auth.uid()));

drop policy if exists "client_macro_goals_update_own_client" on public.client_macro_goals;
create policy "client_macro_goals_update_own_client"
  on public.client_macro_goals for update
  using (exists (select 1 from public.clients c where c.id = client_macro_goals.client_id and c.user_id = auth.uid()))
  with check (exists (select 1 from public.clients c where c.id = client_macro_goals.client_id and c.user_id = auth.uid()));

drop policy if exists "client_macro_goals_delete_own_client" on public.client_macro_goals;
create policy "client_macro_goals_delete_own_client"
  on public.client_macro_goals for delete
  using (exists (select 1 from public.clients c where c.id = client_macro_goals.client_id and c.user_id = auth.uid()));

-- tréner: len čítanie, len pre svojho aktuálneho klienta
drop policy if exists "client_macro_goals_select_own_trainer" on public.client_macro_goals;
create policy "client_macro_goals_select_own_trainer"
  on public.client_macro_goals for select
  using (exists (select 1 from public.clients c where c.id = client_macro_goals.client_id and c.trainer_id = auth.uid()));

revoke all on public.client_macro_goals from anon, authenticated;
grant select, insert, update, delete on public.client_macro_goals to authenticated;

-- ---------- leave_trainer(): navyše odpojí makrá od trénera ----------
-- Definícia z 0036 (najnovšia; 0069 ju len spomína v komentári) + update nutrition_profiles.
create or replace function public.leave_trainer()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_client public.clients%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select * into v_client from public.clients where user_id = v_uid order by created_at asc limit 1;
  if not found then raise exception 'no_client'; end if;
  if v_client.trainer_id is null then return; end if;

  update public.clients
    set trainer_id = null, ended_at = null, invite_code = public.gen_client_code()
    where id = v_client.id;

  -- makro cieľ ostáva klientovi, ale už nepatrí odchádzajúcemu trénerovi (nový tréner ho môže prepísať)
  update public.nutrition_profiles set trainer_id = null where client_id = v_client.id;
end;
$$;

revoke execute on function public.leave_trainer() from public, anon;
grant execute on function public.leave_trainer() to authenticated;

-- ---------- jednorazová oprava starých dát ----------
-- Klienti, ktorí od trénera odišli pred touto migráciou, majú makro profil stále priradený
-- bývalému trénerovi (ten ho už nevidí a nový tréner ho nemohol prepísať) → uvoľniť ho.
update public.nutrition_profiles np
  set trainer_id = null
  where np.trainer_id is not null
    and np.trainer_id is distinct from (select c.trainer_id from public.clients c where c.id = np.client_id);
