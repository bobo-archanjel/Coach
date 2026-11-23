/* DEV náhľady sekcie Tréning (?preview=…). */
import type { PortalExercise, PortalTrainingData, PortalTrainingResult } from "@/lib/portal/types";
import { previewCompare } from "../previewCompare";

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
            entries: DAY_A_ENTRIES,
            rpe: 8,
            note: null,
            compare: previewCompare(DAY_A, DAY_A_ENTRIES),
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
            entries: DAY_B_ENTRIES,
            rpe: 9,
            note: null,
            compare: previewCompare(DAY_B, DAY_B_ENTRIES),
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
          lastLog: null,
          exercises: DAY_A,
        },
      ],
    },
  ],
  // Analytika tréningu „Moja jesenná sila“: bench 3 tréningy, tlaky 1 (graf až od 2.), zhyby bez kg
  previewVolume: {
    "plan-own-done": [
      {
        dayId: "d6",
        exercises: [
          {
            entryId: "e1",
            name: "Bench press",
            points: [
              { date: "2026-10-27", volumeKg: 1680 },
              { date: "2026-11-03", volumeKg: 1824 },
              { date: "2026-11-10", volumeKg: 1375 },
            ],
          },
          { entryId: "e2", name: "Tlaky nad hlavu", points: [{ date: "2026-11-10", volumeKg: 1080 }] },
        ],
      },
      {
        dayId: "d7",
        exercises: [
          {
            entryId: "e3",
            name: "Mŕtvy ťah",
            points: [
              { date: "2026-10-29", volumeKg: 1500 },
              { date: "2026-11-12", volumeKg: 1080 },
            ],
          },
          { entryId: "e4", name: "Zhyby", points: [] },
        ],
      },
    ],
  },
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

export function previewResult(kind: string): PortalTrainingResult | null {
  if (process.env.NODE_ENV !== "development") return null;
  if (kind === "ok") return { state: "ok", data: withFreshLog(PREVIEW) };
  if (kind === "empty") return { state: "ok", data: { ...PREVIEW, plans: [], activePlanId: null } };
  if (kind === "own")
    return {
      state: "ok",
      data: { ...PREVIEW, plans: PREVIEW.plans.filter((p) => p.source === "client"), activePlanId: "plan-own" },
    };
  if (kind === "error") return { state: "error" };
  return null;
}
