// FitPilot — druhy úspechov v client_achievements (0078 + 0079). Bez importov servera.
export type AchievementKind = "pr" | "badge" | "challenge";

/** Názov výzvy z meta odznaku (meta je z DB, preto sa overuje tvar a dĺžka). */
export function challengeNameOf(meta: unknown): string | null {
  const n = (meta as { challenge_name?: unknown } | null)?.challenge_name;
  return typeof n === "string" && n.length > 0 ? n.slice(0, 80) : null;
}
