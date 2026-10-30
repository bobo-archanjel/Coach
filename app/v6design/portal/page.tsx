import Link from "next/link";
import { getPortalData } from "@/lib/portal/data";
import { MIN_VISIBLE_STREAK, pluralSk, type PortalStreaks } from "@/lib/portal/streak";
import type { PortalData } from "@/lib/portal/types";
import { previewResult } from "@/app/portal/preview";
import { DoneWorkoutView } from "@/app/portal/DoneWorkoutView";
import { LogWorkoutButton } from "@/app/portal/LogWorkoutButton";
import { CooperationNotice } from "@/app/portal/CooperationNotice";
import { RetryButton } from "@/app/portal/RetryButton";
import { WorkoutStopwatch } from "@/app/portal/WorkoutStopwatch";
import { WeekHistory } from "@/app/portal/WeekHistory";
import { BodyMetricForm } from "@/app/portal/BodyMetricForm";
import { ProfileIcon, TrainingIcon } from "@/app/portal/icons";
import { AlertIcon, Notice } from "./V6Notice";
import s from "./styles/portal.module.css";

/* /v6design/portal — "Dnes" v novom dizajne. Tie isté dáta (getPortalData), stavy
   a interaktívne komponenty ako /portal (app/portal/page.tsx); mení sa rozloženie:
   pozdrav, odkaz trénera, terakotová karta dňa s prstencom, prehľad s grafom. */

const RING_R = 40;
const RING_CIRC = 2 * Math.PI * RING_R;

function greetingPart(hour: number): string {
  return hour < 10 ? "Dobré ráno" : hour < 18 ? "Dobrý deň" : "Dobrý večer";
}

const cap = (str: string) => str.charAt(0).toUpperCase() + str.slice(1);

/** "dnes o 18:00" / "zajtra o 9:30" / "streda 10.9. o 8:00" — rovnako ako /portal. */
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

/** Dátum trvalého zmazania (deletion_requested_at + 30 dní grace period, 0018). */
function purgeDateLabel(requestedAt: string): string {
  const purgeDate = new Date(new Date(requestedAt).getTime() + 30 * 86_400_000);
  return purgeDate.toLocaleDateString("sk-SK");
}

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
    <path d="M5 12.5l4.5 4.5L19 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const CalendarIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x="4" y="5.5" width="16" height="14.5" rx="3" stroke="currentColor" strokeWidth="1.8" />
    <path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);
const RulerIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M4 15.5 15.5 4 20 8.5 8.5 20 4 15.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    <path d="M8 12l2 2M11 9l2 2M14 6l2 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

function ProgressRing({ done, total }: { done: number; total: number }) {
  const fraction = total > 0 ? done / total : 0;
  const offset = RING_CIRC * (1 - fraction);
  return (
    <svg className={s.ring} viewBox="0 0 92 92" style={{ ["--ring-circ" as string]: `${RING_CIRC}` }} aria-hidden="true">
      <circle className={s.ringTrack} cx="46" cy="46" r={RING_R} strokeDasharray={RING_CIRC} />
      <circle className={s.ringStart} cx="46" cy={46 - RING_R} r="4" />
      <circle className={s.ringValue} cx="46" cy="46" r={RING_R} strokeDasharray={RING_CIRC} strokeDashoffset={offset} />
      <text className={s.ringCenter} x="46" y="44" textAnchor="middle" dominantBaseline="middle">
        {done}/{total}
      </text>
      <text className={s.ringCenterSub} x="46" y="59" textAnchor="middle" dominantBaseline="middle">
        CVIKOV
      </text>
    </svg>
  );
}

/** Série pod grafom — rovnaké pravidlá a texty ako app/portal/StreakRow.tsx. */
function StreakChips({ streaks }: { streaks: PortalStreaks }) {
  const { training, food } = streaks;
  const showTraining = training.count >= MIN_VISIBLE_STREAK;
  const showFood = food.count >= MIN_VISIBLE_STREAK;
  if (!showTraining && !showFood) return null;

  const need = training.needThisWeek;
  let hint: string | null = null;
  if (showTraining && need > 0) {
    const what = `${need} ${pluralSk(need, "tréning", "tréningy", "tréningov")}`;
    hint = training.atRisk ? `Ešte ${what} tento týždeň a séria pokračuje.` : `Do splnenia týždňa chýba ešte ${what}.`;
  } else if (showFood && food.atRisk) {
    hint = "Zapíš dnes aspoň jedno jedlo, nech séria pokračuje.";
  }

  return (
    <>
      <div className={s.chipRow}>
        {showTraining && (
          <span className={s.chip}>
            Tréning: {training.count} {pluralSk(training.count, "týždeň", "týždne", "týždňov")} v rade
          </span>
        )}
        {showFood && (
          <span className={s.chip}>
            Zápis jedla: {food.count} {pluralSk(food.count, "deň", "dni", "dní")} v rade
          </span>
        )}
      </div>
      {hint && <p className={s.hint}>{hint}</p>}
    </>
  );
}

