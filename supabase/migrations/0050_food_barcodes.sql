-- FitPilot — čiarové kódy potravín (skener v denníku, feature/barcode-scanner).
-- Spustiť v Supabase Dashboard → SQL Editor → New query → vložiť celý súbor → Run.
-- Predpokladá 0005 (foods + RLS), 0007 (foods_select_client_of_trainer), 0012 (external_id).
-- Idempotentné — dá sa spustiť opakovane. Spustiť PRED nasadením kódu (knižnica
-- potravín v portáli, jedálniček aj AI kontext filtrujú podľa nového stĺpca source).
--
-- source:
--   'import' — globálna knižnica (seed z 0005, USDA import scripts/import-foods.mjs)
--   'off'    — produkt z Open Food Facts uložený po prvom skene (globálny, zapisuje ho
--              len server cez service role — ďalšie skeny idú z DB, nie z OFF)
--   'user'   — potravina založená používateľom (tréner v jedálničku, klient po skene,
--              ktorý OFF nepozná)
-- created_by: autor 'user' potraviny. Default auth.uid() — trénerovo pridanie potraviny
--   v jedálničku (app/dashboard/vyziva/jedalnicek/actions.ts) tak funguje bez zmeny kódu.
--   Pri 'import'/'off' null (service role nemá auth.uid()).
-- barcode: GTIN v jednotnom tvare z lib/barcode.ts (EAN-13/EAN-8; UPC s úvodnou nulou).
-- serving_g: veľkosť porcie z OFF (serving_quantity) — predvyplní gramáž aj pri ďalších
--   skenoch z DB.
-- fiber/sugars/salt na 100 g: doplnkové, môžu chýbať (OFF ich nemá pri každom produkte).

alter table public.foods
  add column if not exists barcode text,
  add column if not exists source text,
  add column if not exists created_by uuid references public.profiles (id) on delete cascade,
  add column if not exists off_synced_at timestamptz,
  add column if not exists serving_g numeric,
  add column if not exists fiber_100g numeric,
  add column if not exists sugars_100g numeric,
  add column if not exists salt_100g numeric;

-- ---------- backfill ----------
-- globálne riadky (trainer_id null) = import; trénerove = user s trénerom ako autorom
update public.foods set source = 'import' where source is null and trainer_id is null;
update public.foods
  set source = 'user', created_by = coalesce(created_by, trainer_id)
  where source is null and trainer_id is not null;

alter table public.foods alter column source set default 'user';
alter table public.foods alter column source set not null;
alter table public.foods alter column created_by set default auth.uid();

-- ---------- obmedzenia ----------
alter table public.foods drop constraint if exists foods_source_check;
alter table public.foods add constraint foods_source_check
  check (source in ('import', 'off', 'user'));

alter table public.foods drop constraint if exists foods_user_has_author;
alter table public.foods add constraint foods_user_has_author
  check (source <> 'user' or created_by is not null);

alter table public.foods drop constraint if exists foods_barcode_format;
alter table public.foods add constraint foods_barcode_format
  check (barcode is null or barcode ~ '^([0-9]{8}|[0-9]{13})$');

alter table public.foods drop constraint if exists foods_extra_nutrients_check;
alter table public.foods add constraint foods_extra_nutrients_check
  check (
    (serving_g is null or (serving_g > 0 and serving_g <= 5000))
    and (fiber_100g is null or fiber_100g >= 0)
    and (sugars_100g is null or sugars_100g >= 0)
    and (salt_100g is null or salt_100g >= 0)
  );

-- ---------- indexy ----------
-- Unikátnosť zvlášť pre globálny katalóg a pre každého autora: jeden globálny
-- unique(barcode) by sa zrazil so súkromnými 'user' potravinami (klient B by si nevedel
-- založiť kód, ktorý má klient A — a zlyhaný zápis by prezradil, že ho niekto má).
create unique index if not exists foods_barcode_global_uidx
  on public.foods (barcode)
  where barcode is not null and source in ('import', 'off');

create unique index if not exists foods_barcode_user_uidx
  on public.foods (created_by, barcode)
  where barcode is not null and source = 'user';

create index if not exists foods_created_by_idx on public.foods (created_by);

-- ---------- RLS ----------
-- Výber: globálne (import/off), vlastné (trainer_id = ja — tréner, created_by = ja — autor).
-- Klient navyše vidí potraviny svojho trénera cez foods_select_client_of_trainer (0007,
-- podľa trainer_id) — bez zmeny. Klientova 'user' potravina má trainer_id null, preto
-- globálna podmienka 'user' riadky vylučuje (inak by ju videl každý).
drop policy if exists "foods_select_global_or_own" on public.foods;
create policy "foods_select_global_or_own"
  on public.foods for select
  using (
    (trainer_id is null and source <> 'user')
    or trainer_id = auth.uid()
    or created_by = auth.uid()
  );

-- Zápis: používateľ zakladá len 'user' potraviny pod vlastným menom. 'import'/'off'
-- (globálne, zdieľané všetkými) zapisuje výhradne service role (import, route skenera) —
-- inak by si ktokoľvek mohol "zabrať" kód v globálnom katalógu alebo podstrčiť hodnoty.
drop policy if exists "foods_insert_own" on public.foods;
create policy "foods_insert_own"
  on public.foods for insert
  with check (
    source = 'user'
    and created_by = auth.uid()
    and (trainer_id is null or trainer_id = auth.uid())
  );

-- Úprava: predtým bez WITH CHECK — vlastník mohol riadok zmeniť na globálny
-- (trainer_id = null). Teraz musí ostať vlastnou 'user' potravinou.
drop policy if exists "foods_update_own" on public.foods;
create policy "foods_update_own"
  on public.foods for update
  using (trainer_id = auth.uid() or created_by = auth.uid())
  with check (
    source = 'user'
    and created_by = auth.uid()
    and (trainer_id is null or trainer_id = auth.uid())
  );

drop policy if exists "foods_delete_own" on public.foods;
create policy "foods_delete_own"
  on public.foods for delete
  using (trainer_id = auth.uid() or created_by = auth.uid());
