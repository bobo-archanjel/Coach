import { getPortalTraining } from "@/lib/portal/data";
import { previewResult } from "@/app/portal/trening/preview";
import { TrainingSection } from "@/app/portal/trening/TrainingSection";
import { RetryButton } from "@/app/portal/RetryButton";
import { AlertIcon, Notice } from "../Notice";
import s from "../portal.module.css";

/* /portal/trening — plány od trénera aj vlastné, šablóny a builder (TrainingSection). */

export default async function TreningPage({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  const { preview } = await searchParams;
  const result = (preview && previewResult(preview)) || (await getPortalTraining());

  if (result.state === "error") {
    return (
      <Notice icon={<AlertIcon />} title="Nepodarilo sa načítať tvoje tréningy" tone="alert" action={<RetryButton />}>
        Skús to o chvíľu znova. Ak to potrvá, napíš svojmu trénerovi.
      </Notice>
    );
  }

  return (
    <>
      <header>
        <h1 className={s.pageTitle}>Tréning</h1>
        <p className={s.pageSub}>Plány od trénera aj tvoje vlastné — vyber deň a začni.</p>
      </header>
      <TrainingSection data={result.data} />
    </>
  );
}
