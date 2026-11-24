// FitPilot — pravidlá týždenného e-mailu klientom. Čisté rozhodnutie bez I/O
// (testy: e2e/mail.spec.ts). Cron (lib/mail/weeklyJob.ts) ho volá pre každého klienta.

export interface WeeklyDecisionInput {
  /** klient nevypol „Týždenné zhrnutie e-mailom“ (predvolene zapnuté) */
  optedIn: boolean;
  /** klient má účet s e-mailom */
  hasEmail: boolean;
  /** tréner má aktívny prístup (nie read-only po skončení tarify) */
  trainerActive: boolean;
  /** súhrn sumarizovaného týždňa má aktivitu (tréning, jedlo, rekord, odznak, výzva) */
  weekHasActivity: boolean;
  /** aktivita v 2 týždňoch PRED sumarizovaným týždňom */
  recentActivity: boolean;
}

export type WeeklySkipReason = "opted_out" | "no_email" | "trainer_inactive" | "dormant";

export type WeeklyDecision = { send: true; kind: "full" | "nudge" } | { send: false; reason: WeeklySkipReason };

/**
 * - bez e-mailu / odhlásený / tréner bez prístupu → nič,
 * - aktivita v týždni → plné zhrnutie,
 * - týždeň bez aktivity, ale aktivita v 2 týždňoch predtým → jemné povzbudenie,
 * - žiadna aktivita 3 a viac týždňov (sumarizovaný + 2 predtým) → nič (nezahlcujeme spiacich).
 */
export function decideWeeklyEmail(i: WeeklyDecisionInput): WeeklyDecision {
  if (!i.hasEmail) return { send: false, reason: "no_email" };
  if (!i.optedIn) return { send: false, reason: "opted_out" };
  if (!i.trainerActive) return { send: false, reason: "trainer_inactive" };
  if (i.weekHasActivity) return { send: true, kind: "full" };
  if (i.recentActivity) return { send: true, kind: "nudge" };
  return { send: false, reason: "dormant" };
}
