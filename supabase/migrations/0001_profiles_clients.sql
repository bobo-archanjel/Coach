-- FitPilot — základný dátový model: profily (role trainer/client) + zoznam klientov trénera.
-- Spustiť v Supabase Dashboard → SQL Editor → New query → vložiť celý súbor → Run.
-- Zvyšok schémy z docs/projektbrief.md (workout_plans, meal_plans, ai_conversations, ...)
-- pribudne v ďalších migráciách, keď sa budú stavať príslušné moduly.

-- ---------- profiles ----------
-- Jeden riadok na auth.users, drží našu vlastnú rolu a zobrazovacie údaje.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('trainer', 'client')),
  full_name text,
  email text,
  created_at timestamptz not null default now()
);

-- ---------- clients ----------
-- Klient v databáze trénera. user_id je null, kým si klient cez pozývací kód
-- nezaloží vlastný účet (invite flow ešte nie je postavený).
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.profiles (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete set null,
  invite_code text unique,
  full_name text not null,
  goal text,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists clients_trainer_id_idx on public.clients (trainer_id);
create index if not exists clients_user_id_idx on public.clients (user_id);

-- ---------- RLS: profiles ----------
alter table public.profiles enable row level security;

create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id);

-- Tréner smie vidieť profil klienta, ktorý mu patrí (potrebné pre dashboard roster).
create policy "profiles_select_own_clients"
  on public.profiles for select
  using (
    exists (
      select 1 from public.clients c
      where c.user_id = profiles.id
        and c.trainer_id = auth.uid()
    )
  );

-- ---------- RLS: clients ----------
alter table public.clients enable row level security;

create policy "clients_select_own_trainer"
  on public.clients for select
  using (auth.uid() = trainer_id);

create policy "clients_select_own_client"
  on public.clients for select
  using (auth.uid() = user_id);

create policy "clients_insert_own_trainer"
  on public.clients for insert
  with check (auth.uid() = trainer_id);

create policy "clients_update_own_trainer"
  on public.clients for update
  using (auth.uid() = trainer_id);

create policy "clients_delete_own_trainer"
  on public.clients for delete
  using (auth.uid() = trainer_id);

-- ---------- auto-vytvorenie profilu pri registrácii ----------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'role', 'trainer'),
    new.raw_user_meta_data ->> 'full_name',
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill: ak už existujú auth.users z testovania pred touto migráciou.
insert into public.profiles (id, role, full_name, email)
select
  u.id,
  coalesce(u.raw_user_meta_data ->> 'role', 'trainer'),
  u.raw_user_meta_data ->> 'full_name',
  u.email
from auth.users u
on conflict (id) do nothing;
