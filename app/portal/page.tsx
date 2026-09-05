import Link from "next/link";
import { getPortalData } from "@/lib/portal/data";
import type { PortalData, PortalResult } from "@/lib/portal/types";
import { DoneWorkoutView } from "./DoneWorkoutView";
import { ProfileIcon, TrainingIcon } from "./icons";
import { LogWorkoutButton } from "./LogWorkoutButton";
import { AlertIcon, Notice } from "./Notice";
import { CooperationNotice } from "./CooperationNotice";
import { RetryButton } from "./RetryButton";
import { WorkoutStopwatch } from "./WorkoutStopwatch";
import { WeekHistory } from "./WeekHistory";
import { BodyMetricForm } from "./BodyMetricForm";
import styles from "./portal.module.css";

/* /portal — domovská obrazovka "Dnes".
   Kompozícia "Oblúk tréningového dňa" (seed 7c5000e8): príprava → práca → dozvuk.
   Reálne dáta z Supabase (lib/portal/data.ts, migrácia 0002_workout_portal.sql);
   auth guard v layout.tsx.
   THESIS: home je priebeh tréningového dňa čítaný zhora nadol, nie mriežka dlaždíc.
   SIGNATURE: prstenec postupu sa pri načítaní vykreslí z 0 na aktuálnu hodnotu. */

const RING_R = 40;
const RING_CIRC = 2 * Math.PI * RING_R;

function greeting(name: string, hour: number): string {
  const part = hour < 10 ? "Dobré ráno" : hour < 18 ? "Dobrý deň" : "Dobrý večer";
  return name ? `${part}, ${name}` : part;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** 1 tréning, 2-4 tréningy, 5+ tréningov (slovenská plurálna zhoda). */
function sessionUnit(n: number): string {
  if (n === 1) return "tréning";
  if (n >= 2 && n <= 4) return "tréningy";
  return "tréningov";
}

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
    <path d="M5 12.5l4.5 4.5L19 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const PLATE_CLASS: Record<string, string> = {
  done: styles.plateOn,
  rest: styles.plateRest,
};

function ProgressRing({ done, total }: { done: number; total: number }) {
  const fraction = total > 0 ? done / total : 0;
  const offset = RING_CIRC * (1 - fraction);
  return (
    <svg className={styles.ring} viewBox="0 0 92 92" style={{ ["--ring-circ" as string]: `${RING_CIRC}` }} aria-hidden="true">
      <circle className={styles.ringTrack} cx="46" cy="46" r={RING_R} strokeDasharray={RING_CIRC} />
      <circle className={styles.ringStart} cx="46" cy={46 - RING_R} r="4" />
      <circle
        className={styles.ringValue}
        cx="46"
        cy="46"
        r={RING_R}
        strokeDasharray={RING_CIRC}
        strokeDashoffset={offset}
      />
      <text className={styles.ringCenter} x="46" y="44" textAnchor="middle" dominantBaseline="middle">
        {done}/{total}
      </text>
      <text className={styles.ringCenterSub} x="46" y="58" textAnchor="middle" dominantBaseline="middle">
        CVIKOV
      </text>
    </svg>
  );
}

