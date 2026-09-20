-- FitPilot — feature/security: komplexné sprísnenie bezpečnosti databázy.
-- Spustiť v Supabase Dashboard → SQL Editor → New query → vložiť celý súbor → Run.
-- Predpokladá 0001–0035. Idempotentné (dá sa spustiť opakovane).
--
-- ⚠️ Poradie nasadenia: najprv nasadiť kód z vetvy feature/security (používa nové
-- funkcie a prestal zapisovať zakázané stĺpce), potom spustiť túto migráciu.
-- Kód je voči chýbajúcej migrácii tolerantný (padá späť na doterajšie správanie),
-- opačné poradie by však na chvíľu rozbilo "Pridať klienta".
-- Kód navyše vyžaduje SUPABASE_SERVICE_ROLE_KEY v serverovom prostredí (už je v
-- .env.local.example) — používa sa výhradne na serveri pre lockout a AI limity.
--
-- Obsah (číslovanie zodpovedá bezpečnostnému auditu):
--  A. Najmenšie oprávnenia: anon nemá žiadny priamy prístup k tabuľkám/funkciám,
--     stĺpcové GRANTy zabraňujú prepísať user_id/invite_code/role (nálezy 1, 11).
--  B. RLS: tréner smie zapisovať len klientom, ktorí sú JEHO, a čítať len kým
--     vzťah trvá — nie po odpojení klienta (nálezy 2, 5).
--  C. Kód klienta sa mení pri odpojení aj pri pripojení, generuje ho DB (nález 5).
--  D. Lockout prihlásenia len cez server (service role), nie z anon kľúča (nález 4).
--  E. AI: atomická rezervácia limitov + globálny strop, zákaz podvrhnutých správ
--     asistenta, obmedzenie tém, validovaná eskalácia (nálezy 7, 9, 10).
--  F. Súkromné poznámky trénera mimo tabuliek, ktoré číta klient (nález 8).
--  G. Ochrana pred zaplavením chatu.

-- ============================================================
--  A. NAJMENŠIE OPRÁVNENIA
-- ============================================================
-- Nepihlásený používateľ (anon kľúč je verejný, je v prehliadači) nemá k dátam
-- čo hľadať: appka cez anon volá len Supabase Auth, nikdy PostgREST tabuľky/RPC.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from anon;

-- Funkcie: zruš implicitné PUBLIC/anon EXECUTE, prihlásenému a serveru ponechaj.
-- Konkrétne funkcie, ktoré prihlásený smie/nesmie volať, upresňuje časť ďalej.
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;

-- clients: tréner smie meniť len "popisné" polia. NIKDY user_id (prepis by mu dal
-- prístup k súkromnému AI chatu klienta), invite_code, trainer_id, ended_at,
-- deletion_* — tie menia len SECURITY DEFINER funkcie (leave_trainer,
-- add_client_by_code, request_client_deletion, …).
revoke insert, update, delete on public.clients from authenticated;
grant insert (trainer_id, full_name, goal, age, weight_kg, height_cm) on public.clients to authenticated;
grant update (full_name, goal, age, weight_kg, height_cm) on public.clients to authenticated;

-- profiles: rola a e-mail sa z API meniť nesmú (self-eskalácia client → trainer).
revoke insert, update, delete on public.profiles from authenticated;
grant update (full_name) on public.profiles to authenticated;

-- Tabuľky, do ktorých píšu výhradne serverové funkcie/cron:
revoke insert, update, delete on public.ai_usage from authenticated;
revoke insert, update, delete on public.client_health_snapshots from authenticated;
revoke update, delete on public.messages from authenticated;
revoke update, delete on public.ai_messages from authenticated;
revoke update on public.ai_conversations from authenticated;

