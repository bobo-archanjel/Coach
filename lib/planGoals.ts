// FitPilot — zdieľaný zoznam cieľov tréningového plánu (chudnutie/hypertrofia/
// sila/kondícia). Používa AI generátor plánu (lib/ai/planGenerator.ts) aj jeho
// server action (app/dashboard/treningy/actions.ts) — a teraz aj filtrovanie
// tréningových šablón (feature/progress-AI-sablona) podľa `plan_templates.goal`.
// Jedno miesto pravdy namiesto duplicitných máp v každom mieste použitia.

import type { PlanGoal } from "./ai/planGenerator";

export const PLAN_GOALS: PlanGoal[] = ["chudnutie", "hypertrofia", "sila", "kondicia"];

export function isPlanGoal(value: string | null | undefined): value is PlanGoal {
  return !!value && (PLAN_GOALS as string[]).includes(value);
}
