// FitPilot — druhy úspechov v client_achievements (0078 + 0079). Bez importov servera.
export type AchievementKind = "pr" | "badge" | "challenge" | "level";

/** Predošlá úroveň z meta oslavy postupu (odmeny sa ukážu za všetky preskočené úrovne). */
export function levelFromOf(meta: unknown): number | null {
  const n = (meta as { from?: unknown } | null)?.from;
  return typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 60 ? n : null;
}

/** Úroveň z meta oslavy postupu (kind 'level'); meta je z DB, preto sa overuje tvar. */
export function levelOf(meta: unknown): number | null {
  const n = (meta as { level?: unknown } | null)?.level;
  return typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 60 ? n : null;
}

/** Názov výzvy z meta odznaku (meta je z DB, preto sa overuje tvar a dĺžka). */
export function challengeNameOf(meta: unknown): string | null {
  const n = (meta as { challenge_name?: unknown } | null)?.challenge_name;
  return typeof n === "string" && n.length > 0 ? n.slice(0, 80) : null;
}
