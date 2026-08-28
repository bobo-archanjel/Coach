// Typy klientskeho portálu /portal. Naplnené reálnymi Supabase dátami v lib/portal/data.ts
// (migrácia supabase/migrations/0002_workout_portal.sql). Viď DESIGN.md → Surfaces → Klientsky portál.

export type DayCellState = "done" | "today" | "upcoming" | "rest" | "missed";

/** Stav dňa v páse "Séria" — odcvičené / voľno podľa plánu / vynechané. */
export type StreakDayState = "done" | "rest" | "missed";

export interface WeekDay {
  /** Po, Ut, St … */
  label: string;
  dayNum: number;
  state: DayCellState;
  /** krátky plán dňa, napr. "Deň A" alebo "Voľno" */
  plan: string;
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
  /** training = bežný deň, rest = voľno, done = dnes už odcvičené */
  kind: "training" | "rest" | "done";
  title: string;
  focus: string;
  durationLabel: string;
  exercises: PortalExercise[];
  /** koľko cvikov je odškrtnutých (0 kým Fáza B nepostaví odklikávanie) */
  completedCount: number;
}

export interface PortalData {
  clientFirstName: string;
  today: string; // ISO (YYYY-MM-DD), v zóne Europe/Bratislava
  /** hodina dňa (0-23) pre pozdrav, v zóne Europe/Bratislava */
  hour: number;
  coachNote: CoachNote | null;
  session: TodaySession;
  week: WeekDay[];
  /** dní za sebou podľa plánu (rest dni sériu nelámu) */
  streakDays: number;
  /** posledných 12 dní pred dneškom, najstarší prvý */
  streakHistory: StreakDayState[];
}

/** Výsledok načítania portálu — buď dáta, alebo dôvod prázdneho stavu. */
export type PortalResult =
  | { state: "ok"; data: PortalData }
  | { state: "unlinked"; firstName: string | null }
  | { state: "no_plan"; firstName: string }
  | { state: "error"; message?: string };
