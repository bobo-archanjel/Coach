import { getTranslations } from "next-intl/server";
import { getPortalNutrition } from "@/lib/portal/data";
import { previewResult, PREVIEW_STAPLES } from "@/app/portal/strava/preview";
import { NutritionSection } from "@/app/portal/strava/NutritionSection";
import { RetryButton } from "@/app/portal/RetryButton";
import { AlertIcon, Notice } from "../Notice";
import s from "../portal.module.css";

/* /portal/strava — makro cieľ, aktívny jedálniček (od trénera alebo vlastný) a builder
   vlastného jedálnička (NutritionSection, getPortalNutrition). */

export default async function StravaPage({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  const { preview } = await searchParams;
  const previewData = preview ? previewResult(preview) : null;
  const [result, tp, t] = await Promise.all([
    previewData ?? getPortalNutrition(),
    getTranslations("portal"),
    getTranslations("portal.nutrition"),
  ]);

  if (result.state === "error") {
    return (
      <Notice icon={<AlertIcon />} title={t("loadFailed")} tone="alert" action={<RetryButton />}>
        {tp("retryLater")}
      </Notice>
    );
  }
  // getPortalNutrition už „unlinked“ nevracia (vlastný jedálniček si klient vytvorí aj bez
  // trénera) — typ ho pozná kvôli spätnej kompatibilite
  if (result.state === "unlinked") return null;

  return (
    <>
      <header>
        <h1 className={s.pageTitle}>{t("title")}</h1>
        <p className={s.pageSub}>{t("sub")}</p>
      </header>
      <NutritionSection data={result.data} initialStaples={previewData ? PREVIEW_STAPLES : undefined} />
    </>
  );
}
