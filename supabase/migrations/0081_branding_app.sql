-- FitPilot — branding trénera, fáza 2: inštalovateľná appka s ikonou a názvom trénera,
-- logo pre tmavé pozadie (feature/Stripe). Nadväzuje na 0075_branding.sql (neupravovať).
-- Spustiť v Supabase Dashboard → SQL Editor → New query → vložiť celý súbor → Run.
-- Idempotentné (dá sa spustiť opakovane). Spustiť PRED nasadením kódu, ktorý ich číta
-- (kód má poistku — pri chýbajúcich stĺpcoch sa značka zobrazí bez ikon — ale ukladanie
-- značky nové stĺpce zapisuje).
--
-- Čo pridáva:
--  * logo_dark_path — voliteľné druhé logo pre tmavé pozadie (portál v tmavej téme).
--  * icon_192_path, icon_512_path, icon_maskable_path, icon_apple_path — PNG ikony appky,
--    ktoré server vygeneruje (sharp) z loga a farby značky pri uložení. Z nich sa skladá
--    manifest webovej appky (názov + ikona trénera pri „Pridať na plochu“) a apple-touch-icon.
--  * bucket `branding` smie odteraz aj image/png (ikony). Logo/fotka ostávajú image/webp.
--
-- Bezpečnosť: rovnaký vzor ako 0075 — cesta má pevný tvar s náhodným UUID a vedie len do
-- priečinka vlastného trénera (CHECK). Zápis do úložiska výhradne cez service role; PNG
-- generuje server z už znovu zakódovaného loga (nikdy sa nezachová pôvodný nahraný súbor).

-- ============================================================
--  1) bucket: povoliť aj PNG (ikony appky)
-- ============================================================
update storage.buckets
   set allowed_mime_types = array['image/webp', 'image/png']
 where id = 'branding';

-- ============================================================
--  2) nové stĺpce trainer_branding
-- ============================================================
alter table public.trainer_branding
  add column if not exists logo_dark_path text,
  add column if not exists icon_192_path text,
  add column if not exists icon_512_path text,
  add column if not exists icon_maskable_path text,
  add column if not exists icon_apple_path text;

-- CHECK obmedzenia (alter table ... add constraint nemá "if not exists" → cez drop/add)
alter table public.trainer_branding drop constraint if exists trainer_branding_logo_dark_path_check;
alter table public.trainer_branding add constraint trainer_branding_logo_dark_path_check check (
  logo_dark_path is null
  or (logo_dark_path ~ '^[0-9a-f-]{36}/logodark-[0-9a-f-]{36}\.webp$' and logo_dark_path like trainer_id::text || '/logodark-%')
);

alter table public.trainer_branding drop constraint if exists trainer_branding_icon_192_path_check;
alter table public.trainer_branding add constraint trainer_branding_icon_192_path_check check (
  icon_192_path is null
  or (icon_192_path ~ '^[0-9a-f-]{36}/icon-192-[0-9a-f-]{36}\.png$' and icon_192_path like trainer_id::text || '/icon-192-%')
);

alter table public.trainer_branding drop constraint if exists trainer_branding_icon_512_path_check;
alter table public.trainer_branding add constraint trainer_branding_icon_512_path_check check (
  icon_512_path is null
  or (icon_512_path ~ '^[0-9a-f-]{36}/icon-512-[0-9a-f-]{36}\.png$' and icon_512_path like trainer_id::text || '/icon-512-%')
);

alter table public.trainer_branding drop constraint if exists trainer_branding_icon_maskable_path_check;
alter table public.trainer_branding add constraint trainer_branding_icon_maskable_path_check check (
  icon_maskable_path is null
  or (icon_maskable_path ~ '^[0-9a-f-]{36}/icon-maskable-[0-9a-f-]{36}\.png$' and icon_maskable_path like trainer_id::text || '/icon-maskable-%')
);

alter table public.trainer_branding drop constraint if exists trainer_branding_icon_apple_path_check;
alter table public.trainer_branding add constraint trainer_branding_icon_apple_path_check check (
  icon_apple_path is null
  or (icon_apple_path ~ '^[0-9a-f-]{36}/icon-apple-[0-9a-f-]{36}\.png$' and icon_apple_path like trainer_id::text || '/icon-apple-%')
);

-- RLS: politiky z 0075 sa vzťahujú na celý riadok, nové stĺpce netreba nič ďalšie
-- (klient vidí riadok svojho trénera s Business — v ňom sú len verejné cesty k obrázkom).
-- RPC get_invite_branding ostáva nezmenená: pozvánka ikony ani tmavé logo nepotrebuje.
