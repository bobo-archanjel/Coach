/* DEV náhľady karty Dnes (?preview=…). */
import type { PortalData, PortalExercise, PortalPlanChoice, PortalResult, TodaySession } from "@/lib/portal/types";
import { previewCompare } from "./previewCompare";

/** Tento týždeň → pondelok: plán dňa a čo klient naozaj odcvičil (náhľad s porovnaním). */
const WEEK_MON_PLAN: PortalExercise[] = [
  { idx: "1", name: "Tlak na lavičke", scheme: "3 × 8", load: "70 kg", rest: "120 s", entryId: "w1", plannedSets: 3, plannedReps: "8", exerciseId: null, loadKg: 70, restSeconds: 120 },
  { idx: "2", name: "Tlak nad hlavu", scheme: "3 × 10", load: "35 kg", rest: "90 s", entryId: "w2", plannedSets: 3, plannedReps: "10", exerciseId: null, loadKg: 35, restSeconds: 90 },
  { idx: "3", name: "Bicepsový zdvih", scheme: "3 × 12", load: "14 kg", rest: "60 s", entryId: "w3", plannedSets: 3, plannedReps: "12", exerciseId: null, loadKg: 14, restSeconds: 60 },
];
const WEEK_MON_ENTRIES = [
  { entryId: "w1", name: "Tlak na lavičke", sets: [{ reps: 8, weight: 70 }, { reps: 8, weight: 70 }, { reps: 6, weight: 75 }] },
  { entryId: "w2", name: "Tlak nad hlavu", sets: [{ reps: 10, weight: 35 }, { reps: 9, weight: 35 }, { reps: 8, weight: 35 }] },
  { entryId: "w3", name: "Bicepsový zdvih", sets: [{ reps: 12, weight: 14 }, { reps: 11, weight: 14 }] },
];

/** Prepínač aktívneho plánu na Dnes (PlanSwitchSheet) — aktívny je prvý. */
const PREVIEW_PLAN_CHOICE: PortalPlanChoice = {
  activePlanId: "pp-strength",
  activePlanName: "Silový 3× týždenne",
  plans: [
    { id: "pp-strength", name: "Silový 3× týždenne", source: "trainer", dayCount: 3 },
    { id: "pp-own", name: "Môj ranný tréning", source: "client", dayCount: 2 },
    { id: "pp-empty", name: "Rozpracovaný plán", source: "trainer", dayCount: 0 },
  ],
};

const PREVIEW_SESSION: TodaySession = {
  kind: "training",
  title: "Deň C — Nohy",
  focus: "",
  durationLabel: "",
  completedCount: 0,
  dayId: "preview-day-c",
  loggedExercises: null,
  exercises: [
    { idx: "1", name: "Drep s veľkou činkou", scheme: "4 × 6", load: "90 kg", rest: "150 s", tempo: "3 s dole, kolená von", entryId: "p1", plannedSets: 4, plannedReps: "6", exerciseId: null, loadKg: 90, restSeconds: 150 },
    { idx: "2", name: "Rumunský mŕtvy ťah", scheme: "3 × 8", load: "100 kg", rest: "2 min", entryId: "p2", plannedSets: 3, plannedReps: "8", exerciseId: null, loadKg: 100, restSeconds: 120 },
    { idx: "3", name: "Predkopávanie na stroji", scheme: "3 × 12", load: "45 kg", rest: "75 s", entryId: "p3", plannedSets: 3, plannedReps: "12", exerciseId: null, loadKg: 45, restSeconds: 75, superset: "sspv" },
    { idx: "4", name: "Zakopávanie v ľahu", scheme: "3 × 12", load: "35 kg", rest: "75 s", entryId: "p4", plannedSets: 3, plannedReps: "12", exerciseId: null, loadKg: 35, restSeconds: 75, superset: "sspv" },
    { idx: "5", name: "Výpony na lýtka v stoji", scheme: "4 × 15", load: "60 kg", rest: "60 s", entryId: "p5", plannedSets: 4, plannedReps: "15", exerciseId: null, loadKg: 60, restSeconds: 60 },
    { idx: "6", name: "Plank s výdržou", scheme: "3 × 45 s", load: "vlastná váha", rest: "45 s", entryId: "p6", plannedSets: 3, plannedReps: "45 s", exerciseId: null, loadKg: null, restSeconds: 45 },
  ],
};

/** Karta Dnes po odcvičení (?preview=done): čo klient naozaj zapísal. */
const PREVIEW_DONE_ENTRIES = [
  { entryId: "p1", name: "Drep s veľkou činkou", sets: [{ reps: 6, weight: 92 }, { reps: 6, weight: 92 }, { reps: 6, weight: 90 }, { reps: 5, weight: 90 }] },
  { entryId: "p2", name: "Rumunský mŕtvy ťah", note: "Posledná séria ťažká na úchop", sets: [{ reps: 8, weight: 100 }, { reps: 8, weight: 100 }, { reps: 7, weight: 100 }] },
  // cvik pridaný počas tréningu (mimo plánu)
  { entryId: null, name: "Tlaky s jednoručkami", sets: [{ reps: 10, weight: 20 }] },
  // pridaný cvik na čas
  { entryId: null, name: "Bočný plank", sets: [{ reps: null, weight: null, durationS: 40 }] },
];

