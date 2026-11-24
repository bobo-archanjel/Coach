// FitPilot — živá motivácia počas tréningu (gamifikácia v2): nápoveda z histórie
// („Minule: 80 kg × 8 · skús 82,5 kg 💪“) a okamžitá kontrola osobného rekordu pri sérii.
// Čisté funkcie (testy: e2e/gamification-v2.spec.ts) — načítanie histórie rieši server
// (lib/gamification/hintsServer.ts), klient len porovnáva s už načítanými dátami.
//
// Pravidlá nápovedy (progresívne a bezpečne):
//  - cvik s váhou: ak klient minule splnil všetky série na cieľové opakovania, navrhne sa +2,5 kg
//    (nikdy viac než +5 % z váhy, zaokrúhlené na 0,5 kg); inak rovnaká váha a o opakovanie viac,
//  - cvik s vlastnou váhou: o 1 opakovanie viac,
//  - cvik na čas: o 5 s viac (1 s by nikoho nemotivovalo),
//  - žiadne tlačenie k nebezpečným skokom: krok je vždy menší z 2,5 kg a 5 % váhy.
//
// Rekord (inline) = rovnaké pravidlo ako lib/gamification/records.ts: STRIKTNE vyššia váha ALEBO vyšší
// odhad 1RM než všetko z histórie a cvik musí mať aspoň jeden predošlý zápis (prvý zápis rekord nie je).
// Server ostáva zdrojom pravdy — po ukončení tréningu rekord vyhodnotí znova.

import { epley1RM } from "@/lib/reports/aggregate";
import { exerciseKeyOf } from "./records";

export const WEIGHT_STEP_KG = 2.5;
export const MAX_STEP_RATIO = 0.05;
export const TIME_STEP_S = 5;
/** Sériu pod týmto podielom najťažšej série berieme ako rozcvičku (do nápovedy nepatrí). */
const WORKING_RATIO = 0.85;

export interface HintSet {
  weight?: number | null;
  reps?: number | null;
  durationS?: number | null;
}

/** Záznam cviku v workout_logs.entries (série môžu mať aj čas v sekundách). */
interface EntryLike {
  name?: string;
  sets?: HintSet[];
}

export type Hint =
  | { kind: "weight"; lastWeight: number; lastReps: number; nextWeight: number; nextReps: number | null }
  | { kind: "reps"; lastWeight: number; lastReps: number; nextWeight: number; nextReps: number }
  | { kind: "bodyweight"; lastReps: number; nextReps: number }
  | { kind: "time"; lastSeconds: number; nextSeconds: number };

/** Horná hranica z plánovaných opakovaní: „8“ → 8, „8-10“ → 10, „max“/prázdne → null. */
export function targetRepsOf(plannedReps: string | null | undefined): number | null {
  const s = (plannedReps ?? "").trim();
  const m = /^(\d{1,3})(?:\s*[-–]\s*(\d{1,3}))?$/.exec(s);
  if (!m) return null;
  const n = Number(m[2] ?? m[1]);
  return n >= 1 ? n : null;
}

/** Krok navýšenia váhy: menší z 2,5 kg a 5 % váhy, zaokrúhlený nadol na 0,5 kg, aspoň 0,5 kg. */
export function weightStep(weight: number): number {
  const raw = Math.min(WEIGHT_STEP_KG, weight * MAX_STEP_RATIO);
  return Math.max(0.5, Math.floor(raw * 2) / 2);
}

/** Nápoveda z minulých sérií cviku; null = z čoho vychádzať nie je. */
export function progressionHint(lastSets: HintSet[], opts: { plannedReps?: string | null; timed?: boolean } = {}): Hint | null {
  // cvik na čas: najdlhšie trvanie
  if (opts.timed || lastSets.some((s) => (s.durationS ?? 0) > 0 && s.reps == null)) {
    const secs = Math.max(0, ...lastSets.map((s) => s.durationS ?? 0));
    return secs > 0 ? { kind: "time", lastSeconds: secs, nextSeconds: secs + TIME_STEP_S } : null;
  }
  const weighted = lastSets.filter((s) => s.weight != null && s.weight > 0 && s.reps != null && s.reps >= 1) as { weight: number; reps: number }[];
  if (weighted.length === 0) {
    const reps = Math.max(0, ...lastSets.map((s) => s.reps ?? 0));
    return reps > 0 ? { kind: "bodyweight", lastReps: reps, nextReps: reps + 1 } : null;
  }
  const top = weighted.reduce((a, b) => (b.weight > a.weight || (b.weight === a.weight && b.reps > a.reps) ? b : a));
  const working = weighted.filter((s) => s.weight >= top.weight * WORKING_RATIO);
  const target = targetRepsOf(opts.plannedReps);
  const hit = target != null ? working.every((s) => s.reps >= target) : working.length > 0 && top.reps >= 6 && working.every((s) => s.reps === top.reps);
  if (hit) {
    return {
      kind: "weight",
      lastWeight: top.weight,
      lastReps: top.reps,
      nextWeight: Math.round((top.weight + weightStep(top.weight)) * 2) / 2,
      nextReps: target,
    };
  }
  const nextReps = target != null ? Math.min(target, top.reps + 1) : top.reps + 1;
  return { kind: "reps", lastWeight: top.weight, lastReps: top.reps, nextWeight: top.weight, nextReps: Math.max(nextReps, 1) };
}

