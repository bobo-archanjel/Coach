-- FitPilot — Šablóny plánov (feature/progress-AI-sablona): tréner uloží existujúci
-- tréningový plán/jedálniček ako znovupoužiteľnú šablónu a neskôr ju "použije" pre
-- ľubovoľného iného klienta (vytvorí bežný koncept presne ako AI generátor/ručný
-- plán, žiadny nový draft-mechanizmus).
--
-- Zámerne SAMOSTATNÉ tabuľky, nie nullable client_id na workout_plans/meal_plans —
-- tie by si vyžiadali prerobiť existujúce RLS politiky a všetky dopyty, ktoré
-- spoliehajú na client_id not null (napr. `/dashboard/klienti/[id]` joiny).
-- Šablóna je čisto interná vec trénera, klient k nej nemá (a nepotrebuje) prístup.
--
-- Spustiť v Supabase Dashboard → SQL Editor → New query → vložiť celý súbor → Run.
-- Idempotentné.

-- ---------- plan_templates (tréningové) ----------
create table if not exists public.plan_templates (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  goal text,
  created_at timestamptz not null default now()
);

create index if not exists plan_templates_trainer_id_idx on public.plan_templates (trainer_id);

-- exercises: rovnaký jsonb tvar ako workout_days.exercises (0002) — kopíruje sa
-- 1:1 pri ukladaní šablóny aj pri jej použití, žiadna transformácia.
create table if not exists public.plan_template_days (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.plan_templates (id) on delete cascade,
  day_number int not null,
  name text not null,
  exercises jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists plan_template_days_template_id_idx on public.plan_template_days (template_id);

-- ---------- meal_templates (jedálničkové) ----------
create table if not exists public.meal_templates (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create index if not exists meal_templates_trainer_id_idx on public.meal_templates (trainer_id);

-- meals: rovnaký jsonb tvar ako meal_days.meals (0005).
create table if not exists public.meal_template_days (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.meal_templates (id) on delete cascade,
  day_number int not null,
  name text not null,
  meals jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists meal_template_days_template_id_idx on public.meal_template_days (template_id);

-- ---------- RLS: plan_templates / plan_template_days ----------
alter table public.plan_templates enable row level security;

create policy "plan_templates_all_own_trainer"
  on public.plan_templates for all
  using (trainer_id = auth.uid())
  with check (trainer_id = auth.uid());

alter table public.plan_template_days enable row level security;

create policy "plan_template_days_all_own_trainer"
  on public.plan_template_days for all
  using (
    exists (
      select 1 from public.plan_templates pt
      where pt.id = plan_template_days.template_id
        and pt.trainer_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.plan_templates pt
      where pt.id = plan_template_days.template_id
        and pt.trainer_id = auth.uid()
    )
  );

-- ---------- RLS: meal_templates / meal_template_days ----------
alter table public.meal_templates enable row level security;

create policy "meal_templates_all_own_trainer"
  on public.meal_templates for all
  using (trainer_id = auth.uid())
  with check (trainer_id = auth.uid());

alter table public.meal_template_days enable row level security;

create policy "meal_template_days_all_own_trainer"
  on public.meal_template_days for all
  using (
    exists (
      select 1 from public.meal_templates mt
      where mt.id = meal_template_days.template_id
        and mt.trainer_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.meal_templates mt
      where mt.id = meal_template_days.template_id
        and mt.trainer_id = auth.uid()
    )
  );
