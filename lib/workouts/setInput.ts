// Parsovanie a validácia hodnôt série, ako ich klient píše do formulára
// "Ukončiť tréning" (QA K8/K9/K17). Čistá logika bez next/supabase importov —
// zdieľaná formulárom (app/portal/LogWorkoutButton.tsx), serverom
// (app/portal/actions.ts) a e2e/training-done.spec.ts, aby pravidlá sedeli všade.
//
// Prečo text a nie <input type="number">: slovenský používateľ píše desatinnú
// čiarku ("62,5"). Number input ju v Chromiu zahodil (→ 625 kg), v Safari vrátil
// prázdnu hodnotu (→ séria ticho zmizla). Ukončený tréning je zamknutý (0048),
// takže preklep sa musí zachytiť PRED uložením, nie ticho orezať na serveri.

export const REPS_MAX = 999;
export const WEIGHT_MAX_KG = 1000;

export type ParsedValue = { value: number | null; error: string | null };

const EMPTY: ParsedValue = { value: null, error: null };

/** Opakovania: prázdne = nezadané, inak celé číslo 0–999. */
export function parseReps(raw: string): ParsedValue {
  const s = raw.trim();
  if (s === "") return EMPTY;
  if (!/^\d+$/.test(s)) return { value: null, error: "Opakovania zadaj ako celé číslo." };
  const n = Number(s);
  if (n > REPS_MAX) return { value: null, error: `Najviac ${REPS_MAX} opakovaní.` };
  return { value: n, error: null };
}

/** Váha v kg: prázdne = nezadané, inak 0–1000, desatinná čiarka aj bodka, max. 2 desatinné miesta. */
export function parseWeight(raw: string): ParsedValue {
  const s = raw.trim().replace(/\s+/g, "").replace(",", ".");
  if (s === "") return EMPTY;
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return { value: null, error: "Váhu zadaj ako číslo, napr. 62,5." };
  const n = Number(s);
  if (n > WEIGHT_MAX_KG) return { value: null, error: `Najviac ${WEIGHT_MAX_KG} kg.` };
  return { value: n, error: null };
}

export type SetDraftRow = { reps: string; weight: string };

export interface WorkoutFormSummary {
  /** séria bez chyby a aspoň s jednou hodnotou, po cvikoch (index cviku → série) */
  sets: Record<number, { reps: number | null; weight: number | null }[]>;
  /** počet polí s neplatnou hodnotou */
  invalidCount: number;
  /** indexy cvikov bez jedinej zapísanej série */
  emptyExercises: number[];
  /** klient nezapísal vôbec nič (žiadna séria v žiadnom cviku) */
  nothingLogged: boolean;
}

export function summarizeWorkoutForm(exerciseCount: number, rows: Record<number, SetDraftRow[]>): WorkoutFormSummary {
  const sets: WorkoutFormSummary["sets"] = {};
  let invalidCount = 0;
  const emptyExercises: number[] = [];

  for (let i = 0; i < exerciseCount; i++) {
    const out: { reps: number | null; weight: number | null }[] = [];
    for (const row of rows[i] ?? []) {
      const reps = parseReps(row.reps);
      const weight = parseWeight(row.weight);
      if (reps.error) invalidCount++;
      if (weight.error) invalidCount++;
      if (reps.error || weight.error) continue;
      if (reps.value === null && weight.value === null) continue;
      out.push({ reps: reps.value, weight: weight.value });
    }
    sets[i] = out;
    if (out.length === 0) emptyExercises.push(i);
  }

  return { sets, invalidCount, emptyExercises, nothingLogged: emptyExercises.length === exerciseCount };
}

/** Kontrola na serveri: rovnaké pravidlá pre už sparsované čísla (null = nezadané). */
export function isValidReps(v: unknown): boolean {
  return v === null || (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= REPS_MAX);
}

export function isValidWeight(v: unknown): boolean {
  return v === null || (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= WEIGHT_MAX_KG);
}
