/* DEV náhľady sekcie Tréning (?preview=…). */
import type { PortalExercise, PortalTrainingData, PortalTrainingResult } from "@/lib/portal/types";
import { previewCompare } from "../previewCompare";
import { buildPlanReview, type PlanReview } from "@/lib/portal/planReview";

const DAY_A: PortalExercise[] = [
  { idx: "1", name: "Bench press", scheme: "4 × 6", load: "80 kg", rest: "150 s", tempo: "lopatky stiahnuté, 2 s dole", entryId: "e1", plannedSets: 4, plannedReps: "6", exerciseId: null, loadKg: 80, restSeconds: 150 },
  { idx: "2", name: "Tlaky nad hlavu", scheme: "3 × 8", load: "45 kg", rest: "120 s", entryId: "e2", plannedSets: 3, plannedReps: "8", exerciseId: null, loadKg: 45, restSeconds: 120 },
];
const DAY_B: PortalExercise[] = [
  { idx: "1", name: "Mŕtvy ťah", scheme: "3 × 5", load: "120 kg", rest: "180 s", entryId: "e3", plannedSets: 3, plannedReps: "5", exerciseId: null, loadKg: 120, restSeconds: 180, superset: "sstr" },
  { idx: "2", name: "Zhyby", scheme: "4 × 8", load: "vlastná váha", rest: "90 s", entryId: "e4", plannedSets: 4, plannedReps: "8", exerciseId: null, loadKg: null, restSeconds: 90, superset: "sstr" },
];
// Deň B: klient vymazal 3. sériu mŕtveho ťahu, pri zhyboch spravil viac a jednu sériu vynechal
const DAY_B_ENTRIES = [
  { entryId: "e3", name: "Mŕtvy ťah", superset: "sstr", sets: [{ reps: 5, weight: 120 }, { reps: 4, weight: 120 }] },
  { entryId: "e4", name: "Zhyby", superset: "sstr", sets: [{ reps: 8, weight: null }, { reps: 10, weight: null }, { reps: 7, weight: null }] },
];
// Deň A: 3 zo 4 sérií benchu (jedna s vyššou váhou, jedna s menej opakovaniami), tlaky nezapísané
const DAY_A_ENTRIES = [
  { entryId: "e1", name: "Bench press", sets: [{ reps: 6, weight: 80 }, { reps: 6, weight: 82.5 }, { reps: 5, weight: 80 }] },
];

// „Moja jesenná sila“ (celý odcvičený vlastný plán): bench všetky série splnené (→ návrh +2,5 kg),
// tlaky 2 z 3 sérií, mŕtvy ťah 120 kg (rekord oproti 115), zhyby vždy viac opakovaní
const OWN_T1_ENTRIES = [
  { entryId: "e1", name: "Bench press", sets: [{ reps: 6, weight: 80 }, { reps: 6, weight: 80 }, { reps: 6, weight: 80 }, { reps: 7, weight: 80 }] },
  { entryId: "e2", name: "Tlaky nad hlavu", sets: [{ reps: 8, weight: 45 }, { reps: 7, weight: 45 }] },
];
const OWN_T2_ENTRIES = [
  { entryId: "e3", name: "Mŕtvy ťah", superset: "sstr", sets: [{ reps: 5, weight: 120 }, { reps: 5, weight: 120 }, { reps: 4, weight: 120 }] },
  { entryId: "e4", name: "Zhyby", superset: "sstr", sets: [{ reps: 10, weight: null }, { reps: 10, weight: null }, { reps: 9, weight: null }, { reps: 9, weight: null }] },
];
const snapshotOf = (exercises: PortalExercise[]) => ({
  exercises: exercises.map((e) => ({
    entry_id: e.entryId,
    exercise_name: e.name,
    sets: e.plannedSets,
    reps: e.plannedReps,
    load_kg: e.loadKg,
  })),
});
function ownDoneReview(): PlanReview {
  const log = (id: string, dayId: string | null, performedOn: string, entries: unknown, planSnapshot: unknown, rpe: number | null, note: string | null) => ({
    id,
    dayId,
    performedOn,
    completedAt: `${performedOn}T17:00:00Z`,
    rpe,
    note,
    entries,
    planSnapshot,
  });
  return buildPlanReview({
    days: [
      { id: "d6", name: "Tréning 1", exercises: snapshotOf(DAY_A).exercises },
      { id: "d7", name: "Tréning 2", exercises: snapshotOf(DAY_B).exercises },
    ],
    logs: [
      // staršie tréningy z iného plánu — história pre grafy a rekordy
      log("h1", null, "2026-10-20", [{ entryId: "o1", name: "Bench press", sets: [{ reps: 6, weight: 75 }, { reps: 6, weight: 77.5 }] }, { entryId: "o2", name: "Mŕtvy ťah", sets: [{ reps: 5, weight: 110 }] }], null, 7, null),
      log("h2", null, "2026-10-27", [{ entryId: "o1", name: "Bench press", sets: [{ reps: 6, weight: 80 }, { reps: 5, weight: 80 }] }, { entryId: "o2", name: "Mŕtvy ťah", sets: [{ reps: 5, weight: 115 }] }], null, 8, null),
      log("log-d6", "d6", "2026-11-10", OWN_T1_ENTRIES, snapshotOf(DAY_A), 8, "Bench išiel ľahko."),
      log("log-d7", "d7", "2026-11-12", OWN_T2_ENTRIES, snapshotOf(DAY_B), 9, null),
    ],
    nameOf: (_entryId, storedName) => storedName,
  });
}

