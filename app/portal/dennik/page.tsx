import { getPortalFoodDiary } from "@/lib/portal/data";
import type { PortalDiaryData, PortalDiaryResult } from "@/lib/portal/types";
import { AlertIcon, Notice } from "../Notice";
import { ProfileIcon } from "../icons";
import { RetryButton } from "../RetryButton";
import { DiaryView } from "./DiaryView";

/* /portal/dennik — food diary. Klient loguje, čo skutočne zjedol, oproti makro cieľu.
   Protikus k /portal/strava (čo MÁ jesť podľa trénera). Dáta: lib/portal/data.ts,
   migrácia 0007_food_logs.sql. Render (hero + makro pruhy + zoznam + pridávanie)
   je v DiaryView.tsx — client component s optimistic UI (feature/optimalizacia). */

// ---------- DEV náhľad bez DB ----------
const PREVIEW: PortalDiaryData = {
  today: "2026-08-28",
  hour: 14,
  goal: { bmr: 1780, tdee: 2560, caloriesTarget: 2350, proteinG: 175, carbsG: 240, fatG: 70 },
  totals: { kcal: 1420, proteinG: 118, carbsG: 132, fatG: 44 },
  groups: [
    {
      slot: "ranajky",
      slotLabel: "Raňajky",
      kcal: 520,
      entries: [
        { id: "p1", slot: "ranajky", name: "Ovsené vločky", grams: 80, kcal: 300, proteinG: 10.4, carbsG: 48, fatG: 5.6 },
        { id: "p2", slot: "ranajky", name: "Grécky jogurt (0-2 %)", grams: 200, kcal: 120, proteinG: 18, carbsG: 8, fatG: 1 },
        { id: "p3", slot: "ranajky", name: "Banán", grams: 110, kcal: 98, proteinG: 1.2, carbsG: 25.3, fatG: 0.3 },
      ],
    },
    {
      slot: "obed",
      slotLabel: "Obed",
      kcal: 620,
      entries: [
        { id: "p4", slot: "obed", name: "Kuracie prsia (surové)", grams: 200, kcal: 220, proteinG: 46, carbsG: 0, fatG: 3 },
        { id: "p5", slot: "obed", name: "Ryža basmati (varená)", grams: 250, kcal: 325, proteinG: 6.8, carbsG: 70, fatG: 0.8 },
        { id: "p6", slot: "obed", name: "Brokolica (varená)", grams: 200, kcal: 70, proteinG: 4.8, carbsG: 14, fatG: 0.8 },
      ],
    },
  ],
  planFoods: [
    { foodId: null, name: "Tvaroh (polotučný)", kcal100g: 98, protein100g: 12, carbs100g: 3.5, fat100g: 4.3, plannedGrams: 250, plannedSlot: "vecera" },
    { foodId: null, name: "Losos (surový)", kcal100g: 208, protein100g: 20, carbs100g: 0, fat100g: 13, plannedGrams: 150, plannedSlot: "vecera" },
  ],
};

function previewResult(kind: string): PortalDiaryResult | null {
  if (process.env.NODE_ENV === "production") return null;
  if (kind === "ok") return { state: "ok", data: PREVIEW };
  if (kind === "nogoal") return { state: "ok", data: { ...PREVIEW, goal: null } };
  if (kind === "over")
    return { state: "ok", data: { ...PREVIEW, totals: { kcal: 2610, proteinG: 190, carbsG: 250, fatG: 88 } } };
  if (kind === "empty") return { state: "ok", data: { ...PREVIEW, groups: [], totals: { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 } } };
  if (kind === "unlinked") return { state: "unlinked", firstName: "Ján" };
  if (kind === "error") return { state: "error" };
  return null;
}

export default async function DennikPage({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string }>;
}) {
  const { preview } = await searchParams;
  const result = (preview && previewResult(preview)) || (await getPortalFoodDiary());

  if (result.state === "error") {
    return (
      <Notice icon={<AlertIcon />} title="Nepodarilo sa načítať denník" tone="alert" action={<RetryButton />}>
        Skús to o chvíľu znova. Ak to potrvá, napíš svojmu trénerovi.
      </Notice>
    );
  }

  if (result.state === "unlinked") {
    return (
      <Notice icon={<ProfileIcon />} title={result.firstName ? `Vitaj, ${result.firstName}` : "Vitaj vo FitPilot"}>
        Tvoj účet ešte nie je prepojený s trénerom. Prepojenie spraví tréner zo svojej strany.
      </Notice>
    );
  }

  return <DiaryView data={result.data} />;
}
