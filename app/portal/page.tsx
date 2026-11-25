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
import { InvitePrompt } from "@/app/portal/InvitePrompt";
import { RetryButton } from "@/app/portal/RetryButton";
import { WorkoutStopwatch } from "@/app/portal/WorkoutStopwatch";
import { WeekHistory } from "@/app/portal/WeekHistory";
import { PlanSwitch } from "@/app/portal/PlanSwitchSheet";
import type { ReactNode } from "react";
import { BodyMetricForm } from "@/app/portal/BodyMetricForm";
import { ProgressCard } from "@/app/portal/ProgressCard";
import { ProfileIcon, TrainingIcon } from "@/app/portal/icons";
import { AlertIcon, Notice } from "./Notice";
import s from "./portal.module.css";
import { LiveProgressRing, ProgressRing } from "./ProgressRing";
import { OtherTodayWorkouts } from "./OtherTodayWorkouts";
import { GamificationHome } from "./GamificationHome";
import { MissionsHost } from "./MissionsHost";
import { Suspense } from "react";
import { ChallengesHost } from "./ChallengesCard";
import { WeeklySummaryHost } from "./WeeklySummaryHost";
import { AppointmentNotice } from "./AppointmentNotice";
import { HIDDEN_APPOINTMENT_COOKIE } from "@/lib/portal/appointmentNotice";
import { cookies } from "next/headers";

/* /portal — "Dnes": dáta z getPortalData, pozdrav, odkaz trénera, terakotová karta
   dňa s prstencom postupu (začatie/zápis tréningu, stopky), prehľad týždňa s grafom. */


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

