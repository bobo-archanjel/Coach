import { requireReports } from "@/lib/reports/guard";
import { ClientReportPanel } from "./ClientReportPanel";
import { ReportsLocked } from "./ReportsLocked";

/**
 * Záložka „Reporty“ na detaile klienta (server komponent): tarifu overuje server — Starter/skúška
 * vidia zamknutý náhľad, Pro/Business panel, ktorý si dáta načíta až po otvorení záložky.
 * Read-only tréner (nad limitom klientov) reporty vidí, ak ich jeho tarifa obsahuje.
 */
export async function ClientReportsTab({ clientId }: { clientId: string }) {
  const auth = await requireReports();
  if (!auth.ok) return auth.locked ? <ReportsLocked variant="client" /> : null;
  return <ClientReportPanel clientId={clientId} />;
}
