-- FitPilot — regresný bezpečnostný test databázy (feature/security).
--
-- Overuje, že (a) útoky z bezpečnostného auditu zlyhávajú a (b) legitímne toky
-- ostávajú funkčné. Beží na JEDNORAZOVEJ lokálnej Postgres (nikdy proti produkcii):
--   1. novú DB, stuby Supabase (roly anon/authenticated/service_role, schéma auth s
--      auth.uid() čítajúcim current_setting('app.uid'), schéma cron, publikácia),
--   2. postupne migrácie supabase/migrations/*.sql,
--   3. psql -v ON_ERROR_STOP=1 -f supabase/tests/security_regression.sql
-- Postup krok za krokom: supabase/tests/README.md.
-- Skript na konci zlyhá (nenulový exit), ak čo i len jedna kontrola neprešla.

create temp table results (name text, ok boolean, detail text);
grant all on results to public;

create or replace function pg_temp.chk(p_name text, p_ok boolean, p_detail text default '') returns void
language sql as $$ insert into results values (p_name, coalesce(p_ok, false), p_detail) $$;

-- Vykoná príkaz ako prihlásený používateľ (RLS/GRANTy platia). Vráti 'OK' alebo 'ERR:<sqlstate>'.
create or replace function pg_temp.try(p_uid uuid, p_stmt text, p_role text default 'authenticated') returns text
language plpgsql as $$
declare r text;
begin
  perform set_config('app.uid', coalesce(p_uid::text, ''), true);
  execute 'set local role ' || quote_ident(p_role);
  begin
    execute p_stmt;
    r := 'OK';
  exception when others then
    r := 'ERR:' || sqlstate;
  end;
  reset role;
  return r;
end $$;

-- Počet riadkov, ktoré daný používateľ vidí.
create or replace function pg_temp.cnt(p_uid uuid, p_sql text, p_role text default 'authenticated') returns bigint
language plpgsql as $$
declare n bigint;
begin
  perform set_config('app.uid', coalesce(p_uid::text, ''), true);
  execute 'set local role ' || quote_ident(p_role);
  begin
    execute 'select count(*) from (' || p_sql || ') q' into n;
  exception when others then
    n := -1;   -- -1 = dotaz zlyhal (napr. permission denied)
  end;
  reset role;
  return n;
end $$;

-- ---------------------------------------------------------------- fixtures
\set T2 '''aaaaaaaa-0000-0000-0000-00000000000a'''
\set SOCK '''bbbbbbbb-0000-0000-0000-00000000000b'''
\set C '''cccccccc-0000-0000-0000-00000000000c'''
\set T1 '''dddddddd-0000-0000-0000-00000000000d'''

insert into auth.users (id, email, raw_user_meta_data) values
  (:T2,  't2@x.sk',   '{"role":"trainer","full_name":"Zly Trener"}'),
  (:SOCK,'sock@x.sk', '{"role":"client","full_name":"Sock ucet trenera"}'),
  (:C,   'obet@x.sk', '{"role":"client","full_name":"Obet"}'),
  (:T1,  't1@x.sk',   '{"role":"trainer","full_name":"Cudzi Trener"}');

-- Obeť má self-klientsky riadok (trigger) a kód; tréner T2 ju pripojí legitímnou cestou (kódom).
select id as cid, invite_code as ccode from public.clients where user_id = :C \gset
select pg_temp.try(:T2, format($f$select * from public.add_client_by_code(%L)$f$, :'ccode')) as attach \gset
select pg_temp.chk('legit: tréner pripojí klienta jeho kódom', :'attach' = 'OK', :'attach');

select trainer_id = :T2 as attached, invite_code <> :'ccode' as rotated from public.clients where id = :'cid' \gset
select pg_temp.chk('kód sa po pripojení zmenil (starý už neplatí)', :'rotated'::boolean and :'attached'::boolean);

-- súkromná AI konverzácia obete
insert into public.ai_conversations (id, client_id) values ('22222222-0000-0000-0000-000000000002', :'cid');
insert into public.ai_messages (conversation_id, role, content) values
  ('22222222-0000-0000-0000-000000000002', 'user', 'súkromná zdravotná správa');

-- ============================================================ A) súkromie AI chatu
select pg_temp.chk('A: tréner nemôže prepísať clients.user_id',
  pg_temp.try(:T2, format('update public.clients set user_id = %L where id = %L', :SOCK, :'cid')) like 'ERR:%');
select pg_temp.chk('A: tréner nemôže zmeniť invite_code',
  pg_temp.try(:T2, format('update public.clients set invite_code = ''HACK'' where id = %L', :'cid')) like 'ERR:%');
select pg_temp.chk('A: tréner nemôže zmeniť trainer_id ani ended_at',
  pg_temp.try(:T2, format('update public.clients set trainer_id = null where id = %L', :'cid')) like 'ERR:%'
  and pg_temp.try(:T2, format('update public.clients set ended_at = now() where id = %L', :'cid')) like 'ERR:%');
select pg_temp.chk('A: tréner nevidí AI chat klienta', pg_temp.cnt(:T2, 'select 1 from public.ai_messages') = 0);
select pg_temp.chk('A: sock účet nevidí AI chat klienta', pg_temp.cnt(:SOCK, 'select 1 from public.ai_messages') = 0);
select pg_temp.chk('A: klient svoj AI chat vidí', pg_temp.cnt(:C, 'select 1 from public.ai_messages') = 1);
select pg_temp.chk('legit: tréner smie upraviť popisné polia klienta',
  pg_temp.try(:T2, format('update public.clients set goal = ''nový cieľ'', age = 31 where id = %L', :'cid')) = 'OK');
select pg_temp.chk('tréner nesmie mazať klienta (GDPR lehota cez funkciu)',
  pg_temp.try(:T2, format('delete from public.clients where id = %L', :'cid')) like 'ERR:%'
  or (select count(*) from public.clients where id = :'cid') = 1);

-- ============================================================ B) cross-tenant zápis
select pg_temp.chk('B: cudzí tréner nevloží cieľ kalórií cudziemu klientovi',
  pg_temp.try(:T1, format($f$insert into public.nutrition_profiles (client_id, trainer_id, sex, age, weight_kg, height_cm, activity_level, goal, bmr, tdee, calories_target, protein_g, carbs_g, fat_g)
    values (%L, %L, 'muz', 34, 89, 178, 'stredna', 'chudnutie', 1800, 2500, 800, 60, 50, 20)$f$, :'cid', :T1)) like 'ERR:%');
select pg_temp.chk('B: cudzí tréner nevloží tréningový plán cudziemu klientovi',
  pg_temp.try(:T1, format('insert into public.workout_plans (client_id, trainer_id, name) values (%L, %L, ''x'')', :'cid', :T1)) like 'ERR:%');
select pg_temp.chk('B: cudzí tréner nevloží jedálniček cudziemu klientovi',
  pg_temp.try(:T1, format('insert into public.meal_plans (client_id, trainer_id, name) values (%L, %L, ''x'')', :'cid', :T1)) like 'ERR:%');
select pg_temp.chk('legit: vlastný tréner vloží plán, jedálniček aj cieľ vlastnému klientovi',
  pg_temp.try(:T2, format('insert into public.workout_plans (client_id, trainer_id, name) values (%L, %L, ''Plan'')', :'cid', :T2)) = 'OK'
  and pg_temp.try(:T2, format('insert into public.meal_plans (client_id, trainer_id, name) values (%L, %L, ''Jedalnicek'')', :'cid', :T2)) = 'OK'
  and pg_temp.try(:T2, format($f$insert into public.nutrition_profiles (client_id, trainer_id, sex, age, weight_kg, height_cm, activity_level, goal, bmr, tdee, calories_target, protein_g, carbs_g, fat_g)
    values (%L, %L, 'muz', 34, 89, 178, 'stredna', 'chudnutie', 1800, 2500, 2300, 170, 240, 70)$f$, :'cid', :T2)) = 'OK');
-- plán presunutý na cudzieho klienta
select pg_temp.chk('B: tréner nepresunie svoj plán cudziemu klientovi (update client_id)',
  pg_temp.try(:T2, format('update public.workout_plans set client_id = (select id from public.clients where user_id = %L) where trainer_id = %L', :SOCK, :T2)) like 'ERR:%'
  or (select count(*) from public.workout_plans wp join public.clients c on c.id = wp.client_id where c.user_id = :SOCK) = 0);
select pg_temp.chk('legit: klient vidí plán a cieľ od svojho trénera',
  pg_temp.cnt(:C, 'select 1 from public.workout_plans') = 1 and pg_temp.cnt(:C, 'select 1 from public.nutrition_profiles') = 1);

-- B2) klient vs. klient — priame čítanie cudzích dát (nie cez trénera, priamo
-- ako druhý prihlásený klientský účet skúšajúci vidieť/upraviť dáta iného
-- klienta). SOCK je samostatný klientský účet — pripojený k inému trénerovi
-- (T1) než klient C (ktorého má T2), takže ide o dve úplne nezávislé dvojice.
select id as sock_cid, invite_code as sock_code from public.clients where user_id = :SOCK \gset
select pg_temp.try(:T1, format($f$select * from public.add_client_by_code(%L)$f$, :'sock_code')) as sock_attach \gset
select pg_temp.chk('legit: tréner T1 pripojí klienta SOCK jeho kódom', :'sock_attach' = 'OK', :'sock_attach');
select pg_temp.chk('legit: klient vloží vlastný tréningový plán priamo (bez trénera)',
  pg_temp.try(:SOCK, format('insert into public.workout_plans (client_id, name) values (%L, ''Sockov plan'')', :'sock_cid')) = 'OK');
select pg_temp.chk('legit: klient vloží vlastný záznam telesných mier',
  pg_temp.try(:SOCK, format('insert into public.body_metrics (client_id, trainer_id, measured_on, weight_kg) values (%L, %L, current_date, 80)', :'sock_cid', :T1)) = 'OK');
select pg_temp.chk('B2: klient C nevidí tréningový plán klienta SOCK',
  pg_temp.cnt(:C, format('select 1 from public.workout_plans where client_id = %L', :'sock_cid')) = 0);
select pg_temp.chk('B2: klient SOCK nevidí tréningový plán klienta C (od trénera T2)',
  pg_temp.cnt(:SOCK, format('select 1 from public.workout_plans where client_id = %L', :'cid')) = 0);
select pg_temp.chk('B2: klient C nevidí telesné miery klienta SOCK',
  pg_temp.cnt(:C, format('select 1 from public.body_metrics where client_id = %L', :'sock_cid')) = 0);
select pg_temp.chk('B2: klient SOCK nezapíše telesné miery klientovi C (cudzí client_id)',
  pg_temp.try(:SOCK, format('insert into public.body_metrics (client_id, measured_on, weight_kg) values (%L, current_date, 999)', :'cid')) like 'ERR:%');
select pg_temp.chk('B2: klient SOCK neupraví tréningový plán klienta C',
  pg_temp.try(:SOCK, format('update public.workout_plans set name = ''hack'' where client_id = %L', :'cid')) like 'ERR:%'
  or (select count(*) from public.workout_plans where client_id = :'cid' and name = 'hack') = 0);
select pg_temp.chk('legit: klient SOCK vidí len svoj vlastný plán a svoje miery',
  pg_temp.cnt(:SOCK, 'select 1 from public.workout_plans') = 1 and pg_temp.cnt(:SOCK, 'select 1 from public.body_metrics') = 1);

-- ============================================================ C/E) rola, profil
select pg_temp.chk('11: používateľ si nezmení rolu (client → trainer)',
  pg_temp.try(:C, format('update public.profiles set role = ''trainer'' where id = %L', :C)) like 'ERR:%'
  and (select role from public.profiles where id = :C) = 'client');
select pg_temp.chk('11: používateľ si nezmení e-mail v profile',
  pg_temp.try(:C, format('update public.profiles set email = ''x@x.sk'' where id = %L', :C)) like 'ERR:%');
select pg_temp.chk('legit: používateľ si zmení meno',
  pg_temp.try(:C, format('update public.profiles set full_name = ''Nove Meno'' where id = %L', :C)) = 'OK');

-- ============================================================ D) lockout len cez service role
select pg_temp.chk('4: anon nevolá check_login_lockout', pg_temp.try(null, $s$select public.check_login_lockout('obet@x.sk', 5)$s$, 'anon') like 'ERR:%');
select pg_temp.chk('4: anon nevolá record_failed_login', pg_temp.try(null, $s$select public.record_failed_login('obet@x.sk')$s$, 'anon') like 'ERR:%');
select pg_temp.chk('4: anon nevolá clear_login_attempts', pg_temp.try(null, $s$select public.clear_login_attempts('obet@x.sk')$s$, 'anon') like 'ERR:%');
select pg_temp.chk('4: prihlásený nevolá lockout funkcie', pg_temp.try(:C, $s$select public.record_failed_login('obet@x.sk')$s$) like 'ERR:%');
select pg_temp.chk('4: anon nič nečíta z tabuliek', pg_temp.cnt(null, 'select 1 from public.clients', 'anon') = -1
  and pg_temp.cnt(null, 'select 1 from public.login_attempts', 'anon') = -1);
select pg_temp.try(null, $s$select public.record_failed_login('lock@x.sk') from generate_series(1,5)$s$, 'service_role');
select public.check_login_lockout('lock@x.sk', 5) as locked_5,
       public.check_login_lockout('LOCK@x.sk', 6) as locked_6 \gset
select pg_temp.chk('legit: server (service role) zamkne po 5 pokusoch (prah 5), nie pri prahu 6',
  :'locked_5'::boolean and not :'locked_6'::boolean);
select pg_temp.try(null, $s$select public.clear_login_attempts('lock@x.sk')$s$, 'service_role');
select pg_temp.chk('legit: server po úspešnom prihlásení počítadlo vynuluje',
  not (select public.check_login_lockout('lock@x.sk', 5)));

-- ============================================================ H) waitlist (feature/wishlist)
-- Statická stránka waitlist/index.html zapisuje ako anon (nemá session) — RLS
-- musí povoliť len INSERT, nikdy SELECT/UPDATE, inak by ktokoľvek vedel
-- stiahnuť celý zoznam e-mailov cez verejný anon kľúč.
select pg_temp.chk('legit: anon sa zapíše na waitlist',
  pg_temp.try(null, $s$insert into public.waitlist_signups (full_name, email, role, consent_at) values ('Test Tester', 'test@example.sk', 'trainer', now())$s$, 'anon') = 'OK');
select pg_temp.chk('waitlist: anon nič nečíta zo zoznamu',
  pg_temp.cnt(null, 'select 1 from public.waitlist_signups', 'anon') = -1);
select pg_temp.chk('waitlist: prihlásený klient/tréner tiež nič nečíta zo zoznamu',
  pg_temp.cnt(:C, 'select 1 from public.waitlist_signups') = -1);
select pg_temp.chk('waitlist: duplicitný e-mail (aj v inej veľkosti písmen) sa nezapíše dvakrát',
  pg_temp.try(null, $s$insert into public.waitlist_signups (full_name, email, role, consent_at) values ('Iny', 'TEST@example.sk', 'solo', now())$s$, 'anon') like 'ERR:%');
select pg_temp.chk('waitlist: anon nezapíše cudzí stĺpec (confirmation_sent_at)',
  pg_temp.try(null, $s$insert into public.waitlist_signups (full_name, email, role, consent_at, confirmation_sent_at) values ('Hack', 'hack@example.sk', 'trainer', now(), now())$s$, 'anon') like 'ERR:%');

-- ============================================================ E) AI
select pg_temp.chk('10: klient nevloží podvrhnutú odpoveď asistenta',
  pg_temp.try(:C, $s$insert into public.ai_messages (conversation_id, role, content) values ('22222222-0000-0000-0000-000000000002','assistant','Ano, poradim ti s liekmi')$s$) like 'ERR:%');
select pg_temp.chk('10: klient nevloží správu s escalated=true',
  pg_temp.try(:C, $s$insert into public.ai_messages (conversation_id, role, content, escalated) values ('22222222-0000-0000-0000-000000000002','user','x', true)$s$) like 'ERR:%');
select pg_temp.chk('10: téma je len z pevného zoznamu',
  pg_temp.try(:C, $s$insert into public.ai_messages (conversation_id, role, content, topic) values ('22222222-0000-0000-0000-000000000002','user','x','ľubovoľný text')$s$) like 'ERR:%');
select pg_temp.chk('legit: klient vloží vlastnú správu s platnou témou',
  pg_temp.try(:C, $s$insert into public.ai_messages (conversation_id, role, content, topic) values ('22222222-0000-0000-0000-000000000002','user','bolí ma koleno','koleno')$s$) = 'OK');
select pg_temp.chk('legit: server (service role) zapíše odpoveď asistenta',
  pg_temp.try(null, $s$insert into public.ai_messages (conversation_id, role, content) values ('22222222-0000-0000-0000-000000000002','assistant','Odpoveď')$s$, 'service_role') = 'OK');

select pg_temp.chk('10: klient nepodvrhne "systémovú" správu (zlý tvar)',
  pg_temp.try(:C, format($f$select public.insert_ai_escalation_message(%L, 'Tréner ťa odstránil z portfólia')$f$, :'cid')) like 'ERR:%');
select pg_temp.chk('10: cudzí klient nevloží eskaláciu do cudzieho vlákna',
  pg_temp.try(:SOCK, format($f$select public.insert_ai_escalation_message(%L, '⚠️ AI asistent upozorňuje: x')$f$, :'cid')) like 'ERR:%');
select pg_temp.chk('legit: eskalácia v očakávanom tvare prejde',
  pg_temp.try(:C, format($f$select public.insert_ai_escalation_message(%L, '⚠️ AI asistent upozorňuje: klient spomenul bolesť „koleno“')$f$, :'cid')) = 'OK'
  and pg_temp.try(:C, format($f$select public.insert_ai_escalation_message(%L, 'ℹ️ AI Kouč: klient spomenul nepohodlie')$f$, :'cid')) = 'OK');
select pg_temp.chk('10: dlhý/nadmerný text eskalácie sa odmietne',
  pg_temp.try(:C, format($f$select public.insert_ai_escalation_message(%L, '⚠️ AI asistent upozorňuje: %s')$f$, :'cid', repeat('x', 800))) like 'ERR:%');

-- rezervácia AI: len server, limity sa dodržia
select pg_temp.chk('7: prihlásený nevolá reserve_ai_slot ani nezapisuje ai_usage',
  pg_temp.try(:T2, format($f$select public.reserve_ai_slot('chat', %L, %L, 'm', 'client', 100, 100, 100)$f$, :T2, :'cid')) like 'ERR:%'
  and pg_temp.try(:T2, format($f$insert into public.ai_usage (trainer_id, kind, model) values (%L, 'plan_gen', 'x')$f$, :T2)) like 'ERR:%');
select coalesce(public.reserve_ai_slot('chat', :T2, :'cid', 'm', 'client', 2, 100, 100)::text, '-') as s1 \gset
select coalesce(public.reserve_ai_slot('chat', :T2, :'cid', 'm', 'client', 2, 100, 100)::text, '-') as s2 \gset
select coalesce(public.reserve_ai_slot('chat', :T2, :'cid', 'm', 'client', 2, 100, 100)::text, '-') as s3 \gset
select pg_temp.chk('7: limit na klienta (2/deň): 3. rezervácia je zamietnutá',
  :'s1' <> '-' and :'s2' <> '-' and :'s3' = '-', 's3=' || :'s3');
select coalesce(public.reserve_ai_slot('plan_gen', :T2, null, 'm', 'trainer', 5, 5, 3)::text, '-') as g1 \gset
select coalesce(public.reserve_ai_slot('plan_gen', :T2, null, 'm', 'trainer', 5, 5, 3)::text, '-') as g2 \gset
select pg_temp.chk('7: globálny denný strop sa dodrží (strop 3, už použité 2 chat + 1 plan_gen)',
  :'g1' <> '-' and :'g2' = '-', 'g2=' || :'g2');
select public.finalize_ai_call(:'s1'::uuid, 10, 20);
select pg_temp.chk('legit: finalize zapíše tokeny',
  (select input_tokens = 10 and output_tokens = 20 from public.ai_usage where id = :'s1'::uuid));

-- ============================================================ F) súkromné poznámky trénera
select pg_temp.chk('8: tréner uloží súkromnú poznámku (nová tabuľka)',
  pg_temp.try(:T2, format($f$insert into public.trainer_private_notes (client_id, scope, trainer_id, notes) values (%L, 'client', %L, 'citlivá poznámka')$f$, :'cid', :T2)) = 'OK');
select pg_temp.chk('8: klient poznámku trénera nevidí', pg_temp.cnt(:C, 'select 1 from public.trainer_private_notes') = 0);
select pg_temp.chk('8: cudzí tréner poznámku nevidí', pg_temp.cnt(:T1, 'select 1 from public.trainer_private_notes') = 0);
select pg_temp.chk('8: do starých stĺpcov "notes" sa už zapisovať nedá',
  pg_temp.try(:T2, format('update public.nutrition_profiles set notes = ''x'' where client_id = %L', :'cid')) like 'ERR:%');

-- ============================================================ manuálny klient: kód z DB
select pg_temp.try(:T2, format('insert into public.clients (trainer_id, full_name) values (%L, ''Manualny'')', :T2)) as man_insert \gset
select pg_temp.chk('5: tréner vytvorí manuálneho klienta bez kódu — DB mu vygeneruje silný kód',
  :'man_insert' = 'OK' and (select invite_code ~ '^FP-[0-9A-F]{20}$' from public.clients where full_name = 'Manualny'),
  :'man_insert');
select pg_temp.chk('5: tréner nenastaví vlastný (slabý) kód pri vytváraní',
  pg_temp.try(:T2, format('insert into public.clients (trainer_id, full_name, invite_code) values (%L, ''X'', ''ABC-1234'')', :T2)) like 'ERR:%');
select pg_temp.chk('5: tréner nepriradí pri vytváraní cudzí user_id',
  pg_temp.try(:T2, format('insert into public.clients (trainer_id, full_name, user_id) values (%L, ''Y'', %L)', :T2, :C)) like 'ERR:%');

-- ============================================================ 5) bývalý tréner po odpojení
select invite_code as code_before_leave from public.clients where id = :'cid' \gset
select pg_temp.chk('legit: klient sa odpojí od trénera', pg_temp.try(:C, 'select public.leave_trainer()') = 'OK');
select invite_code <> :'code_before_leave' as rotated2, trainer_id is null as detached from public.clients where id = :'cid' \gset
select pg_temp.chk('5: kód sa po odpojení zmenil', :'rotated2'::boolean and :'detached'::boolean);
select pg_temp.chk('5: bývalý tréner sa starým kódom nevráti',
  pg_temp.try(:T2, format($f$select * from public.add_client_by_code(%L)$f$, :'code_before_leave')) like 'ERR:%'
  and pg_temp.try(:T2, format($f$select * from public.add_client_by_code(%L)$f$, :'ccode')) like 'ERR:%');
select pg_temp.chk('2/5: bývalý tréner už nečíta dáta odpojeného klienta',
  pg_temp.cnt(:T2, 'select 1 from public.nutrition_profiles') = 0
  and pg_temp.cnt(:T2, 'select 1 from public.workout_plans wp join public.clients c on c.id = wp.client_id where c.user_id is not null') = 0
  and pg_temp.cnt(:T2, 'select 1 from public.meal_plans') = 0);
select pg_temp.chk('legit: klient svoje dáta stále vidí po odpojení', pg_temp.cnt(:C, 'select 1 from public.nutrition_profiles') = 1);

-- ============================================================ 9) k-anonymita insightov
insert into auth.users (id, email, raw_user_meta_data)
  select gen_random_uuid(), 'k' || g || '@x.sk', '{"role":"client","full_name":"K"}'::jsonb from generate_series(1, 5) g;
do $$
declare r record; conv uuid; n int := 0;
begin
  for r in select c.id from public.clients c join auth.users u on u.id = c.user_id where u.email like 'k%@x.sk' loop
    n := n + 1;
    update public.clients set trainer_id = 'dddddddd-0000-0000-0000-00000000000d' where id = r.id;
    insert into public.ai_conversations (client_id) values (r.id) returning id into conv;
    insert into public.ai_messages (conversation_id, role, content, topic, created_at)
      values (conv, 'user', 'x', 'koleno', now() - interval '3 days');
    -- 5. klient píše téma "stres/úzkosť" len pred hodinou (nesmie sa započítať)
    insert into public.ai_messages (conversation_id, role, content, topic, created_at)
      values (conv, 'user', 'x', 'stres/úzkosť', now() - interval '1 hour');
  end loop;
end $$;
select pg_temp.chk('9: 5 klientov s rovnakou témou (staršou ako 24 h) sa zobrazí',
  (select count(*) from (select * from public.get_ai_topic_insights(7)) q) is not null
  and pg_temp.cnt(:T1, 'select 1 from public.get_ai_topic_insights(7) where topic = ''koleno''') = 1);
select pg_temp.chk('9: téma z posledných 24 hodín sa nezobrazí (proti sledovaniu v čase)',
  pg_temp.cnt(:T1, 'select 1 from public.get_ai_topic_insights(7) where topic = ''stres/úzkosť''') = 0);
select pg_temp.chk('9: úzke okno (1 deň) sa zaokrúhli na 7 — nedá sa použiť na sledovanie',
  pg_temp.cnt(:T1, 'select 1 from public.get_ai_topic_insights(1) where topic = ''koleno''') = 1);
delete from public.ai_messages where topic = 'koleno' and created_at < now() - interval '2 days'
  and conversation_id in (select id from public.ai_conversations order by created_at desc limit 1);
select pg_temp.chk('9: pod prahom 5 klientov sa téma neukáže',
  pg_temp.cnt(:T1, 'select 1 from public.get_ai_topic_insights(7) where topic = ''koleno''') = 0);

-- ============================================================ G) zaplavenie chatu
select id as cid2 from public.clients where user_id = :SOCK \gset
update public.clients set trainer_id = :T2 where id = :'cid2';
select count(*) filter (where pg_temp.try(:SOCK, format($f$insert into public.messages (client_id, sender, sender_id, body) values (%L, 'client', %L, 'spam')$f$, :'cid2', :SOCK)) = 'OK') as sent
from generate_series(1, 40) \gset
select pg_temp.chk('G: klient nepošle viac ako 30 správ za minútu', :'sent'::int = 30, 'sent=' || :'sent');

-- ============================================================ výsledok
\echo
\echo ===== VÝSLEDKY =====
select case when ok then 'PASS' else 'FAIL' end as stav, name, case when ok then '' else detail end as detail from results order by ok, name;
select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed from results \gset
\echo Prešlo :passed, zlyhalo :failed
do $$ begin if (select count(*) from results where not ok) > 0 then raise exception 'BEZPEČNOSTNÝ REGRESNÝ TEST ZLYHAL'; end if; end $$;