const PREVIEW_DATA: PortalData = {
  clientFirstName: "Ján",
  today: "2026-08-28",
  hour: 8,
  coachNote: {
    trainer: "Marek",
    initials: "M",
    text: "Dnes ide o techniku, nie o váhu — pri drepe drž tempo 3 s dole a kontrolu v spodnej polohe. Ak koleno pri RDL tlačí, zníž záťaž o 10 kg a napíš mi.",
  },
  session: {
    kind: "training",
    title: "Deň C — Nohy",
    focus: "Silový 3× týždenne",
    durationLabel: "",
    completedCount: 0,
    dayId: "preview-day-c",
    loggedExercises: null,
    exercises: [
      { idx: "1", name: "Drep s veľkou činkou", scheme: "4 × 6", load: "90 kg", rest: "150 s", tempo: "3-0-1", entryId: "p1", plannedSets: 4, plannedReps: "6", exerciseId: null, loadKg: 90, restSeconds: 150 },
      { idx: "2", name: "Rumunský mŕtvy ťah", scheme: "3 × 8", load: "100 kg", rest: "2 min", entryId: "p2", plannedSets: 3, plannedReps: "8", exerciseId: null, loadKg: 100, restSeconds: 120 },
      { idx: "3", name: "Predkopávanie na stroji", scheme: "3 × 12", load: "45 kg", rest: "75 s", entryId: "p3", plannedSets: 3, plannedReps: "12", exerciseId: null, loadKg: 45, restSeconds: 75 },
      { idx: "4", name: "Zakopávanie v ľahu", scheme: "3 × 12", load: "35 kg", rest: "75 s", entryId: "p4", plannedSets: 3, plannedReps: "12", exerciseId: null, loadKg: 35, restSeconds: 75 },
      { idx: "5", name: "Výpony na lýtka v stoji", scheme: "4 × 15", load: "60 kg", rest: "60 s", entryId: "p5", plannedSets: 4, plannedReps: "15", exerciseId: null, loadKg: 60, restSeconds: 60 },
      { idx: "6", name: "Plank s výdržou", scheme: "3 × 45 s", load: "vlastná váha", rest: "45 s", entryId: "p6", plannedSets: 3, plannedReps: "45 s", exerciseId: null, loadKg: null, restSeconds: 45 },
    ],
  },
  week: {
    mondayIso: "2026-08-24",
    rangeLabel: "24. – 30. aug",
    isCurrentWeek: true,
    days: [
      {
        label: "Po",
        dayNum: 24,
        iso: "2026-08-24",
        state: "done",
        sessions: [
          {
            dayName: "Deň A — Tlak",
            planName: "Silový 3× týždenne",
            exercises: [
              { name: "Tlak na lavičke", sets: [{ reps: 8, weight: 70 }, { reps: 8, weight: 70 }, { reps: 6, weight: 75 }] },
              { name: "Tlak nad hlavu", sets: [{ reps: 10, weight: 35 }, { reps: 9, weight: 35 }, { reps: 8, weight: 35 }] },
              { name: "Bicepsový zdvih", sets: [{ reps: 12, weight: 14 }, { reps: 11, weight: 14 }] },
            ],
          },
        ],
      },
      { label: "Ut", dayNum: 25, iso: "2026-08-25", state: "none", sessions: [] },
      {
        label: "St",
        dayNum: 26,
        iso: "2026-08-26",
        state: "done",
        sessions: [{ dayName: "Deň B — Ťah", planName: "Silový 3× týždenne", exercises: [] }],
      },
      { label: "Št", dayNum: 27, iso: "2026-08-27", state: "none", sessions: [] },
      { label: "Pi", dayNum: 28, iso: "2026-08-28", state: "today", sessions: [] },
      { label: "So", dayNum: 29, iso: "2026-08-29", state: "future", sessions: [] },
      { label: "Ne", dayNum: 30, iso: "2026-08-30", state: "future", sessions: [] },
    ],
  },
  totalSessions: 12,
  streakHistory: ["rest", "done", "rest", "done", "rest", "rest", "done", "rest", "done", "rest", "done", "rest"],
  deletionNotice: null,
  cooperationEndedNotice: null,
  bodyMetrics: [90, 76, 62, 48, 34, 20, 6].map((daysAgo, i) => ({
    measuredOn: new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10),
    weightKg: 88 - i * 1.1,
    waistCm: i === 6 || i === 0 ? 88 - i * 0.5 : null,
    chestCm: i === 6 ? 102 : null,
    hipsCm: i === 6 ? 98 : null,
    armCm: null,
    thighCm: null,
    note: null,
  })),
};

