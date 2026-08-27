// Mock dáta pre klientsky portál /portal (Fáza A) — bez backendu, bez DB.
// Nahradiť reálnymi Supabase queries pri napojení na Track 1-B (workout_logs, client_onboarding).
// Viď DESIGN.md → Surfaces → Klientsky portál.

export type DayCellState = "done" | "today" | "upcoming" | "rest";

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
  /** pauza medzi sériami */
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
  today: string; // ISO
  /** hodina dňa pre pozdrav — pinnutá k mocku, aby demo nezáviselo od reálneho času */
  hour: number;
  coachNote: CoachNote | null;
  session: TodaySession;
  week: WeekDay[];
  /** dní za sebou podľa plánu (rest dni sériu nelámu) */
  streakDays: number;
  /** posledných ~12 dní: true = splnené podľa plánu */
  streakHistory: boolean[];
}

export const mockPortal: PortalData = {
  clientFirstName: "Ján",
  today: "2026-08-27",
  hour: 7,
  coachNote: {
    trainer: "Marek",
    initials: "M",
    text: "Dnes ide o techniku, nie o váhu — pri drepe drž tempo 3 s dole a kontrolu v spodnej polohe. Ak koleno pri RDL tlačí, zníž záťaž o 10 kg a napíš mi.",
  },
  session: {
    kind: "training",
    title: "Deň C — Nohy",
    focus: "Dolná časť tela + core",
    durationLabel: "~55 min",
    completedCount: 0,
    exercises: [
      { idx: "A1", name: "Drep s veľkou činkou", scheme: "4 × 6", load: "90 kg", rest: "150 s", tempo: "3-0-1" },
      { idx: "A2", name: "Rumunský mŕtvy ťah", scheme: "3 × 8", load: "100 kg", rest: "120 s" },
      { idx: "B1", name: "Predkopávanie na stroji", scheme: "3 × 12", load: "45 kg", rest: "75 s" },
      { idx: "B2", name: "Zakopávanie v ľahu", scheme: "3 × 12", load: "35 kg", rest: "75 s" },
      { idx: "C1", name: "Výpony na lýtka v stoji", scheme: "4 × 15", load: "60 kg", rest: "60 s" },
      { idx: "C2", name: "Plank s výdržou", scheme: "3 × 45 s", load: "vlastná váha", rest: "45 s" },
    ],
  },
  week: [
    { label: "Po", dayNum: 24, state: "done", plan: "Deň A" },
    { label: "Ut", dayNum: 25, state: "done", plan: "Deň B" },
    { label: "St", dayNum: 26, state: "rest", plan: "Voľno" },
    { label: "Št", dayNum: 27, state: "today", plan: "Deň C" },
    { label: "Pi", dayNum: 28, state: "upcoming", plan: "Deň A" },
    { label: "So", dayNum: 29, state: "upcoming", plan: "Kardio" },
    { label: "Ne", dayNum: 30, state: "rest", plan: "Voľno" },
  ],
  streakDays: 12,
  streakHistory: [true, true, true, true, true, true, true, true, true, true, true, true],
};
