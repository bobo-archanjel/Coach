-- FitPilot — obrázky a preklad pre globálnu knižnicu cvikov (Free Exercise DB import).
-- Spustiť v Supabase Dashboard → SQL Editor → New query → vložiť celý súbor → Run.
-- Predpokladá migráciu 0002_workout_builder.sql (tabuľka exercises).
--
-- Aditívne stĺpce, žiadny breaking change — existujúce riadky (vlastné cviky
-- trénerov aj základná globálna knižnica) ostávajú bezo zmeny, nové stĺpce sú
-- nullable / s bezpečným defaultom.
--
-- image_url:      externé URL adresy (raw.githubusercontent.com/yuhonas/free-exercise-db),
--                  žiadne kopírovanie do Supabase Storage — šetrí miesto na free tieri.
-- instructions:    kroky cvičenia (jsonb pole textov), zobrazené v detaile cviku.
-- external_id:     id z Free Exercise DB, na idempotentný re-import (upsert podľa neho).
-- name_sk:         slovenský preklad názvu (vyplnený zatiaľ len pre bežné cviky);
--                  ak je null, UI zobrazí pôvodný anglický name.

alter table public.exercises
  add column if not exists image_url text[] not null default '{}',
  add column if not exists instructions jsonb not null default '[]'::jsonb,
  add column if not exists external_id text,
  add column if not exists name_sk text;

create unique index if not exists exercises_external_id_idx
  on public.exercises (external_id)
  where external_id is not null;
