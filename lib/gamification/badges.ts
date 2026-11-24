// FitPilot — katalóg odznakov klienta (gamifikácia, fáza A + v2). Čisté funkcie, žiadna DB.
// Texty (názov, popis) sú v messages/<jazyk>/gamification.json pod `badges.<id>.name|desc`,
// tu sú len kľúče, ikona a pravidlo.
//
// Zásady (rovnaké ako lib/portal/streak.ts):
//  - tréning po TÝŽDŇOCH, jedlo po DNIACH so zápisom aspoň jednej položky,
//  - nikdy odznak za trafenie kalórií alebo chudnutie,
//  - jedno vynechanie sa toleruje (runLength zo streak.ts), pozitívne a bez hanenia.
//
// v2: rodiny odznakov majú stupne bronz / striebro / zlato (workouts, streak, volume, prs, food),
// pribudli zábavné odznaky z času dokončenia tréningu a z pestrosti (Nočná sova, Ranné vtáča,
// Víkendový bojovník, Comeback, Tank, Všestranný, Pondelková sila) a sezónne skryté odznaky.
// Staré ID z fázy A zostávajú v DB platné: `normalizeBadgeIds` ich premapuje na stupne,
// takže nič sa neoslavuje dvakrát a získané odznaky sa nestrácajú.
//
// Idempotencia: `missingBadges(stats, owned)` vráti len odznaky, ktoré sú splnené a ešte
// nie sú pripísané — server ich vloží s UNIQUE (client_id, badge_id), takže opakované
// vyhodnotenie nič nezdvojí.

import { addDaysIso, diffDays, weekStartOf } from "@/lib/reports/period";
import { runLength } from "@/lib/portal/streak";

export type BadgeCategory = "endurance" | "strength" | "nutrition" | "progress" | "fun" | "hidden";
export type BadgeRarity = "common" | "rare" | "epic";
export type BadgeTier = "bronze" | "silver" | "gold";
/** Čo na zápise môže odznak zmeniť — podľa toho server vie, ktoré dáta načítať. */
export type BadgeTrigger = "workout" | "food" | "body";
export type BadgeIcon =
  | "spark"
  | "dumbbell"
  | "flame"
  | "trophy"
  | "weight"
  | "leaf"
  | "ruler"
  | "map"
  | "star"
  | "moon"
  | "sun"
  | "calendar"
  | "bolt"
  | "shield"
  | "grid"
  | "gift"
  | "egg";
/** Jednotka postupu v texte „Ešte 3 tréningy do …“ (i18n gamification.next.units.*). */
export type ProgressUnit =
  | "workouts"
  | "weeks"
  | "tons"
  | "prs"
  | "days"
  | "nights"
  | "mornings"
  | "weekends"
  | "exercises"
  | "mondays"
  | "measurements";

export interface BadgeStats {
  /** dokončené tréningy (workout_logs) */
  workoutCount: number;
  /** najdlhšia séria tréningových týždňov (s toleranciou jedného vynechania) */
  bestTrainingStreakWeeks: number;
  /** počet osobných rekordov */
  prCount: number;
  /** celkový objem v kg (kg × opakovania) */
  totalVolumeKg: number;
  /** najdlhšia séria dní so zapísaným jedlom */
  bestFoodStreakDays: number;
  /** existuje týždeň s cieľom bielkovín splneným aspoň 5 dní */
  proteinWeek: boolean;
  /** počet meraní tela */
  bodyMetricCount: number;
  /** existuje plán (aspoň 2 dni), ktorého každý deň klient aspoň raz odcvičil */
  planAllDaysDone: boolean;
  /** tréning 31. 12. alebo 1. 1. */
  newYearWorkout: boolean;
  // ---- v2 ----
  /** tréningy dokončené po 21:00 (miestny čas) */
  nightWorkouts: number;
  /** tréningy dokončené pred 8:00 (miestny čas) — completed_at je len čas dokončenia */
  earlyWorkouts: number;
  /** víkendy, v ktorých klient cvičil aj v sobotu, aj v nedeľu */
  weekendDoubles: number;
  /** tréning po pauze aspoň 14 dní */
  comeback: boolean;
  /** najväčší objem jedného tréningu (kg) */
  maxWorkoutVolumeKg: number;
  /** počet rôznych cvikov v histórii */
  distinctExercises: number;
  /** počet rôznych týždňov, v ktorých klient cvičil v pondelok */
  mondayWeeks: number;
  /** tréning vo veľkonočnom týždni (pondelok pred Veľkou nocou – Veľkonočný pondelok) */
  easterWeekWorkout: boolean;
  /** tréning 24.–26. 12. */
  christmasWorkout: boolean;
}