const PREVIEW_DATA: PortalData = {
  clientFirstName: "Ján",
  today: "2026-08-28",
  hour: 8,
  coachNote: {
    trainer: "Marek",
    initials: "M",
    text: "Dnes ide o techniku, nie o váhu — pri drepe drž tempo 3 s dole a kontrolu v spodnej polohe. Ak koleno pri RDL tlačí, zníž záťaž o 10 kg a napíš mi.",
  },
  session: PREVIEW_SESSION,
  hasTrainer: true,
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
            compare: previewCompare(WEEK_MON_PLAN, WEEK_MON_ENTRIES),
          },
        ],
      },
      { label: "Ut", dayNum: 25, iso: "2026-08-25", state: "none", sessions: [] },
      {
        label: "St",
        dayNum: 26,
        iso: "2026-08-26",
        state: "done",
        sessions: [{ dayName: "Deň B — Ťah", planName: "Silový 3× týždenne", compare: previewCompare(null, []) }],
      },
      { label: "Št", dayNum: 27, iso: "2026-08-27", state: "none", sessions: [] },
      { label: "Pi", dayNum: 28, iso: "2026-08-28", state: "today", sessions: [] },
      { label: "So", dayNum: 29, iso: "2026-08-29", state: "future", sessions: [] },
      { label: "Ne", dayNum: 30, iso: "2026-08-30", state: "future", sessions: [] },
    ],
  },
  streaks: {
    training: { count: 5, atRisk: false, thisWeekDays: 1, needThisWeek: 1 },
    food: { count: 12, atRisk: false },
  },
  deletionNotice: null,
  cooperationEndedNotice: null,
  nextAppointment: { title: "Konzultácia — kontrola techniky", startsAt: new Date(Date.now() + 2 * 86_400_000).toISOString() },
  planChoice: PREVIEW_PLAN_CHOICE,
  bodyMetrics: [90, 76, 62, 48, 34, 20, 6].map((daysAgo, i) => ({
    measuredOn: new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10),
    weightKg: [88, 87.2, 86.9, 85.6, 84.8, 85.1, 83.9][i],
    waistCm: 88 - i * 0.5,
    chestCm: i === 6 ? 102 : i === 3 ? 103 : null,
    hipsCm: i === 6 ? 98 : null,
    armCm: i % 2 === 0 ? 34 + i * 0.25 : null,
    thighCm: null,
    note: null,
  })),
};

/** Nový klient bez plánu: Dnes ukáže prázdnu kartu plánu, prehľad a týždeň s nulami. */
const NEW_CLIENT_DATA: PortalData = {
  ...PREVIEW_DATA,
  coachNote: null,
  nextAppointment: null,
  session: null,
  planChoice: null,
  streaks: { training: { count: 0, atRisk: false, thisWeekDays: 0, needThisWeek: 1 }, food: { count: 0, atRisk: false } },
  week: {
    ...PREVIEW_DATA.week,
    days: PREVIEW_DATA.week.days.map((d) => ({ ...d, state: d.state === "done" ? "none" : d.state, sessions: [] })),
  },
  bodyMetrics: [],
};

/** DEV: ?preview=unlinked|no_plan|no_plan_solo|no_plan_choice|error|ok|done|deletion|deletion_self|ended vynúti prázdny/chybový/hotový stav bez DB. */
export function previewResult(kind: string): PortalResult | null {
  if (process.env.NODE_ENV !== "development") return null;
  switch (kind) {
    case "unlinked":
      return { state: "unlinked", firstName: "Ján" };
    case "no_plan":
      return { state: "ok", data: NEW_CLIENT_DATA };
    case "no_plan_solo":
      return { state: "ok", data: { ...NEW_CLIENT_DATA, hasTrainer: false } };
    case "no_plan_choice":
      // aktívny plán bez cvikov, klient má aj iné plány
      return {
        state: "ok",
        data: {
          ...PREVIEW_DATA,
          session: null,
          planChoice: { ...PREVIEW_PLAN_CHOICE, activePlanId: "pp-empty", activePlanName: "Rozpracovaný plán" },
        },
      };
    case "error":
      return { state: "error" };
    case "ok":
      return { state: "ok", data: PREVIEW_DATA };
    case "complete":
      return {
        state: "ok",
        data: {
          ...PREVIEW_DATA,
          session: {
            ...PREVIEW_SESSION,
            kind: "complete",
            title: "Silový 3× týždenne",
            exercises: [],
            loggedExercises: null,
            completedCount: 3,
            dayId: null,
          },
        },
      };
    case "done":
      return {
        state: "ok",
        data: {
          ...PREVIEW_DATA,
          session: {
            ...PREVIEW_SESSION,
            kind: "done",
            completedCount: PREVIEW_SESSION.exercises.length,
            loggedExercises: PREVIEW_DONE_ENTRIES,
            compare: previewCompare(PREVIEW_SESSION.exercises, PREVIEW_DONE_ENTRIES),
            completedAt: new Date().toISOString(),
            logId: "preview-log",
            editableUntil: new Date(Date.now() + 23 * 60 * 60 * 1000).toISOString(),
            sessionRpe: 8,
            sessionNote: "Dobrý tréning, koleno OK.",
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
          cooperationEndedNotice: { endedAt: new Date(Date.now() - 2 * 86_400_000).toISOString(), removed: false },
        },
      };
    default:
      return null;
  }
}