/** DEV: ?preview=unlinked|no_plan|error|ok|done|deletion|deletion_self|ended vynúti prázdny/chybový/hotový stav bez DB. */
function previewResult(kind: string): PortalResult | null {
  if (process.env.NODE_ENV === "production") return null;
  switch (kind) {
    case "unlinked":
      return { state: "unlinked", firstName: "Ján" };
    case "no_plan":
      return { state: "no_plan", firstName: "Ján" };
    case "error":
      return { state: "error" };
    case "ok":
      return { state: "ok", data: PREVIEW_DATA };
    case "done":
      return {
        state: "ok",
        data: {
          ...PREVIEW_DATA,
          session: {
            ...PREVIEW_DATA.session,
            kind: "done",
            completedCount: PREVIEW_DATA.session.exercises.length,
            loggedExercises: [
              { entryId: "p1", name: "Drep s veľkou činkou", sets: [{ reps: 6, weight: 92 }, { reps: 6, weight: 92 }, { reps: 6, weight: 90 }, { reps: 5, weight: 90 }] },
              { entryId: "p2", name: "Rumunský mŕtvy ťah", sets: [{ reps: 8, weight: 100 }, { reps: 8, weight: 100 }, { reps: 7, weight: 100 }] },
            ],
          },
        },
      };
    case "deletion":
      return {
        state: "ok",
        data: {
          ...PREVIEW_DATA,
          deletionNotice: { requestedBy: "trainer", requestedAt: new Date(Date.now() - 5 * 86_400_000).toISOString() },
        },
      };
    case "deletion_self":
      return {
        state: "ok",
        data: {
          ...PREVIEW_DATA,
          deletionNotice: { requestedBy: "client", requestedAt: new Date(Date.now() - 5 * 86_400_000).toISOString() },
        },
      };
    case "ended":
      return {
        state: "ok",
        data: {
          ...PREVIEW_DATA,
          cooperationEndedNotice: { endedAt: new Date(Date.now() - 2 * 86_400_000).toISOString() },
        },
      };
    default:
      return null;
  }
}

export default async function PortalHome({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string }>;
}) {
  const { preview } = await searchParams;
  const result = (preview && previewResult(preview)) || (await getPortalData());

  if (result.state === "error") {
    return (
      <Notice
        icon={<AlertIcon />}
        title="Nepodarilo sa načítať tvoj deň"
        tone="alert"
        action={<RetryButton />}
      >
        Skús to o chvíľu znova. Ak to potrvá, napíš svojmu trénerovi.
      </Notice>
    );
  }

  if (result.state === "unlinked") {
    return (
      <Notice icon={<ProfileIcon />} title={result.firstName ? `Vitaj, ${result.firstName}` : "Vitaj vo FitPilot"}>
        Tvoj účet ešte nie je prepojený s trénerom. Prepojenie spraví tréner zo
        svojej strany — potom sa ti tu zobrazí tvoj plán a dnešný tréning.
      </Notice>
    );
  }

  if (result.state === "no_plan") {
    return (
      <Notice
        icon={<TrainingIcon />}
        title={result.firstName ? `${result.firstName}, plán je na ceste` : "Plán je na ceste"}
      >
        Tréner ti zatiaľ nepriradil aktívny tréningový plán. Hneď ako to spraví,
        nájdeš tu dnešný tréning aj prehľad týždňa.
      </Notice>
    );
  }

  return <PortalToday data={result.data} />;
}

/** Dátum trvalého zmazania (deletion_requested_at + 30 dní grace period, 0018), sk-SK formát. */
function purgeDateLabel(requestedAt: string): string {
  const purgeDate = new Date(new Date(requestedAt).getTime() + 30 * 86_400_000);
  return purgeDate.toLocaleDateString("sk-SK");
}

