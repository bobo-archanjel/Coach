-- FitPilot — klient smie opraviť hodnoty dokončeného tréningu 24 h po ukončení.
-- Spustiť v Supabase Dashboard → SQL Editor → New query → vložiť celý súbor → Run.
-- Predpokladá 0048_workout_log_completion.sql. Idempotentné.
--
-- 0048 zamkla dokončený záznam hneď po "Ukončiť tréning". V praxi klient zabudne
-- zapísať sériu alebo sa preklepne a nemal to ako opraviť. Nové pravidlo:
--   * do 24 h od completed_at smie klient meniť LEN hodnoty (entries, rpe, note),
--   * každá taká oprava nastaví edited_at (tréner v detaile vidí "Upravené klientom"),
--   * plán (plan_snapshot), stav, dátumy, väzby ani mazanie sa nemenia nikdy,
--   * po 24 h je záznam zamknutý ako doteraz (pre každého, aj service role).

alter table public.workout_logs
  add column if not exists edited_at timestamptz;

-- ============================================================
--  trigger: zámok dokončeného záznamu + okno na opravu hodnôt
-- ============================================================
create or replace function public.workout_log_guard_completed()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status is distinct from 'completed' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'DELETE' then
    -- kaskáda zo zmazania klienta (0018, GDPR) — nie priamy príkaz používateľa
    if pg_trigger_depth() > 1 then
      return old;
    end if;
  elsif new.workout_day_id is null
    and old.workout_day_id is not null
    and (to_jsonb(new) - 'workout_day_id') = (to_jsonb(old) - 'workout_day_id') then
    -- zmazanie dňa/plánu → FK on delete set null
    return new;
  elsif old.completed_at is not null
    and now() <= old.completed_at + interval '24 hours'
    and (to_jsonb(new) - array['entries', 'rpe', 'note', 'edited_at'])
      = (to_jsonb(old) - array['entries', 'rpe', 'note', 'edited_at']) then
    -- oprava hodnôt v 24 h okne; edited_at nastaví DB, nie klient
    new.edited_at := now();
    return new;
  end if;

  raise exception 'locked: Hodnoty dokončeného tréningu sa dajú upraviť len 24 hodín po jeho ukončení.'
    using errcode = '42501';
end;
$$;

revoke execute on function public.workout_log_guard_completed() from public, anon, authenticated;

-- ============================================================
--  RLS — klient smie UPDATE aj dokončeného záznamu, kým je v okne
-- ============================================================
-- (zúženie na povolené stĺpce drží trigger vyššie; RLS len vpustí správne riadky)
drop policy if exists "workout_logs_update_own_client" on public.workout_logs;

create policy "workout_logs_update_own_client"
  on public.workout_logs for update
  using (
    (
      workout_logs.status <> 'completed'
      or workout_logs.completed_at > now() - interval '24 hours'
    )
    and exists (
      select 1 from public.clients c
      where c.id = workout_logs.client_id and c.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.clients c
      where c.id = workout_logs.client_id and c.user_id = auth.uid()
    )
  );
