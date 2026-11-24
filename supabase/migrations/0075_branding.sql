-- FitPilot — branding trénera (tarifa Business, feature/Stripe, "fáza 1").
-- Spustiť v Supabase Dashboard → SQL Editor → New query → vložiť celý súbor → Run.
-- Predpokladá 0001 (profiles, clients), 0073/0074 (trainer_subscriptions, billing_effective_tier,
-- my_trainer_can_write). Idempotentné (dá sa spustiť opakovane).
--
-- Čo to je: tréner s tarifou Business si nastaví značku (názov, logo, fotka, farba, uvítací text).
-- Klient, ktorého AKTUÁLNY tréner má Business, vidí v portáli trénerovo logo a názov namiesto
-- FitPilot, akcentovú farbu, a pozývacia stránka /pozvanka/<odkaz> ukáže značku trénera.
-- Pri strate Business sa značka klientom prestane ukazovať (dáta ostávajú) — rozhoduje server
-- (lib/branding/server.ts), SQL ju tu len zrkadlí.
--
-- Bezpečnosť úložiska:
--  * bucket `branding` je VEREJNÝ (public = true): logo a fotka sú určené na zobrazenie
--    klientom aj nepríhlásenému návštevníkovi pozvánky, nemajú citlivý obsah, názvy súborov
--    obsahujú náhodné UUID (nedajú sa uhádnuť) a verejná URL funguje bez podpisovania
--    a expirácie (cache, PDF, pozvánka). Výpis obsahu bucketu cez API nie je možný (žiadna
--    SELECT politika na storage.objects).
--  * limit 1 MB a LEN image/webp — aplikácia obrázok vždy znovu zakóduje (sharp), takže do
--    bucketu sa nikdy nedostane SVG/GIF/HTML ani pôvodné metadáta.
--  * ZÁPIS len cez service role (server action po overení session + tréner + Business +
--    magic bytes). Na storage.objects zámerne NIE je žiadna INSERT/UPDATE/DELETE politika pre
--    authenticated/anon → priamy upload z prehliadača je zamietnutý.

-- ============================================================
--  1) storage bucket
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('branding', 'branding', true, 1048576, array['image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = 1048576,
      allowed_mime_types = array['image/webp'];

-- ============================================================
--  2) tabuľka trainer_branding
-- ============================================================
create table if not exists public.trainer_branding (
  trainer_id uuid primary key references public.profiles (id) on delete cascade,
  brand_name text not null default '' check (char_length(brand_name) <= 40),
  -- #rrggbb malými písmenami; null = predvolená farba FitPilot
  accent_color text check (accent_color is null or accent_color ~ '^#[0-9a-f]{6}$'),
  welcome_text text not null default '' check (char_length(welcome_text) <= 300),
  -- cesta v buckete branding: <trainer_id>/logo-<uuid>.webp (generuje server; check nižšie
  -- zaručí, že ukazuje len do priečinka vlastného trénera)
  logo_path text check (
    logo_path is null
    or (logo_path ~ '^[0-9a-f-]{36}/logo-[0-9a-f-]{36}\.webp$' and logo_path like trainer_id::text || '/logo-%')
  ),
  photo_path text check (
    photo_path is null
    or (photo_path ~ '^[0-9a-f-]{36}/photo-[0-9a-f-]{36}\.webp$' and photo_path like trainer_id::text || '/photo-%')
  ),
  -- tajný odkaz pozvánky /pozvanka/<invite_slug> (80 bitov z CSPRNG → nedá sa enumerovať)
  invite_slug text unique check (invite_slug is null or invite_slug ~ '^[a-f0-9]{20}$'),
  updated_at timestamptz not null default now()
);

alter table public.trainer_branding enable row level security;

-- ============================================================
--  3) pomocná funkcia pre RLS klienta
-- ============================================================
-- „Smiem ja (prihlásený) vidieť značku tohto trénera?“ — áno, ak som jeho aktívny klient
-- A tréner má teraz Business. Vracia len boolean o VLASTNOM vzťahu volajúceho, takže sa
-- cez ňu nedá zisťovať tarifa cudzích trénerov.
create or replace function public.branding_visible_to_me(p_trainer uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and exists (
      select 1 from public.clients c
      where c.user_id = auth.uid() and c.trainer_id = p_trainer and c.ended_at is null
    )
    and public.billing_effective_tier(p_trainer) = 'business';
$$;

revoke execute on function public.branding_visible_to_me(uuid) from public, anon;
grant execute on function public.branding_visible_to_me(uuid) to authenticated;

-- ============================================================
--  4) RLS politiky
-- ============================================================
revoke all on public.trainer_branding from public, anon, authenticated;
grant select, insert, update on public.trainer_branding to authenticated;

-- tréner: čítanie vlastného riadku (aj bez Business — nastavenia ukážu uložené dáta)
drop policy if exists "trainer_branding_select_own" on public.trainer_branding;
create policy "trainer_branding_select_own"
  on public.trainer_branding for select
  to authenticated
  using (auth.uid() = trainer_id);

-- tréner: zápis len do vlastného riadku a len s aktívnym prístupom (nie read-only);
-- kontrolu Business robí navyše server action (feature "branding")
drop policy if exists "trainer_branding_insert_own" on public.trainer_branding;
create policy "trainer_branding_insert_own"
  on public.trainer_branding for insert
  to authenticated
  with check (auth.uid() = trainer_id and public.my_trainer_can_write());

drop policy if exists "trainer_branding_update_own" on public.trainer_branding;
create policy "trainer_branding_update_own"
  on public.trainer_branding for update
  to authenticated
  using (auth.uid() = trainer_id)
  with check (auth.uid() = trainer_id and public.my_trainer_can_write());

-- klient: len značka svojho AKTUÁLNEHO trénera s Business
drop policy if exists "trainer_branding_select_my_trainer" on public.trainer_branding;
create policy "trainer_branding_select_my_trainer"
  on public.trainer_branding for select
  to authenticated
  using (public.branding_visible_to_me(trainer_id));

-- ============================================================
--  5) RPC pre pozývaciu stránku /pozvanka/<odkaz>
-- ============================================================
-- Vráti LEN verejné polia značky pre platný odkaz a tréner s Business; inak žiadny riadok
-- (rovnaká odpoveď pre neexistujúci odkaz aj tréner bez Business — nič sa nedá rozlíšiť).
-- Volateľné VÝHRADNE zo servera (service role) — server pred volaním limituje počet pokusov
-- na IP; anon/authenticated nemajú právo (žiadne priame skúšanie odkazov z prehliadača).
create or replace function public.get_invite_branding(p_slug text)
returns table (
  brand_name text,
  welcome_text text,
  accent_color text,
  logo_path text,
  photo_path text
)
language sql
stable
security definer
set search_path = public
as $$
  select b.brand_name, b.welcome_text, b.accent_color, b.logo_path, b.photo_path
  from public.trainer_branding b
  where p_slug ~ '^[a-f0-9]{20}$'
    and b.invite_slug = p_slug
    and public.billing_effective_tier(b.trainer_id) = 'business'
  limit 1;
$$;

revoke execute on function public.get_invite_branding(text) from public, anon, authenticated;
grant execute on function public.get_invite_branding(text) to service_role;