export const EMPTY_BADGE_STATS: BadgeStats = {
  workoutCount: 0,
  bestTrainingStreakWeeks: 0,
  prCount: 0,
  totalVolumeKg: 0,
  bestFoodStreakDays: 0,
  proteinWeek: false,
  bodyMetricCount: 0,
  planAllDaysDone: false,
  newYearWorkout: false,
  nightWorkouts: 0,
  earlyWorkouts: 0,
  weekendDoubles: 0,
  comeback: false,
  maxWorkoutVolumeKg: 0,
  distinctExercises: 0,
  mondayWeeks: 0,
  easterWeekWorkout: false,
  christmasWorkout: false,
};

export interface BadgeDef {
  id: string;
  category: BadgeCategory;
  icon: BadgeIcon;
  rarity: BadgeRarity;
  /** rodina so stupňami (workouts, streak, …); samostatné odznaky ju nemajú */
  family?: string;
  tier?: BadgeTier;
  /** skrytý odznak ukazuje „???“, kým ho klient nezíska */
  hidden?: boolean;
  trigger: BadgeTrigger;
  rule: (s: BadgeStats) => boolean;
  /** pre galériu: hodnota a cieľ (pásik postupu); chýba pri odznakoch typu áno/nie */
  progress?: (s: BadgeStats) => { value: number; goal: number };
  /** jednotka pre text „Ešte N … do …“ */
  unit?: ProgressUnit;
}

// ---------- stupne rodín ----------
export const TIER_ORDER: readonly BadgeTier[] = ["bronze", "silver", "gold"];
export const TIER_RARITY: Record<BadgeTier, BadgeRarity> = { bronze: "common", silver: "rare", gold: "epic" };

export const WORKOUT_TIERS = [10, 50, 150] as const;
export const STREAK_TIERS = [4, 12, 26] as const;
export const VOLUME_TIERS_T = [10, 50, 200] as const;
export const PR_TIERS = [5, 25, 75] as const;
export const FOOD_TIERS = [7, 30, 100] as const;

/** Nočná sova: dokončené od 21:00 do 4:00; Ranné vtáča: od 4:00 do 8:00 (po polnoci ešte patrí do noci). */
export const NIGHT_HOUR_FROM = 21;
export const NIGHT_HOUR_UNTIL = 4;
export const EARLY_HOUR_BEFORE = 8;
export const NIGHT_GOAL = 5;
export const EARLY_GOAL = 5;
export const WEEKEND_GOAL = 4;
export const COMEBACK_PAUSE_DAYS = 14;
export const TANK_KG = 5000;
export const VERSATILE_GOAL = 15;
export const MONDAY_GOAL = 8;

const atLeast = (pick: (s: BadgeStats) => number, goal: number) => ({
  rule: (s: BadgeStats) => pick(s) >= goal,
  progress: (s: BadgeStats) => ({ value: Math.min(pick(s), goal), goal }),
});

function tiered(
  family: string,
  goals: readonly number[],
  category: BadgeCategory,
  icon: BadgeIcon,
  trigger: BadgeTrigger,
  pick: (s: BadgeStats) => number,
  unit: ProgressUnit,
  scale = 1,
): BadgeDef[] {
  return TIER_ORDER.map((tier, i) => ({
    id: `${family}_${tier}`,
    family,
    tier,
    category,
    icon,
    rarity: TIER_RARITY[tier],
    trigger,
    unit,
    ...atLeast(pick, goals[i] * scale),
  }));
}

const single = (
  id: string,
  category: BadgeCategory,
  icon: BadgeIcon,
  rarity: BadgeRarity,
  trigger: BadgeTrigger,
  rule: (s: BadgeStats) => boolean,
  extra: Partial<BadgeDef> = {},
): BadgeDef => ({ id, category, icon, rarity, trigger, rule, ...extra });

/**
 * Katalóg. Poradie = poradie v galérii.
 * „Ranné vtáča“ sa rátá z `completed_at` (čas DOKONČENIA tréningu) — workout_logs neukladá začiatok.
 */
