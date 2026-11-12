import { AppLink as Link } from "../components/AppLink";
import { getPortalData } from "@/lib/portal/data";
import { MIN_VISIBLE_STREAK, type PortalStreaks } from "@/lib/portal/streak";
import { useLocale, useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { intlLocale, type Locale } from "@/lib/i18n/locales";
import type { PortalData, TodaySession } from "@/lib/portal/types";
import { previewResult } from "@/app/portal/preview";
import { DoneWorkoutView } from "@/app/portal/DoneWorkoutView";
import { LogWorkoutButton } from "@/app/portal/LogWorkoutButton";
import { CooperationNotice } from "@/app/portal/CooperationNotice";
import { RetryButton } from "@/app/portal/RetryButton";
import { WorkoutStopwatch } from "@/app/portal/WorkoutStopwatch";
import { WeekHistory } from "@/app/portal/WeekHistory";
import { PlanSwitch } from "@/app/portal/PlanSwitchSheet";
import { BodyMetricForm } from "@/app/portal/BodyMetricForm";
import { ProfileIcon, TrainingIcon } from "@/app/portal/icons";
import { AlertIcon, Notice } from "./Notice";
import s from "./portal.module.css";

/* /portal — "Dnes": dáta z getPortalData, pozdrav, odkaz trénera, terakotová karta
   dňa s prstencom postupu (začatie/zápis tréningu, stopky), prehľad týždňa s grafom. */

const RING_R = 40;
const RING_CIRC = 2 * Math.PI * RING_R;

type TodayT = ReturnType<typeof useTranslations<"today">>;

function greetingPart(hour: number, t: TodayT): string {
  return hour < 10 ? t("goodMorning") : hour < 18 ? t("goodDay") : t("goodEvening");
}

const cap = (str: string) => str.charAt(0).toUpperCase() + str.slice(1);

/** "dnes o 18:00" / "zajtra o 9:30" / "streda 10.9. o 8:00" */
function appointmentWhenLabel(startsAtIso: string, t: TodayT, locale: Locale): string {
  const start = new Date(startsAtIso);
  const now = new Date();
  const sameDay = start.toDateString() === now.toDateString();
  const tomorrow = new Date(now.getTime() + 86_400_000);
  const isTomorrow = start.toDateString() === tomorrow.toDateString();
  const time = start.toLocaleTimeString(intlLocale(locale), { hour: "2-digit", minute: "2-digit" });
  if (sameDay) return t("todayAt", { time });
  if (isTomorrow) return t("tomorrowAt", { time });
  const dayLabel = start.toLocaleDateString(intlLocale(locale), { weekday: "long", day: "numeric", month: "numeric" });
  return t("dayAt", { day: dayLabel, time });
}

/** Dátum trvalého zmazania (deletion_requested_at + 30 dní grace period, 0018). */
function purgeDateLabel(requestedAt: string, locale: Locale): string {
  const purgeDate = new Date(new Date(requestedAt).getTime() + 30 * 86_400_000);
  return purgeDate.toLocaleDateString(intlLocale(locale));
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
  const t = useTranslations("today");
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
        {t("exercisesRing")}
      </text>
    </svg>
  );
}

/** Série pod grafom (lib/portal/streak.ts — od MIN_VISIBLE_STREAK dní). */
function StreakChips({ streaks }: { streaks: PortalStreaks }) {
  const { training, food } = streaks;
  const t = useTranslations("today");
  const showTraining = training.count >= MIN_VISIBLE_STREAK;
  const showFood = food.count >= MIN_VISIBLE_STREAK;
  if (!showTraining && !showFood) return null;

  const need = training.needThisWeek;
  let hint: string | null = null;
  if (showTraining && need > 0) {
    const what = t("needTrainings", { count: need });
    hint = training.atRisk ? t("hintAtRisk", { what }) : t("hintMissing", { what });
  } else if (showFood && food.atRisk) {
    hint = t("hintFood");
  }

  return (
    <>
      <div className={s.chipRow}>
        {showTraining && (
          <span className={s.chip}>
            {t("streakTraining", { count: training.count })}
          </span>
        )}
        {showFood && (
          <span className={s.chip}>
            {t("streakFood", { count: food.count })}
          </span>
        )}
      </div>
      {hint && <p className={s.hint}>{hint}</p>}
    </>
  );
}

