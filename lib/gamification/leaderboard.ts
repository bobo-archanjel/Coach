// FitPilot — rebríček klientov jedného trénera (gamifikácia, fáza B). Čisté funkcie
// (testy: e2e/gamification-b.spec.ts); dáta a oprávnenia rieši lib/gamification/leaderboardServer.ts.
//
// Zásady:
//  - len tieto metriky: tréningy tento týždeň / mesiac, aktuálna séria tréningových týždňov
//    a rekordy tento mesiac — NIKDY podľa váhy, chudnutia ani kalórií,
//  - klient sa vidí len ako „krstné meno + iniciála priezviska“ a číslo metriky,
//  - klient, ktorý sa skryl (opt-out), v rebríčku nie je a rebríček ani nevidí (vzájomnosť),
//  - do poradia idú len kladné hodnoty (nikto nie je „posledný s nulou“).

import { TRAINING_WEEK_TARGET, runLength } from "@/lib/portal/streak";
import { addDaysIso, weekStartOf } from "@/lib/reports/period";

export const LEADERBOARD_METRICS = ["workoutsWeek", "workoutsMonth", "streakWeeks", "prsMonth"] as const;
export type LeaderboardMetric = (typeof LEADERBOARD_METRICS)[number];

export function isLeaderboardMetric(v: unknown): v is LeaderboardMetric {
  return typeof v === "string" && (LEADERBOARD_METRICS as readonly string[]).includes(v);
}

/** Koľko najlepších sa zobrazí. */
export const LEADERBOARD_TOP_N = 10;
/** Okno týždňov pre sériu. */
export const STREAK_WINDOW_WEEKS = 52;

/** „Jana Nováková“ → „Jana N.“; jedno slovo ostane; prázdne → null (volajúci použije náhradu). */
export function maskName(fullName: string | null | undefined): string | null {
  const parts = (fullName ?? "")
    .replace(/[^\p{L}\p{M}\s'’.-]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return null;
  const first = [...parts[0]].slice(0, 20).join("");
  if (parts.length === 1) return first;
  const initial = [...parts[parts.length - 1]][0]?.toLocaleUpperCase("sk");
  return initial ? `${first} ${initial}.` : first;
}

/** Týždeň → počet odlišných tréningových dní. Séria = po sebe idúce týždne s ≥ cieľ dňami (tolerancia 1 vynechania ako inde). */
export function streakFromWeeks(
  weekDays: ReadonlyMap<string, number>,
  today: string,
  target: number = TRAINING_WEEK_TARGET,
): number {
  const thisMonday = weekStartOf(today);
  const qualifies: boolean[] = [];
  for (let k = 0; k < STREAK_WINDOW_WEEKS; k++) {
    qualifies.push((weekDays.get(addDaysIso(thisMonday, -7 * k)) ?? 0) >= target);
  }
  return runLength(qualifies).count;
}

export interface BoardClient {
  clientId: string;
  fullName: string;
  /** false = klient sa v rebríčku skryl */
  visible: boolean;
  workoutsWeek: number;
  workoutsMonth: number;
  streakWeeks: number;
  prsMonth: number;
}

export interface BoardRow {
  rank: number;
  name: string;
  value: number;
  isMe: boolean;
  /** zvolený titul = číslo úrovne 10–20 (text titulu je v i18n); len titul, nič osobné */
  title?: number | null;
}

export interface Board {
  metric: LeaderboardMetric;
  /** najlepších N (pri zhode hodnoty rovnaké poradie) */
  top: BoardRow[];
  /** poradie volajúceho (aj mimo top N); null = nemá kladnú hodnotu */
  me: { rank: number; value: number } | null;
  /** koľko ľudí je v poradí (kladná hodnota, viditeľní) */
  total: number;
}

/**
 * Poradie pre metriku. Skrytí klienti sa vyfiltrujú PRED poradím (ich údaje sa nepoužijú vôbec).
 * Súťažné poradie 1, 1, 3 (zhoda = rovnaké miesto); pri zhode abecedne podľa mena (stabilné).
 * Do výstupu ide len maskované meno a hodnota — nikdy clientId ani celé meno.
 */
export function buildLeaderboard(
  clients: BoardClient[],
  metric: LeaderboardMetric,
  meClientId: string,
  topN: number = LEADERBOARD_TOP_N,
): Board {
  const rows = clients
    .filter((c) => c.visible)
    .map((c) => ({ id: c.clientId, name: maskName(c.fullName) ?? "—", value: c[metric] }))
    .filter((c) => c.value > 0)
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, "sk"));

  const ranked: (BoardRow & { id: string })[] = [];
  rows.forEach((r, i) => {
    const rank = i > 0 && rows[i - 1].value === r.value ? ranked[i - 1].rank : i + 1;
    ranked.push({ id: r.id, rank, name: r.name, value: r.value, isMe: r.id === meClientId });
  });

  const mine = ranked.find((r) => r.isMe);
  return {
    metric,
    top: ranked.slice(0, topN).map(({ id: _id, ...row }) => row),
    me: mine ? { rank: mine.rank, value: mine.value } : null,
    total: ranked.length,
  };
}