-- ============================================================
--  B. RLS — vlastníctvo klienta pri zápise, vzťah pri čítaní
-- ============================================================
-- Doteraz stačilo trainer_id = auth.uid(): tréner vedel vložiť plán / cieľ kalórií
-- CUDZIEMU klientovi (stačilo poznať UUID) a bývalý tréner čítal dáta klienta aj po
-- odpojení. Teraz sa vždy overuje AKTUÁLNY vzťah clients.trainer_id = auth.uid().

-- --- workout_plans ---
drop policy if exists "workout_plans_select_own_trainer" on public.workout_plans;
drop policy if exists "workout_plans_insert_own_trainer" on public.workout_plans;
drop policy if exists "workout_plans_update_own_trainer" on public.workout_plans;
drop policy if exists "workout_plans_delete_own_trainer" on public.workout_plans;
create policy "workout_plans_select_own_trainer" on public.workout_plans for select
  using (auth.uid() = trainer_id and exists (select 1 from public.clients c where c.id = workout_plans.client_id and c.trainer_id = auth.uid()));
create policy "workout_plans_insert_own_trainer" on public.workout_plans for insert
  with check (auth.uid() = trainer_id and exists (select 1 from public.clients c where c.id = workout_plans.client_id and c.trainer_id = auth.uid()));
create policy "workout_plans_update_own_trainer" on public.workout_plans for update
  using (auth.uid() = trainer_id and exists (select 1 from public.clients c where c.id = workout_plans.client_id and c.trainer_id = auth.uid()))
  with check (auth.uid() = trainer_id and exists (select 1 from public.clients c where c.id = workout_plans.client_id and c.trainer_id = auth.uid()));
create policy "workout_plans_delete_own_trainer" on public.workout_plans for delete
  using (auth.uid() = trainer_id and exists (select 1 from public.clients c where c.id = workout_plans.client_id and c.trainer_id = auth.uid()));

-- --- workout_days (cez plán) ---
drop policy if exists "workout_days_select_own_trainer" on public.workout_days;
drop policy if exists "workout_days_insert_own_trainer" on public.workout_days;
drop policy if exists "workout_days_update_own_trainer" on public.workout_days;
drop policy if exists "workout_days_delete_own_trainer" on public.workout_days;
create policy "workout_days_select_own_trainer" on public.workout_days for select
  using (exists (select 1 from public.workout_plans wp join public.clients c on c.id = wp.client_id
                 where wp.id = workout_days.plan_id and wp.trainer_id = auth.uid() and c.trainer_id = auth.uid()));
create policy "workout_days_insert_own_trainer" on public.workout_days for insert
  with check (exists (select 1 from public.workout_plans wp join public.clients c on c.id = wp.client_id
                      where wp.id = workout_days.plan_id and wp.trainer_id = auth.uid() and c.trainer_id = auth.uid()));
create policy "workout_days_update_own_trainer" on public.workout_days for update
  using (exists (select 1 from public.workout_plans wp join public.clients c on c.id = wp.client_id
                 where wp.id = workout_days.plan_id and wp.trainer_id = auth.uid() and c.trainer_id = auth.uid()))
  with check (exists (select 1 from public.workout_plans wp join public.clients c on c.id = wp.client_id
                      where wp.id = workout_days.plan_id and wp.trainer_id = auth.uid() and c.trainer_id = auth.uid()));
create policy "workout_days_delete_own_trainer" on public.workout_days for delete
  using (exists (select 1 from public.workout_plans wp join public.clients c on c.id = wp.client_id
                 where wp.id = workout_days.plan_id and wp.trainer_id = auth.uid() and c.trainer_id = auth.uid()));

-- --- meal_plans ---
drop policy if exists "meal_plans_select_own_trainer" on public.meal_plans;
drop policy if exists "meal_plans_insert_own_trainer" on public.meal_plans;
drop policy if exists "meal_plans_update_own_trainer" on public.meal_plans;
drop policy if exists "meal_plans_delete_own_trainer" on public.meal_plans;
create policy "meal_plans_select_own_trainer" on public.meal_plans for select
  using (auth.uid() = trainer_id and exists (select 1 from public.clients c where c.id = meal_plans.client_id and c.trainer_id = auth.uid()));
