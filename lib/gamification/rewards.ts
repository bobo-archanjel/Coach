// FitPilot — odmeny za úrovne (gamifikácia v2). Čisté funkcie, žiadna DB.
//
//  - rámiky avatara (CSS kruhy/gradienty okolo iniciály v hlavičke portálu),
//  - farebné témy portálu pre klienta (len keď tréner NEMÁ aktívnu značku — značka vždy vyhráva;
//    inak téma ovplyvní len farbu rámika avatara),
//  - zmrazenia série (streak freeze): +1 za každú 4. úroveň (4, 8, 12, 16, 20) a za týždeň,
//    v ktorom klient splnil všetky tri misie; uložené max. 2.
//
// Klient si vyberá aktívny rámik a tému na stránke Úspechy. Server overí, že úroveň odomknutie dovoľuje.

export const FRAME_IDS = ["none", "ember", "mint", "steel", "gold", "aurora", "prism", "olympus"] as const;
export type FrameId = (typeof FRAME_IDS)[number];

export const THEME_IDS = ["default", "ocean", "forest", "sunset", "violet", "graphite"] as const;
export type ThemeId = (typeof THEME_IDS)[number];

/** Od ktorej úrovne je rámik / téma odomknutá (none a default od začiatku). */
export const FRAME_LEVEL: Readonly<Record<FrameId, number>> = {
  none: 1,
  ember: 2,
  mint: 4,
  steel: 6,
  gold: 9,
  aurora: 12,
  prism: 15,
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
  freezes: number;
}

/** Odmeny odomknuté postupom z úrovne `from` (bez nej) na úroveň `to` (vrátane). */
export function rewardsBetween(from: number, to: number): RewardSet {
  const inRange = (lvl: number) => lvl > from && lvl <= to;
  return {
    frames: FRAME_IDS.filter((f) => f !== "none" && inRange(FRAME_LEVEL[f])),
    themes: THEME_IDS.filter((t) => t !== "default" && inRange(THEME_LEVEL[t])),
    freezes: FREEZE_LEVELS.filter(inRange).length,
  };
}

/** Odmeny konkrétnej úrovne (pre oslavu level-upu). */
export function rewardsAt(level: number): RewardSet {
  return rewardsBetween(level - 1, level);
}

/** Najbližšia odmena nad aktuálnou úrovňou (pre „Na ďalšej úrovni: …“); null = všetko odomknuté. */
export function nextReward(level: number): { level: number; rewards: RewardSet } | null {
  const max = Math.max(...Object.values(FRAME_LEVEL), ...Object.values(THEME_LEVEL), ...FREEZE_LEVELS);
  for (let lvl = level + 1; lvl <= max; lvl++) {
    const r = rewardsAt(lvl);
    if (r.frames.length + r.themes.length + r.freezes > 0) return { level: lvl, rewards: r };
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
