// Typy klientskeho portálu /portal. Naplnené reálnymi Supabase dátami v lib/portal/data.ts
// (migrácia supabase/migrations/0002_workout_portal.sql). Viď DESIGN.md → Surfaces → Klientsky portál.

import type { MealSlot } from "@/lib/meals";

// Rotačný model (2026-08-28): plán nemá pevný rozvrh podľa dňa v týždni — klient
// si sám vyberá kedy cvičí, "ďalší tréning" je vždy nasledujúci nedokončený deň
// v poradí (lib/portal/data.ts). Preto tu niet "missed" (vynechaný podľa rozvrhu)
// — len či sa v ten kalendárny deň odcvičilo (`done`), alebo nie (`none`);
// `future` je deň, ktorý ešte len príde (relevantné pri prezeraní minulých týždňov).
export type DayCellState = "done" | "today" | "future" | "none";

/** Stav dňa v páse histórie — odcvičil / neodcvičil (bez väzby na rozvrh). */
export type StreakDayState = "done" | "rest";

/** Jedna skutočne odcvičená séria v histórii (workout_logs.entries). */
export interface LoggedSetView {
  reps: number | null;
  weight: number | null;
}

/** Jeden cvik s odcvičenými sériami — pohľad do histórie, bez väzieb na builder. */
export interface LoggedExerciseView {
  name: string;
  sets: LoggedSetView[];
}

/** Jeden odcvičený tréning v konkrétny deň (jeden riadok workout_logs). */
export interface LoggedSessionView {
  /** názov dňa z workout_days, alebo "Tréning" ak deň medzitým zanikol */
  dayName: string;
  planName: string | null;
  /** skutočné hodnoty; prázdne pri starších (Fáza A) záznamoch bez zápisu sérií */
  exercises: LoggedExerciseView[];
}

export interface WeekDay {
  /** Po, Ut, St … */
  label: string;
  dayNum: number;
  /** kalendárny dátum bunky, YYYY-MM-DD */
  iso: string;
  state: DayCellState;
  /** odcvičené tréningy v tento kalendárny deň (zvyčajne 0 – 1, zriedka viac) */
  sessions: LoggedSessionView[];
}

/** Týždeň pre pás „Tento týždeň" — aktuálny aj ktorýkoľvek minulý (WeekHistory). */
export interface WeekView {
  /** pondelok tohto týždňa, YYYY-MM-DD */
  mondayIso: string;
  /** ľudský rozsah týždňa, napr. „18. – 24. aug" */
  rangeLabel: string;
  isCurrentWeek: boolean;
  days: WeekDay[];
}

export type PortalWeekResult =
  | { state: "ok"; week: WeekView }
  | { state: "error"; message?: string };

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

/** Klient je v GDPR grace period (0013_client_deletion.sql) — banner na karte Dnes. */
export interface PortalDeletionNotice {
  requestedBy: "trainer" | "client";
  requestedAt: string; // ISO timestamptz
}

/** Tréner ukončil spoluprácu (0015_client_cooperation_pause.sql) — banner na karte Dnes. */
export interface PortalCooperationNotice {
  endedAt: string; // ISO timestamptz
}

export interface PortalData {
  clientFirstName: string;
  today: string; // ISO (YYYY-MM-DD), v zóne Europe/Bratislava
  /** hodina dňa (0-23) pre pozdrav, v zóne Europe/Bratislava */
  hour: number;
  coachNote: CoachNote | null;
  session: TodaySession;
  week: WeekView;
  /** koľko tréningov klient v tomto pláne odcvičil spolu (rotácia dní, nie fixný rozvrh) */
  totalSessions: number;
  /** posledných 12 dní pred dneškom, najstarší prvý */
  streakHistory: StreakDayState[];
  /** null, kým nie je podaná žiadosť o zmazanie klienta (viď DeleteAccountSection na /portal/profil) */
  deletionNotice: PortalDeletionNotice | null;
  /** null, kým tréner neukončil spoluprácu (0015) — na rozdiel od deletionNotice dáta ostávajú */
  cooperationEndedNotice: PortalCooperationNotice | null;
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
  /** klient tento deň už niekedy odcvičil (aspoň 1 záznam vo workout_logs) — badge „Hotovo" v zozname dní */
  done: boolean;
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
  /** slovenský preklad názvu, ak existuje (Free Exercise DB import) — inak zobraz `name` */
  nameSk: string | null;
  muscleGroup: string | null;
  /** prvý obrázok cviku (miniatúra) — externé URL, Free Exercise DB */
  imageUrl: string | null;
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
  /** "system" = automatická správa (napr. GDPR zmazanie, 0014), nepatrí ani trénerovi ani klientovi */
  sender: "trainer" | "client" | "system";
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