create policy "meal_plans_insert_own_trainer" on public.meal_plans for insert
  with check (auth.uid() = trainer_id and exists (select 1 from public.clients c where c.id = meal_plans.client_id and c.trainer_id = auth.uid()));
create policy "meal_plans_update_own_trainer" on public.meal_plans for update
  using (auth.uid() = trainer_id and exists (select 1 from public.clients c where c.id = meal_plans.client_id and c.trainer_id = auth.uid()))
  with check (auth.uid() = trainer_id and exists (select 1 from public.clients c where c.id = meal_plans.client_id and c.trainer_id = auth.uid()));
create policy "meal_plans_delete_own_trainer" on public.meal_plans for delete
  using (auth.uid() = trainer_id and exists (select 1 from public.clients c where c.id = meal_plans.client_id and c.trainer_id = auth.uid()));

-- --- meal_days (cez plán) ---
drop policy if exists "meal_days_select_own_trainer" on public.meal_days;
drop policy if exists "meal_days_insert_own_trainer" on public.meal_days;
drop policy if exists "meal_days_update_own_trainer" on public.meal_days;
drop policy if exists "meal_days_delete_own_trainer" on public.meal_days;
create policy "meal_days_select_own_trainer" on public.meal_days for select
  using (exists (select 1 from public.meal_plans mp join public.clients c on c.id = mp.client_id
                 where mp.id = meal_days.plan_id and mp.trainer_id = auth.uid() and c.trainer_id = auth.uid()));
create policy "meal_days_insert_own_trainer" on public.meal_days for insert
  with check (exists (select 1 from public.meal_plans mp join public.clients c on c.id = mp.client_id
                      where mp.id = meal_days.plan_id and mp.trainer_id = auth.uid() and c.trainer_id = auth.uid()));
create policy "meal_days_update_own_trainer" on public.meal_days for update
  using (exists (select 1 from public.meal_plans mp join public.clients c on c.id = mp.client_id
                 where mp.id = meal_days.plan_id and mp.trainer_id = auth.uid() and c.trainer_id = auth.uid()))
  with check (exists (select 1 from public.meal_plans mp join public.clients c on c.id = mp.client_id
                      where mp.id = meal_days.plan_id and mp.trainer_id = auth.uid() and c.trainer_id = auth.uid()));
create policy "meal_days_delete_own_trainer" on public.meal_days for delete
  using (exists (select 1 from public.meal_plans mp join public.clients c on c.id = mp.client_id
                 where mp.id = meal_days.plan_id and mp.trainer_id = auth.uid() and c.trainer_id = auth.uid()));

-- --- nutrition_profiles ---
drop policy if exists "nutrition_profiles_select_own_trainer" on public.nutrition_profiles;
drop policy if exists "nutrition_profiles_insert_own_trainer" on public.nutrition_profiles;
drop policy if exists "nutrition_profiles_update_own_trainer" on public.nutrition_profiles;
drop policy if exists "nutrition_profiles_delete_own_trainer" on public.nutrition_profiles;
create policy "nutrition_profiles_select_own_trainer" on public.nutrition_profiles for select
  using (auth.uid() = trainer_id and exists (select 1 from public.clients c where c.id = nutrition_profiles.client_id and c.trainer_id = auth.uid()));
create policy "nutrition_profiles_insert_own_trainer" on public.nutrition_profiles for insert
  with check (auth.uid() = trainer_id and exists (select 1 from public.clients c where c.id = nutrition_profiles.client_id and c.trainer_id = auth.uid()));
create policy "nutrition_profiles_update_own_trainer" on public.nutrition_profiles for update
  using (auth.uid() = trainer_id and exists (select 1 from public.clients c where c.id = nutrition_profiles.client_id and c.trainer_id = auth.uid()))
  with check (auth.uid() = trainer_id and exists (select 1 from public.clients c where c.id = nutrition_profiles.client_id and c.trainer_id = auth.uid()));
