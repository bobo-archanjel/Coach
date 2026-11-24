-- FitPilot — 0085: výkon (audit docs/audit/performance.md). Len INDEXY, žiadna zmena dát ani práv.
-- Idempotentné (`create index if not exists`) — bezpečné spustiť opakovane.
-- Spustiť v Supabase Dashboard → SQL Editor → New query → vložiť celý súbor → Run.
-- (CONCURRENTLY nejde v transakcii SQL editora; tabuľky sú rádovo tisíce až desaťtisíce riadkov, lock je krátky.)

-- 1) workout_logs.workout_day_id — jediný FK stĺpec tabuľky bez vlastného indexu.
--    Existujúce indexy majú `workout_day_id` až ako 2. stĺpec (unique client_id, workout_day_id, performed_on),
--    takže dopyt „logy tohto dňa“ ho nepoužije. Takto sa dnes číta:
--      • embed `workout_days(... workout_logs(count))` — odcvičenosť plánov (isPlanLocked, zoznam klientov, builder),
--      • `.in("workout_day_id", [...])` v detaile klienta (okno odcvičeného dňa) a v getPlanCompletion,
--      • FK `on delete set null`: zmazanie dňa/plánu (aj každé uloženie rozpracovanej úpravy plánu, 0071)
--        musí nájsť logy daného dňa — bez indexu sekvenčný sken celej tabuľky logov pre KAŽDÝ zmazaný deň.
--    Rastie s každým tréningom každého klienta, preto je to prvý index, ktorý začne bolieť.
create index if not exists workout_logs_day_idx
  on public.workout_logs (workout_day_id, performed_on desc)
  where workout_day_id is not null;

-- 2) workout_days.source_day_id — FK `on delete set null` (0071). Pri zmazaní dňa pôvodného plánu
--    (publikovanie úpravy, zmazanie plánu) Postgres hľadá kópie, ktoré naň ukazujú; bez indexu je to sekvenčný sken
--    všetkých dní. Čiastočný index (iba riadky kópií) je drobný.
create index if not exists workout_days_source_day_idx
  on public.workout_days (source_day_id)
  where source_day_id is not null;

-- 3) clients.active_plan_id / active_day_id — FK `on delete set null` (0010, 0022). Pri zmazaní plánu / dňa
--    Postgres hľadá klientov, ktorí ho majú ako aktívny. Čiastočné indexy (väčšina klientov má NULL) sú malé.
create index if not exists clients_active_plan_idx
  on public.clients (active_plan_id)
  where active_plan_id is not null;
create index if not exists clients_active_day_idx
  on public.clients (active_day_id)
  where active_day_id is not null;

-- 4) food_logs.food_id — FK `on delete set null` (0007). Zmazanie vlastnej potraviny trénera / klienta
--    inak prejde celú tabuľku zápisov jedla (najrýchlejšie rastúca tabuľka v appke).
create index if not exists food_logs_food_idx
  on public.food_logs (food_id)
  where food_id is not null;
