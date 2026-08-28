import Link from "next/link";
import { getPortalData } from "@/lib/portal/data";
import type { PortalData, PortalResult } from "@/lib/portal/types";
import { ProfileIcon, TrainingIcon } from "./icons";
import { AlertIcon, Notice } from "./Notice";
import { RetryButton } from "./RetryButton";
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

const FULL_WEEKDAY: Record<string, string> = {
  Po: "pondelok",
  Ut: "utorok",
  St: "streda",
  Št: "štvrtok",
  Pi: "piatok",
  So: "sobota",
  Ne: "nedeľa",
};

const ArrowIcon = () => (
  <svg className={styles.startArrow} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M5 12h13M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
    <path d="M5 12.5l4.5 4.5L19 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const MARK_CLASS: Record<string, string> = {
  done: styles.markDone,
  today: styles.markToday,
  upcoming: styles.markUpcoming,
  missed: styles.markMissed,
  rest: styles.markRest,
};

const PLATE_CLASS: Record<string, string> = {
  done: styles.plateOn,
  missed: styles.plateMissed,
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
    exercises: [
      { idx: "1", name: "Drep s veľkou činkou", scheme: "4 × 6", load: "90 kg", rest: "150 s", tempo: "3-0-1" },
      { idx: "2", name: "Rumunský mŕtvy ťah", scheme: "3 × 8", load: "100 kg", rest: "2 min" },
      { idx: "3", name: "Predkopávanie na stroji", scheme: "3 × 12", load: "45 kg", rest: "75 s" },
      { idx: "4", name: "Zakopávanie v ľahu", scheme: "3 × 12", load: "35 kg", rest: "75 s" },
      { idx: "5", name: "Výpony na lýtka v stoji", scheme: "4 × 15", load: "60 kg", rest: "60 s" },
      { idx: "6", name: "Plank s výdržou", scheme: "3 × 45 s", load: "vlastná váha", rest: "45 s" },
    ],
  },
  week: [
    { label: "Po", dayNum: 24, state: "done", plan: "Deň A" },
    { label: "Ut", dayNum: 25, state: "rest", plan: "Voľno" },
    { label: "St", dayNum: 26, state: "done", plan: "Deň B" },
    { label: "Št", dayNum: 27, state: "missed", plan: "Deň A" },
    { label: "Pi", dayNum: 28, state: "today", plan: "Deň C" },
    { label: "So", dayNum: 29, state: "upcoming", plan: "Deň A" },
    { label: "Ne", dayNum: 30, state: "rest", plan: "Voľno" },
  ],
  streakDays: 12,
  streakHistory: ["rest", "done", "rest", "done", "rest", "rest", "done", "missed", "done", "rest", "done", "rest"],
};

/** DEV: ?preview=unlinked|no_plan|error|ok vynúti prázdny/chybový stav bez DB. */
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

function PortalToday({ data }: { data: PortalData }) {
  const { clientFirstName, today, hour, coachNote, session, week, streakDays, streakHistory } = data;

  const d = new Date(`${today}T12:00:00Z`);
  const dateLabel = cap(
    d.toLocaleDateString("sk-SK", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }),
  );
  const total = session.exercises.length;

  const nextDay = week.find((w) => w.state === "upcoming");

  return (
    <>
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

      {/* 2 · práca */}
      <section className={styles.session} aria-label="Dnešný tréning">
        {session.kind === "rest" ? (
          <div className={styles.sessionQuiet}>
            <h2 className={styles.sessionTitle}>Dnes máš voľno</h2>
            <p>
              Žiadny naplánovaný tréning. Doprej telu regeneráciu — ľahká prechádzka alebo strečing
              podľa chuti. Ďalší blok: {nextDay?.plan ?? "čoskoro"}.
            </p>
          </div>
        ) : (
          <>
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
                <CheckIcon /> Tréning hotový — dobrá práca
              </p>
            )}

            <ol className={styles.exList}>
              {session.exercises.map((ex, i) => (
                <li key={`${ex.idx}-${i}`} className={styles.exRow}>
                  <span className={styles.exIdx}>{ex.idx}</span>
                  <span className={styles.exBody}>
                    <span className={styles.exName}>{ex.name}</span>
                    <span className={styles.exMeta}>
                      {[ex.scheme, ex.rest && `pauza ${ex.rest}`, ex.tempo && `tempo ${ex.tempo}`]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  {ex.load && <span className={styles.exLoad}>{ex.load}</span>}
                </li>
              ))}
            </ol>

            {session.kind === "training" && (
              <Link href="/portal/trening" className={`btn btn-primary ${styles.startBtn}`}>
                Začať tréning
                <ArrowIcon />
              </Link>
            )}
          </>
        )}
      </section>

      {/* 3 · dozvuk */}
      <section className={styles.after} aria-label="Prehľad">
        <div className={styles.panel}>
          <p className={styles.panelLabel}>Séria</p>
          <div className={styles.streakHead}>
            <span className={styles.streakNum}>{streakDays}</span>
            <span className={styles.streakUnit}>
              {streakDays === 1 ? "deň podľa plánu" : streakDays >= 2 && streakDays <= 4 ? "dni podľa plánu" : "dní podľa plánu"}
            </span>
          </div>
          <div className={styles.streakPlates} aria-hidden="true">
            {streakHistory.map((state, i) => (
              <span key={i} className={`${styles.plate} ${PLATE_CLASS[state] ?? ""}`} />
            ))}
          </div>
        </div>

        <div className={styles.panel}>
          <p className={styles.panelLabel}>Tento týždeň</p>
          <div className={styles.week}>
            {week.map((day) => (
              <div
                key={day.label}
                className={`${styles.weekCell} ${day.state === "today" ? styles.weekCellToday : ""}`}
                aria-current={day.state === "today" ? "date" : undefined}
              >
                <span className={styles.weekDay}>{day.label}</span>
                <span className={styles.weekMark}>
                  <span className={day.state === "rest" ? MARK_CLASS.rest : `${styles.weekDot} ${MARK_CLASS[day.state]}`} />
                </span>
                <span className={styles.weekNum}>{day.dayNum}</span>
                <span className={styles.weekPlan}>{day.plan}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {nextDay && (
        <p className={styles.nextUp}>
          Ďalší tréning · <span>{FULL_WEEKDAY[nextDay.label] ?? nextDay.label}</span> — {nextDay.plan}
        </p>
      )}
    </>
  );
}