/** „Moje kardio + core“ — rozpracovaný: odcvičený len „Sila — horná časť“ (rátajú sa len odcvičené). */
function ownWipReview(): PlanReview {
  return buildPlanReview({
    days: [
      { id: "d3", name: "Rozcvička", exercises: [{ entry_id: "e5", exercise_name: "Plank", sets: 3, reps: "45 s", load_kg: null }] },
      { id: "d8", name: "Sila — horná časť", exercises: snapshotOf(DAY_A).exercises },
    ],
    logs: [
      { id: "h1", dayId: null, performedOn: "2026-10-20", completedAt: "2026-10-20T17:00:00Z", rpe: 7, note: null, entries: [{ entryId: "o1", name: "Bench press", sets: [{ reps: 6, weight: 75 }] }], planSnapshot: null },
      { id: "log-d8", dayId: "d8", performedOn: "2026-11-18", completedAt: "2026-11-18T17:00:00Z", rpe: 7, note: null, entries: OWN_T1_ENTRIES, planSnapshot: snapshotOf(DAY_A) },
    ],
    nameOf: (_entryId, storedName) => storedName,
  });
}

const PREVIEW: PortalTrainingData = {
  draftOwner: "preview",
  activePlanId: "plan-trainer",
  plans: [
    {
      id: "plan-trainer",
      name: "Silový plán — 3× týždenne",
      source: "trainer",
      isActive: true,
      days: [
        {
          id: "d1",
          name: "Deň A — Tlak",
          done: true,
          doneToday: true,
          lastLog: null, // doplní previewResult (čas relatívne k "teraz")
          exercises: DAY_A,
        },
        {
          id: "d2",
          name: "Deň B — Ťah",
          done: true,
          doneToday: false,
          // odcvičený pred týždňom — 24 h okno na opravu dávno uplynulo
          lastLog: {
            id: "log-d2",
            completedAt: "2026-09-17T17:00:00Z",
            editableUntil: null,
            entries: DAY_B_ENTRIES,
            rpe: 8,
            note: null,
            compare: previewCompare(DAY_B, DAY_B_ENTRIES),
          },
          exercises: DAY_B,
        },
      ],
    },
    {
      id: "plan-own",
      name: "Moje kardio + core",
      source: "client",
      isActive: false,
      days: [
        {
          id: "d3",
          name: "Rozcvička",
          done: false,
          doneToday: false,
          lastLog: null,
          exercises: [
            { idx: "1", name: "Plank", scheme: "3 × 45 s", load: "vlastná váha", rest: "45 s", entryId: "e5", plannedSets: 3, plannedReps: "45 s", exerciseId: null, loadKg: null, restSeconds: 45 },
          ],
        },
        {
          // rozpracovaný plán s jedným odcvičeným tréningom — „Náhľad“ aj „Upraviť“
          id: "d8",
          name: "Sila — horná časť",
          done: true,
          doneToday: false,
          lastLog: {
            id: "log-d8",
            completedAt: "2026-11-18T17:00:00Z",
            editableUntil: null,
            entries: OWN_T1_ENTRIES,
            rpe: 7,
            note: null,
            compare: previewCompare(DAY_A, OWN_T1_ENTRIES),
          },
          exercises: DAY_A,
        },
      ],
    },
    {
      // celý odcvičený VLASTNÝ plán — „Náhľad“ namiesto „Upraviť“ (+ Analytika tréningu)
      id: "plan-own-done",
      name: "Moja jesenná sila",
      source: "client",
      isActive: false,
      days: [
        {
          id: "d6",
          name: "Tréning 1",
          done: true,
          doneToday: false,
          lastLog: {
            id: "log-d6",
            completedAt: "2026-11-10T17:00:00Z",
            editableUntil: null,
            entries: OWN_T1_ENTRIES,
            rpe: 8,
            note: "Bench išiel ľahko.",
            compare: previewCompare(DAY_A, OWN_T1_ENTRIES),
          },
          exercises: DAY_A,
        },
        {
          id: "d7",
          name: "Tréning 2",
          done: true,
          doneToday: false,
          lastLog: {
            id: "log-d7",
            completedAt: "2026-11-12T17:00:00Z",
            editableUntil: null,
            entries: OWN_T2_ENTRIES,
            rpe: 9,
            note: null,
            compare: previewCompare(DAY_B, OWN_T2_ENTRIES),
          },
          exercises: DAY_B,
        },
      ],
    },
    {
      // celý odcvičený plán — „Hotovo“, aktívnym sa už nastaviť nedá
      id: "plan-done",
      name: "Letný plán — celé telo",
      source: "trainer",
      isActive: false,
      days: [
        {
          id: "d5",
          name: "Celé telo",
          done: true,
          doneToday: false,
          lastLog: {
            id: "log-d5",
            completedAt: "2026-09-02T17:00:00Z",
            editableUntil: null,
            entries: DAY_A_ENTRIES,
            rpe: 7,
            note: "Prvý tréning po dovolenke.",
            compare: previewCompare(DAY_A, DAY_A_ENTRIES),
          },
          exercises: DAY_A,
        },
      ],
    },
  ],
  previewReview: { "plan-own-done": ownDoneReview(), "plan-own": ownWipReview() },
  templates: [
    {
      id: "tpl-own",
      name: "Moje kardio + core",
      days: [
        {
          name: "Rozcvička",
          exercises: [
            { idx: "1", name: "Plank", scheme: "3 × 45 s", load: "vlastná váha", rest: "45 s", entryId: "e5", plannedSets: 3, plannedReps: "45 s", exerciseId: null, loadKg: null, restSeconds: 45 },
          ],
        },
      ],
    },
  ],
};

