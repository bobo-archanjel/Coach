import Link from "next/link";
import { getPortalData } from "@/lib/portal/data";
import { pluralSk } from "@/lib/portal/streak";
import type { PortalData } from "@/lib/portal/types";
import { DoneWorkoutView } from "./DoneWorkoutView";
import { ProfileIcon, TrainingIcon } from "./icons";
import { LogWorkoutButton } from "./LogWorkoutButton";
import { AlertIcon, Notice } from "./Notice";
import { CooperationNotice } from "./CooperationNotice";
import { RetryButton } from "./RetryButton";
import { WorkoutStopwatch } from "./WorkoutStopwatch";
import { StreakRow } from "./StreakRow";
import { previewResult } from "./preview";
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

/** "dnes o 18:00" / "zajtra o 9:30" / "streda 10.9. o 8:00" — appointments (0026). */
function appointmentWhenLabel(startsAtIso: string): string {
  const start = new Date(startsAtIso);
  const now = new Date();
  const sameDay = start.toDateString() === now.toDateString();
  const tomorrow = new Date(now.getTime() + 86_400_000);
  const isTomorrow = start.toDateString() === tomorrow.toDateString();
  const time = start.toLocaleTimeString("sk-SK", { hour: "2-digit", minute: "2-digit" });
  if (sameDay) return `dnes o ${time}`;
  if (isTomorrow) return `zajtra o ${time}`;
  const dayLabel = start.toLocaleDateString("sk-SK", { weekday: "long", day: "numeric", month: "numeric" });
  return `${dayLabel} o ${time}`;
}

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
    // Zápis telesnej miery nezávisí od tréningového plánu (QA nález #3) — Notice
    // o chýbajúcom pláne sa zobrazí ako predtým, ale BodyMetricForm pod ňou
    // funguje bez ohľadu na to, či/kedy tréner (alebo klient sám) plán vytvorí.
    if (!result.hasTrainer) {
      return (
        <>
          <Notice
            icon={<TrainingIcon />}
            title={result.firstName ? `${result.firstName}, poďme na to` : "Poďme na to"}
            action={
              <Link href="/portal/trening" className="btn btn-primary btn-sm">
                Vytvoriť plán
              </Link>
            }
          >
            Zatiaľ nemáš tréningový plán. Vytvor si vlastný v sekcii Tréning — alebo pošli svoj kód z Profilu trénerovi
            a plán ti pripraví on.
          </Notice>
          <BodyMetricForm today={result.today} history={result.bodyMetrics} />
        </>
      );
    }
    return (
      <>
        <Notice
          icon={<TrainingIcon />}
          title={result.firstName ? `${result.firstName}, plán je na ceste` : "Plán je na ceste"}
        >
          Tréner ti zatiaľ nepriradil aktívny tréningový plán. Hneď ako to spraví,
          nájdeš tu dnešný tréning aj prehľad týždňa.
        </Notice>
        <BodyMetricForm today={result.today} history={result.bodyMetrics} />
      </>
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
    streaks,
    deletionNotice,
    cooperationEndedNotice,
    bodyMetrics,
    nextAppointment,
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
              <p className={styles.noteFrom}>{coachNote.trainer ? `Tréner ${coachNote.trainer}` : "Tréner"}</p>
              <p className={styles.noteText}>{coachNote.text}</p>
            </div>
          </div>
        )}

        {nextAppointment && (
          <div className={styles.appointmentNotice}>
            <span className={styles.appointmentDot} aria-hidden="true" />
            <p>
              Najbližší termín: <strong>{nextAppointment.title}</strong> — {appointmentWhenLabel(nextAppointment.startsAt)}
            </p>
          </div>
        )}
      </section>

      {/* 2 · práca — ďalší tréning v poradí (rotácia, nie pevný rozvrh podľa dňa v týždni) */}
      {session.kind === "complete" ? (
        // Plán je jednorazový — všetky dni odcvičené, žiadny ďalší "Začať tréning".
        <section className={styles.session} aria-label="Tréningový plán hotový">
          <div className={styles.sessionTop}>
            <ProgressRing done={session.completedCount} total={session.completedCount} />
            <div>
              <h2 className={styles.sessionTitle}>Plán máš hotový</h2>
              <p className={styles.sessionFocus}>{session.title}</p>
            </div>
          </div>
          <p className={styles.doneMark}>
            <CheckIcon /> Odcvičil si všetky dni plánu. Ďalší ti pripraví tréner — alebo si vytvor vlastný v sekcii
            Tréning.
          </p>
        </section>
      ) : (
      <section className={styles.session} aria-label="Ďalší tréning">
        <div className={styles.sessionTop}>
          <ProgressRing done={session.completedCount} total={total} />
          <div>
            <h2 className={styles.sessionTitle}>{session.title}</h2>
            {session.focus && <p className={styles.sessionFocus}>{session.focus}</p>}
            <div className={styles.sessionChips}>
              <span className={styles.chip}>
                {total} {pluralSk(total, "cvik", "cviky", "cvikov")}
              </span>
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
          // Vrátiť sa do tréningu = vidieť to, čo si naozaj zapísal (Fáza B), nie
          // znovu ponúkaný plán. Od 0048 len na čítanie — záznam je zamknutý v DB.
          <DoneWorkoutView
            loggedExercises={session.loggedExercises}
            completedAt={session.completedAt}
            sessionRpe={session.sessionRpe}
            sessionNote={session.sessionNote}
            logId={session.logId}
            editableUntil={session.editableUntil}
            exercises={session.exercises}
          />
        )}

        {/* Rozpis cvikov pred začatím sa tu už nezobrazuje (revízia 2026-09) —
            ten istý zoznam (ExercisePreviewList) vidno v sekcii Tréning, karta Dnes
            má zostať prehľad (ring, názov, počet cvikov), nie duplicitný rozpis. */}

        {session.kind === "training" && session.dayId && (
          // key: iný deň = nový stav formulára (koncept aj riadky sú viazané na deň)
          <LogWorkoutButton key={session.dayId} dayId={session.dayId} exercises={session.exercises} />
        )}
      </section>
      )}

      {/* Plávajúce stopky / časovač pauzy — ikona dole sa objaví po "Začať tréning",
          zmizne po ukončení. Fixne pozicované, miesto v strome je len logické. */}
      {session.dayId && (
        <WorkoutStopwatch dayId={session.dayId} finished={session.kind === "done"} />
      )}

      {/* 3 · dozvuk */}
      <section className={styles.after} aria-label="Prehľad">
        <div className={styles.panel}>
          <p className={styles.panelLabel}>Meranie</p>
          <BodyMetricForm today={today} history={bodyMetrics} />
        </div>

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
          <StreakRow streaks={streaks} />
        </div>

        <WeekHistory initial={week} />
      </section>
    </>
  );
}
