-- FitPilot — feature/optimalizacia: chýbajúce indexy na trainer_id.
--
-- Audit FK stĺpcov naprieč všetkými migráciami (porovnané s create index
-- príkazmi aj unique/primary key constraintmi, ktoré tiež vytvárajú index)
-- ukázal presne 3 stĺpce, na ktoré sa priamo filtruje v RLS politike
-- (`trainer_id = auth.uid()`), no nemajú vlastný index — bez neho Postgres
-- pri raste tabuľky prejde na sekvenčné skenovanie namiesto indexového:
--
--   body_metrics.trainer_id           — "body_metrics_all_own_trainer" (0023):
--     `using (trainer_id = auth.uid())`, priamy filter bez joinu. Zasiahnuté:
--     trénerova analytika naprieč celým portfóliom klientov.
--   coach_notes.trainer_id            — RLS (0003/0036): `auth.uid() = trainer_id
--     and exists(...)`. Existujúci index je len na (client_id, created_at) —
--     nepomôže dotazu, ktorý filtruje podľa trainer_id naprieč klientmi.
--   trainer_private_notes.trainer_id  — RLS (0036): rovnaký vzor, PK je
--     (client_id, scope), trainer_id nemá vlastný index.
--
-- Ostatné FK stĺpce v schéme (client_id na ai_conversations/nutrition_profiles,
-- trainer_id na notification_dismissals/client_health_snapshots/...) MAJÚ
-- pokrytie cez unique/primary key constraint alebo explicitný index — overené
-- ručne v každej migrácii, nie sú tu duplicitne pridané.
--
-- Spustiť v Supabase Dashboard → SQL Editor → New query → vložiť celý súbor → Run.
-- Idempotentné (CONCURRENTLY nejde v transakcii/migration runneri, preto obyčajný
-- CREATE INDEX IF NOT EXISTS — na existujúcich riadkoch v produkcii ide o krátky
-- lock, tabuľky sú v tomto štádiu appky rádovo tisíce riadkov, nie milióny).

create index if not exists body_metrics_trainer_idx
  on public.body_metrics (trainer_id);

create index if not exists coach_notes_trainer_idx
  on public.coach_notes (trainer_id);

create index if not exists trainer_private_notes_trainer_idx
  on public.trainer_private_notes (trainer_id);
