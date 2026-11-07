import { getPortalTraining } from "@/lib/portal/data";
import { AlertIcon, Notice } from "../Notice";
import { RetryButton } from "../RetryButton";
import { TrainingSection } from "./TrainingSection";
import { previewResult } from "./preview";

/* /portal/trening — zoznam tréningových plánov klienta (od trénera aj vlastné).
   Klient si vie vytvoriť vlastný tréning (aj bez trénera) a ťukom naň ho nastaviť
   ako aktívny — potom sa správa presne ako plán od trénera (karta Dnes, stopky,
   logovanie). Dáta: lib/portal/data.ts, migrácia 0010_client_own_workouts.sql. */

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
