import { getPortalFoodDiary } from "@/lib/portal/data";
import { previewResult } from "@/app/portal/dennik/preview";
import { DiaryView } from "@/app/portal/dennik/DiaryView";
import { ProfileIcon } from "@/app/portal/icons";
import { RetryButton } from "@/app/portal/RetryButton";
import { AlertIcon, Notice } from "../V6Notice";
import s from "../styles/portal.module.css";

/* /v6design/portal/dennik — ten istý denník (DiaryView: optimistické pridávanie,
   úprava gramáže, listovanie dňami) ako /portal/dennik, vzhľad dodá v6 skin. */

export default async function V6DennikPage({
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

  return (
    <>
      <header>
        <h1 className={s.pageTitle}>Denník</h1>
        <p className={s.pageSub}>Čo si naozaj zjedol, oproti tvojmu cieľu.</p>
      </header>
      {/* key: pri prepnutí dňa sa optimistický zoznam aj formulár začnú odznova (ako /portal) */}
      <DiaryView key={result.data.date} data={result.data} />
    </>
  );
}
