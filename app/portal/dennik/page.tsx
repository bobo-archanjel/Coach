import { getPortalFoodDiary } from "@/lib/portal/data";
import { AlertIcon, Notice } from "../Notice";
import { ProfileIcon } from "../icons";
import { RetryButton } from "../RetryButton";
import { DiaryView } from "./DiaryView";
import { previewResult } from "./preview";

/* /portal/dennik — food diary. Klient loguje, čo skutočne zjedol, oproti makro cieľu.
   Protikus k /portal/strava (čo MÁ jesť podľa trénera). Dáta: lib/portal/data.ts,
   migrácia 0007_food_logs.sql. Render (hero + makro pruhy + zoznam + pridávanie)
   je v DiaryView.tsx — client component s optimistic UI (feature/optimalizacia). */

export default async function DennikPage({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string; date?: string }>;
}) {
  const { preview, date } = await searchParams;
  const result = (preview && previewResult(preview)) || (await getPortalFoodDiary(date));

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

  // key: pri prepnutí dňa sa optimistický zoznam aj rozpracovaný formulár začnú odznova.
  return <DiaryView key={result.data.date} data={result.data} />;
}
