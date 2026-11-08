-- FitPilot — feature/optimalizacia (security audit): rate limit na
-- claim_client_by_invite (0006_client_invite_claim.sql).
--
-- Pozývací kód mal len ~1.68M kombinácií (XXX-YYYY, YYYY = 4 znaky z
-- Math.random()) a RPC nemal ŽIADNY limit pokusov — ktokoľvek s vlastným
-- (aj čerstvo vytvoreným) účtom mohol skriptom skúšať kódy a prepojiť sa
-- s cudzím klientským účtom (account takeover — prístup k cudziemu
-- tréningu/jedálničku/chatu). Táto migrácia pridáva rate limit PRIAMO do
-- RPC (nie samostatná funkcia volaná z app kódu ako pri login lockoute,
-- 0028) — claim_client_by_invite je naša vlastná funkcia, netreba
-- obchádzať cudzie API ako pri Supabase Auth.
--
-- Spolu s 0030 (dlhší kód, 8 znakov namiesto 4) — táto migrácia sama o
-- sebe stačí na existujúce (staršie, kratšie) kódy, nezávisle od nej.
--
-- Spustiť v Supabase Dashboard → SQL Editor → New query → vložiť celý súbor → Run.

create table if not exists public.invite_claim_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  created_at timestamptz not null default now()
);

create index if not exists invite_claim_attempts_user_created_idx
  on public.invite_claim_attempts (user_id, created_at desc);

alter table public.invite_claim_attempts enable row level security;
-- Žiadne policy — prístup len cez claim_client_by_invite nižšie (security definer).
revoke all on public.invite_claim_attempts from public, anon, authenticated;

create or replace function public.claim_client_by_invite(p_invite_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id uuid;
  v_current_user_id uuid;
  v_recent_attempts int;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select count(*) into v_recent_attempts
  from public.invite_claim_attempts
  where user_id = auth.uid() and created_at > now() - interval '15 minutes';
  if v_recent_attempts >= 8 then
    raise exception 'too_many_attempts';
  end if;

  select id, user_id into v_client_id, v_current_user_id
  from public.clients
  where invite_code = p_invite_code;

  if v_client_id is null then
    insert into public.invite_claim_attempts (user_id) values (auth.uid());
    delete from public.invite_claim_attempts where created_at < now() - interval '1 day';
    raise exception 'invalid_invite_code';
  end if;

  if v_current_user_id is not null and v_current_user_id <> auth.uid() then
    insert into public.invite_claim_attempts (user_id) values (auth.uid());
    raise exception 'already_claimed';
  end if;

  update public.clients set user_id = auth.uid() where id = v_client_id;

  -- Úspech — vyčisti počítadlo pre tohto používateľa (nový klient si nabudúce
  -- zaslúži čistý stav, nie zvyšné "takmer vyčerpané" pokusy z predošlého pokusu).
  delete from public.invite_claim_attempts where user_id = auth.uid();
end;
$$;

grant execute on function public.claim_client_by_invite(text) to authenticated;
