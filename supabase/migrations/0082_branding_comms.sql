-- FitPilot — komunikácia s klientmi: uvítacia správa v chate, e-mailové pozvánky a týždenné
-- zhrnutie e-mailom (feature/Stripe, branding "bod 2"). Nadväzuje na 0036 (add_client_by_code),
-- 0046/0069 (messages audience + trainer_id), 0075/0077 (trainer_branding, claim_invite),
-- 0073 (my_trainer_can_write), 0059 (profiles.locale). Neupravuje už nasadené migrácie.
-- Spustiť v Supabase Dashboard → SQL Editor → New query → vložiť celý súbor → Run.
-- Idempotentné (create ... if not exists / create or replace / drop policy if exists).
--
-- Čo pridáva:
--  1. trainer_welcome_messages — text uvítacej správy trénera (všetky tarify, nie len Business).
--  2. trainer_welcome_sent + send_trainer_welcome() — pri spárovaní klienta (add_client_by_code,
--     claim_invite) mu príde uvítanie ako BEŽNÁ správa v chate OD trénera. Idempotentné (jedno
--     uvítanie na dvojicu klient–tréner za 30 dní), neprelomí spárovanie ani pri chybe, rešpektuje
--     ochranu pred zaplavením chatu (0036) a adresáta správ (0046/0069 — sender = 'trainer' =
--     audience 'both', trainer_id doplní trigger). Pri OBNOVENÍ spolupráce (resume_client_cooperation)
--     sa uvítanie zámerne neposiela: klient svojho trénera už pozná a správu už dostal.
--  3. client_email_prefs — voľba klienta „Týždenné zhrnutie e-mailom“ (predvolene zapnuté).
--  4. mail_send_log / weekly_summary_log / mail_suppressions + reserve_mail_send() — evidencia
--     odoslaných e-mailov a atómové limity (zápis VÝHRADNE service role; príjemca sa ukladá len
--     ako HMAC hash, nikdy v čitateľnej podobe).

-- ============================================================
--  1) text uvítacej správy trénera
-- ============================================================
create table if not exists public.trainer_welcome_messages (
  trainer_id uuid primary key references public.profiles (id) on delete cascade,
  -- {meno} = krstné meno klienta (nahrádza sa pri odoslaní)
  body text not null default '' check (char_length(body) <= 1000),
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.trainer_welcome_messages enable row level security;
revoke all on public.trainer_welcome_messages from public, anon, authenticated;
grant select, insert, update on public.trainer_welcome_messages to authenticated;

drop policy if exists "trainer_welcome_select_own" on public.trainer_welcome_messages;
create policy "trainer_welcome_select_own"
  on public.trainer_welcome_messages for select
  to authenticated
  using (auth.uid() = trainer_id);

drop policy if exists "trainer_welcome_insert_own" on public.trainer_welcome_messages;
create policy "trainer_welcome_insert_own"
  on public.trainer_welcome_messages for insert
  to authenticated
  with check (auth.uid() = trainer_id and public.my_trainer_can_write());

drop policy if exists "trainer_welcome_update_own" on public.trainer_welcome_messages;
create policy "trainer_welcome_update_own"
  on public.trainer_welcome_messages for update
  to authenticated
  using (auth.uid() = trainer_id)
  with check (auth.uid() = trainer_id and public.my_trainer_can_write());

-- ============================================================
--  2) odoslané uvítania (idempotencia) + pomocná funkcia
-- ============================================================
create table if not exists public.trainer_welcome_sent (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  trainer_id uuid not null,
  sent_at timestamptz not null default now()
);
create index if not exists trainer_welcome_sent_idx on public.trainer_welcome_sent (client_id, trainer_id, sent_at desc);

alter table public.trainer_welcome_sent enable row level security;
revoke all on public.trainer_welcome_sent from public, anon, authenticated;

