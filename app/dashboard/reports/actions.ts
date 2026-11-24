"use server";

import { getTranslations } from "next-intl/server";
import { requireReports } from "@/lib/reports/guard";
import { loadClientPeriodReport } from "@/lib/reports/loaders";
import { parsePeriod } from "@/lib/reports/period";
import type { ClientReport } from "@/lib/reports/types";

export type ClientReportResult = { report: ClientReport; error?: undefined; locked?: undefined } | { report?: undefined; error: string; locked: boolean };

/**
 * Report klienta za obdobie (4/12/26 týždňov, celá história) — číta sa až po otvorení záložky
 * Reporty, preto ho stránka klienta neťahá vopred. Server action je verejný endpoint, takže tarifu
 * a vlastníctvo klienta overuje tu (requireReports + loader), nie UI.
 */
export async function loadClientReportAction(clientId: string, period: string): Promise<ClientReportResult> {
  if (typeof clientId !== "string" || !/^[0-9a-f-]{36}$/i.test(clientId)) {
    return { error: (await getTranslations("reports.errors"))("clientNotFound"), locked: false };
  }
  const auth = await requireReports();
  if (!auth.ok) return { error: auth.error, locked: auth.locked };
  const t = await getTranslations("reports.errors");
  try {
    const report = await loadClientPeriodReport(auth.supabase, auth.userId, clientId, parsePeriod(period));
    if (!report) return { error: t("clientNotFound"), locked: false };
    return { report };
  } catch (e) {
    console.error("reports.loadClientReportAction:", e instanceof Error ? e.message : e);
    return { error: t("loadFailed"), locked: false };
  }
}