export const BADGES: readonly BadgeDef[] = [
  // Vytrvalosť
  single("first_workout", "endurance", "spark", "common", "workout", (s) => s.workoutCount >= 1, {
    ...atLeast((s) => s.workoutCount, 1),
    unit: "workouts",
  }),
  ...tiered("workouts", WORKOUT_TIERS, "endurance", "dumbbell", "workout", (s) => s.workoutCount, "workouts"),
  ...tiered("streak", STREAK_TIERS, "endurance", "flame", "workout", (s) => s.bestTrainingStreakWeeks, "weeks"),
  // Sila
  single("first_pr", "strength", "trophy", "common", "workout", (s) => s.prCount >= 1, { ...atLeast((s) => s.prCount, 1), unit: "prs" }),
  ...tiered("prs", PR_TIERS, "strength", "trophy", "workout", (s) => s.prCount, "prs"),
  single("volume_1t", "strength", "weight", "common", "workout", (s) => s.totalVolumeKg >= 1000, {
    ...atLeast((s) => s.totalVolumeKg, 1000),
    unit: "tons",
  }),
  ...tiered("volume", VOLUME_TIERS_T, "strength", "weight", "workout", (s) => s.totalVolumeKg, "tons", 1000),
  // Strava
  ...tiered("food", FOOD_TIERS, "nutrition", "leaf", "food", (s) => s.bestFoodStreakDays, "days"),
  single("protein_week", "nutrition", "leaf", "rare", "food", (s) => s.proteinWeek),
  // Progres
  single("first_measurement", "progress", "ruler", "common", "body", (s) => s.bodyMetricCount >= 1, {
    ...atLeast((s) => s.bodyMetricCount, 1),
    unit: "measurements",
  }),
  single("plan_all_days", "progress", "map", "rare", "workout", (s) => s.planAllDaysDone),
  // Zábavné (z času dokončenia a pestrosti)
  single("night_owl", "fun", "moon", "rare", "workout", (s) => s.nightWorkouts >= NIGHT_GOAL, {
    ...atLeast((s) => s.nightWorkouts, NIGHT_GOAL),
    unit: "nights",
  }),
  single("early_bird", "fun", "sun", "rare", "workout", (s) => s.earlyWorkouts >= EARLY_GOAL, {
    ...atLeast((s) => s.earlyWorkouts, EARLY_GOAL),
    unit: "mornings",
  }),
  single("weekend_warrior", "fun", "calendar", "rare", "workout", (s) => s.weekendDoubles >= WEEKEND_GOAL, {
    ...atLeast((s) => s.weekendDoubles, WEEKEND_GOAL),
    unit: "weekends",
  }),
  single("comeback", "fun", "bolt", "rare", "workout", (s) => s.comeback),
  single("tank", "fun", "shield", "epic", "workout", (s) => s.maxWorkoutVolumeKg >= TANK_KG, {
    ...atLeast((s) => s.maxWorkoutVolumeKg, TANK_KG),
    unit: "tons",
  }),
  single("versatile", "fun", "grid", "rare", "workout", (s) => s.distinctExercises >= VERSATILE_GOAL, {
    ...atLeast((s) => s.distinctExercises, VERSATILE_GOAL),
    unit: "exercises",
  }),
  single("monday_power", "fun", "bolt", "rare", "workout", (s) => s.mondayWeeks >= MONDAY_GOAL, {
    ...atLeast((s) => s.mondayWeeks, MONDAY_GOAL),
    unit: "mondays",
  }),
  // Skryté (sezónne)
  single("new_year", "hidden", "star", "rare", "workout", (s) => s.newYearWorkout, { hidden: true }),
  single("easter_week", "hidden", "egg", "epic", "workout", (s) => s.easterWeekWorkout, { hidden: true }),
  single("christmas", "hidden", "gift", "epic", "workout", (s) => s.christmasWorkout, { hidden: true }),
];

export const BADGE_CATEGORIES: readonly BadgeCategory[] = ["endurance", "strength", "nutrition", "progress", "fun", "hidden"];

const BY_ID = new Map(BADGES.map((b) => [b.id, b]));
export function badgeById(id: string): BadgeDef | undefined {
  return BY_ID.get(id);
}

// ---------- migrácia starých ID (fáza A → v2) ----------

/**
 * Staré odznaky → stupeň novej rodiny (najvyšší stupeň, ktorého hranica nie je vyššia než stará).
 * Nezmenené (samostatné) odznaky tu nie sú: first_workout, first_pr, first_measurement, volume_1t,
 * protein_week, plan_all_days, new_year.
 */
