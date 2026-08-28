// Typy klientskeho portálu /portal. Naplnené reálnymi Supabase dátami v lib/portal/data.ts
// (migrácia supabase/migrations/0002_workout_portal.sql). Viď DESIGN.md → Surfaces → Klientsky portál.

// Rotačný model (2026-08-28): plán nemá pevný rozvrh podľa dňa v týždni — klient
// si sám vyberá kedy cvičí, "ďalší tréning" je vždy nasledujúci nedokončený deň
// v poradí (lib/portal/data.ts). Preto tu niet "missed" (vynechaný podľa rozvrhu)
// ani "upcoming" (naplánovaný na budúci deň) — len či sa v ten kalendárny deň
// odcvičilo, alebo nie.
export type DayCellState = "done" | "today" | "none";

/** Stav dňa v páse histórie — odcvičil / neodcvičil (bez väzby na rozvrh). */
export type StreakDayState = "done" | "rest";

export interface WeekDay {
  /** Po, Ut, St … */
  label: string;
  dayNum: number;
  state: DayCellState;
}

export interface PortalExercise {
  idx: string;
  name: string;
  /** série × opakovania, napr. "4 × 6" */
  scheme: string;
  /** záťaž, napr. "90 kg" alebo "vlastná váha" */
  load: string;
  /** pauza medzi sériami, napr. "150 s" */
  rest: string;
  /** tempo, voliteľné */
  tempo?: string;
}

export interface CoachNote {
  trainer: string;
  initials: string;
  text: string;
}

export interface TodaySession {
  /** training = pripravený ďalší tréning v poradí, done = dnes už odcvičené */
  kind: "training" | "done";
  title: string;
  focus: string;
  durationLabel: string;
  exercises: PortalExercise[];
  /** koľko cvikov je odškrtnutých (0 kým Fáza B nepostaví per-cvik odklikávanie) */
  completedCount: number;
  /** id workout_day na zápis workout_logs pri "Ukončiť tréning" */
  dayId: string | null;
}

export interface PortalData {
  clientFirstName: string;
  today: string; // ISO (YYYY-MM-DD), v zóne Europe/Bratislava
  /** hodina dňa (0-23) pre pozdrav, v zóne Europe/Bratislava */
  hour: number;
  coachNote: CoachNote | null;
  session: TodaySession;
  week: WeekDay[];
  /** koľko tréningov klient v tomto pláne odcvičil spolu (rotácia dní, nie fixný rozvrh) */
  totalSessions: number;
  /** posledných 12 dní pred dneškom, najstarší prvý */
  streakHistory: StreakDayState[];
}

/** Výsledok načítania portálu — buď dáta, alebo dôvod prázdneho stavu. */
export type PortalResult =
  | { state: "ok"; data: PortalData }
  | { state: "unlinked"; firstName: string | null }
  | { state: "no_plan"; firstName: string }
  | { state: "error"; message?: string };

// ---------- Tréning (celý plán, nie len dnešok) ----------

export interface PortalTrainingDay {
  id: string;
  name: string;
  exercises: PortalExercise[];
}

export interface PortalTrainingData {
  planName: string;
  days: PortalTrainingDay[];
}

export type PortalTrainingResult =
  | { state: "ok"; data: PortalTrainingData }
  | { state: "unlinked"; firstName: string | null }
  | { state: "no_plan" }
  | { state: "error"; message?: string };

// ---------- Strava (makro cieľ + jedálniček) ----------

export interface PortalMacroGoal {
  bmr: number;
  tdee: number;
  caloriesTarget: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface PortalMealEntry {
  name: string;
  grams: number;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface PortalMealGroup {
  /** už lokalizovaný label, napr. "Raňajky" */
  slotLabel: string;
  entries: PortalMealEntry[];
}

export interface PortalMealDay {
  id: string;
  name: string;
  groups: PortalMealGroup[];
  totalKcal: number;
}

export interface PortalNutritionData {
  macroGoal: PortalMacroGoal | null;
  mealPlanName: string | null;
  mealDays: PortalMealDay[];
}

export type PortalNutritionResult =
  | { state: "ok"; data: PortalNutritionData }
  | { state: "unlinked"; firstName: string | null }
  | { state: "error"; message?: string };
