import { SwipeBack } from "@/app/components/SwipeBack";
import { getTranslations } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import { AppLink as Link } from "../../../../components/AppLink";
import { createClient } from "@/lib/supabase/server";
import { getPlanReview } from "@/lib/portal/planReviewData";
import { buildDoneDays, fetchPlanLogs, toProgressionDays } from "@/lib/dashboard/planDoneDays";
import { DayReview } from "@/app/portal/trening/PlanReviewView";
import { ActionDownloadIcon } from "@/app/components/ActionIcons";
import { PlanReviewPanel } from "../PlanReviewPanel";
import pa from "@/app/components/planActions.module.css";
import rv from "@/app/portal/portal.module.css";
import styles from "@/app/dashboard/dashboard.module.css";

/**
 * Report plánu pre trénera (karta plánu v detaile klienta → „Report“) — vyhodnotenie aj
 * rozpracovaného plánu: rátajú sa len odcvičené tréningy (buildPlanReview berie len zápisy
 * dní plánu). Pod súhrnom každý deň: odcvičený → karty cvikov (plán vs. skutočnosť, graf),
 * neodcvičený → krátka veta. „Zopakovať s progresiou“ len pri celom odcvičenom pláne.
 * Nič sa tu neupravuje. Hore „Export PDF“ — celý report (vyhodnotenie, odcvičené tréningy
 * plán vs. skutočnosť, zostávajúce tréningy) — app/api/export/plan/[planId]/report/pdf.
 */
export default async function PlanReportPage({ params }: { params: Promise<{ planId: string }> }) {
  const { planId } = await params;
  const supabase = await createClient();

  const [{ data: plan }, { data: days }, { data: logs }, review, t] = await Promise.all([
    supabase
      .from("workout_plans")
      // explicitná FK — clients má aj active_plan_id → workout_plans (PGRST201 bez nej)
      .select("id, name, client_id, edit_of, clients!workout_plans_client_id_fkey(full_name)")
      .eq("id", planId)
      .maybeSingle(),
    supabase.from("workout_days").select("id, day_number, name, exercises").eq("plan_id", planId).order("day_number"),
    fetchPlanLogs(supabase, planId),
    getPlanReview(planId),
    getTranslations("plans.review"),
  ]);

  if (!plan) notFound();
  // skrytá kópia úprav nemá vlastný report — patrí k plánu, ktorý upravuje
  if (plan.edit_of) redirect(`/dashboard/treningy/${plan.edit_of}/report`);

  const clientName = (plan.clients as unknown as { full_name: string } | null)?.full_name ?? "?";
  const planDays = days ?? [];
  const doneDays = buildDoneDays(logs ?? []);
  const doneCount = planDays.filter((d) => doneDays[d.id]).length;
  const allDone = planDays.length > 0 && doneCount === planDays.length;

  return (
    // Späť na klienta: na mobile potiahnutím zľava doprava (SwipeBack), na počítači bočné menu / odkaz.
    <SwipeBack href={`/dashboard/klienti/${plan.client_id}`} className={styles.planPage}>
      <div className={styles.detailHead}>
        <div className={styles.detailTitle}>
          <h1>{plan.name}</h1>
          <div className={styles.clientGoal}>
            <Link href={`/dashboard/klienti/${plan.client_id}`}>{clientName}</Link>
          </div>
        </div>
        <div className={styles.detailHeadStatus}>
          {/* súborový download (Route Handler) — obyčajný <a>, nie klientska navigácia */}
          <a href={`/api/export/plan/${planId}/report/pdf`} className={`${pa.action} ${pa.small} ${styles.reportExport}`}>
            <ActionDownloadIcon />
            {t("exportPdf")}
          </a>
          {allDone ? (
            <span className={styles.planDoneBadge}>{t("doneBadge")}</span>
          ) : (
            <span className={`${styles.publishBadge} ${styles.publishBadgeDraft}`} data-testid="preview-progress">
              {t("progressBadge", { done: doneCount, total: planDays.length })}
            </span>
          )}
        </div>
      </div>

      {review ? (
        <PlanReviewPanel
          planId={planId}
          review={review}
          days={toProgressionDays(planDays)}
          canRepeat={allDone}
          title={allDone ? undefined : t("reviewTitleProgress")}
        />
      ) : (
        <p className={styles.noWorkouts} role="alert">
          {t("reviewError")}
        </p>
      )}

      {/* tréningy plánu — odcvičené s kartami cvikov, ostatné len s vetou */}
      <section className={rv.rvPanel} aria-labelledby="plan-preview-days">
        <h2 id="plan-preview-days" className={rv.rvPanelTitle}>
          {t("daysTitle")}
        </h2>
        {planDays.map((d) => {
          const done = doneDays[d.id];
          return (
            // deň bez orámovania — karty cvikov idú na celú šírku
            <section key={d.id} className={styles.reportDay} data-testid="preview-day" data-done={done ? "true" : "false"}>
              <h3 className={`${rv.rvBoxTitle} ${styles.reportDayTitle}`}>
                {d.name}
                {done && <span className={`${styles.planDoneBadge} ${styles.previewDayBadge}`}>{t("doneBadge")}</span>}
              </h3>
              {done ? (
                <DayReview compare={done.compare} review={review} voice="trainer" />
              ) : (
                <p className={rv.trHint}>{t("dayNotDone")}</p>
              )}
            </section>
          );
        })}
      </section>

    </SwipeBack>
  );
}
