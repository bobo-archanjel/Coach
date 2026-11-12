// i18n-ignore-file: podklad pre AI model (interné dáta v prompte)
// Údaje konkrétneho klienta pre AI generátor tréningového plánu (feature/jedalnicky-multi-klient).
// Tréner zadá cieľ/skúsenosť/vybavenie raz pre celý výber klientov; každý plán sa potom
// generuje zvlášť a model k tomu dostane aj to, čo appka o danom klientovi vie — cieľ
// z karty klienta, telesné údaje, aktivitu a poznámku trénera (obmedzenia, zranenia).
// Čisté funkcie bez next/supabase importov (testovateľné, rovnako ako planTaxonomy.ts).

import { ACTIVITY_LABELS, GOAL_LABELS, type ActivityLevel, type Goal } from "../nutrition";
import type { WholePlanFocus } from "./planCategories";

export interface PlanClientFacts {
  /** voľný text z karty klienta (clients.goal) */
  goal: string | null;
  sex: "muz" | "zena" | null;
  age: number | null;
  weightKg: number | null;
  heightCm: number | null;
  activityLevel: ActivityLevel | null;
  /** nutričný cieľ (nutrition_profiles.goal) */
  nutritionGoal: Goal | null;
  /** súkromná poznámka trénera ku klientovi (trainer_private_notes, scope 'client') */
  trainerNote: string | null;
}

/** Poznámka trénera ide do promptu len v skrátenej podobe — stačí na obmedzenia/zranenia. */
export const TRAINER_NOTE_PROMPT_MAX = 600;

/** Predvyplnené celoplánové zameranie podľa pohlavia — len návrh, tréner ho vždy prepíše. */
export function defaultFocusForSex(sex: "muz" | "zena" | null): WholePlanFocus {
  if (sex === "zena") return "dolna";
  if (sex === "muz") return "horna";
  return "vyvazene";
}

const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();

/** Riadky „Údaje o klientovi“ do promptu; prázdne pole = appka o klientovi nič nevie. */
export function planClientContextLines(facts: PlanClientFacts): string[] {
  const lines: string[] = [];
  const goal = facts.goal ? oneLine(facts.goal) : "";
  if (goal) lines.push(`Cieľ z karty klienta: ${goal.slice(0, 200)}`);
  const body = [
    facts.sex === "muz" ? "muž" : facts.sex === "zena" ? "žena" : null,
    facts.age ? `${facts.age} rokov` : null,
    facts.weightKg ? `${facts.weightKg} kg` : null,
    facts.heightCm ? `${facts.heightCm} cm` : null,
  ].filter(Boolean);
  if (body.length > 0) lines.push(`Klient: ${body.join(", ")}`);
  if (facts.activityLevel) lines.push(`Bežná aktivita: ${ACTIVITY_LABELS[facts.activityLevel]}`);
  if (facts.nutritionGoal) lines.push(`Cieľ stravy: ${GOAL_LABELS[facts.nutritionGoal]}`);
  const note = facts.trainerNote ? oneLine(facts.trainerNote) : "";
  if (note) {
    const clipped = note.length > TRAINER_NOTE_PROMPT_MAX ? `${note.slice(0, TRAINER_NOTE_PROMPT_MAX)}…` : note;
    lines.push(`Poznámka trénera (obmedzenia, zranenia, preferencie): ${clipped}`);
  }
  return lines.map((l) => `- ${l}`);
}
