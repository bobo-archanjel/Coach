// FitPilot — odmeny za úrovne (gamifikácia v2). Čisté funkcie, žiadna DB.
//
//  - rámiky avatara (CSS kruhy/gradienty okolo iniciály v hlavičke portálu),
//  - farebné témy portálu pre klienta — len keď tréner NEMÁ aktívnu značku (značka vždy vyhráva). Klientom so
//    značkou sa sekcia tém nezobrazuje vôbec; namiesto nich (na rovnakých úrovniach 3, 7, 10, 13, 17) majú
//    odmeny, ktoré sa so značkou nehádajú: animované rámiky (Žiara, Plameň), štýl osláv (Hviezdy, Ohňostroj)
//    a titul v rebríčku. Tieto odmeny dostávajú aj klienti bez značky — témy sú pre nich navyše,
//  - zmrazenia série (streak freeze): +1 za každú 4. úroveň (4, 8, 12, 16, 20) a za týždeň,
//    v ktorom klient splnil všetky tri misie; uložené max. 2.
//
// Klient si vyberá aktívny rámik a tému na stránke Úspechy. Server overí, že úroveň odomknutie dovoľuje.

export const FRAME_IDS = ["none", "ember", "glow", "mint", "steel", "gold", "aurora", "prism", "flame", "olympus"] as const;
export type FrameId = (typeof FRAME_IDS)[number];

export const THEME_IDS = ["default", "ocean", "forest", "sunset", "violet", "graphite"] as const;
export type ThemeId = (typeof THEME_IDS)[number];

/** Od ktorej úrovne je rámik / téma odomknutá (none a default od začiatku). */
export const FRAME_LEVEL: Readonly<Record<FrameId, number>> = {
  none: 1,
  ember: 2,
  glow: 3,
  mint: 4,
  steel: 6,
  gold: 9,
  aurora: 12,
  prism: 15,
  flame: 13,
  olympus: 20,
};

export const THEME_LEVEL: Readonly<Record<ThemeId, number>> = {
  default: 1,
  ocean: 3,
  forest: 7,
  sunset: 10,
  violet: 13,
  graphite: 17,
};

/** Animované rámiky (jemný pohyb len transform/opacity; pri prefers-reduced-motion statické). */
export const ANIMATED_FRAMES: readonly FrameId[] = ["glow", "flame", "aurora", "prism", "olympus"];
/** Od koľkých týždňov série sa rámik Plameň sám rozžiari silnejšie. */
export const FLAME_HOT_STREAK = 8;

/** Štýl oslavy rekordu / úrovne / splnenej misie. */
export const CELEBRATION_IDS = ["confetti", "stars", "fireworks"] as const;
export type CelebrationId = (typeof CELEBRATION_IDS)[number];
export const CELEBRATION_LEVEL: Readonly<Record<CelebrationId, number>> = {
  confetti: 1,
  stars: 7,
  fireworks: 17,
};

/** Titul vedľa prezývky v celoappkovom rebríčku: od úrovne 10 si klient vyberie titul ktorejkoľvek úrovne 10 až aktuálna. */
export const TITLE_MIN_LEVEL = 10;
export const TITLE_MAX_LEVEL = 20;

/** Úrovne, ktoré dávajú zmrazenie série. */
export const FREEZE_LEVELS: readonly number[] = [4, 8, 12, 16, 20];
/** Najviac uložených zmrazení naraz. */
export const MAX_STORED_FREEZES = 2;

export function isFrameId(v: unknown): v is FrameId {
  return typeof v === "string" && (FRAME_IDS as readonly string[]).includes(v);
}
export function isThemeId(v: unknown): v is ThemeId {
  return typeof v === "string" && (THEME_IDS as readonly string[]).includes(v);
}

export function isCelebrationId(v: unknown): v is CelebrationId {
  return typeof v === "string" && (CELEBRATION_IDS as readonly string[]).includes(v);
}
/** Číslo úrovne, ktorej titul sa dá zvoliť (celé číslo 10–20); inak null. */
export function normalizeTitleLevel(v: unknown): number | null {
  return typeof v === "number" && Number.isInteger(v) && v >= TITLE_MIN_LEVEL && v <= TITLE_MAX_LEVEL ? v : null;
}
export function celebrationUnlocked(c: CelebrationId, level: number): boolean {
  return level >= CELEBRATION_LEVEL[c];
}
export function unlockedCelebrations(level: number): CelebrationId[] {
  return CELEBRATION_IDS.filter((c) => celebrationUnlocked(c, level));
}
/** Titul úrovne `titleLevel` je dostupný, keď ho klient dosiahol a má ≥ úroveň 10. */
export function titleUnlocked(titleLevel: number, level: number): boolean {
  return normalizeTitleLevel(titleLevel) != null && titleLevel <= level;
}
/** Dostupné tituly (čísla úrovní) — pre výber v odmenách. */
export function unlockedTitles(level: number): number[] {
  const out: number[] = [];
  for (let n = TITLE_MIN_LEVEL; n <= Math.min(level, TITLE_MAX_LEVEL); n++) out.push(n);
  return out;
}
export function effectiveCelebration(c: unknown, level: number): CelebrationId {
  return isCelebrationId(c) && celebrationUnlocked(c, level) ? c : "confetti";
}
export function effectiveTitle(titleLevel: unknown, level: number): number | null {
  const n = normalizeTitleLevel(titleLevel);
  return n != null && n <= level ? n : null;
}

