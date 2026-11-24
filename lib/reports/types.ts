// FitPilot — Pokročilé reporty: tvary dát medzi loaderom (server) a UI/PDF/CSV. Len typy
// (žiadny kód), takže ich môže importovať aj klientská komponenta.

import type { Comparison, NutritionSummary, RiskAssessment, SeriesPoint, TrainingSummary, WeekAdherence } from "./aggregate";
import type { PeriodKey } from "./period";

export const MEASURE_KEYS = ["weight", "waist", "chest", "hips", "arm", "thigh"] as const;
export type MeasureKey = (typeof MEASURE_KEYS)[number];

export interface StrengthReportPoint {
  date: string;
  /** odhad 1RM (kde sa dá), inak najťažšia séria */
  value: number;
  /** najťažšia séria dňa */
  weightKg: number;
  reps: number;
}

export interface StrengthExerciseReport {
  name: string;
  points: StrengthReportPoint[];
  /** začiatok vs. koniec obdobia (odhad 1RM) */
  comparison: Comparison | null;
  /** najlepšia pracovná váha v období */
  bestWeightKg: number;
}

export interface ClientReport {
  clientId: string;
  clientName: string;
  period: PeriodKey | "month";
  from: string;
  to: string;
  today: string;
  measures: Record<MeasureKey, SeriesPoint[]>;
  comparisons: Record<MeasureKey, Comparison | null>;
  strength: StrengthExerciseReport[];
  training: {
    weeks: WeekAdherence[];
    summary: TrainingSummary;
    /** týždenný cieľ tréningov (dni aktívneho plánu, inak predvolený) */
    weeklyTarget: number;
    hasPlan: boolean;
    /** séria splnených týždňov (lib/portal/streak.ts — rovnaké pravidlá ako v portáli klienta) */
    streakWeeks: number;
    lastWorkoutOn: string | null;
  };
  nutrition: NutritionSummary & {
    /** priemerný príjem po týždňoch (len dni so zápisom) */
    weekly: { weekStart: string; avgKcal: number | null; daysLogged: number }[];
    /** denné hodnoty — len pre krátke rozsahy (mesačný report), inak prázdne */
    daily: { date: string; kcal: number; protein: number }[];
  };
  lastFoodOn: string | null;
  risk: RiskAssessment;
}

export interface PortfolioClientRow {
  id: string;
  name: string;
  pairedOn: string | null;
  trainingPct30: number;
  nutritionPct30: number | null;
  planPct30: number | null;
  /** priemer adherencie (lib/dashboard/portfolioStatus.ts → sortScore) */
  score: number;
  status: "ok" | "watch" | "risk" | "none";
  lastTrainedOn: string | null;
  lastFoodOn: string | null;
  sessions14: number;
  weightDeltaKg: number | null;
  risk: RiskAssessment;
}

export interface PortfolioReport {
  today: string;
  activeClients: number;
  endedClients: number;
  startedThisMonth: number;
  endedThisMonth: number;
  months: { month: string; started: number; ended: number }[];
  weeks: { weekStart: string; workouts: number; trainedClients: number }[];
  clients: PortfolioClientRow[];
}
