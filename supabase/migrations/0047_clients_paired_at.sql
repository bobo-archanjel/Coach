-- FitPilot — "Klient od" = od kedy je klient s TÝMTO trénerom (QA 2026-09-23).
-- Detail klienta aj zoznam ukazovali clients.created_at — deň registrácie klienta
-- (od 0032 si klient zakladá účet sám, dávno pred spárovaním), a po odpojení a
-- znovu-spárovaní sa dátum nezmenil.
--
-- clients.paired_at nastavuje trigger vždy, keď klient dostane trénera (insert
-- s trainer_id, alebo zmena trainer_id na iného/nového) — add_client_by_code,
-- claim_client_by_invite ani trénerom vytvorený klient sa preto nemusia meniť.
-- Obnovenie spolupráce (resume_client_cooperation) trainer_id nemení → dátum ostáva.
-- Backfill: posledná systémová správa o spárovaní, inak created_at.
--
-- Spustiť v Supabase Dashboard → SQL Editor → New query → vložiť celý súbor → Run.
-- Predpokladá 0001–0046. Idempotentné.

alter table public.clients add column if not exists paired_at timestamptz;

create or replace function public.clients_set_paired_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.trainer_id is not null then
      new.paired_at := coalesce(new.paired_at, now());
    end if;
  elsif new.trainer_id is distinct from old.trainer_id then
    -- nový tréner → nový začiatok spolupráce; odpojenie (null) dátum vynuluje
    new.paired_at := case when new.trainer_id is null then null else now() end;
  end if;
  return new;
end;
$$;

drop trigger if exists clients_set_paired_at on public.clients;
create trigger clients_set_paired_at
  before insert or update of trainer_id on public.clients
  for each row execute function public.clients_set_paired_at();

-- Backfill len tam, kde paired_at ešte nie je (idempotentné).
update public.clients c
  set paired_at = coalesce(
    (select max(m.created_at) from public.messages m
      where m.client_id = c.id and m.sender = 'system' and m.body like '% ťa pridal/-a ako svojho klienta.%'),
    c.created_at
  )
  where c.trainer_id is not null and c.paired_at is null;
