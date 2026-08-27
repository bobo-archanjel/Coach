import Link from "next/link";
import { mockPortal } from "@/lib/mock/portal";
import styles from "./portal.module.css";

/* /portal — domovská obrazovka "Dnes" (Fáza A).
   Kompozícia "Oblúk tréningového dňa" (seed 7c5000e8): príprava → práca → dozvuk.
   Mock dáta (lib/mock/portal.ts), žiadny backend, žiadny auth guard.
   THESIS: home je priebeh tréningového dňa čítaný zhora nadol, nie mriežka dlaždíc.
   SIGNATURE: prstenec postupu sa pri načítaní vykreslí z 0 na aktuálnu hodnotu. */

const RING_R = 40;
const RING_CIRC = 2 * Math.PI * RING_R;

function greeting(name: string, hour: number): string {
  const part = hour < 10 ? "Dobré ráno" : hour < 18 ? "Dobrý deň" : "Dobrý večer";
  return `${part}, ${name}`;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

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
  rest: styles.markRest,
};

function ProgressRing({ done, total }: { done: number; total: number }) {
  const fraction = total > 0 ? done / total : 0;
  const offset = RING_CIRC * (1 - fraction);
  return (
    <svg className={styles.ring} viewBox="0 0 92 92" style={{ ["--ring-circ" as string]: `${RING_CIRC}` }} aria-hidden="true">
      <circle
        className={styles.ringTrack}
        cx="46"
        cy="46"
        r={RING_R}
        strokeDasharray={RING_CIRC}
      />
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

export default function PortalHome() {
  const { clientFirstName, today, hour, coachNote, session, week, streakDays, streakHistory } = mockPortal;

  const d = new Date(today);
  const dateLabel = cap(d.toLocaleDateString("sk-SK", { weekday: "long", day: "numeric", month: "long" }));
  const total = session.exercises.length;

  const nextDay = week.find((w) => w.state === "upcoming");
  const nextLabel = nextDay
    ? new Date(d.getFullYear(), d.getMonth(), nextDay.dayNum).toLocaleDateString("sk-SK", { weekday: "long" })
    : null;

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
              podľa chuti. Zajtra ťa čaká {week.find((w) => w.state === "upcoming")?.plan ?? "ďalší blok"}.
            </p>
          </div>
        ) : (
          <>
            <div className={styles.sessionTop}>
              <ProgressRing done={session.kind === "done" ? total : session.completedCount} total={total} />
              <div>
                <h2 className={styles.sessionTitle}>{session.title}</h2>
                <p className={styles.sessionFocus}>{session.focus}</p>
                <div className={styles.sessionChips}>
                  <span className={styles.chip}>{total} cvikov</span>
                  <span className={styles.chip}>{session.durationLabel}</span>
                </div>
              </div>
            </div>

            {session.kind === "done" && (
              <p className={styles.doneMark}>
                <CheckIcon /> Tréning hotový — dobrá práca
              </p>
            )}

            <ol className={styles.exList}>
              {session.exercises.map((ex) => (
                <li key={ex.idx} className={styles.exRow}>
                  <span className={styles.exIdx}>{ex.idx}</span>
                  <span className={styles.exBody}>
                    <span className={styles.exName}>{ex.name}</span>
                    <span className={styles.exMeta}>
                      {ex.scheme} · pauza {ex.rest}
                      {ex.tempo ? ` · tempo ${ex.tempo}` : ""}
                    </span>
                  </span>
                  <span className={styles.exLoad}>{ex.load}</span>
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
            <span className={styles.streakUnit}>dní podľa plánu</span>
          </div>
          <div className={styles.streakPlates} aria-hidden="true">
            {streakHistory.map((hit, i) => (
              <span key={i} className={`${styles.plate} ${hit ? styles.plateOn : ""}`} />
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

      {nextDay && nextLabel && (
        <p className={styles.nextUp}>
          Ďalší tréning · <span>{nextLabel}</span> — {nextDay.plan}
        </p>
      )}
    </>
  );
}
