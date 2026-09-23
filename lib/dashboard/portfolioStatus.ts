// FitPilot — stav klienta v portfóliu (V poriadku / Sleduj / Riziko / Bez dát).
// Jeden zdroj pre /dashboard/analytika aj AI digest portfólia — digest predtým
// dostával len holé percentá a mohol napísať "dobrá adherencia" pri klientovi,
// ktorého stránka hneď vedľa ukazovala ako "Riziko" (QA 2026-09-23).
import type { ClientAnalyticsRow } from "./analytics";

export type ClientStatus = "ok" | "watch" | "risk" | "none";

export const CLIENT_STATUS_LABEL: Record<ClientStatus, string> = {
  ok: "V poriadku",
  watch: "Sleduj",
  risk: "Riziko",
  none: "Bez dát",
};

/** Priemer adherencie stravy a tréningu za 30 dní (bez dát = 100, nech neklesne do rizika). */
export function sortScore(row: ClientAnalyticsRow): number {
  const values = [row.nutritionPct30, row.trainingPct30].filter((v): v is number => v != null);
  if (values.length === 0) return 100;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Klient bez akéhokoľvek signálu za 30 dní — nepatrí do žiadneho zdravotného koša, ukáže sa zvlášť. */
export function hasNoSignal(row: ClientAnalyticsRow): boolean {
  return row.nutritionPct30 == null && row.trainingPct30 === 0 && row.lastTrainedOn == null;
}

/** Rovnaké prahy ako `pctTone`: ≥70 % v poriadku, <40 % riziko, medzi tým sleduj. */
export function clientStatus(row: ClientAnalyticsRow): ClientStatus {
  if (hasNoSignal(row)) return "none";
  const score = sortScore(row);
  if (score >= 70) return "ok";
  if (score < 40) return "risk";
  return "watch";
}
