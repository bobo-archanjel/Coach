-- FitPilot — denník jedla: klient si môže upraviť gramáž zapísanej položky
-- (QA 2026-09-23: dalo sa len zmazať a pridať znova). 0007 zámerne nemala UPDATE
-- policy, "lebo appka záznam nemení" a UPDATE bez with-check by dovolil prepísať
-- client_id na cudzí — preto using AJ with check, oboje na vlastného klienta.
-- Stĺpce zapisovaného riadku sú kvalifikované (`food_logs.`) — nekvalifikovaný
-- názov v poddotaze `from clients c` by sa naviazal na stĺpec clients (viď 0043).
-- Appka (updateFoodLogAction) mení len grams a meal_slot.
-- Spustiť v Supabase Dashboard → SQL Editor → New query → vložiť celý súbor → Run.
-- Predpokladá 0001–0044. Idempotentné.

drop policy if exists "food_logs_update_own_client" on public.food_logs;
create policy "food_logs_update_own_client"
  on public.food_logs for update
  using (exists (select 1 from public.clients c where c.id = food_logs.client_id and c.user_id = auth.uid()))
  with check (exists (select 1 from public.clients c where c.id = food_logs.client_id and c.user_id = auth.uid()));
