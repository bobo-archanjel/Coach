// Typy klientskeho portálu /portal. Naplnené reálnymi Supabase dátami v lib/portal/data.ts
// (migrácia supabase/migrations/0002_workout_portal.sql). Viď DESIGN.md → Surfaces → Klientsky portál.

import type { MealSlot } from "@/lib/meals";

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
  /** entry_id z workout_days.exercises — kľúč pre zápis skutočných hodnôt do workout_logs.entries (Fáza B) */
  entryId: string | null;
  /** plánovaný počet sérií z buildera — koľko riadkov sa predvyplní vo formulári "Ukončiť tréning" */
  plannedSets: number;
  /** plánované opakovania ako placeholder v riadku série, napr. "6" alebo "8-10" */
  plannedReps: string | null;
  /** surové hodnoty pre builder vlastného tréningu (úprava existujúceho plánu) */
  exerciseId: string | null;
  loadKg: number | null;
  restSeconds: number | null;
}

/** Jedna skutočne odcvičená séria — vyplní klient pri "Ukončiť tréning" (Fáza B). */
export interface LoggedSet {
  reps: number | null;
  weight: number | null;
}

/** Skutočné hodnoty jedného cviku v rámci workout_logs.entries (Fáza B). */
export interface LoggedExercise {
  entryId: string | null;
  name: string;
  sets: LoggedSet[];
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
  /**
   * Skutočne zadané hodnoty (Fáza B), keď je `kind: "done"` — "vrátiť sa do
   * tréningu" ukazuje toto namiesto `exercises` (plánu), nech klient vidí, čo
   * naozaj zapísal. `null` keď deň ešte nie je hotový, alebo klient nezadal
   * žiadne hodnoty (len odklikol) — vtedy sa použije `exercises` ako fallback.
   */
  loggedExercises: LoggedExercise[] | null;
  /** koľko cvikov je odškrtnutých (0 kým Fáza B nepostaví per-cvik odškrtávanie) */
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

// ---------- Tréning (zoznam plánov klienta — od trénera aj vlastné) ----------

export interface PortalTrainingDay {
  id: string;
  name: string;
  exercises: PortalExercise[];
}

/** Zdroj plánu: od trénera, alebo si ho klient vytvoril sám. */
export type PlanSource = "trainer" | "client";

export interface PortalPlan {
  id: string;
  name: string;
  source: PlanSource;
  /** true pre plán, ktorý riadi kartu Dnes (clients.active_plan_id, inak najnovší) */
  isActive: boolean;
  days: PortalTrainingDay[];
}

export interface PortalTrainingData {
  plans: PortalPlan[];
  activePlanId: string | null;
  /** globálna knižnica cvikov pre builder vlastného tréningu */
  exerciseLibrary: ExerciseOption[];
}

export interface ExerciseOption {
  id: string;
  name: string;
  muscleGroup: string | null;
}

export type PortalTrainingResult =
  | { state: "ok"; data: PortalTrainingData }
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

// ---------- Denník (čo klient skutočne zjedol dnes) ----------

/** Jedna položka na výber v pridávaní jedla — z knižnice `foods` alebo z trénerovho plánu. */
export interface PortalFoodOption {
  foodId: string | null;
  name: string;
  kcal100g: number;
  protein100g: number;
  carbs100g: number;
  fat100g: number;
  /** len pri "z plánu" — koľko gramov tréner naplánoval a v ktorom jedle dňa */
  plannedGrams?: number;
  plannedSlot?: MealSlot;
}

export interface PortalDiaryEntry {
  id: string;
  slot: MealSlot;
  name: string;
  grams: number;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface PortalDiaryGroup {
  slot: MealSlot;
  slotLabel: string;
  entries: PortalDiaryEntry[];
  kcal: number;
}

export interface PortalDiaryData {
  today: string; // ISO (YYYY-MM-DD), Europe/Bratislava
  /** hodina dňa 0-23 — na predvolený výber jedla dňa pri pridávaní */
  hour: number;
  goal: PortalMacroGoal | null;
  groups: PortalDiaryGroup[];
  totals: { kcal: number; proteinG: number; carbsG: number; fatG: number };
  /** položky z najnovšieho trénerovho jedálnička na rýchle pridanie */
  planFoods: PortalFoodOption[];
  /** celá knižnica potravín (globálna + trénerove vlastné) na vyhľadávanie */
  library: PortalFoodOption[];
}

export type PortalDiaryResult =
  | { state: "ok"; data: PortalDiaryData }
  | { state: "unlinked"; firstName: string | null }
  | { state: "error"; message?: string };

// ---------- Chat tréner ↔ klient ----------

export interface PortalChatMessage {
  id: string;
  sender: "trainer" | "client";
  body: string;
  createdAt: string; // ISO
}

export interface PortalChatData {
  messages: PortalChatMessage[];
  trainerName: string;
}

export type PortalChatResult =
  | { state: "ok"; data: PortalChatData }
  | { state: "unlinked"; firstName: string | null }
  | { state: "error"; message?: string };