export const LEGACY_BADGE_MAP: Readonly<Record<string, string>> = {
  workouts_10: "workouts_bronze",
  workouts_25: "workouts_bronze",
  workouts_50: "workouts_silver",
  workouts_100: "workouts_silver",
  workouts_250: "workouts_gold",
  streak_4w: "streak_bronze",
  streak_12w: "streak_silver",
  streak_26w: "streak_gold",
  streak_52w: "streak_gold",
  prs_10: "prs_bronze",
  volume_10t: "volume_bronze",
  volume_50t: "volume_silver",
  volume_100t: "volume_silver",
  food_streak_7: "food_bronze",
  food_streak_30: "food_silver",
};

/** Vzácnosť starých ID — XP za už získané odznaky sa po migrácii nemení. */
export const LEGACY_BADGE_RARITY: Readonly<Record<string, BadgeRarity>> = {
  workouts_10: "common",
  workouts_25: "common",
  workouts_50: "rare",
  workouts_100: "rare",
  workouts_250: "epic",
  streak_4w: "common",
  streak_12w: "rare",
  streak_26w: "epic",
  streak_52w: "epic",
  prs_10: "rare",
  volume_10t: "rare",
  volume_50t: "epic",
  volume_100t: "epic",
  food_streak_7: "common",
  food_streak_30: "rare",
};

/** ID z DB → ID z aktuálneho katalógu (staré premapuje, neznáme ponechá). */
export function canonicalBadgeId(id: string): string {
  return LEGACY_BADGE_MAP[id] ?? id;
}

/** Množina ID z DB → množina ID z katalógu (duplicity po premapovaní zaniknú). */
export function normalizeBadgeIds(ids: Iterable<string>): Set<string> {
  const out = new Set<string>();
  for (const id of ids) out.add(canonicalBadgeId(id));
  return out;
}

/** Dátum získania po premapovaní: pri zlúčení starých ID platí najskorší. */
export function normalizeEarnedOn(earned: Iterable<[string, string]>): Map<string, string> {
  const out = new Map<string, string>();
  for (const [id, date] of earned) {
    const canon = canonicalBadgeId(id);
    const prev = out.get(canon);
    if (!prev || date < prev) out.set(canon, date);
  }
  return out;
}

/** Splnené podľa štatistík (bez ohľadu na to, či už sú pripísané). */
export function satisfiedBadges(stats: BadgeStats): string[] {
  return BADGES.filter((b) => b.rule(stats)).map((b) => b.id);
}

/**
 * Splnené a ešte nepripísané — to je celé „idempotentné pripisovanie“. `owned` sa berie po premapovaní
 * starých ID, takže klient so starým `workouts_25` nedostane `workouts_bronze` znova.
 */
export function missingBadges(stats: BadgeStats, owned: ReadonlySet<string>, triggers?: readonly BadgeTrigger[]): string[] {
  const have = normalizeBadgeIds(owned);
  return BADGES.filter((b) => (!triggers || triggers.includes(b.trigger)) && !have.has(b.id) && b.rule(stats)).map((b) => b.id);
}

/** Odznaky, ktoré ešte nie sú pripísané — server podľa nich vie, či má vôbec načítať dáta. */
export function unownedBadges(owned: ReadonlySet<string>, trigger: BadgeTrigger): BadgeDef[] {
  const have = normalizeBadgeIds(owned);
  return BADGES.filter((b) => b.trigger === trigger && !have.has(b.id));
}

/** Skrytý odznak sa odhalí až po získaní; ostatné sú viditeľné vždy. */
export function isBadgeRevealed(def: BadgeDef, earned: boolean): boolean {
  return !def.hidden || earned;
}

/** Odznaky pre galériu po kategóriách: získané (s dátumom) aj zamknuté, skryté zamknuté bez prezradenia. */
export interface BadgeView {
  id: string;
  category: BadgeCategory;
  icon: BadgeIcon;
  rarity: BadgeRarity;
  family: string | null;
  tier: BadgeTier | null;
  earned: boolean;
  earnedOn: string | null;
  /** false = v UI „???“ namiesto názvu a popisu */
  revealed: boolean;
  /** postup k odznaku (z aktuálnych štatistík); null = odznak typu áno/nie alebo už získaný */
  progress: { value: number; goal: number; unit: ProgressUnit | null } | null;
}

