-- FitPilot — odmeny pre klientov so značkou trénera (gamifikácia v2, dodatok). Idempotentné; predpokladá 0084.
--
--  1. gamification_settings.celebration_style — zvolený štýl osláv (konfety / hviezdy / ohňostroj),
--  2. gamification_settings.leaderboard_title — zvolený titul vedľa prezývky v rebríčku (číslo úrovne 10–20),
--  3. avatar_frame — povolené hodnoty rozšírené o animované rámiky „glow“ (Žiara) a „flame“ (Plameň).
-- Kód funguje aj pred spustením tejto migrácie (nové voľby sa len nedajú uložiť; predvolené: konfety, bez titulu).

alter table public.gamification_settings
  add column if not exists celebration_style text check (celebration_style is null or celebration_style in ('confetti', 'stars', 'fireworks')),
  add column if not exists leaderboard_title smallint check (leaderboard_title is null or leaderboard_title between 10 and 20);

-- pôvodný inline CHECK z 0084 má automatický názov; nahradí sa rozšíreným
alter table public.gamification_settings drop constraint if exists gamification_settings_avatar_frame_check;
alter table public.gamification_settings drop constraint if exists gamification_settings_avatar_frame_v2_check;
alter table public.gamification_settings
  add constraint gamification_settings_avatar_frame_v2_check
  check (avatar_frame is null or avatar_frame in ('none', 'ember', 'glow', 'mint', 'steel', 'gold', 'aurora', 'prism', 'flame', 'olympus'));
