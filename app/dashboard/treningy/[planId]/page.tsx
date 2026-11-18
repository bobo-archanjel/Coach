import { SwipeBack } from "@/app/components/SwipeBack";
import { getTranslations } from "next-intl/server";
import { AppLink as Link } from "../../../components/AppLink";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { tryCreateAdminClient } from "@/lib/supabase/admin";
import { PlanBuilder, type DoneDay } from "./PlanBuilder";
import { PlanRecipients } from "@/app/dashboard/PlanRecipients";
import { listPlanRecipients } from "@/lib/planRecipients";
import { PublishActions, PublishBadge } from "./PublishControl";
import { PlanTitle } from "./PlanTitle";
import { PlanFooterActions } from "./PlanFooterActions";
import type { WorkoutExerciseEntry } from "../actions";
import type { ExerciseLibraryRow } from "@/lib/exercises";
import { compareLog } from "@/lib/workouts/completed";
import { getPlanCompletion } from "@/lib/dashboard/planCompletion";
import { getTrainerExerciseLibrary } from "@/lib/exerciseLibrary";
import { InfoTip } from "@/app/components/InfoTip";
import styles from "@/app/dashboard/dashboard.module.css";

// i18n-ignore-start — DEV náhľad (vymyslené dáta)
// DEV náhľad buildera bez session (?preview=builder) — viac dní s rôzne dlhými
// názvami (test lámania piluliek) + deň so 6 cvikmi (test šípok poradia na kraji).
function previewEntry(i: number, name: string): WorkoutExerciseEntry {
  // Rozpažky + Francúzsky tlak (deň 1, cviky 3 a 4) = superséria A
  const superset = i === 2 || i === 3 ? "sspreview" : null;
  return { entry_id: `p${i}`, exercise_id: `x${i}`, exercise_name: name, sets: 3, reps: "8-10", load_kg: i % 2 ? 40 : null, tempo: null, rest_seconds: 90, superset };
}
const PREVIEW_DAYS = [
  { id: "d1", day_number: 1, name: "Deň 1 — Tlak (hrudník, ramená, triceps)", exercises: ["Bench press", "Tlaky nad hlavu", "Rozpažky s jednoručkami", "Francúzsky tlak", "Tlak na hrudník na stroji", "Kliky"].map((n, i) => previewEntry(i, n)) },
  { id: "d2", day_number: 2, name: "Deň 2 — Nohy a spodný chrbát", exercises: ["Drep s veľkou činkou", "Rumunský mŕtvy ťah", "Výpady"].map((n, i) => previewEntry(i + 10, n)) },
  { id: "d3", day_number: 3, name: "Deň 3 — Ťah (chrbát, biceps, zadné delty)", exercises: ["Zhyby", "Veslovanie v predklone", "Bicepsový zdvih"].map((n, i) => previewEntry(i + 20, n)) },
  { id: "d4", day_number: 4, name: "Deň 4 — Horná časť tela (silový mix) a core", exercises: ["Plank", "Mŕtvy ťah"].map((n, i) => previewEntry(i + 30, n)) },
];

// deň 3 odcvičený (iné testy buildera upravujú dni 1 a 2): zhyby podľa plánu aj menej,
// veslovanie bez 3. série, bicepsový zdvih nezapísaný
const PREVIEW_DONE_DAYS: Record<string, DoneDay> = {
  d3: {
    logId: "preview-log",
    completedAt: "2026-11-16T17:30:00Z",
    rpe: 8,
    note: "Zhyby v poslednej sérii už s gumou.",
    editedAt: "2026-11-16T20:05:00Z",
    compare: compareLog({ exercises: PREVIEW_DAYS[2].exercises }, [
      { entryId: "p20", name: "Zhyby", sets: [{ reps: 10, weight: null }, { reps: 8, weight: null }, { reps: 7, weight: null }] },
      { entryId: "p21", name: "Veslovanie v predklone", sets: [{ reps: 9, weight: 40 }, { reps: 8, weight: 42.5 }] },
    ]),
  },
};

// ?preview=builder_done — celý plán odcvičený (uzamknutý): každý deň s výsledkom
const PREVIEW_ALL_DONE: Record<string, DoneDay> = Object.fromEntries(
  PREVIEW_DAYS.map((d, i) => [
    d.id,
    PREVIEW_DONE_DAYS[d.id] ?? {
      logId: `preview-log-${d.id}`,
      completedAt: `2026-11-${String(10 + i * 2).padStart(2, "0")}T17:30:00Z`,
      rpe: 7,
      note: null,
      editedAt: null,
      compare: compareLog(
        { exercises: d.exercises },
        d.exercises.map((e) => ({ entryId: e.entry_id, name: e.exercise_name, sets: [{ reps: 10, weight: e.load_kg }, { reps: 9, weight: e.load_kg }, { reps: 8, weight: e.load_kg }] })),
      ),
    },
  ]),
);