export function buildBadgeViews(earnedOn: ReadonlyMap<string, string>, stats?: BadgeStats): BadgeView[] {
  const earnedNorm = normalizeEarnedOn(earnedOn);
  return BADGES.map((b) => {
    const date = earnedNorm.get(b.id) ?? null;
    const prog = date == null && stats && b.progress && !b.hidden ? b.progress(stats) : null;
    return {
      id: b.id,
      category: b.category,
      icon: b.icon,
      rarity: b.rarity,
      family: b.family ?? null,
      tier: b.tier ?? null,
      earned: date != null,
      earnedOn: date,
      revealed: isBadgeRevealed(b, date != null),
      progress: prog ? { ...prog, unit: b.unit ?? null } : null,
    };
  });
}

// ---------- „Ešte N do …“ ----------

export interface NextBadge {
  id: string;
  value: number;
  goal: number;
  /** koľko chýba (v jednotke postupu; pri tonách v kg) */
  remaining: number;
  /** 0–1 */
  fraction: number;
  unit: ProgressUnit;
}

/**
 * Najbližšie odznaky: z každej rodiny len nasledujúci nezískaný stupeň, ďalej samostatné odznaky s postupom;
 * zoradené od najbližšieho (najvyšší podiel). Skryté odznaky sa nikdy neprezradzú.
 */
export function nextBadges(stats: BadgeStats, owned: ReadonlySet<string>, limit = 3, only?: (def: BadgeDef) => boolean): NextBadge[] {
  const have = normalizeBadgeIds(owned);
  const seenFamily = new Set<string>();
  const out: NextBadge[] = [];
  for (const b of BADGES) {
    if (b.hidden || !b.progress || !b.unit || have.has(b.id) || (only && !only(b))) continue;
    if (b.family) {
      if (seenFamily.has(b.family)) continue;
      seenFamily.add(b.family);
    }
    const { value, goal } = b.progress(stats);
    if (goal <= 0 || value >= goal) continue;
    out.push({ id: b.id, value, goal, remaining: goal - value, fraction: value / goal, unit: b.unit });
  }
  return out.sort((a, b) => b.fraction - a.fraction || a.id.localeCompare(b.id)).slice(0, limit);
}

/** Zjednodušený pohľad na jedno ID (pre kartu „Ešte N do …“): hodnota v zobrazovanej jednotke. */
export function displayAmount(unit: ProgressUnit, amount: number): number {
  return unit === "tons" ? Math.round((amount / 1000) * 10) / 10 : Math.round(amount);
}

// ---------- najdlhšie série z histórie (pre odznaky; aktuálna séria je v streak.ts) ----------

/**
 * Najdlhšia séria z chronologického poľa „splnená jednotka?“ (od najstaršej) — rovnaké
 * pravidlá ako runLength (jedno vynechanie sa toleruje). Okno 120 jednotiek stačí na
 * odznaky do 100 dní / 52 týždňov.
 */
export function bestRun(chronological: boolean[], window = 120): number {
  let best = 0;
  for (let i = 0; i < chronological.length; i++) {
    if (!chronological[i]) continue;
    const back: boolean[] = [];
    for (let k = i; k >= 0 && back.length < window; k--) back.push(chronological[k]);
    best = Math.max(best, runLength(back).count);
  }
  return best;
}

/** Najdlhšia séria tréningových týždňov (≥ `target` odlišných dní v týždni). */
export function bestTrainingStreakWeeks(trainedDates: Iterable<string>, today: string, target: number): number {
  const daysByWeek = new Map<string, Set<string>>();
  let earliest = today;
  for (const d of trainedDates) {
    if (d < earliest) earliest = d;
    const week = weekStartOf(d);
    const set = daysByWeek.get(week) ?? new Set<string>();
    set.add(d);
    daysByWeek.set(week, set);
  }
  const first = weekStartOf(earliest);
  const weeks = Math.floor(diffDays(first, weekStartOf(today)) / 7) + 1;
  const chrono: boolean[] = [];
  for (let k = 0; k < weeks; k++) chrono.push((daysByWeek.get(addDaysIso(first, 7 * k))?.size ?? 0) >= target);
  return bestRun(chrono);
}

/** Najdlhšia séria dní so zapísaným jedlom. */
export function bestFoodStreakDays(foodDates: Iterable<string>, today: string): number {
  const set = new Set(foodDates);
  if (set.size === 0) return 0;
  const first = [...set].sort()[0];
  const days = diffDays(first, today) + 1;
  const chrono: boolean[] = [];
  for (let k = 0; k < days; k++) chrono.push(set.has(addDaysIso(first, k)));
  return bestRun(chrono);
}