export default async function V6PortalHome({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  const { preview } = await searchParams;
  const result = (preview && previewResult(preview)) || (await getPortalData());

  if (result.state === "error") {
    return (
      <Notice icon={<AlertIcon />} title="Nepodarilo sa načítať tvoj deň" tone="alert" action={<RetryButton />}>
        Skús to o chvíľu znova. Ak to potrvá, napíš svojmu trénerovi.
      </Notice>
    );
  }

  if (result.state === "unlinked") {
    return (
      <Notice icon={<ProfileIcon />} title={result.firstName ? `Vitaj, ${result.firstName}` : "Vitaj vo FitPilot"}>
        Tvoj účet ešte nie je prepojený s trénerom. Prepojenie spraví tréner zo svojej strany — potom sa ti tu zobrazí
        tvoj plán a dnešný tréning.
      </Notice>
    );
  }

  if (result.state === "no_plan") {
    // Zápis merania nezávisí od plánu — rovnako ako /portal.
    const measurement = (
      <div className={s.panel}>
        <div className={s.panelHead}>
          <p className={s.panelLabel}>Meranie</p>
          <span className={s.panelIcon}>
            <RulerIcon />
          </span>
        </div>
        <BodyMetricForm today={result.today} history={result.bodyMetrics} />
      </div>
    );
    if (!result.hasTrainer) {
      return (
        <>
          <Notice
            icon={<TrainingIcon />}
            title={result.firstName ? `${result.firstName}, poďme na to` : "Poďme na to"}
            action={
              <Link href="/v6design/portal/trening" className="btn btn-primary btn-sm">
                Vytvoriť plán
              </Link>
            }
          >
            Zatiaľ nemáš tréningový plán. Vytvor si vlastný v sekcii Tréning — alebo pošli svoj kód z Profilu trénerovi a
            plán ti pripraví on.
          </Notice>
          {measurement}
        </>
      );
    }
    return (
      <>
        <Notice icon={<TrainingIcon />} title={result.firstName ? `${result.firstName}, plán je na ceste` : "Plán je na ceste"}>
          Tréner ti zatiaľ nepriradil aktívny tréningový plán. Hneď ako to spraví, nájdeš tu dnešný tréning aj prehľad
          týždňa.
        </Notice>
        {measurement}
      </>
    );
  }

  return <V6Today data={result.data} />;
}

function V6Today({ data }: { data: PortalData }) {
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
  const dateLabel = cap(d.toLocaleDateString("sk-SK", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }));
  const total = session.exercises.length;
  const complete = session.kind === "complete";

  return (
    <>
      {deletionNotice && (
        <div className={s.deletionNotice} role="status">
          <p className={s.deletionNoticeTitle}>
            {deletionNotice.requestedBy === "trainer" ? "Odstránený/á z portfólia trénera" : "Zmazanie dát prebieha"}
          </p>
          <p className={s.deletionNoticeText}>
            {deletionNotice.requestedBy === "trainer"
              ? "Tréner ťa odstránil zo svojho portfólia. Tvoje tréningy, výživa, denník aj správy sa natrvalo vymažú"
              : "Požiadal/a si o zmazanie svojich dát — vymažú sa"}{" "}
            {purgeDateLabel(deletionNotice.requestedAt)}, pokiaľ zmazanie nezrušíš.
          </p>
          <Link href="/v6design/portal/profil" className={s.deletionNoticeLink}>
            Spravovať v Profile →
          </Link>
        </div>
      )}

      {!deletionNotice && cooperationEndedNotice && <CooperationNotice />}

      <header className={s.hello}>
        <p className={s.helloDate}>{dateLabel}</p>
        <h1 className={s.helloTitle}>
          {clientFirstName ? `${greetingPart(hour)},` : null}
          <span className={s.helloName}>{clientFirstName || greetingPart(hour)}</span>
        </h1>
      </header>

      {coachNote && (
        <div className={s.coachNote}>
          <span className={s.noteTile} aria-hidden="true">
            {coachNote.initials}
          </span>
          <div>
            <p className={s.noteFrom}>{coachNote.trainer ? `Tréner ${coachNote.trainer}` : "Tréner"}</p>
            <p className={s.noteText}>{coachNote.text}</p>
          </div>
        </div>
      )}

      {nextAppointment && (
        <div className={s.appointment}>
          <span className={s.appointmentIcon} aria-hidden="true">
            <CalendarIcon />
          </span>
          <p>
            Najbližší termín: <strong>{nextAppointment.title}</strong> — {appointmentWhenLabel(nextAppointment.startsAt)}
          </p>
        </div>
      )}

      {/* ďalší tréning v poradí — terakotový pás s prstencom, pod ním akcia */}
      <section className={s.hero} aria-label={complete ? "Tréningový plán hotový" : "Ďalší tréning"}>
        <div className={s.heroBand}>
          <div className={s.heroText}>
            <p className={s.heroKicker}>
              {complete ? "Tréningový plán" : session.kind === "done" ? "Dnešný tréning" : "Ďalší tréning"}
            </p>
            <h2 className={s.heroTitle}>{complete ? "Plán máš hotový" : session.title}</h2>
            {complete ? (
              <p className={s.heroFocus}>{session.title}</p>
            ) : (
              session.focus && <p className={s.heroFocus}>{session.focus}</p>
            )}
            {!complete && (
              <div className={s.heroChips}>
                <span className={s.heroChip}>
                  {total} {pluralSk(total, "cvik", "cviky", "cvikov")}
                </span>
                {session.durationLabel && <span className={s.heroChip}>{session.durationLabel}</span>}
              </div>
            )}
          </div>
          <div className={s.heroRing}>
            {complete ? (
              <ProgressRing done={session.completedCount} total={session.completedCount} />
            ) : (
              <ProgressRing done={session.completedCount} total={total} />
            )}
          </div>
        </div>

        <div className={s.heroBody}>
          {complete && (
            <p className={s.doneMark}>
              <CheckIcon /> Odcvičil si všetky dni plánu. Ďalší ti pripraví tréner — alebo si vytvor vlastný v sekcii
              Tréning.
            </p>
          )}

          {session.kind === "done" && (
            <p className={s.doneMark}>
              <CheckIcon /> Tento tréning máš dnes hotový — vrátiš sa sem kedykoľvek, kým je dnešný deň
            </p>
          )}

          {session.kind === "done" && session.dayId && (
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

          {session.kind === "training" && session.dayId && (
            // key: iný deň = nový stav formulára (rovnako ako /portal)
            <LogWorkoutButton key={session.dayId} dayId={session.dayId} exercises={session.exercises} />
          )}
        </div>
      </section>

      {/* plávajúce stopky — fixne pozicované, miesto v strome je len logické */}
      {session.dayId && <WorkoutStopwatch dayId={session.dayId} finished={session.kind === "done"} />}

      <section className={s.after} aria-label="Prehľad">
        <h2 className={s.sectionTitle}>Môj prehľad</h2>

        <div className={s.panel}>
          <div className={s.panelHead}>
            <p className={s.panelLabel}>Odcvičené spolu</p>
            <span className={s.panelIcon}>
              <TrainingIcon />
            </span>
          </div>
          <div className={s.streakHead}>
            <span className={s.streakNum}>{totalSessions}</span>
            <span className={s.streakUnit}>{pluralSk(totalSessions, "tréning", "tréningy", "tréningov")}</span>
          </div>
          <div className={s.bars} aria-hidden="true">
            {streakHistory.map((state, i) => (
              <span key={i} className={`${s.bar} ${state === "done" ? s.barOn : s.barRest}`} />
            ))}
          </div>
          <div className={s.barsLegend} aria-hidden="true">
            <span>pred {streakHistory.length} dňami</span>
            <span>včera</span>
          </div>
          <StreakChips streaks={streaks} />
        </div>

        <WeekHistory initial={week} />

        <div className={s.panel}>
          <div className={s.panelHead}>
            <p className={s.panelLabel}>Meranie</p>
            <span className={s.panelIcon}>
              <RulerIcon />
            </span>
          </div>
          <BodyMetricForm today={today} history={bodyMetrics} />
        </div>
      </section>
    </>
  );
}