create policy "nutrition_profiles_delete_own_trainer" on public.nutrition_profiles for delete
  using (auth.uid() = trainer_id and exists (select 1 from public.clients c where c.id = nutrition_profiles.client_id and c.trainer_id = auth.uid()));

-- --- coach_notes (insert už vzťah overoval) ---
drop policy if exists "coach_notes_select_own_trainer" on public.coach_notes;
drop policy if exists "coach_notes_update_own_trainer" on public.coach_notes;
drop policy if exists "coach_notes_delete_own_trainer" on public.coach_notes;
create policy "coach_notes_select_own_trainer" on public.coach_notes for select
  using (auth.uid() = trainer_id and exists (select 1 from public.clients c where c.id = coach_notes.client_id and c.trainer_id = auth.uid()));
create policy "coach_notes_update_own_trainer" on public.coach_notes for update
  using (auth.uid() = trainer_id and exists (select 1 from public.clients c where c.id = coach_notes.client_id and c.trainer_id = auth.uid()))
  with check (auth.uid() = trainer_id and exists (select 1 from public.clients c where c.id = coach_notes.client_id and c.trainer_id = auth.uid()));
create policy "coach_notes_delete_own_trainer" on public.coach_notes for delete
  using (auth.uid() = trainer_id and exists (select 1 from public.clients c where c.id = coach_notes.client_id and c.trainer_id = auth.uid()));

-- --- body_metrics, appointments (with check už vzťah overoval, using nie) ---
drop policy if exists "body_metrics_all_own_trainer" on public.body_metrics;
create policy "body_metrics_all_own_trainer" on public.body_metrics for all
  using (trainer_id = auth.uid() and exists (select 1 from public.clients c where c.id = client_id and c.trainer_id = auth.uid()))
  with check (trainer_id = auth.uid() and exists (select 1 from public.clients c where c.id = client_id and c.trainer_id = auth.uid()));

drop policy if exists "appointments_all_own_trainer" on public.appointments;
create policy "appointments_all_own_trainer" on public.appointments for all
  using (trainer_id = auth.uid() and exists (select 1 from public.clients c where c.id = client_id and c.trainer_id = auth.uid()))
  with check (trainer_id = auth.uid() and exists (select 1 from public.clients c where c.id = client_id and c.trainer_id = auth.uid()));

-- ============================================================
--  C. KÓD KLIENTA — generuje DB, mení sa pri pripojení aj odpojení
-- ============================================================
-- Kód manuálne pridaného klienta predtým generoval Math.random() s predvídateľnými
-- iniciálami. Teraz default z DB (gen_client_code: 80 bitov z gen_random_uuid()),
-- tréner ho pri vytváraní nastaviť nemôže (stĺpec nie je v INSERT grante).
alter table public.clients alter column invite_code set default public.gen_client_code();

-- Kód bol trvalý "bearer" údaj: bývalý tréner, ktorý ho poznal, sa vedel po odpojení
-- klienta znova pripojiť. Teraz sa mení pri odpojení aj pri každom pripojení.
create or replace function public.leave_trainer()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_client public.clients%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select * into v_client from public.clients where user_id = v_uid order by created_at asc limit 1;
  if not found then raise exception 'no_client'; end if;
  if v_client.trainer_id is null then return; end if;

  update public.clients
    set trainer_id = null, ended_at = null, invite_code = public.gen_client_code()
    where id = v_client.id;
end;
$$;

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

  delete from public.invite_claim_attempts where user_id = v_uid;

  return query select v_client.id, v_client.full_name;
end;
$$;

-- ============================================================
--  D. LOCKOUT PRIHLÁSENIA — len z servera (service role)
-- ============================================================
-- Funkcie z 0028 boli dostupné anonymne cez verejný anon kľúč: ktokoľvek vedel
-- cudzí účet zamknúť (5 volaní), počítadlo vynulovať alebo tabuľku zaplaviť. Teraz
-- ich smie volať výhradne server (app/prihlasenie/actions.ts, service role) a limit
-- sa dá zadať (per e-mail, per e-mail+IP, per IP majú rôzne prahy).
drop function if exists public.check_login_lockout(text);