export function frameUnlocked(frame: FrameId, level: number): boolean {
  return level >= FRAME_LEVEL[frame];
}
export function themeUnlocked(theme: ThemeId, level: number): boolean {
  return level >= THEME_LEVEL[theme];
}

export function unlockedFrames(level: number): FrameId[] {
  return FRAME_IDS.filter((f) => frameUnlocked(f, level));
}
export function unlockedThemes(level: number): ThemeId[] {
  return THEME_IDS.filter((t) => themeUnlocked(t, level));
}

/** Uložená voľba klienta: neplatná alebo ešte nedostupná hodnota sa zahodí (rámik „none“, téma „default“). */
export function effectiveFrame(frame: unknown, level: number): FrameId {
  return isFrameId(frame) && frameUnlocked(frame, level) ? frame : "none";
}
export function effectiveTheme(theme: unknown, level: number): ThemeId {
  return isThemeId(theme) && themeUnlocked(theme, level) ? theme : "default";
}

export interface RewardSet {
  frames: FrameId[];
  themes: ThemeId[];
  celebrations: CelebrationId[];
  /** nové tituly (čísla úrovní 10–20) */
  titles: number[];
  freezes: number;
}

/** Odmeny odomknuté postupom z úrovne `from` (bez nej) na úroveň `to` (vrátane). */
export function rewardsBetween(from: number, to: number, branded = false): RewardSet {
  const inRange = (lvl: number) => lvl > from && lvl <= to;
  return {
    frames: FRAME_IDS.filter((f) => f !== "none" && inRange(FRAME_LEVEL[f])),
    // klient so značkou trénera témy nemá (značka vyhráva) — nedostane ani ich oznam
    themes: branded ? [] : THEME_IDS.filter((t) => t !== "default" && inRange(THEME_LEVEL[t])),
    celebrations: CELEBRATION_IDS.filter((c) => c !== "confetti" && inRange(CELEBRATION_LEVEL[c])),
    titles: unlockedTitles(Math.min(to, TITLE_MAX_LEVEL)).filter(inRange),
    freezes: FREEZE_LEVELS.filter(inRange).length,
  };
}

/** Prehľad odmien na úrovni pre zoznam „čo sa kedy odomkne“ (tému dostane len klient bez značky). */
export function rewardCount(r: RewardSet): number {
  return r.frames.length + r.themes.length + r.celebrations.length + r.titles.length + r.freezes;
}

/** Odmeny konkrétnej úrovne (pre oslavu level-upu). */
export function rewardsAt(level: number, branded = false): RewardSet {
  return rewardsBetween(level - 1, level, branded);
}

/** Najbližšia odmena nad aktuálnou úrovňou (pre „Na ďalšej úrovni: …“); null = všetko odomknuté. */
export function nextReward(level: number, branded = false): { level: number; rewards: RewardSet } | null {
  for (let lvl = level + 1; lvl <= TITLE_MAX_LEVEL; lvl++) {
    const r = rewardsAt(lvl, branded);
    if (rewardCount(r) > 0) return { level: lvl, rewards: r };
  }
  return null;
}

/** Zdroj zmrazenia za úroveň / za týždeň misií (UNIQUE (client_id, source) v DB). */
export const freezeSourceLevel = (level: number) => `level:${level}`;
export const freezeSourceMissionWeek = (weekStart: string) => `mission_week:${weekStart}`;

/** Zmrazenia, ktoré klient za dosiahnutú úroveň má dostať (zdroje; server vynechá už pripísané). */
export function freezeSourcesForLevel(level: number): string[] {
  return FREEZE_LEVELS.filter((l) => l <= level).map(freezeSourceLevel);
}

/** Farby tém (akcent; svetlá a tmavá téma portálu) — zdieľa ich CSS aj náhľad voľby. */
export const THEME_SWATCH: Readonly<Record<ThemeId, string>> = {
  default: "#d9694a",
  ocean: "#2f7fb8",
  forest: "#3b8a5a",
  sunset: "#d98a2b",
  violet: "#7a5bc4",
  graphite: "#5b6470",
};
