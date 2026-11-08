-- FitPilot — čakacia listina (feature/wishlist).
--
-- Samostatná statická stránka waitlist/index.html zapisuje sem cez verejný anon
-- kľúč (rovnaký princíp bezpečnosti ako zvyšok appky: anon kľúč je verejný by
-- design, hranicu drží RLS). Anon smie výhradne INSERT, nikdy SELECT/UPDATE/DELETE
-- — nikto okrem service_role (Supabase dashboard, edge function) zoznam nevidí.
--
-- Spustiť v Supabase Dashboard → SQL Editor → New query → vložiť celý súbor → Run.
-- Idempotentné.

create table if not exists public.waitlist_signups (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (char_length(btrim(full_name)) between 1 and 120),
  email text not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 320),
  role text not null check (role in ('trainer', 'solo')),
  note text check (note is null or char_length(note) <= 500),
  consent_at timestamptz not null default now(),
  -- Značka pre edge function (send-waitlist-confirmation) — aby pri prípadnom
  -- opakovanom volaní webhooku (Supabase Database Webhooks nemajú at-most-once
  -- záruku) nikdy neposlala potvrdenie dvakrát.
  confirmation_sent_at timestamptz,
  created_at timestamptz not null default now()
);

-- Case-insensitive unikátnosť e-mailu (a@x.sk aj A@x.sk = ten istý zápis).
-- Klient (waitlist/js/main.js) posiela e-mail už v lowercase, toto je poistka
-- pre priamy insert mimo formulára (napr. import, ručný zápis cez dashboard).
create unique index if not exists waitlist_signups_email_lower_idx
  on public.waitlist_signups (lower(email));

alter table public.waitlist_signups enable row level security;

revoke all on public.waitlist_signups from public, anon, authenticated;

drop policy if exists "waitlist_signups_insert_anon" on public.waitlist_signups;
create policy "waitlist_signups_insert_anon"
  on public.waitlist_signups for insert
  to anon
  with check (true);

-- Stĺpcové oprávnenie navyše k RLS politike (rovnaký dvojitý zámok ako 0036) —
-- anon nesmie nastaviť id/created_at/confirmation_sent_at, len tieto štyri polia.
grant insert (full_name, email, role, note, consent_at) on public.waitlist_signups to anon;

grant all on public.waitlist_signups to service_role;