create or replace function public.check_login_lockout(p_identifier text, p_max int default 5)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  select count(*) into v_count
  from public.login_attempts
  where identifier = lower(p_identifier)
    and created_at > now() - interval '15 minutes';
  return v_count >= greatest(coalesce(p_max, 5), 1);
end;
$$;

revoke all on function public.check_login_lockout(text, int) from public, anon, authenticated;
revoke all on function public.record_failed_login(text) from public, anon, authenticated;
revoke all on function public.clear_login_attempts(text) from public, anon, authenticated;
grant execute on function public.check_login_lockout(text, int) to service_role;
grant execute on function public.record_failed_login(text) to service_role;
grant execute on function public.clear_login_attempts(text) to service_role;

-- ============================================================
--  E. AI — atomické limity, žiadne podvrhnuté správy, validácie
-- ============================================================
-- E1. Rezervácia AI volania. Doterajší limit sa najprv prečítal a zapísal až PO
-- volaní modelu — paralelné požiadavky ho obišli. Rezervácia beží pod advisory
-- lockom (počet + vloženie riadku v jednej kritickej sekcii), má globálny denný
-- strop (ochrana pred zneužitím cez množstvo účtov) a limit na trénera. Volá ju
-- iba server (service role) s limitmi z env — používateľ ich zadať nemôže.
create or replace function public.reserve_ai_slot(
  p_kind text,
  p_trainer_id uuid,
  p_client_id uuid,
  p_model text,
  p_subject text,        -- 'client' | 'trainer' — komu sa počíta denný limit
  p_subject_limit int,
  p_trainer_limit int,   -- strop pre trénera a druh (chráni pred farmou fiktívnych klientov)
  p_global_limit int
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_since timestamptz := date_trunc('day', now() at time zone 'Europe/Bratislava') at time zone 'Europe/Bratislava';
  v_n int;
  v_id uuid;
begin
  if p_subject not in ('client', 'trainer') then raise exception 'bad_subject'; end if;

  perform pg_advisory_xact_lock(884422);

  select count(*) into v_n from public.ai_usage where created_at >= v_since;
  if v_n >= p_global_limit then return null; end if;

  select count(*) into v_n from public.ai_usage
    where trainer_id = p_trainer_id and kind = p_kind and created_at >= v_since;
  if v_n >= p_trainer_limit then return null; end if;

  if p_subject = 'client' then
    select count(*) into v_n from public.ai_usage
      where client_id = p_client_id and kind = p_kind and created_at >= v_since;
  else
    v_n := (select count(*) from public.ai_usage
              where trainer_id = p_trainer_id and kind = p_kind and created_at >= v_since);
  end if;
  if v_n >= p_subject_limit then return null; end if;

  insert into public.ai_usage (trainer_id, client_id, kind, model, input_tokens, output_tokens)
  values (p_trainer_id, p_client_id, p_kind, p_model, 0, 0)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.finalize_ai_call(p_id uuid, p_input int, p_output int)
returns void
language sql
security definer
set search_path = public
as $$
  update public.ai_usage set input_tokens = greatest(p_input, 0), output_tokens = greatest(p_output, 0) where id = p_id;
$$;

revoke all on function public.reserve_ai_slot(text, uuid, uuid, text, text, int, int, int) from public, anon, authenticated;
revoke all on function public.finalize_ai_call(uuid, int, int) from public, anon, authenticated;
grant execute on function public.reserve_ai_slot(text, uuid, uuid, text, text, int, int, int) to service_role;
grant execute on function public.finalize_ai_call(uuid, int, int) to service_role;

-- Priamy insert do ai_usage cez politiku umožňoval klientovi vyčerpať limity svojho
-- trénera (podvrhnuté riadky) — zápis je teraz len zo servera.
drop policy if exists "ai_usage_insert_own_trainer_or_client" on public.ai_usage;

-- E2. AI chat: klient smie vkladať len VLASTNÉ (user) správy. Odpovede asistenta
-- zapisuje server; inak by si klient vedel podvrhnúť "asistentove" odpovede, ktoré
-- sa posielajú modelu ako história (obchvat zdravotných hraníc).
update public.ai_messages
  set topic = null
  where topic is not null
    and topic not in ('koleno', 'chrbát', 'rameno', 'členok/členky', 'zápästie', 'bedro/bok', 'lakeť',
                      'iné zdravotné', 'motivácia', 'spánok/únava', 'stres/úzkosť', 'hlad/chute');
alter table public.ai_messages drop constraint if exists ai_messages_topic_check;
alter table public.ai_messages add constraint ai_messages_topic_check
  check (topic is null or topic in ('koleno', 'chrbát', 'rameno', 'členok/členky', 'zápästie', 'bedro/bok', 'lakeť',
                                    'iné zdravotné', 'motivácia', 'spánok/únava', 'stres/úzkosť', 'hlad/chute'));

drop policy if exists "ai_messages_insert" on public.ai_messages;
create policy "ai_messages_insert"
  on public.ai_messages for insert
  with check (
    role = 'user' and escalated = false
    and exists (
      select 1 from public.ai_conversations conv
      join public.clients c on c.id = conv.client_id
      where conv.id = ai_messages.conversation_id and c.user_id = auth.uid()
    )
  );

-- E3. Eskalácia trénerovi. Funkciu mohol klient volať priamo s ľubovoľným textom
-- a podvrhnúť tak "systémovú" správu (napr. "Tréner ťa odstránil..."). Teraz musí
-- text začínať tvarom, ktorý appka generuje (lib/ai/healthFilter.ts), je zastropovaný
-- a počet takých správ za hodinu je obmedzený.
create or replace function public.insert_ai_escalation_message(p_client_id uuid, p_body text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recent int;
begin
  if not exists (select 1 from public.clients where id = p_client_id and user_id = auth.uid()) then
    raise exception 'insert_ai_escalation_message: caller is not the owning client';
  end if;

  if p_body is null or char_length(p_body) > 700
     or not (p_body ~ '^\S{1,4} AI asistent upozorňuje: ' or p_body ~ '^\S{1,4} AI Kouč: ') then
    raise exception 'insert_ai_escalation_message: invalid body';
  end if;

  select count(*) into v_recent from public.messages
    where client_id = p_client_id and sender = 'system' and created_at > now() - interval '1 hour';
  if v_recent >= 10 then
    raise exception 'insert_ai_escalation_message: rate limited';
  end if;

  insert into public.messages (client_id, sender, sender_id, body)
  values (p_client_id, 'system', null, p_body);
end;
$$;

-- E4. Agregované AI insighty: k-anonymita s pevným oknom. Voľný parameter dní a
-- prah 3 umožňovali diferenčný útok (úzke okno + sledovanie zmeny počtu → ktorá téma
-- prišla práve teraz). Teraz: okno aspoň 7 dní (max 30), posledných 24 hodín sa
-- nezapočítava a prah je 5 rôznych klientov.
create or replace function public.get_ai_topic_insights(p_days integer default 7)
returns table (topic text, client_count bigint)
language sql
security definer
set search_path = public
as $$
  select m.topic, count(distinct c.id) as client_count
  from public.ai_messages m
  join public.ai_conversations conv on conv.id = m.conversation_id
  join public.clients c on c.id = conv.client_id
  where c.trainer_id = auth.uid()
    and m.role = 'user'
    and m.topic is not null
    and m.created_at >= now() - make_interval(days => greatest(least(coalesce(p_days, 7), 30), 7))
    and m.created_at < now() - interval '24 hours'
  group by m.topic
  having count(distinct c.id) >= 5
  order by client_count desc;
$$;

-- ============================================================
--  F. SÚKROMNÉ POZNÁMKY TRÉNERA — mimo tabuliek, ktoré číta klient
-- ============================================================
-- RLS je riadková: klient číta CELÝ svoj riadok v clients a nutrition_profiles,
-- vrátane trénerových poznámok "notes". Poznámky sa presúvajú do tabuľky, ktorú
-- vidí len súčasný tréner klienta.
create table if not exists public.trainer_private_notes (
  client_id uuid not null references public.clients (id) on delete cascade,
  scope text not null check (scope in ('client', 'nutrition')),
  trainer_id uuid not null references public.profiles (id) on delete cascade,
  notes text not null check (char_length(notes) <= 4000),
  updated_at timestamptz not null default now(),
  primary key (client_id, scope)
);

alter table public.trainer_private_notes enable row level security;
drop policy if exists "trainer_private_notes_own_trainer" on public.trainer_private_notes;
create policy "trainer_private_notes_own_trainer" on public.trainer_private_notes for all
  using (trainer_id = auth.uid() and exists (select 1 from public.clients c where c.id = client_id and c.trainer_id = auth.uid()))
  with check (trainer_id = auth.uid() and exists (select 1 from public.clients c where c.id = client_id and c.trainer_id = auth.uid()));

revoke all on public.trainer_private_notes from anon;

insert into public.trainer_private_notes (client_id, scope, trainer_id, notes)
  select id, 'client', trainer_id, left(notes, 4000) from public.clients
  where notes is not null and btrim(notes) <> '' and trainer_id is not null
  on conflict (client_id, scope) do nothing;

insert into public.trainer_private_notes (client_id, scope, trainer_id, notes)
  select client_id, 'nutrition', trainer_id, left(notes, 4000) from public.nutrition_profiles
  where notes is not null and btrim(notes) <> ''
  on conflict (client_id, scope) do nothing;

-- Až po skopírovaní: pôvodné stĺpce sa vynulujú (dáta ostávajú v novej tabuľke)
-- a do "notes" sa už z API nedá zapisovať.
update public.clients set notes = null
  where notes is not null and trainer_id is not null
    and exists (select 1 from public.trainer_private_notes n where n.client_id = clients.id and n.scope = 'client');
update public.nutrition_profiles set notes = null
  where notes is not null
    and exists (select 1 from public.trainer_private_notes n where n.client_id = nutrition_profiles.client_id and n.scope = 'nutrition');

do $$
declare
  cols text;
begin
  select string_agg(quote_ident(column_name), ', ') into cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'nutrition_profiles' and column_name <> 'notes';
  execute 'revoke insert, update on public.nutrition_profiles from authenticated';
  execute format('grant insert (%s), update (%s) on public.nutrition_profiles to authenticated', cols, cols);
end $$;

-- ============================================================
--  G. OCHRANA PRED ZAPLAVENÍM CHATU
-- ============================================================
create or replace function public.messages_flood_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.sender in ('client', 'trainer') and new.sender_id is not null then
    if (select count(*) from public.messages
          where sender_id = new.sender_id and created_at > now() - interval '1 minute') >= 30 then
      raise exception 'rate_limited: príliš veľa správ za minútu';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists messages_flood_guard_trg on public.messages;
create trigger messages_flood_guard_trg
  before insert on public.messages
  for each row execute function public.messages_flood_guard();

-- ============================================================
--  Záverečné upresnenie oprávnení funkcií
-- ============================================================
-- Interné/cron funkcie nemá čo volať ani prihlásený používateľ.
revoke execute on function public.send_proactive_ai_checkins() from authenticated;
revoke execute on function public.snapshot_client_health_weekly() from authenticated;
revoke execute on function public.get_client_health_buckets() from authenticated;
revoke execute on function public.purge_deleted_clients() from authenticated;
revoke execute on function public.messages_flood_guard() from authenticated;
