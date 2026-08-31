import { getPortalTraining } from "@/lib/portal/data";
import type { PortalTrainingData, PortalTrainingResult } from "@/lib/portal/types";
import { AlertIcon, Notice } from "../Notice";
import { RetryButton } from "../RetryButton";
import { TrainingSection } from "./TrainingSection";

/* /portal/trening — zoznam tréningových plánov klienta (od trénera aj vlastné).
   Klient si vie vytvoriť vlastný tréning (aj bez trénera) a ťukom naň ho nastaviť
   ako aktívny — potom sa správa presne ako plán od trénera (karta Dnes, stopky,
   logovanie). Dáta: lib/portal/data.ts, migrácia 0010_client_own_workouts.sql. */

const PREVIEW: PortalTrainingData = {
  activePlanId: "plan-trainer",
  exerciseLibrary: [
    { id: "g1", name: "Bench press", nameSk: null, muscleGroup: "hrudník", imageUrl: null },
    { id: "g2", name: "Drep s činkou", nameSk: null, muscleGroup: "nohy", imageUrl: null },
    { id: "g3", name: "Mŕtvy ťah", nameSk: null, muscleGroup: "chrbát", imageUrl: null },
    { id: "g4", name: "Zhyby", nameSk: null, muscleGroup: "chrbát", imageUrl: null },
    { id: "g5", name: "Tlaky nad hlavu", nameSk: null, muscleGroup: "ramená", imageUrl: null },
    { id: "g6", name: "Veslovanie v predklone", nameSk: null, muscleGroup: "chrbát", imageUrl: null },
    { id: "g7", name: "Plank", nameSk: null, muscleGroup: "core", imageUrl: null },
  ],
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
          exercises: [
            { idx: "1", name: "Bench press", scheme: "4 × 6", load: "80 kg", rest: "150 s", tempo: "2-0-1", entryId: "e1", plannedSets: 4, plannedReps: "6", exerciseId: null, loadKg: 80, restSeconds: 150 },
            { idx: "2", name: "Tlaky nad hlavu", scheme: "3 × 8", load: "45 kg", rest: "120 s", entryId: "e2", plannedSets: 3, plannedReps: "8", exerciseId: null, loadKg: 45, restSeconds: 120 },
          ],
        },
        {
          id: "d2",
          name: "Deň B — Ťah",
          exercises: [
            { idx: "1", name: "Mŕtvy ťah", scheme: "3 × 5", load: "120 kg", rest: "180 s", entryId: "e3", plannedSets: 3, plannedReps: "5", exerciseId: null, loadKg: 120, restSeconds: 180 },
            { idx: "2", name: "Zhyby", scheme: "4 × 8", load: "vlastná váha", rest: "90 s", entryId: "e4", plannedSets: 4, plannedReps: "8", exerciseId: null, loadKg: null, restSeconds: 90 },
          ],
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
          exercises: [
            { idx: "1", name: "Plank", scheme: "3 × 45 s", load: "vlastná váha", rest: "45 s", entryId: "e5", plannedSets: 3, plannedReps: "45 s", exerciseId: null, loadKg: null, restSeconds: 45 },
          ],
        },
      ],
    },
  ],
};

function previewResult(kind: string): PortalTrainingResult | null {
  if (process.env.NODE_ENV === "production") return null;
  if (kind === "ok") return { state: "ok", data: PREVIEW };
  if (kind === "empty") return { state: "ok", data: { ...PREVIEW, plans: [], activePlanId: null } };
  if (kind === "own")
    return {
      state: "ok",
      data: { ...PREVIEW, plans: PREVIEW.plans.filter((p) => p.source === "client"), activePlanId: "plan-own" },
    };
  if (kind === "error") return { state: "error" };
  return null;
}

export default async function TreningPage({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string }>;
}) {
  const { preview } = await searchParams;
  const result = (preview && previewResult(preview)) || (await getPortalTraining());

  if (result.state === "error") {
    return (
      <Notice icon={<AlertIcon />} title="Nepodarilo sa načítať tvoje tréningy" tone="alert" action={<RetryButton />}>
        Skús to o chvíľu znova. Ak to potrvá, napíš svojmu trénerovi.
      </Notice>
    );
  }

  return <TrainingSection data={result.data} />;
}