/** Existuje týždeň (po–ne), v ktorom bolo aspoň 5 dní s cieľom bielkovín splneným? */
export function hasProteinWeek(metDates: Iterable<string>, minDays = 5): boolean {
  const byWeek = new Map<string, number>();
  for (const d of new Set(metDates)) {
    const w = weekStartOf(d);
    byWeek.set(w, (byWeek.get(w) ?? 0) + 1);
  }
  return [...byWeek.values()].some((n) => n >= minDays);
}

/** Tréning 31. 12. alebo 1. 1. (ktorýkoľvek rok). */
export function hasNewYearWorkout(trainedDates: Iterable<string>): boolean {
  for (const d of trainedDates) {
    const md = d.slice(5, 10);
    if (md === "12-31" || md === "01-01") return true;
  }
  return false;
}

/** Tréning 24.–26. 12. (ktorýkoľvek rok). */
export function hasChristmasWorkout(trainedDates: Iterable<string>): boolean {
  for (const d of trainedDates) {
    const md = d.slice(5, 10);
    if (md === "12-24" || md === "12-25" || md === "12-26") return true;
  }
  return false;
}

/** Plán (aspoň 2 dni), ktorého každý deň má aspoň jeden zápis. */
export function hasCompletedPlan(plans: { dayIds: string[] }[], doneDayIds: ReadonlySet<string>): boolean {
  return plans.some((p) => p.dayIds.length >= 2 && p.dayIds.every((id) => doneDayIds.has(id)));
}

// ---------- zábavné odznaky ----------

const HOUR_FORMAT = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: "Europe/Bratislava" });

/** Hodina (0–23) okamihu v miestnom čase (Bratislava = Praha); neplatný vstup → null. */
export function localHour(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const h = Number(HOUR_FORMAT.format(new Date(t)));
  return Number.isInteger(h) ? h : null;
}

/** Počet tréningov dokončených v noci (21:00–4:00) a skoro ráno (4:00–8:00) podľa completed_at. */
export function countTimeOfDay(completedAts: Iterable<string | null | undefined>): { night: number; early: number } {
  let night = 0;
  let early = 0;
  for (const c of completedAts) {
    const h = localHour(c);
    if (h == null) continue;
    if (h >= NIGHT_HOUR_FROM || h < NIGHT_HOUR_UNTIL) night++;
    else if (h < EARLY_HOUR_BEFORE) early++;
  }
  return { night, early };
}

function weekday(iso: string): number {
  // 0 = nedeľa … 6 = sobota
  return new Date(`${iso}T12:00:00Z`).getUTCDay();
}

/** Víkendy so sobotným AJ nedeľným tréningom. */
export function countWeekendDoubles(trainedDates: Iterable<string>): number {
  const set = new Set(trainedDates);
  let n = 0;
  for (const d of set) if (weekday(d) === 0 && set.has(addDaysIso(d, -1))) n++;
  return n;
}

/** Tréning po pauze aspoň `pause` dní (dni medzi dvoma tréningami bez tréningu). */
export function hasComeback(trainedDates: Iterable<string>, pause = COMEBACK_PAUSE_DAYS): boolean {
  const sorted = [...new Set(trainedDates)].sort();
  for (let i = 1; i < sorted.length; i++) if (diffDays(sorted[i - 1], sorted[i]) - 1 >= pause) return true;
  return false;
}

/** Počet rôznych týždňov s tréningom v pondelok. */
export function countMondayWeeks(trainedDates: Iterable<string>): number {
  const weeks = new Set<string>();
  for (const d of trainedDates) if (weekday(d) === 1) weeks.add(d);
  return weeks.size;
}

/** Veľkonočná nedeľa (gregoriánsky kalendár, algoritmus Meeus/Jones/Butcher). */
export function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Veľkonočný týždeň: pondelok pred Veľkou nocou až Veľkonočný pondelok. */
export function isEasterWeek(isoDate: string): boolean {
  const easter = easterSunday(Number(isoDate.slice(0, 4)));
  return isoDate >= addDaysIso(easter, -6) && isoDate <= addDaysIso(easter, 1);
}

export function hasEasterWeekWorkout(trainedDates: Iterable<string>): boolean {
  for (const d of trainedDates) if (isEasterWeek(d)) return true;
  return false;
}
