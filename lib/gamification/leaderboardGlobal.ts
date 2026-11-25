// FitPilot — celoappkový rebríček (gamifikácia v2). Čisté funkcie — referenčná implementácia
// poradia, ktorú zrkadlí SQL funkcia gamification_global_leaderboard (0084) a ktorú testuje
// e2e/gamification-v2.spec.ts. Produkčné poradie počíta DB (rýchlo nad ohraničeným obdobím);
// tu je len dohodnutá sémantika:
//
//  - do poradia idú VŠETCI klienti aplikácie s účtom, ktorí sa nesmú skryť (opt-out),
//  - skrytí klienti sa vyfiltrujú PRED poradím (ich údaje sa nepoužijú vôbec),
//  - len kladné hodnoty (nikto nie je „posledný s nulou“),
//  - súťažné poradie 1, 1, 3 (zhoda = rovnaké miesto), pri zhode stabilne podľa id,
//  - TOP N + poradie volajúceho (aj mimo TOP N) + celkový počet v poradí,
//  - metriky: tréningy tento týždeň / mesiac, séria týždňov, rekordy tento mesiac — nikdy váha ani kalórie.

import type { Board, BoardRow, LeaderboardMetric } from "./leaderboard";
import { displayNickname } from "./nickname";
import { normalizeTitleLevel } from "./rewards";

export const GLOBAL_TOP_N = 10;

export interface GlobalClient {
  clientId: string;
  /** false = klient sa v rebríčku skryl (opt-out) */
  visible: boolean;
  workoutsWeek: number;
  workoutsMonth: number;
  streakWeeks: number;
  prsMonth: number;
}

export interface RankedRow {
  id: string;
  rank: number;
  value: number;
}

export interface GlobalRanking {
  /** najlepších N (v poradí; pri zhode hodnoty rovnaké miesto) */
  top: RankedRow[];
  /** poradie volajúceho (aj mimo TOP N); null = nie je v poradí (skrytý alebo bez kladnej hodnoty) */
  me: RankedRow | null;
  total: number;
}

export function rankGlobal(clients: GlobalClient[], metric: LeaderboardMetric, meClientId: string, topN: number = GLOBAL_TOP_N): GlobalRanking {
  const rows = clients
    .filter((c) => c.visible)
    .map((c) => ({ id: c.clientId, value: c[metric] }))
    .filter((c) => c.value > 0)
    .sort((a, b) => b.value - a.value || a.id.localeCompare(b.id));
  const ranked: RankedRow[] = [];
  rows.forEach((r, i) => ranked.push({ id: r.id, value: r.value, rank: i > 0 && rows[i - 1].value === r.value ? ranked[i - 1].rank : i + 1 }));
  return { top: ranked.slice(0, topN), me: ranked.find((r) => r.id === meClientId) ?? null, total: ranked.length };
}

/**
 * Zloží verejný tvar poradia: len prezývka, hodnota a príznak „to som ja“ — nikdy id ani celé meno.
 * `names` = id → { nickname, fullName } len pre klientov v TOP N.
 */
export function toPublicBoard(
  metric: LeaderboardMetric,
  ranking: GlobalRanking,
  meClientId: string,
  names: ReadonlyMap<string, { nickname: string | null; fullName: string | null; title?: number | null }>,
  fallbackName = "—",
): Board {
  const top: BoardRow[] = ranking.top.map((r) => {
    const n = names.get(r.id);
    return { rank: r.rank, name: displayNickname(n?.nickname, n?.fullName, fallbackName), value: r.value, isMe: r.id === meClientId, title: normalizeTitleLevel(n?.title) };
  });
  return { metric, top, me: ranking.me ? { rank: ranking.me.rank, value: ranking.me.value } : null, total: ranking.total };
}