const PREVIEW_LIBRARY = [
  { id: "lib1", name: "Barbell Hip Thrust", name_sk: "Hip thrust s činkou", muscle_group: "zadok", image_url: [], equipment: "barbell" },
  { id: "lib2", name: "Farmer's Walk", name_sk: "Farmárska chôdza", muscle_group: "predlaktia", image_url: [], equipment: "dumbbell" },
];
// i18n-ignore-end

export default async function PlanDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ planId: string }>;
  searchParams: Promise<{ preview?: string }>;
}) {
  const { planId } = await params;
  const { preview } = await searchParams;

  // ?preview=builder_empty — nový plán bez dní (hláška pri kliku na cvik bez dňa).
  // ?preview=builder_live — publikovaný plán (dole "Zmazať" vedľa PDF).
  // ?preview=builder_done — klient plán celý odcvičil (uzamknutý, len prehľad dní).
  // i18n-ignore-start — DEV náhľad
  if (
    (preview === "builder" || preview === "builder_empty" || preview === "builder_live" || preview === "builder_done") &&
    process.env.NODE_ENV === "development"
  ) {
    const livePreview = preview === "builder_live" || preview === "builder_done";
    const donePreview = preview === "builder_done";

    // Knižnica cvikov v náhľade bola predtým prázdna (`library: []`) — appka
    // nemá anonymný prístup k `exercises` (migrácia 0036 zrušila anon grant),
    // takže bez session by dopyt cez bežný klient vrátil nič. Globálne cviky
    // (trainer_id null) sú ale verejné dáta bez PII, takže na tento JEDEN
    // dev-only náhľad (marketingové screenshoty/nahrávky s reálnymi obrázkami
    // cvikov) čítame service-role klientom — nikdy v mene konkrétneho
    // používateľa, len globálnu knižnicu, a len za NODE_ENV=development.
    let previewLibrary: ExerciseLibraryRow[] = PREVIEW_LIBRARY;
    const admin = tryCreateAdminClient();
    if (admin) {
      const { data } = await admin
        .from("exercises")
        .select("id, name, name_sk, muscle_group, image_url, equipment")
        .is("trainer_id", null)
        .not("image_url", "eq", "{}")
        .order("name")
        .limit(40);
      if (data && data.length > 0) previewLibrary = data as ExerciseLibraryRow[];
    }
    return (
      <SwipeBack href="/dashboard/treningy" className={styles.planPage}>
        <div className={styles.detailHead}>
          <div className={styles.detailTitle}>
            {donePreview ? <h1>AI plán — hypertrofia</h1> : <PlanTitle planId={planId} name="AI plán — hypertrofia" />}
            <div className={styles.clientGoal}>Ján Novák</div>
          </div>
          {donePreview ? <span className={styles.planDoneBadge}>Hotovo</span> : <PublishBadge published={livePreview} />}
        </div>
        {!donePreview && (
          <div className={styles.planActions} data-tour="plan-publish">
            <PublishActions planId={planId} published={livePreview} />
          </div>
        )}
        <PlanBuilder
          planId={planId}
          days={preview === "builder_empty" ? [] : PREVIEW_DAYS}
          library={previewLibrary}
          doneDays={donePreview ? PREVIEW_ALL_DONE : PREVIEW_DONE_DAYS}
          locked={donePreview}
        />
        <div className={styles.planFooterActions} data-tour="plan-footer">
          <PlanFooterActions planId={planId} planName="AI plán — hypertrofia" published={livePreview} hasCompleted canDelete={!donePreview} />
        </div>
      </SwipeBack>
    );
  }
  // i18n-ignore-end

  const supabase = await createClient();

  // `plan`, `days` aj `exercises` berú `planId`/nič z route parametra — nezávislé,
  // paralelne namiesto čakania na `plan` pred spustením zvyšných dvoch.
  const [{ data: plan }, { days, locked }, exercises, { data: completedLogs }] = await Promise.all([
    supabase
      .from("workout_plans")
      // Explicitná FK: odkedy má `clients` aj `active_plan_id → workout_plans`
      // (0010_client_own_workouts.sql), je vzťah workout_plans↔clients nejednoznačný
      // a plain `clients(...)` embed padá na PGRST201 (a maybeSingle() to potichu
      // zmení na "nenájdené" — celá stránka detailu plánu bola nedostupná).
      .select("id, name, client_id, published, clients!workout_plans_client_id_fkey(full_name)")
      .eq("id", planId)
      .maybeSingle(),
    // Plán celý odcvičený klientom (badge "Hotovo", rovnaká definícia ako zoznam
    // Tréningy) = uzamknutý: builder len na čítanie (každý deň plán vs. skutočnosť),
    // PDF a šablóna. Serverové akcie úprav to isté vynucujú cez isPlanLocked.
    supabase
      .from("workout_days")
      .select("id, day_number, name, exercises")
      .eq("plan_id", planId)
      .order("day_number")
      .then(async ({ data: days }) => {
        const completion = await getPlanCompletion(supabase, [{ id: planId, dayIds: (days ?? []).map((d) => d.id) }]);
        return { days, locked: completion.get(planId)?.allDone ?? false };
      }),
    // Globálna knižnica z cache (lib/exerciseLibrary) + vlastné cviky trénera — predtým
    // ~886 riadkov priamo z DB pri každom renderi aj po každej úprave plánu.
    getTrainerExerciseLibrary(supabase),
    // Odcvičené tréningy z tohto plánu (snapshot 0048) — v builderi pri svojom dni
    // (plan vs. skutočnosť, RPE, poznámka). Plán má max. 14 dní, každý sa odcvičí raz.
    supabase
      .from("workout_logs")
      .select("id, workout_day_id, completed_at, performed_on, plan_snapshot, entries, rpe, note, edited_at")
      .eq("plan_snapshot->>plan_id", planId)
      .eq("status", "completed")
      .order("completed_at", { ascending: false })
      .limit(50),
  ]);

  if (!plan) {
    notFound();
  }

  const clientName = (plan.clients as unknown as { full_name: string } | null)?.full_name ?? "?";
  // Odcvičené dni (posledný záznam dňa; logy sú od najnovšieho) — v builderi zamknuté,
  // namiesto úprav plán vs. skutočnosť. Server to vynúti cez getDayForEdit (dayDone).
  // Tréning zo zmazaného dňa sa tu neukáže — ostáva v detaile klienta (Posledná aktivita).
  const doneDays: Record<string, DoneDay> = {};
  for (const log of completedLogs ?? []) {
    const dayId = log.workout_day_id as string | null;
    if (!dayId || doneDays[dayId]) continue;
    doneDays[dayId] = {
      logId: log.id as string,
      completedAt: (log.completed_at as string | null) ?? `${log.performed_on}T12:00:00Z`,
      compare: compareLog(log.plan_snapshot, log.entries),
      rpe: (log.rpe as number | null) ?? null,
      note: (log.note as string | null) ?? null,
      editedAt: (log.edited_at as string | null) ?? null,
    };
  }
  // šablóna použitá pre viacerých klientov (0052) — pri odoslaní dostanú plán aj títo
  const recipients = await listPlanRecipients(supabase, "workout", planId);
  const t = await getTranslations("plans.builder");

  return (
    // Späť na zoznam tréningov: na mobile potiahnutím zľava doprava (SwipeBack), na počítači bočné menu.
    <SwipeBack href="/dashboard/treningy" className={styles.planPage}>

      <div className={styles.detailHead}>
        <div className={styles.detailTitle}>
          {locked ? <h1>{plan.name}</h1> : <PlanTitle planId={planId} name={plan.name} />}
          <div className={styles.clientGoal}>
            <Link href={`/dashboard/klienti/${plan.client_id}`}>{clientName}</Link>
          </div>
          <PlanRecipients kind="workout" planId={planId} published={plan.published} recipients={recipients} />
        </div>
        {/* Vysvetlenie stavu plánu na požiadanie (otáznik vedľa odznaku), nie odsek pod hlavičkou. */}
        <div className={styles.detailHeadStatus}>
          {locked ? <span className={styles.planDoneBadge}>{t("doneBadge")}</span> : <PublishBadge published={plan.published} />}
          {locked ? (
            <InfoTip title={t("lockedTitle")}>{t("lockedText")}</InfoTip>
          ) : (
            completedLogs &&
            completedLogs.length > 0 && (
              <InfoTip title={t("editsTitle")}>{t("editsText")}</InfoTip>
            )
          )}
        </div>
      </div>

      {/* Publikovanie hore; „Uložiť ako šablónu“ je dole vedľa „Stiahnuť PDF“ (PlanFooterActions).
          Hotový plán publikovanie nemá. */}
      {!locked && (
        <div className={styles.planActions} data-tour="plan-publish">
          <PublishActions planId={planId} published={plan.published} recipientCount={recipients.length} />
        </div>
      )}

      {/* Hotový plán: rovnaký prehľad ako rozpracovaný — dráha dní, pri každom dni dátum
          a plán vs. skutočnosť; nič sa nedá upraviť ani pridať. */}
      <PlanBuilder planId={planId} days={days ?? []} library={exercises} doneDays={doneDays} locked={locked} />

      {/* Menej časté akcie na spodku (prehľadnejší vrch stránky, hlavne na mobile). */}
      <div className={styles.planFooterActions} data-tour="plan-footer">
        {/* Hotový plán sa nemaže — ostáva ako záznam (PDF + šablóna, bez „Zmazať“). */}
        <PlanFooterActions
          planId={planId}
          planName={plan.name}
          published={plan.published}
          hasCompleted={(completedLogs?.length ?? 0) > 0}
          canDelete={!locked}
        />
      </div>
    </SwipeBack>
  );
}