/** Série pod týždňom (lib/portal/streak.ts — od MIN_VISIBLE_STREAK dní). */
function StreakChips({ streaks, freezeUsed = false }: { streaks: PortalStreaks; freezeUsed?: boolean }) {
  const { training, food } = streaks;
  const t = useTranslations("today");
  const tf = useTranslations("gamification.freeze");
  const showTraining = training.count >= MIN_VISIBLE_STREAK;
  const showFood = food.count >= MIN_VISIBLE_STREAK;
  if (!showTraining && !showFood && !freezeUsed) return null;

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
        {freezeUsed && (
          <span className={s.chip} data-testid="freeze-used">
            {tf("used")}
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

  // pozvánka cez odkaz trénera (0077): „Pripojiť sa“ — len mimo dev náhľadov
  const invite = preview ? null : <InvitePrompt />;

  if (result.state === "unlinked") {
    return (
      <>
        {invite}
        <Notice icon={<ProfileIcon />} title={result.firstName ? t("welcomeName", { name: result.firstName }) : t("welcome")}>
          {t("unlinked")}
        </Notice>
      </>
    );
  }

  const hiddenAppointmentId = decodeURIComponent((await cookies()).get(HIDDEN_APPOINTMENT_COOKIE)?.value ?? "");
  return (
    <>
      {invite}
      <Today
        data={result.data}
        preview={Boolean(preview) && process.env.NODE_ENV === "development"}
        hiddenAppointmentId={hiddenAppointmentId}
      />
    </>
  );
}

function Today({ data, preview = false, hiddenAppointmentId = "" }: { data: PortalData; preview?: boolean; hiddenAppointmentId?: string }) {
  const {
    clientFirstName,
    today,
    hour,
    coachNote,
    session,
    week,
    streaks,
    gamification,
    deletionNotice,
    cooperationEndedNotice,
    bodyMetrics,
    nextAppointment,
    planChoice,
    hasTrainer,
    freezes,
    workoutHints,
    todayWorkouts,
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

      {!deletionNotice && cooperationEndedNotice && <CooperationNotice removed={cooperationEndedNotice.removed} />}

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

      {/* najbližší termín — × ho skryje (termín ostáva v kalendári); skrytý = cookie s jeho id */}
      {nextAppointment && nextAppointment.id !== hiddenAppointmentId && (
        <AppointmentNotice appointmentId={nextAppointment.id} closeLabel={t("hideAppointment")}>
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
        </AppointmentNotice>
      )}

      {/* aktívny plán (riadi túto kartu) — pri viacerých plánoch „Zmeniť“; s tréningom je
          „Plán <názov>“ priamo v oranžovom poli karty, nad ňou len pri prázdnom pláne */}
      {planChoice && !session && <PlanSwitch choice={planChoice} dayId={null} />}

      {/* úrovne, denné prstence a odznaky — samostatná karta nad tréningom */}
      {gamification && (
        <div className={s.panel} data-tour="today-levels">
          <GamificationHome home={gamification} freezes={freezes?.available ?? null} card />
        </div>
      )}

      {/* ďalší tréning — alebo prázdna karta plánu (nový klient, prázdny plán) */}
      {session ? (
        <NextWorkout
          session={session}
          workoutHints={workoutHints}
          planName={planChoice?.activePlanName ?? null}
          planSwitch={planChoice ? <PlanSwitch choice={planChoice} dayId={session.dayId ?? null} variant="hero" /> : null}
        />
      ) : (
        <EmptyPlan
          planName={planChoice?.activePlanName ?? null}
          canSwitch={(planChoice?.plans.length ?? 0) > 1}
          hasTrainer={hasTrainer}
        />
      )}

      {/* dnes odcvičené tréningy mimo aktívneho plánu (iný plán, zmazaný deň) — aj bez aktívneho tréningu */}
      {todayWorkouts && todayWorkouts.length > 0 && <OtherTodayWorkouts workouts={todayWorkouts} standalone={!session} />}

      {/* týždeň so sériami, meranie a Progres (graf zo záznamov meraní) */}
      <section className={s.after} aria-label={t("overview")}>

        <WeekHistory initial={week} footer={
            <>
              <StreakChips streaks={streaks} freezeUsed={freezes?.recentUse ?? false} />
            </>
          } preview={preview} />

        {/* meranie pod kalendárom — posledné 3 merania, staršie sa posúvajú */}
        <div className={s.panel} data-tour="today-measure">
          <div className={s.panelHead}>
            <p className={s.panelLabel}>{t("measurement")}</p>
            <span className={s.panelIcon}>
              <RulerIcon />
            </span>
          </div>
          <BodyMetricForm today={today} history={bodyMetrics} />
        </div>

        <ProgressCard history={bodyMetrics} />
      </section>

      {/* týždenný súhrn (raz za týždeň), misie a výzvy od trénera — dostreamujú sa, nespomaľujú kartu Dnes */}
      {!preview && (
        <>
          <Suspense fallback={null}>
            <WeeklySummaryHost mode="due" />
          </Suspense>
          <Suspense fallback={null}>
            <MissionsHost compact />
          </Suspense>
          <Suspense fallback={null}>
            <ChallengesHost compact />
          </Suspense>
        </>
      )}
    </>
  );
}

/** Ďalší / dnešný tréning aktívneho plánu — terakotový pás s prstencom, pod ním akcia. */
function NextWorkout({
  session,
  planName,
  planSwitch,
  workoutHints,
}: {
  session: TodaySession;
  planName: string | null;
  /** „Zmeniť“ (PlanSwitch variant hero) — v rade čipov */
  planSwitch: ReactNode;
  /** história cvikov dňa pre nápovedu pri sérii (gamifikácia v2) */
  workoutHints?: PortalData["workoutHints"];
}) {
  const total = session.exercises.length;
  const complete = session.kind === "complete";
  const t = useTranslations("today");
  return (
    <>
        {/* ďalší tréning v poradí — terakotový pás s prstencom, pod ním akcia */}
        <section className={s.hero} aria-label={complete ? t("planDone") : t("nextWorkout")} data-tour="today-hero">
          <div className={s.heroBand}>
            <div className={s.heroText}>
              <p className={s.heroKicker}>
                {complete ? t("plan") : session.kind === "done" ? t("todayWorkout") : t("nextWorkout")}
              </p>
              <h2 className={s.heroTitle}>{complete ? t("planFinished") : session.title}</h2>
              {/* „Plán <názov>“ priamo v oranžovom poli, pod názvom tréningu */}
              {planName && (
                <p className={s.heroPlan}>
                  <span className={s.heroPlanLabel}>{t("planSwitch.plan")}</span>
                  <span className={s.heroPlanName} data-testid="hero-plan">
                    {planName}
                  </span>
                </p>
              )}
              {!complete && session.focus && <p className={s.heroFocus}>{session.focus}</p>}
              <div className={s.heroChips}>
                {!complete && <span className={s.heroChip}>{t("exercises", { count: total })}</span>}
                {!complete && session.durationLabel && <span className={s.heroChip}>{session.durationLabel}</span>}
                {planSwitch}
              </div>
            </div>
            <div className={s.heroRing}>
              {complete ? (
                <ProgressRing done={session.completedCount} total={session.completedCount} />
              ) : session.kind === "done" && session.compare && session.compare.exercises.length > 0 ? (
                // po odcvičení podľa zápisu: cviky so zapísanou sériou / plán + pridané cviky
                <ProgressRing
                  done={session.compare.exercises.filter((e) => e.status !== "skipped").length}
                  total={session.compare.exercises.length}
                />
              ) : session.kind === "training" && session.dayId ? (
                // počas tréningu živý postup z odškrtnutých sérií (LogWorkoutButton)
                <LiveProgressRing dayId={session.dayId} done={session.completedCount} total={total} />
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
                compare={session.compare}
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
              <LogWorkoutButton key={session.dayId} dayId={session.dayId} exercises={session.exercises} hints={workoutHints} />
            )}
          </div>
        </section>

        {/* ďalšie dnes odcvičené tréningy (2–3 dni plánu za deň) — samostatné karty pod aktuálnym */}
        {session.otherToday && session.otherToday.length > 0 && <OtherTodayWorkouts workouts={session.otherToday} />}

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
    <section className={s.hero} aria-label={t("plan")} data-tour="today-hero">
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