export default async function PortalHome({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  const { preview } = await searchParams;
  const result = (preview && previewResult(preview)) || (await getPortalData());
  const t = await getTranslations("today");

  if (result.state === "error") {
    return (
      <Notice icon={<AlertIcon />} title={t("loadFailedTitle")} tone="alert" action={<RetryButton />}>
        {t("loadFailedText")}
      </Notice>
    );
  }

  if (result.state === "unlinked") {
    return (
      <Notice icon={<ProfileIcon />} title={result.firstName ? t("welcomeName", { name: result.firstName }) : t("welcome")}>
        {t("unlinked")}
      </Notice>
    );
  }

  return <Today data={result.data} />;
}

function Today({ data }: { data: PortalData }) {
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
    planChoice,
    hasTrainer,
  } = data;
  const t = useTranslations("today");
  const locale = useLocale();

  const d = new Date(`${today}T12:00:00Z`);
  const dateLabel = cap(d.toLocaleDateString(intlLocale(locale), { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }));

  return (
    <>
      {deletionNotice && (
        <div className={s.deletionNotice} role="status">
          <p className={s.deletionNoticeTitle}>
            {deletionNotice.requestedBy === "trainer" ? t("removedByTrainer") : t("deletionInProgress")}
          </p>
          <p className={s.deletionNoticeText}>
            {deletionNotice.requestedBy === "trainer"
              ? t("removedText", { date: purgeDateLabel(deletionNotice.requestedAt, locale) })
              : t("deletionText", { date: purgeDateLabel(deletionNotice.requestedAt, locale) })}
          </p>
          <Link href="/portal/profil" className={s.deletionNoticeLink}>
            {t("manageInProfile")}
          </Link>
        </div>
      )}

      {!deletionNotice && cooperationEndedNotice && <CooperationNotice />}

      <header className={s.hello}>
        <p className={s.helloDate}>{dateLabel}</p>
        <h1 className={s.helloTitle}>
          {clientFirstName ? `${greetingPart(hour, t)},` : null}
          <span className={s.helloName}>{clientFirstName || greetingPart(hour, t)}</span>
        </h1>
      </header>

      {coachNote && (
        <div className={s.coachNote}>
          <span className={s.noteTile} aria-hidden="true">
            {coachNote.initials}
          </span>
          <div>
            <p className={s.noteFrom}>{coachNote.trainer ? t("trainerNamed", { name: coachNote.trainer }) : t("trainer")}</p>
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
            {t.rich("nextAppointment", {
              b: (chunks) => <strong>{chunks}</strong>,
              title: nextAppointment.title,
              when: appointmentWhenLabel(nextAppointment.startsAt, t, locale),
            })}
          </p>
        </div>
      )}

      {/* aktívny plán (riadi túto kartu) — pri viacerých plánoch „Zmeniť“ */}
      {planChoice && <PlanSwitch choice={planChoice} dayId={session?.dayId ?? null} />}

      {/* ďalší tréning — alebo prázdna karta plánu (nový klient, prázdny plán) */}
      {session ? (
        <NextWorkout session={session} />
      ) : (
        <EmptyPlan
          planName={planChoice?.activePlanName ?? null}
          canSwitch={(planChoice?.plans.length ?? 0) > 1}
          hasTrainer={hasTrainer}
        />
      )}

      <section className={s.after} aria-label={t("overview")}>
        <h2 className={s.sectionTitle}>{t("myOverview")}</h2>

        <div className={s.panel}>
          <div className={s.panelHead}>
            <p className={s.panelLabel}>{t("doneTotal")}</p>
            <span className={s.panelIcon}>
              <TrainingIcon />
            </span>
          </div>
          <div className={s.streakHead}>
            <span className={s.streakNum}>{totalSessions}</span>
            <span className={s.streakUnit}>{t("trainings", { count: totalSessions })}</span>
          </div>
          <div className={s.bars} aria-hidden="true">
            {streakHistory.map((state, i) => (
              <span key={i} className={`${s.bar} ${state === "done" ? s.barOn : s.barRest}`} />
            ))}
          </div>
          <div className={s.barsLegend} aria-hidden="true">
            <span>{t("daysAgo", { count: streakHistory.length })}</span>
            <span>{t("yesterday")}</span>
          </div>
          <StreakChips streaks={streaks} />
        </div>

        <WeekHistory initial={week} />

        <div className={s.panel}>
          <div className={s.panelHead}>
            <p className={s.panelLabel}>{t("measurement")}</p>
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

/** Ďalší / dnešný tréning aktívneho plánu — terakotový pás s prstencom, pod ním akcia. */
function NextWorkout({ session }: { session: TodaySession }) {
  const total = session.exercises.length;
  const complete = session.kind === "complete";
  const t = useTranslations("today");
  return (
    <>
        {/* ďalší tréning v poradí — terakotový pás s prstencom, pod ním akcia */}
        <section className={s.hero} aria-label={complete ? t("planDone") : t("nextWorkout")}>
          <div className={s.heroBand}>
            <div className={s.heroText}>
              <p className={s.heroKicker}>
                {complete ? t("plan") : session.kind === "done" ? t("todayWorkout") : t("nextWorkout")}
              </p>
              <h2 className={s.heroTitle}>{complete ? t("planFinished") : session.title}</h2>
              {/* názov plánu je v riadku PlanSwitch nad kartou — tu by bol druhýkrát */}
              {!complete && session.focus && <p className={s.heroFocus}>{session.focus}</p>}
              {!complete && (
                <div className={s.heroChips}>
                  <span className={s.heroChip}>
                    {t("exercises", { count: total })}
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
                <CheckIcon /> {t("allDaysDone")}
              </p>
            )}

            {session.kind === "done" && (
              <p className={s.doneMark}>
                <CheckIcon /> {t("doneToday")}
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
              // key: iný deň = nový stav formulára
              <LogWorkoutButton key={session.dayId} dayId={session.dayId} exercises={session.exercises} />
            )}
          </div>
        </section>

        {/* plávajúce stopky — fixne pozicované, miesto v strome je len logické */}
        {session.dayId && <WorkoutStopwatch dayId={session.dayId} finished={session.kind === "done"} />}
    </>
  );
}

/**
 * Prázdna karta plánu — nový klient bez plánu (alebo prázdny aktívny plán). Rovnaký tvar
 * ako karta ďalšieho tréningu, len tlmená; prehľad, týždeň aj meranie pod ňou ostávajú.
 */
function EmptyPlan({ planName, canSwitch, hasTrainer }: { planName: string | null; canSwitch: boolean; hasTrainer: boolean }) {
  const t = useTranslations("today");
  const title = planName ? t("emptyNamed", { name: planName }) : hasTrainer ? t("onTheWay") : t("noPlan");
  const text = planName
    ? canSwitch
      ? t("emptySwitch")
      : hasTrainer
        ? t("emptyTrainer")
        : t("emptyOwn")
    : hasTrainer
      ? t("noPlanTrainer")
      : t("noPlanOwn");
  return (
    <section className={s.hero} aria-label={t("plan")}>
      <div className={`${s.heroBand} ${s.heroBandEmpty}`}>
        <div className={s.heroText}>
          <p className={s.heroKicker}>{t("plan")}</p>
          <h2 className={s.heroTitle}>{title}</h2>
          <p className={s.heroFocus}>{text}</p>
        </div>
        <div className={s.heroRing}>
          <span className={s.emptyRing} aria-hidden="true">
            <TrainingIcon />
          </span>
        </div>
      </div>
      {/* bez trénera si plán vytvorí / doplní klient sám */}
      {!hasTrainer && (
        <div className={s.heroBody}>
          <Link href="/portal/trening" className={`btn btn-primary ${s.startBtn}`}>
            {planName ? t("fillPlan") : t("createPlan")}
          </Link>
        </div>
      )}
    </section>
  );
}