-- Vloží uvítaciu správu od trénera do chatu klienta. Volajú ju len iné SECURITY DEFINER funkcie
-- (pri spárovaní) — používateľ ju nemôže zavolať priamo (žiadny EXECUTE pre authenticated/anon).
-- NIKDY nevyhodí výnimku: uvítanie je bonus, spárovanie sa kvôli nemu nesmie zrušiť.
create or replace function public.send_trainer_welcome(p_client_id uuid, p_trainer_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_body text;
  v_enabled boolean;
  v_first text;
  v_text text;
begin
  select w.body, w.enabled into v_body, v_enabled
  from public.trainer_welcome_messages w
  where w.trainer_id = p_trainer_id;

  if not found or not v_enabled or btrim(coalesce(v_body, '')) = '' then return; end if;

  -- už dostal uvítanie od tohto trénera nedávno (opakované spárovanie / dvojklik) → nič
  if exists (
    select 1 from public.trainer_welcome_sent s
    where s.client_id = p_client_id and s.trainer_id = p_trainer_id and s.sent_at > now() - interval '30 days'
  ) then return; end if;

  -- ochrana pred zaplavením chatu (0036: 30 správ/min na odosielateľa) — radšej vynechať než zlyhať
  if (select count(*) from public.messages
        where sender_id = p_trainer_id and created_at > now() - interval '1 minute') >= 25 then
    return;
  end if;

  -- krstné meno klienta; bez mena sa {meno} vynechá a text sa upraví (ako lib/mail/welcome.ts)
  select split_part(btrim(coalesce(c.full_name, '')), ' ', 1) into v_first from public.clients c where c.id = p_client_id;
  v_first := coalesce(v_first, '');
  v_text := replace(v_body, '{meno}', v_first);
  if v_first = '' then
    v_text := regexp_replace(v_text, '\s+([,.!?;:])', '\1', 'g');
    v_text := regexp_replace(v_text, '[ \t]{2,}', ' ', 'g');
  end if;
  v_text := btrim(v_text);
  if v_text = '' or char_length(v_text) > 4000 then return; end if;

  begin
    -- clock_timestamp(): správa je v chate až ZA systémovou správou „… ťa pridal/-a“ z toho istého volania
    insert into public.messages (client_id, sender, sender_id, body, created_at)
    values (p_client_id, 'trainer', p_trainer_id, v_text, clock_timestamp());
    insert into public.trainer_welcome_sent (client_id, trainer_id) values (p_client_id, p_trainer_id);
    delete from public.trainer_welcome_sent where sent_at < now() - interval '90 days';
  exception when others then
    -- čokoľvek (flood guard, check…) sa potichu zahodí; subtransakcia vráti len vloženie správy
    null;
  end;
end;
$$;

revoke execute on function public.send_trainer_welcome(uuid, uuid) from public, anon, authenticated;

-- ============================================================
--  2b) add_client_by_code — telo z 0036 + uvítacia správa
-- ============================================================
create or replace function public.add_client_by_code(p_code text)
returns table (client_id uuid, client_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_client public.clients%rowtype;
  v_recent int;
  v_trainer_name text;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select role into v_role from public.profiles where id = v_uid;
  if v_role is distinct from 'trainer' then raise exception 'not_a_trainer'; end if;

  select count(*) into v_recent from public.invite_claim_attempts
  where user_id = v_uid and created_at > now() - interval '15 minutes';
  if v_recent >= 8 then raise exception 'too_many_attempts'; end if;

  select * into v_client from public.clients where invite_code = upper(btrim(p_code));

  if not found or v_client.user_id is null then
    insert into public.invite_claim_attempts (user_id) values (v_uid);
    delete from public.invite_claim_attempts where created_at < now() - interval '1 day';
    raise exception 'invalid_code';
  end if;

  if v_client.trainer_id = v_uid then raise exception 'already_your_client'; end if;
  if v_client.trainer_id is not null then raise exception 'already_has_trainer'; end if;

  -- Kód, ktorý tréner práve použil, sa okamžite mení — nesmie zostať platným
  -- prístupovým údajom, ktorý by tréner mohol znova použiť po odpojení klienta.
  update public.clients
    set trainer_id = v_uid, ended_at = null, invite_code = public.gen_client_code()
    where id = v_client.id;

  select full_name into v_trainer_name from public.profiles where id = v_uid;

  insert into public.messages (client_id, sender, sender_id, body)
  values (
    v_client.id, 'system', null,
    coalesce(nullif(btrim(v_trainer_name), ''), 'Tréner')
      || ' ťa pridal/-a ako svojho klienta. Ak si to neželáš, prepojenie zrušíš v Profile.'
  );

  -- uvítacia správa od trénera (ak ju má nastavenú); nikdy nezruší spárovanie
  perform public.send_trainer_welcome(v_client.id, v_uid);

  delete from public.invite_claim_attempts where user_id = v_uid;

  return query select v_client.id, v_client.full_name;
end;
$$;

revoke execute on function public.add_client_by_code(text) from public, anon;
grant execute on function public.add_client_by_code(text) to authenticated;

-- ============================================================
--  2c) claim_invite — telo z 0077 + uvítacia správa
-- ============================================================
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

  -- uvítacia správa od trénera (ak ju má nastavenú); nikdy nezruší spárovanie
  perform public.send_trainer_welcome(v_client.id, v_trainer);

  return 'paired';
end;
$$;

revoke execute on function public.claim_invite(text) from public, anon;
grant execute on function public.claim_invite(text) to authenticated;