function PortalToday({ data }: { data: PortalData }) {
  const {
    clientFirstName,
    today,
    hour,
    coachNote,
    session,
    week,
    totalSessions,
    streakHistory,
    deletionNotice,
    cooperationEndedNotice,
    bodyMetrics,
  } = data;

  const d = new Date(`${today}T12:00:00Z`);
  const dateLabel = cap(
    d.toLocaleDateString("sk-SK", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }),
  );
  const total = session.exercises.length;

  return (
    <>
      {deletionNotice && (
        <div className={styles.deletionNotice} role="status">
          <p className={styles.deletionNoticeTitle}>
            {deletionNotice.requestedBy === "trainer" ? "Odstránený/á z portfólia trénera" : "Zmazanie dát prebieha"}
          </p>
          <p className={styles.deletionNoticeText}>
            {deletionNotice.requestedBy === "trainer"
              ? "Tréner ťa odstránil zo svojho portfólia. Tvoje tréningy, výživa, denník aj správy sa natrvalo vymažú"
              : "Požiadal/a si o zmazanie svojich dát — vymažú sa"}{" "}
            {purgeDateLabel(deletionNotice.requestedAt)}, pokiaľ zmazanie nezrušíš.
          </p>
          <Link href="/portal/profil" className={styles.deletionNoticeLink}>
            Spravovať v Profile →
          </Link>
        </div>
      )}

      {!deletionNotice && cooperationEndedNotice && <CooperationNotice />}

      {/* 1 · príprava */}
      <section className={styles.prep} aria-label="Dnešný deň">
        <div>
          <h1 className={styles.greeting}>{greeting(clientFirstName, hour)}</h1>
          <p className={styles.date}>{dateLabel}</p>
        </div>

        {coachNote && (
          <div className={styles.coachNote}>
            <span className={styles.noteTile} aria-hidden="true">
              {coachNote.initials}
            </span>
            <div>
              <p className={styles.noteFrom}>Tréner {coachNote.trainer}</p>
              <p className={styles.noteText}>{coachNote.text}</p>
            </div>
          </div>
        )}
      </section>

      {/* 2 · práca — ďalší tréning v poradí (rotácia, nie pevný rozvrh podľa dňa v týždni) */}
      <section className={styles.session} aria-label="Ďalší tréning">
        <div className={styles.sessionTop}>
          <ProgressRing done={session.completedCount} total={total} />
          <div>
            <h2 className={styles.sessionTitle}>{session.title}</h2>
            {session.focus && <p className={styles.sessionFocus}>{session.focus}</p>}
            <div className={styles.sessionChips}>
              <span className={styles.chip}>{total} cvikov</span>
              {session.durationLabel && <span className={styles.chip}>{session.durationLabel}</span>}
            </div>
          </div>
        </div>

        {session.kind === "done" && (
          <p className={styles.doneMark}>
            <CheckIcon /> Tento tréning máš dnes hotový — vrátiš sa sem kedykoľvek, kým je dnešný deň
          </p>
        )}

        {session.kind === "done" && session.dayId && (
          // Vrátiť sa do tréningu = vidieť (a prípadne opraviť) to, čo si naozaj
          // zapísal (Fáza B), nie znovu ponúkaný plán — inak by "hotovo" a zoznam
          // pod tým vyzerali, akoby ešte len čakal na odcvičenie.
          <DoneWorkoutView dayId={session.dayId} exercises={session.exercises} loggedExercises={session.loggedExercises} />
        )}

        {/* Rozpis cvikov pred začatím sa tu už nezobrazuje (revízia 2026-09) —
            ten istý zoznam (ExercisePreviewList) vidno v sekcii Tréning, karta Dnes
            má zostať prehľad (ring, názov, počet cvikov), nie duplicitný rozpis. */}

        {session.kind === "training" && session.dayId && (
          <LogWorkoutButton dayId={session.dayId} exercises={session.exercises} />
        )}
      </section>

      {/* Plávajúce stopky / časovač pauzy — ikona dole sa objaví po "Začať tréning",
          zmizne po ukončení. Fixne pozicované, miesto v strome je len logické. */}
      {session.dayId && (
        <WorkoutStopwatch dayId={session.dayId} finished={session.kind === "done"} />
      )}

      {/* 3 · dozvuk */}
      <section className={styles.after} aria-label="Prehľad">
        <div className={styles.panel}>
          <p className={styles.panelLabel}>Odcvičené spolu</p>
          <div className={styles.streakHead}>
            <span className={styles.streakNum}>{totalSessions}</span>
            <span className={styles.streakUnit}>{sessionUnit(totalSessions)}</span>
          </div>
          <div className={styles.streakPlates} aria-hidden="true">
            {streakHistory.map((state, i) => (
              <span key={i} className={`${styles.plate} ${PLATE_CLASS[state] ?? ""}`} />
            ))}
          </div>
        </div>

        <div className={styles.panel}>
          <p className={styles.panelLabel}>Meranie</p>
          <BodyMetricForm today={today} history={bodyMetrics} />
        </div>

        <WeekHistory initial={week} />
      </section>
    </>
  );
}
