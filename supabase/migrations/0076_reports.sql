-- Pokročilé reporty (feature/Stripe, tarify Pro a Business).
--
-- Reporty čítajú len existujúce tabuľky pod existujúcou RLS (workout_logs, food_logs, body_metrics,
-- nutrition_profiles, clients) — žiadne nové tabuľky, funkcie ani zmeny politík. Agregácie robí
-- aplikácia nad ohraničenými dátumovými rozsahmi (lib/reports/loaders.ts, stránkovanie po 1000),
-- takže prístup sa dá vynútiť na jednom mieste (requireReports + RLS) bez SECURITY DEFINER kódu.
--
-- Migrácia pridáva len indexy pre dopyty reportov. Idempotentná.

-- tréningy klienta v dátumovom rozsahu a „posledný tréning“ (embed s limitom, rebríček portfólia):
-- doteraz bol len index na client_id a unikátny (client_id, workout_day_id, performed_on),
-- ktorý filter/radenie podľa performed_on bez workout_day_id nevie využiť
create index if not exists workout_logs_client_performed_idx
  on public.workout_logs (client_id, performed_on desc);

-- nové/ukončené spolupráce a zoznam klientov trénera podľa mesiacov (portfólio)
create index if not exists clients_trainer_paired_idx
  on public.clients (trainer_id, paired_at);

-- food_logs (client_id, eaten_on desc) a body_metrics (client_id, measured_on) už existujú (0007, 0023).
