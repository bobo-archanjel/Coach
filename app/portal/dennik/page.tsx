import { getTranslations } from "next-intl/server";
import { getPortalFoodDiary } from "@/lib/portal/data";
import { previewResult } from "@/app/portal/dennik/preview";
import { DiaryView } from "@/app/portal/dennik/DiaryView";
import { ProfileIcon } from "@/app/portal/icons";
import { RetryButton } from "@/app/portal/RetryButton";
import { AlertIcon, Notice } from "../Notice";
import s from "../portal.module.css";

/* /portal/dennik — denník stravy (DiaryView: optimistické pridávanie, úprava gramáže,
   listovanie dňami, skener čiarových kódov). */

export default async function DennikPage({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string; date?: string }>;
}) {
  const { preview, date } = await searchParams;
  const result = (preview && previewResult(preview)) || (await getPortalFoodDiary(date));
  const [tp, t] = await Promise.all([getTranslations("portal"), getTranslations("portal.diary")]);

  if (result.state === "error") {
    return (
      <Notice icon={<AlertIcon />} title={t("loadFailed")} tone="alert" action={<RetryButton />}>
        {tp("retryLater")}
      </Notice>
    );
  }

  if (result.state === "unlinked") {
    return (
      <Notice icon={<ProfileIcon />} title={result.firstName ? tp("welcomeName", { name: result.firstName }) : tp("welcome")}>
        {tp("unlinkedShort")}
      </Notice>
    );
  }

  return (
    <>
      <header>
        <h1 className={s.pageTitle}>{t("title")}</h1>
        <p className={s.pageSub}>{t("sub")}</p>
      </header>
      {/* key: pri prepnutí dňa sa optimistický zoznam aj formulár začnú odznova (ako /portal) */}
      <DiaryView key={result.data.date} data={result.data} />
    </>
  );
}
