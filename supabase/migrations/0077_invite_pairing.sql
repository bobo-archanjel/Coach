-- FitPilot — automatické spárovanie klienta s trénerom cez odkaz pozvánky (feature/Stripe).
-- Spustiť v Supabase Dashboard → SQL Editor → New query → vložiť celý súbor → Run.
-- Predpokladá 0029 (invite_claim_attempts), 0032 (ensure_self_client, gen_client_code),
-- 0036 (vzor add_client_by_code), 0047 (clients.paired_at trigger), 0062 (profiles.deletion_requested_at),
-- 0073/0074 (billing_effective_tier, billing_client_limit), 0075 (trainer_branding.invite_slug).
-- Idempotentné (create or replace).
--
-- Čo to je: klient, ktorý prišiel cez /pozvanka/<odkaz> a je prihlásený, jedným klikom
-- („Pripojiť sa“) vyvolá claim_invite(<odkaz>) a spáruje sa s trénerom — bez posielania kódu FP-….
-- Spárovanie nastane VÝHRADNE na explicitný súhlas klienta (kliknutie); appka nič nespáruje sama.
--
-- Rozhodnutie: claim funguje pre KAŽDÝ platný odkaz trénera, ktorý smie brať klientov (aktívny
-- prístup a pod limitom). Tarifa Business sa tu NEvyžaduje — odkaz zostáva platným spárovacím
-- odkazom aj keď tréner o Business prišiel (značka sa vtedy len neukazuje). Samotná pozývacia
-- stránka /pozvanka/<odkaz> sa ďalej vykreslí len pre Business (get_invite_branding, 0075).
--
-- Bezpečnosť:
--  * SECURITY DEFINER + search_path; execute len pre authenticated (nie public/anon);
--  * volajúci musí byť klient (profiles.role = 'client'), páruje SA IBA SÁM (vlastný clients riadok);
--  * neplatný odkaz / zlý formát / tréner bez účtu = jedna generická chyba 'invalid_invite'
--    (žiadna enumerácia); neplatné pokusy sa počítajú do invite_claim_attempts (zdieľané s kódom,
--    8 / 15 min na používateľa) a pri úspechu sa počítadlo NEmaže (inak by sa dal limit obchádzať
--    striedaním platného a neplatných odkazov);
--  * billing_clients_limit_guard (0073) sa spúšťa len pri krokoch samotného trénera
--    (auth.uid() = new.trainer_id) — tu je volajúcim klient, takže limit aj read-only stav
--    trénera kontroluje táto funkcia sama, pod rovnakým advisory lockom ako trigger;
--  * klient ani chyba neodhalia stav predplatného trénera: read-only aj plný limit = 'trainer_unavailable'.

create or replace function public.claim_invite(p_slug text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_recent int;
  v_trainer uuid;
  v_trainer_name text;
  v_trainer_deleting timestamptz;
  v_client public.clients%rowtype;
  v_limit integer;
  v_active integer;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select role into v_role from public.profiles where id = v_uid;
  if v_role is distinct from 'client' then raise exception 'not_a_client'; end if;

  -- rate limit (zdieľané počítadlo s add_client_by_code / claim_client_by_invite)
  select count(*) into v_recent from public.invite_claim_attempts
  where user_id = v_uid and created_at > now() - interval '15 minutes';
  if v_recent >= 8 then raise exception 'too_many_attempts'; end if;

  -- tréner podľa tajného odkazu
  select b.trainer_id, p.full_name, p.deletion_requested_at
    into v_trainer, v_trainer_name, v_trainer_deleting
  from public.trainer_branding b
  join public.profiles p on p.id = b.trainer_id and p.role = 'trainer'
  where p_slug ~ '^[a-f0-9]{20}$' and b.invite_slug = p_slug;

  if v_trainer is null then
    insert into public.invite_claim_attempts (user_id) values (v_uid);
    delete from public.invite_claim_attempts where created_at < now() - interval '1 day';
    -- COMMIT zápisu pokusu zachová aj návrat hodnotou (výnimka by insert zrušila)
    return 'invalid_invite';
  end if;

  -- vlastný riadok klienta (zamknutý proti súbehu: dve karty / dvojklik / súbežný add_client_by_code)
  select * into v_client from public.clients where user_id = v_uid order by created_at asc limit 1 for update;
  if not found then
    perform public.ensure_self_client();
    select * into v_client from public.clients where user_id = v_uid order by created_at asc limit 1 for update;
    if not found then raise exception 'no_client'; end if;
  end if;

  if v_client.trainer_id is not null then
    -- už je u tohto trénera = hotovo (idempotentné), inak má iného
    if v_client.trainer_id = v_trainer then return 'already_paired'; end if;
    raise exception 'already_has_trainer';
  end if;

  -- súbežné pridávania toho istého trénera sa serializujú (rovnaký kľúč ako billing_clients_limit_guard)
  perform pg_advisory_xact_lock(hashtext('billing_clients:' || v_trainer::text));

  if v_trainer_deleting is not null or public.billing_effective_tier(v_trainer) is null then
    raise exception 'trainer_unavailable';
  end if;

  v_limit := public.billing_client_limit(v_trainer);
  if v_limit is not null then
    select count(*) into v_active
    from public.clients c
    where c.trainer_id = v_trainer
      and c.ended_at is null
      and c.deletion_requested_at is null;
    if v_active >= v_limit then raise exception 'trainer_unavailable'; end if;
  end if;

  -- spárovanie ako pri add_client_by_code: paired_at nastaví trigger (0047); vlastný kód klienta
  -- sa hneď mení, aby sa po odpojení nedal znova použiť starý
  update public.clients
    set trainer_id = v_trainer, ended_at = null, invite_code = public.gen_client_code()
    where id = v_client.id;

  -- notifikácia (rovnaký text ako pri pridaní kódom — preklad aj adresát podľa 0046 a systemMessages.ts)
  insert into public.messages (client_id, sender, sender_id, body)
  values (
    v_client.id, 'system', null,
    coalesce(nullif(btrim(v_trainer_name), ''), 'Tréner')
      || ' ťa pridal/-a ako svojho klienta. Ak si to neželáš, prepojenie zrušíš v Profile.'
  );

  return 'paired';
end;
$$;

revoke execute on function public.claim_invite(text) from public, anon;
grant execute on function public.claim_invite(text) to authenticated;