// ---------- história cviku (pre nápovedu aj kontrolu rekordu) ----------

export interface ExerciseHistory {
  key: string;
  /** dátum posledného zápisu s údajmi */
  lastOn: string;
  lastSets: HintSet[];
  /** najväčšia váha zo všetkých načítaných zápisov (a z uložených rekordov) */
  bestWeight: number;
  /** najvyšší odhad 1RM; null = nikdy nebolo čo odhadnúť */
  bestE1rm: number | null;
  /** v koľkých tréningoch sa cvik objavil (≥ 1 = má sa s čím porovnať) */
  sessions: number;
}

export interface HistoryLog {
  performedOn: string;
  entries: unknown;
}

/**
 * História pre zadané cviky z načítaných tréningov (poradie vstupu je jedno). `extraBests` sú
 * uložené osobné rekordy (client_achievements) — zachytia aj rekord starší než načítané okno.
 */
export function buildExerciseHistories(
  logs: HistoryLog[],
  keys: ReadonlySet<string>,
  extraBests: ReadonlyMap<string, { weight: number; e1rm: number | null }> = new Map(),
): Record<string, ExerciseHistory> {
  const sorted = [...logs].sort((a, b) => b.performedOn.localeCompare(a.performedOn));
  const out: Record<string, ExerciseHistory> = {};
  for (const log of sorted) {
    for (const entry of Array.isArray(log.entries) ? (log.entries as EntryLike[]) : []) {
      const name = typeof entry?.name === "string" ? entry.name.trim() : "";
      if (!name) continue;
      const key = exerciseKeyOf(name);
      if (!keys.has(key)) continue;
      const sets: HintSet[] = (entry.sets ?? []).filter((s) => s && ((s.reps ?? 0) > 0 || (s.durationS ?? 0) > 0));
      if (sets.length === 0) continue;
      let h = out[key];
      if (!h) {
        h = out[key] = { key, lastOn: log.performedOn, lastSets: sets, bestWeight: 0, bestE1rm: null, sessions: 0 };
      }
      h.sessions++;
      for (const s of sets) {
        if (s.weight != null && s.weight > 0) h.bestWeight = Math.max(h.bestWeight, s.weight);
        if (s.weight != null && s.weight > 0 && s.reps != null && s.reps >= 1) {
          const e = epley1RM(s.weight, s.reps);
          if (e != null && (h.bestE1rm == null || e > h.bestE1rm)) h.bestE1rm = e;
        }
      }
    }
  }
  for (const [key, b] of extraBests) {
    const h = out[key];
    if (!h) continue;
    h.bestWeight = Math.max(h.bestWeight, b.weight);
    if (b.e1rm != null && (h.bestE1rm == null || b.e1rm > h.bestE1rm)) h.bestE1rm = b.e1rm;
  }
  return out;
}

/** Je séria (váha × opakovania) nový osobný rekord voči histórii? Rovnaké pravidlo ako server (records.ts). */
export function isNewPersonalRecord(
  history: Pick<ExerciseHistory, "bestWeight" | "bestE1rm" | "sessions"> | undefined,
  weight: number | null,
  reps: number | null,
): boolean {
  if (!history || history.sessions < 1) return false;
  if (weight == null || !(weight > 0) || reps == null || !(reps >= 1)) return false;
  if (weight > history.bestWeight) return true;
  const e = epley1RM(weight, reps);
  return e != null && history.bestE1rm != null && e > history.bestE1rm;
}
