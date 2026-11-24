// FitPilot — séria týždňov pre celoappkový rebríček (gamifikácia v2). Čisté funkcie
// (testy: e2e/gamification-v2.spec.ts).
//
// Poradie podľa série sa nedá lacno spočítať v SQL nad celou históriou všetkých klientov (séria toleruje
// jedno vynechanie a zmrazenia), preto sa séria klienta ukladá do client_streak_cache pri tréningu. Aby
// neaktívny klient v poradí nezostal so starou hodnotou, uloží sa aj `expires_week`: pondelok, od ktorého
// by séria bez nového tréningu už bola 0. Rebríček berie len riadky s expires_week > aktuálny pondelok.

import { TRAINING_WEEK_TARGET, computeTrainingStreak } from "@/lib/portal/streak";
import { addDaysIso, weekStartOf } from "@/lib/reports/period";

/** Najviac toľko týždňov dopredu sa simuluje zánik série (bez nového tréningu zaniká do 3–4 týždňov). */
const MAX_LOOKAHEAD_WEEKS = 8;

export interface StreakSnapshot {
  weeks: number;
  /** pondelok, od ktorého je séria bez nového tréningu 0 */
  expiresWeek: string;
}

export function streakSnapshot(
  trainedDates: Iterable<string>,
  today: string,
  frozenWeeks: Iterable<string> = [],
  target: number = TRAINING_WEEK_TARGET,
): StreakSnapshot {
  const dates = [...trainedDates];
  const frozen = [...frozenWeeks];
  const now = computeTrainingStreak(dates, today, target, frozen).count;
  const monday = weekStartOf(today);
  if (now === 0) return { weeks: 0, expiresWeek: monday };
  for (let k = 1; k <= MAX_LOOKAHEAD_WEEKS; k++) {
    const later = addDaysIso(today, 7 * k);
    if (computeTrainingStreak(dates, later, target, frozen).count === 0) return { weeks: now, expiresWeek: weekStartOf(later) };
  }
  return { weeks: now, expiresWeek: addDaysIso(monday, 7 * (MAX_LOOKAHEAD_WEEKS + 1)) };
}

/** Platí uložená séria v týždni `weekNow`? (zrkadlí podmienku v SQL funkcii rebríčka) */
export function cachedStreakValid(row: { streakWeeks: number; expiresWeek: string } | null | undefined, weekNow: string): boolean {
  return !!row && row.streakWeeks > 0 && row.expiresWeek > weekNow;
}
