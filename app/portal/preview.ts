/* DEV náhľady karty Dnes (?preview=…) — zdieľané /portal a /v6design/portal. */
import type { PortalData, PortalResult } from "@/lib/portal/types";

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
  streaks: {
    training: { count: 5, atRisk: false, thisWeekDays: 1, needThisWeek: 1 },
    food: { count: 12, atRisk: false },
  },
  deletionNotice: null,
  cooperationEndedNotice: null,
  nextAppointment: { title: "Konzultácia — kontrola techniky", startsAt: new Date(Date.now() + 2 * 86_400_000).toISOString() },
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

/** DEV: ?preview=unlinked|no_plan|no_plan_solo|error|ok|done|deletion|deletion_self|ended vynúti prázdny/chybový/hotový stav bez DB. */
export function previewResult(kind: string): PortalResult | null {
  if (process.env.NODE_ENV !== "development") return null;
  switch (kind) {
    case "unlinked":
      return { state: "unlinked", firstName: "Ján" };
    case "no_plan":
      return { state: "no_plan", firstName: "Ján", hasTrainer: true, today: PREVIEW_DATA.today, bodyMetrics: PREVIEW_DATA.bodyMetrics };
    case "no_plan_solo":
      return { state: "no_plan", firstName: "Ján", hasTrainer: false, today: PREVIEW_DATA.today, bodyMetrics: PREVIEW_DATA.bodyMetrics };
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
            ...PREVIEW_DATA.session,
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
            ...PREVIEW_DATA.session,
            kind: "done",
            completedCount: PREVIEW_DATA.session.exercises.length,
            loggedExercises: [
              { entryId: "p1", name: "Drep s veľkou činkou", sets: [{ reps: 6, weight: 92 }, { reps: 6, weight: 92 }, { reps: 6, weight: 90 }, { reps: 5, weight: 90 }] },
              { entryId: "p2", name: "Rumunský mŕtvy ťah", note: "Posledná séria ťažká na úchop", sets: [{ reps: 8, weight: 100 }, { reps: 8, weight: 100 }, { reps: 7, weight: 100 }] },
            ],
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
          cooperationEndedNotice: { endedAt: new Date(Date.now() - 2 * 86_400_000).toISOString() },
        },
      };
    default:
      return null;
  }
}
