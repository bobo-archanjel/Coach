import { getTranslations } from "next-intl/server";
import { getPortalTraining } from "@/lib/portal/data";
import { previewResult } from "@/app/portal/trening/preview";
import { TrainingSection } from "@/app/portal/trening/TrainingSection";
import { RetryButton } from "@/app/portal/RetryButton";
import { AlertIcon, Notice } from "../Notice";
import s from "../portal.module.css";

/* /portal/trening — plány od trénera aj vlastné, šablóny a builder (TrainingSection). */

export default async function TreningPage({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  const t = await getTranslations("training");
  const { preview } = await searchParams;
  const result = (preview && previewResult(preview)) || (await getPortalTraining());

  if (result.state === "error") {
    return (
      <Notice icon={<AlertIcon />} title={t("loadFailedTitle")} tone="alert" action={<RetryButton />}>
        {t("loadFailedText")}
      </Notice>
    );
  }

  return (
    <>
      <header>
        <h1 className={s.pageTitle}>{t("pageTitle")}</h1>
        <p className={s.pageSub}>{t("pageSub")}</p>
      </header>
      <TrainingSection data={result.data} />
    </>
  );
}
