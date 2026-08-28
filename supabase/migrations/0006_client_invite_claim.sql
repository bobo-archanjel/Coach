-- FitPilot — spárovanie klientského účtu s pozývacím kódom pri registrácii.
-- Spustiť v Supabase Dashboard → SQL Editor → New query → vložiť celý súbor → Run.
-- Predpokladá migráciu 0001_profiles_clients.sql (clients.invite_code, clients.user_id).
--
-- Prečo RPC namiesto priameho UPDATE cez klienta: RLS politiky (0001) dovoľujú
-- update riadku clients len trénerovi (auth.uid() = trainer_id). Čerstvo
-- zaregistrovaný klient túto podmienku nesplní, takže potrebuje presne vymedzenú
-- security definer funkciu — nie všeobecné rozvoľnenie RLS (to by dovolilo
-- ktorémukoľvek prihlásenému používateľovi "ukradnúť" ľubovoľný nespárovaný
-- riadok bez znalosti kódu, keďže RLS nevidí WHERE podmienku volajúceho).

create or replace function public.claim_client_by_invite(p_invite_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id uuid;
  v_current_user_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select id, user_id into v_client_id, v_current_user_id
  from public.clients
  where invite_code = p_invite_code;

  if v_client_id is null then
    raise exception 'invalid_invite_code';
  end if;

  if v_current_user_id is not null and v_current_user_id <> auth.uid() then
    raise exception 'already_claimed';
  end if;

  update public.clients set user_id = auth.uid() where id = v_client_id;
end;
$$;

grant execute on function public.claim_client_by_invite(text) to authenticated;
