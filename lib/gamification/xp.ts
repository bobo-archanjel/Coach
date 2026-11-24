// FitPilot — XP a úrovne klienta (gamifikácia, fáza A). Čisté funkcie.
//
// XP sa NIKDY neukladá a klient ho nemôže zapísať: počíta sa deterministicky z dát
// (dokončené tréningy, dni so zápisom jedla) a z udalostí v client_achievements
// (rekordy, odznaky). Zmena pravidiel = prepočet, žiadna migrácia.

import { BADGES, type BadgeRarity } from "./badges";

export const XP_WORKOUT = 50;
export const XP_FOOD_DAY = 10;
export const XP_PR = 25;
export const XP_BADGE: Record<BadgeRarity, number> = { common: 20, rare: 50, epic: 100 };

export interface XpInput {
  workouts: number;
  foodDays: number;
  prs: number;
  badgeIds: Iterable<string>;
}

export interface XpBreakdown {
  total: number;
  workouts: number;
  food: number;
  prs: number;
  badges: number;
}

const RARITY_BY_ID = new Map(BADGES.map((b) => [b.id, b.rarity]));

export function computeXp(input: XpInput): XpBreakdown {
  const workouts = Math.max(0, input.workouts) * XP_WORKOUT;
  const food = Math.max(0, input.foodDays) * XP_FOOD_DAY;
  const prs = Math.max(0, input.prs) * XP_PR;
  let badges = 0;
  // odznak, ktorý už nie je v katalógu (alebo cudzí kľúč), XP nedáva; duplicity sa nerátajú
  for (const id of new Set(input.badgeIds)) {
    const rarity = RARITY_BY_ID.get(id);
    if (rarity) badges += XP_BADGE[rarity];
  }
  return { total: workouts + food + prs + badges, workouts, food, prs, badges };
}

export type LevelId = "bronze" | "silver" | "gold" | "platinum" | "diamond";

/** Spodné hranice úrovní (XP). */
export const LEVELS: readonly { id: LevelId; from: number }[] = [
  { id: "bronze", from: 0 },
  { id: "silver", from: 500 },
  { id: "gold", from: 1500 },
  { id: "platinum", from: 4000 },
  { id: "diamond", from: 10000 },
];

export interface LevelInfo {
  xp: number;
  level: LevelId;
  /** 1-based poradie úrovne */
  index: number;
  /** XP získané v rámci aktuálnej úrovne */
  into: number;
  /** šírka aktuálnej úrovne; null = najvyššia úroveň */
  span: number | null;
  next: LevelId | null;
  /** 0–1 postup k ďalšej úrovni (najvyššia = 1) */
  fraction: number;
  /** XP do ďalšej úrovne; null = najvyššia */
  toNext: number | null;
}

export function levelFor(xp: number): LevelInfo {
  const total = Math.max(0, Math.floor(xp));
  let i = 0;
  for (let k = 0; k < LEVELS.length; k++) if (total >= LEVELS[k].from) i = k;
  const cur = LEVELS[i];
  const next = LEVELS[i + 1] ?? null;
  const span = next ? next.from - cur.from : null;
  const into = total - cur.from;
  return {
    xp: total,
    level: cur.id,
    index: i + 1,
    into,
    span,
    next: next?.id ?? null,
    fraction: span ? Math.min(1, into / span) : 1,
    toNext: next ? next.from - total : null,
  };
}
