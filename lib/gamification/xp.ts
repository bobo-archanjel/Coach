// FitPilot — XP a úrovne klienta (gamifikácia, fáza A). Čisté funkcie.
//
// XP sa NIKDY neukladá a klient ho nemôže zapísať: počíta sa deterministicky z dát
// (dokončené tréningy, dni so zápisom jedla) a z udalostí v client_achievements
// (rekordy, odznaky). Zmena pravidiel = prepočet, žiadna migrácia.

import { BADGES, LEGACY_BADGE_RARITY, type BadgeRarity } from "./badges";

export const XP_WORKOUT = 50;
export const XP_FOOD_DAY = 10;
export const XP_PR = 25;
export const XP_BADGE: Record<BadgeRarity, number> = { common: 20, rare: 50, epic: 100 };
/** XP za splnenú týždennú misiu a bonus za všetky tri v jednom týždni (lib/gamification/missions.ts). */
export const XP_MISSION_BONUS = 50;

export interface XpInput {
  workouts: number;
  foodDays: number;
  prs: number;
  badgeIds: Iterable<string>;
  /** súčet XP zo splnených týždenných misií vrátane bonusu (ukladá ho server pri splnení) */
  missionXp?: number;
}

export interface XpBreakdown {
  total: number;
  workouts: number;
  food: number;
  prs: number;
  badges: number;
  missions: number;
}

// Staré ID odznakov z fázy A (workouts_25, streak_4w…) ostávajú v DB, preto sa XP za ne
// počíta podľa ich pôvodnej vzácnosti — migrácia na stupne nezmení klientovi XP.
const RARITY_BY_ID = new Map<string, BadgeRarity>([
  ...Object.entries(LEGACY_BADGE_RARITY),
  ...BADGES.map((b) => [b.id, b.rarity] as [string, BadgeRarity]),
]);

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
  const missions = Math.max(0, Math.floor(input.missionXp ?? 0));
  return { total: workouts + food + prs + badges + missions, workouts, food, prs, badges, missions };
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

// ---------- 20 úrovní (v2) ----------
// Skupiny Bronz…Diamant ostávajú (LEVELS vyššie) a každá obsahuje 4 úrovne s vlastným názvom:
// 1–4 Bronz, 5–8 Striebro, 9–12 Zlato, 13–16 Platina, 17–20 Diamant. Hranice skupín
// sú rovnaké ako predtým (500 / 1500 / 4000 / 10000 XP), takže existujúce XP dáva rovnakú skupinu.

/** Spodné hranice 20 úrovní (XP). Šírka úrovne plynule rastie: 100 → 1650 → 3000. */
export const LEVEL_FROM: readonly number[] = [
  0, 100, 220, 360, 500, 680, 900, 1180, 1500, 2020, 2620, 3270, 4000, 5300, 6750, 8350, 10000, 12400, 15000, 18000,
];
export const MAX_LEVEL = LEVEL_FROM.length;

export interface LevelDetail {
  xp: number;
  /** 1–20 */
  n: number;
  /** skupina Bronz…Diamant, do ktorej úroveň patrí */
  group: LevelId;
  /** XP získané v rámci aktuálnej úrovne */
  into: number;
  /** šírka aktuálnej úrovne; null = najvyššia */
  span: number | null;
  /** XP do ďalšej úrovne; null = najvyššia */
  toNext: number | null;
  /** 0–1 postup k ďalšej úrovni (najvyššia = 1) */
  fraction: number;
  /** číslo ďalšej úrovne; null = najvyššia */
  nextN: number | null;
}

export function groupOfLevel(n: number): LevelId {
  return LEVELS[Math.min(LEVELS.length - 1, Math.max(0, Math.floor((n - 1) / 4)))].id;
}

/** Podrobná úroveň (1–20) z XP — pre názov úrovne, pásik postupu a odmeny. */
export function levelDetail(xp: number): LevelDetail {
  const total = Math.max(0, Math.floor(xp));
  let i = 0;
  for (let k = 0; k < LEVEL_FROM.length; k++) if (total >= LEVEL_FROM[k]) i = k;
  const next = LEVEL_FROM[i + 1];
  const span = next != null ? next - LEVEL_FROM[i] : null;
  const into = total - LEVEL_FROM[i];
  return {
    xp: total,
    n: i + 1,
    group: groupOfLevel(i + 1),
    into,
    span,
    toNext: next != null ? next - total : null,
    fraction: span ? Math.min(1, into / span) : 1,
    nextN: next != null ? i + 2 : null,
  };
}