/** Deň A odcvičený pred hodinou → ešte v 24 h okne na opravu (0049). */
function withFreshLog(data: PortalTrainingData): PortalTrainingData {
  const completedAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  return {
    ...data,
    plans: data.plans.map((p) => ({
      ...p,
      days: p.days.map((d) =>
        d.id === "d1"
          ? {
              ...d,
              lastLog: {
                id: "log-d1",
                completedAt,
                editableUntil: new Date(Date.parse(completedAt) + 24 * 60 * 60 * 1000).toISOString(),
                entries: DAY_A_ENTRIES,
                rpe: 7,
                note: "Dobré",
                compare: previewCompare(DAY_A, DAY_A_ENTRIES),
              },
            }
          : d,
      ),
    })),
  };
}

/**
 * Náhľad hotového plánu bez servera: každý celý odcvičený plán bez vlastného vyhodnotenia
 * (napr. „Silový plán“ od trénera) ho dostane z posledných zápisov svojich dní.
 */
function withReviews(data: PortalTrainingData): PortalTrainingData {
  const previewReview = { ...data.previewReview };
  for (const plan of data.plans) {
    if (previewReview[plan.id] || plan.days.length === 0 || !plan.days.every((d) => d.done && d.lastLog)) continue;
    previewReview[plan.id] = buildPlanReview({
      days: plan.days.map((d) => ({ id: d.id, name: d.name, exercises: snapshotOf(d.exercises).exercises })),
      logs: plan.days.map((d) => ({
        id: d.lastLog!.id,
        dayId: d.id,
        performedOn: (d.lastLog!.completedAt ?? "2026-01-01").slice(0, 10),
        completedAt: d.lastLog!.completedAt,
        rpe: d.lastLog!.rpe,
        note: d.lastLog!.note,
        entries: d.lastLog!.entries,
        planSnapshot: snapshotOf(d.exercises),
      })),
      nameOf: (_entryId, storedName) => storedName,
    });
  }
  return { ...data, previewReview };
}

export function previewResult(kind: string): PortalTrainingResult | null {
  if (process.env.NODE_ENV !== "development") return null;
  if (kind === "ok") return { state: "ok", data: withReviews(withFreshLog(PREVIEW)) };
  if (kind === "empty") return { state: "ok", data: { ...PREVIEW, plans: [], activePlanId: null } };
  if (kind === "own")
    return {
      state: "ok",
      data: {
        ...PREVIEW,
        // aktívny je vlastný rozpracovaný plán — „Na rade“ pri najbližšom neodcvičenom tréningu
        plans: PREVIEW.plans.filter((p) => p.source === "client").map((p) => ({ ...p, isActive: p.id === "plan-own" })),
        activePlanId: "plan-own",
      },
    };
  if (kind === "error") return { state: "error" };
  return null;
}