-- ============================================================
--  3) voľby e-mailov klienta
-- ============================================================
create table if not exists public.client_email_prefs (
  client_id uuid primary key references public.clients (id) on delete cascade,
  weekly_summary boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.client_email_prefs enable row level security;
revoke all on public.client_email_prefs from public, anon, authenticated;
grant select, insert, update on public.client_email_prefs to authenticated;

drop policy if exists "client_email_prefs_select_own" on public.client_email_prefs;
create policy "client_email_prefs_select_own"
  on public.client_email_prefs for select
  to authenticated
  using (exists (select 1 from public.clients c where c.id = client_email_prefs.client_id and c.user_id = auth.uid()));

drop policy if exists "client_email_prefs_insert_own" on public.client_email_prefs;
create policy "client_email_prefs_insert_own"
  on public.client_email_prefs for insert
  to authenticated
  with check (exists (select 1 from public.clients c where c.id = client_email_prefs.client_id and c.user_id = auth.uid()));

drop policy if exists "client_email_prefs_update_own" on public.client_email_prefs;
create policy "client_email_prefs_update_own"
  on public.client_email_prefs for update
  to authenticated
  using (exists (select 1 from public.clients c where c.id = client_email_prefs.client_id and c.user_id = auth.uid()))
  with check (exists (select 1 from public.clients c where c.id = client_email_prefs.client_id and c.user_id = auth.uid()));

-- ============================================================
--  4) evidencia a limity e-mailov (len service role)
-- ============================================================
-- Pozvánky: jeden riadok na odoslaný e-mail. recipient_hash = HMAC-SHA256(e-mail, tajný kľúč servera)
-- — z databázy sa adresa nedá prečítať ani zistiť slovníkom bez kľúča.
create table if not exists public.mail_send_log (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('invite')),
  recipient_hash text not null check (char_length(recipient_hash) between 16 and 128),
  sent_at timestamptz not null default now()
);
create index if not exists mail_send_log_trainer_idx on public.mail_send_log (trainer_id, sent_at desc);
create index if not exists mail_send_log_recipient_idx on public.mail_send_log (trainer_id, recipient_hash, sent_at desc);
create index if not exists mail_send_log_sent_idx on public.mail_send_log (sent_at desc);

-- Týždenné zhrnutie: unikátne (klient, týždeň) = idempotencia cronu (opakovaný beh nič nezdvojí).
create table if not exists public.weekly_summary_log (
  client_id uuid not null references public.clients (id) on delete cascade,
  week_start date not null,
  sent_at timestamptz not null default now(),
  primary key (client_id, week_start)
);

-- Odhlásenia z pozvánok (celoplošne, bez ohľadu na trénera) — podľa hashu adresy.
create table if not exists public.mail_suppressions (
  recipient_hash text primary key check (char_length(recipient_hash) between 16 and 128),
  created_at timestamptz not null default now()
);

alter table public.mail_send_log enable row level security;
alter table public.weekly_summary_log enable row level security;
alter table public.mail_suppressions enable row level security;
revoke all on public.mail_send_log, public.weekly_summary_log, public.mail_suppressions from public, anon, authenticated;
grant select, insert, update, delete on public.mail_send_log, public.weekly_summary_log, public.mail_suppressions to service_role;

-- Atómová rezervácia odoslania pozvánky: v jednej kritickej sekcii (advisory lock na trénera)
-- skontroluje limity a vloží riadok. Vracia 'ok' + id záznamu, inak dôvod odmietnutia
-- ('recipient_cooldown' | 'hour_limit' | 'day_limit' | 'global_limit'). Limity zadáva server.
-- Zrkadlo: lib/mail/limits.ts (decideInviteSend) — pri zmene pravidiel upraviť OBE miesta.
create or replace function public.reserve_mail_send(
  p_trainer uuid,
  p_hash text,
  p_hour_limit int,
  p_day_limit int,
  p_cooldown_hours int,
  p_global_day_limit int
)
returns table (status text, log_id uuid, hour_count int, day_count int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hour int;
  v_day int;
  v_global int;
  v_recipient int;
  v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('mail_send:' || p_trainer::text));

  select count(*) filter (where sent_at > now() - interval '1 hour'),
         count(*) filter (where sent_at > now() - interval '24 hours'),
         count(*) filter (where recipient_hash = p_hash and sent_at > now() - make_interval(hours => greatest(p_cooldown_hours, 1)))
    into v_hour, v_day, v_recipient
  from public.mail_send_log
  where trainer_id = p_trainer
    and sent_at > now() - greatest(interval '24 hours', make_interval(hours => greatest(p_cooldown_hours, 1)));

  select count(*) into v_global from public.mail_send_log where sent_at > now() - interval '24 hours';

  if v_recipient > 0 then return query select 'recipient_cooldown'::text, null::uuid, v_hour, v_day; return; end if;
  if v_hour >= p_hour_limit then return query select 'hour_limit'::text, null::uuid, v_hour, v_day; return; end if;
  if v_day >= p_day_limit then return query select 'day_limit'::text, null::uuid, v_hour, v_day; return; end if;
  if v_global >= p_global_day_limit then return query select 'global_limit'::text, null::uuid, v_hour, v_day; return; end if;

  insert into public.mail_send_log (trainer_id, kind, recipient_hash) values (p_trainer, 'invite', p_hash) returning id into v_id;
  -- údržba: záznamy staršie ako 90 dní netreba
  delete from public.mail_send_log where sent_at < now() - interval '90 days';
  return query select 'ok'::text, v_id, v_hour + 1, v_day + 1;
end;
$$;

revoke execute on function public.reserve_mail_send(uuid, text, int, int, int, int) from public, anon, authenticated;
grant execute on function public.reserve_mail_send(uuid, text, int, int, int, int) to service_role;
