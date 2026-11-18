-- FitPilot — registrácia klienta cez Google dostane rolu klient (feature/google-rola).
-- Spustiť v Supabase Dashboard → SQL Editor → New query → vložiť celý súbor → Run.
-- Predpokladá 0032 (ensure_self_client), 0036 (profiles bez update roly z API). Idempotentné.
--
-- Problém: OAuth registrácia neposiela metadáta, takže handle_new_user vytvorí profil s
-- predvolenou rolou 'trainer'. Callback (app/auth/callback/route.ts) ju potom menil na
-- 'client' priamym update profilu — ten je však od 0036 zakázaný (ochrana pred zmenou
-- roly z API), update ticho zlyhal a klient z Google ostal trénerom.
--
-- Teraz: RPC claim_client_role() zmení rolu trainer → client a založí klientovi vlastný
-- riadok s kódom (ako pri registrácii e-mailom). Len pre čerstvý účet (do 10 minút od
-- vytvorenia), ktorý ešte nemá žiadnych klientov — inak sa rola nezmení. Smer
-- client → trainer zostáva z API nemožný.

create or replace function public.claim_client_role()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_created timestamptz;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select p.role, u.created_at into v_role, v_created
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.id = v_uid;

  if v_role is null then raise exception 'no_profile'; end if;

  if v_role = 'trainer' then
    if v_created is null or v_created < now() - interval '10 minutes' then
      raise exception 'not_fresh_account';
    end if;
    if exists (select 1 from public.clients where trainer_id = v_uid) then
      raise exception 'has_clients';
    end if;
    update public.profiles set role = 'client' where id = v_uid;
  elsif v_role <> 'client' then
    raise exception 'invalid_role';
  end if;

  -- vlastný klientsky riadok + kód (idempotentné, ako pri registrácii e-mailom)
  perform public.ensure_self_client();
end;
$$;

revoke execute on function public.claim_client_role() from public, anon;
grant execute on function public.claim_client_role() to authenticated;
