-- FitPilot — šablóny verejnej stránky trénera (feature/stranka-sablony). Idempotentné.
-- Spustiť v Supabase Dashboard → SQL Editor → New query → vložiť celý súbor → Run.
-- Predpokladá 0083 (trainer_public_profiles, get_public_trainer_page).
-- Appka funguje aj PRED spustením: bez stĺpca sa používa šablóna „klasik“ a výber šablóny
-- v nastaveniach ukáže hlášku, že šablóny budú dostupné po aktualizácii databázy.
--
-- Čo pribúda:
--  1. trainer_public_profiles.template — vzhľad stránky (klasik | sport | minimal | wellness), predvolene klasik.
--     Mení len prezentáciu; obsah stránky ostáva rovnaký. Zápis ide cez existujúce RLS (vlastný riadok).
--  2. get_public_trainer_page() vracia navyše 'template' (zvyšok je bez zmeny oproti 0083).

alter table public.trainer_public_profiles
  add column if not exists template text not null default 'klasik';

alter table public.trainer_public_profiles drop constraint if exists trainer_public_profiles_template_check;
alter table public.trainer_public_profiles
  add constraint trainer_public_profiles_template_check
  check (template in ('klasik', 'sport', 'minimal', 'wellness'));

create or replace function public.get_public_trainer_page(p_handle text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'handle', p.handle,
    'headline', p.headline,
    'bio', p.bio,
    'location', p.location,
    'online', p.online,
    'specializations', to_jsonb(p.specializations),
    'socials', p.socials,
    'updated_at', p.updated_at,
    'template', p.template,
    'display_name', coalesce(nullif(b.brand_name, ''), pr.full_name, ''),
    'accent_color', b.accent_color,
    'logo_path', b.logo_path,
    'logo_dark_path', b.logo_dark_path,
    'photo_path', b.photo_path,
    'services', coalesce((
      select jsonb_agg(jsonb_build_object('name', s.name, 'description', s.description, 'price_text', s.price_text) order by s.position)
      from public.trainer_services s where s.trainer_id = p.trainer_id
    ), '[]'::jsonb),
    'gallery', coalesce((
      select jsonb_agg(g.path order by g.position)
      from public.trainer_gallery g where g.trainer_id = p.trainer_id
    ), '[]'::jsonb),
    'testimonials', coalesce((
      select jsonb_agg(jsonb_build_object('author', t.author, 'body', t.body) order by t.position)
      from public.trainer_testimonials t where t.trainer_id = p.trainer_id
    ), '[]'::jsonb)
  )
  from public.trainer_public_profiles p
  join public.profiles pr on pr.id = p.trainer_id
  left join public.trainer_branding b on b.trainer_id = p.trainer_id
  where p_handle ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    and p.handle = lower(p_handle)
    and p.published
    and public.billing_effective_tier(p.trainer_id) = 'business'
  limit 1;
$$;

revoke execute on function public.get_public_trainer_page(text) from public, anon, authenticated;
grant execute on function public.get_public_trainer_page(text) to service_role;
