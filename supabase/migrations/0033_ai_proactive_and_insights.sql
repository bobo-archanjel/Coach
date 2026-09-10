-- FitPilot — feature/AI: (1) Realtime pre chat namiesto čistého pollingu,
-- (2) proaktívny AI check-in pri strate adherencie, (3) agregované AI Kouč
-- insighty pre trénera bez prístupu k obsahu (GDPR).
-- Spustiť v Supabase Dashboard → SQL Editor → New query → vložiť celý súbor → Run.
-- Predpokladá 0008 (messages), 0014/0017 (ai_conversations/ai_messages, súkromné).

-- ---------- 1. Realtime pre `messages` (tréner↔klient chat) ----------
-- Chat bol dovtedy čisto poll-based (~12 s, ROADMAP). Postgres_changes cez
-- Supabase Realtime vyhodnocuje SELECT RLS danej tabuľky za pripojeného
-- používateľa (messages_select, 0008) — klient teda cez tento kanál nikdy
-- nedostane nič, čo by si beztak nemohol prečítať bežným dopytom. Idempotentný
-- guard, lebo ALTER PUBLICATION ... ADD TABLE nemá vlastné IF NOT EXISTS.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;

-- ---------- 2. Proaktívny AI check-in (klient N dní necvičí) ----------
-- Doteraz stratu adherencie videl len tréner (badge "meškanie" na /dashboard) —
-- klient sám nedostal žiadny impulz, kým sa mu tréner sám neozval. Denný
-- pg_cron job (rovnaký vzor ako purge-deleted-clients-daily, 0018) pošle
-- klientovi jemnú, zdravotne bezpečnú správu priamo do AI Kouč vlákna (rovnaké
-- guardraily ako živý chat — appka NIKDY nekomentuje/nediagnostikuje zdravotný
-- dôvod, len odkáže na trénera, viď lib/ai/healthFilter.ts). Zámerne pevný
-- (nie AI-generovaný) text — žiadny voľný LLM výstup do neiniciovanej správy,
-- nulové riziko halucinácie pri niečom, čo klient sám nevyžiadal.
alter table public.clients add column if not exists last_proactive_checkin_at timestamptz;

-- "Mešká" = rovnaká definícia ako badge na /dashboard (app/dashboard/page.tsx,
-- LATE_THRESHOLD_DAYS): má priradený plán, ale posledný odklikaný tréning
-- (alebo pridelenie plánu, ak ešte necvičil vôbec) je ≥5 dní dozadu. Cooldown
-- 5 dní medzi dvoma nudge správami tomu istému klientovi, nech appka nespamuje
-- pri každom dennom behu jobu.
create or replace function public.send_proactive_ai_checkins()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  v_conversation_id uuid;
  v_message text;
begin
  for rec in
    with plan_latest as (
      select client_id, max(created_at) as plan_created_at
      from public.workout_plans
      group by client_id
    ),
    log_latest as (
      select client_id, max(performed_on) as last_performed_on
      from public.workout_logs
      group by client_id
    )
    select
      c.id as client_id,
      extract(day from now() - coalesce(ll.last_performed_on::timestamptz, pl.plan_created_at))::int as days_late
    from public.clients c
    join plan_latest pl on pl.client_id = c.id
    left join log_latest ll on ll.client_id = c.id
    where c.trainer_id is not null
      and c.ended_at is null
      and c.deletion_requested_at is null
      and (c.last_proactive_checkin_at is null or c.last_proactive_checkin_at < now() - interval '5 days')
      and coalesce(ll.last_performed_on::timestamptz, pl.plan_created_at) < now() - interval '5 days'
  loop
    v_message := case
      when rec.days_late < 10 then
        'Ahoj! Posledný odcvičený tréning ti eviduje appka pred ' || rec.days_late || ' dňami. Ako to ide — ' ||
        'drží ťa niečo mimo tréningu (čas, chuť, alebo niečo iné)? Napíš mi pokojne, poradím s tréningom aj ' ||
        'stravou. Pri čomkoľvek zdravotnom sa vždy radšej obráť rovno na svojho trénera.'
      when rec.days_late < 21 then
        'Ahoj! Je to už ' || rec.days_late || ' dní bez odcvičeného tréningu. Nič sa nedeje, ak sa niečo zmenilo — ' ||
        'chcel by si upraviť plán, aby lepšie sedel tvojmu bežnému týždňu? Napíš mi, poradíme sa. Zdravotné veci ' ||
        'nechaj radšej priamo na svojho trénera.'
      else
        'Ahoj, dlho sme sa nevideli — ' || rec.days_late || ' dní bez tréningu. Ak sa ti oplatí naštartovať odznova, ' ||
        'pokojne mi napíš, prejdeme si to spolu. A ak je dôvodom niečo zdravotné, ozvi sa radšej priamo trénerovi.'
    end;

    select id into v_conversation_id from public.ai_conversations where client_id = rec.client_id;
    if v_conversation_id is null then
      insert into public.ai_conversations (client_id) values (rec.client_id) returning id into v_conversation_id;
    end if;

    insert into public.ai_messages (conversation_id, role, content)
    values (v_conversation_id, 'assistant', v_message);

    update public.clients set last_proactive_checkin_at = now() where id = rec.client_id;
  end loop;
end;
$$;

-- Nikdy negrantované authenticated/anon — spúšťa len pg_cron ako vlastník joby (postgres), rovnako ako purge_deleted_clients.
revoke execute on function public.send_proactive_ai_checkins() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'send-proactive-ai-checkins-daily') then
    perform cron.unschedule('send-proactive-ai-checkins-daily');
  end if;
end $$;

-- 9:00 ráno (Europe/Bratislava je server bez explicitnej TZ na cron.schedule
-- typicky UTC — presný čas nie je kriticky dôležitý, ide o dennú kadenciu).
select cron.schedule(
  'send-proactive-ai-checkins-daily',
  '0 9 * * *',
  $$select public.send_proactive_ai_checkins();$$
);

-- ---------- 3. Agregované AI Kouč insighty pre trénera (bez obsahu) ----------
-- `topic` sa nastavuje len na user správach pri odoslaní (lib/ai/topicClassify.ts),
-- z pevného zoznamu kategórií (napr. "koleno", "spánok") — nikdy voľný text ani
-- časť správy. ai_messages_select (0017) ostáva nezmenené: tréner naďalej NEMÁ
-- SELECT prístup k tejto tabuľke, ani k `topic` stĺpcu — jediná cesta k číslam
-- je nižšia SECURITY DEFINER funkcia, ktorá vracia výhradne (téma, počet klientov)
-- a nikdy menej než 3 rôznych klientov naraz (k-anonymita — pri 1-2 klientoch by
-- agregát fakticky odhalil, kto sa pýtal).
alter table public.ai_messages add column if not exists topic text;

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
    and m.created_at >= now() - (p_days || ' days')::interval
  group by m.topic
  having count(distinct c.id) >= 3
  order by client_count desc;
$$;

revoke execute on function public.get_ai_topic_insights(integer) from public, anon;
grant execute on function public.get_ai_topic_insights(integer) to authenticated;
