// FitPilot — osobné rekordy (PR) klienta (gamifikácia, fáza A).
// Čisté funkcie nad načítanými tréningami — žiadna DB (testy: e2e/gamification.spec.ts).
// Odhad 1RM sa nepíše znova: berie sa epley1RM z lib/reports/aggregate.ts (reps 1–12).
//
// Pravidlá:
//  - Rekord = v tréningu padla STRIKTNE vyššia váha (séria s ≥ 1 opakovaním) ALEBO vyšší
//    odhad 1RM než všetko z predošlých tréningov. Remíza nie je rekord.
//  - Prvý zápis cviku nie je rekord (nie je s čím porovnať) — len základ.
//  - Cviky bez váhy (vlastná váha) rekord nemajú.
//  - Ak padli obe kritériá, ukladá sa jeden rekord typu 'weight' (jedna oslava na cvik a tréning).

import { epley1RM, type LoggedEntry } from "@/lib/reports/aggregate";

export interface LogForRecords {
  id: string;
  performedOn: string;
  /** na zoradenie tréningov v ten istý deň; chýba → podľa id */
  createdAt?: string | null;
  entries: unknown;
}

export interface PrEvent {
  exerciseKey: string;
  exerciseName: string;
  prType: "weight" | "e1rm";
  /** najťažšia séria tréningu (kg) */
  weightKg: number;
  reps: number;
  /** najvyšší odhad 1RM z tréningu (null = len veľa opakovaní) */
  e1rm: number | null;
  sourceLogId: string;
  achievedOn: string;
}

/** Zjednotenie názvu cviku (veľkosť písmen, medzery) na kľúč. */
export function exerciseKeyOf(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase().slice(0, 200);
}

interface Best {
  name: string;
  weight: number;
  reps: number;
  e1rm: number | null;
}

/** Najlepšie hodnoty cviku v jednom tréningu (cvik sa môže v logu opakovať). */
function bestsInLog(entries: unknown): Map<string, Best> {
  const out = new Map<string, Best>();
  for (const entry of Array.isArray(entries) ? (entries as LoggedEntry[]) : []) {
    const name = typeof entry?.name === "string" ? entry.name.trim() : "";
    if (!name) continue;
    const key = exerciseKeyOf(name);
    for (const s of entry.sets ?? []) {
      const weight = s?.weight;
      const reps = s?.reps;
      if (weight == null || !(weight > 0) || reps == null || !(reps >= 1)) continue;
      const e = epley1RM(weight, reps);
      const cur = out.get(key);
      if (!cur) {
        out.set(key, { name, weight, reps, e1rm: e });
        continue;
      }
      if (weight > cur.weight || (weight === cur.weight && reps > cur.reps)) {
        cur.weight = weight;
        cur.reps = reps;
      }
      if (e != null && (cur.e1rm == null || e > cur.e1rm)) cur.e1rm = e;
    }
  }
  return out;
}

/**
 * Všetky rekordy z histórie, chronologicky. Rovnaká funkcia slúži na živé vyhodnotenie
 * (vyberie sa udalosť s `sourceLogId` práve ukončeného tréningu) aj na tichý backfill.
 */
export function detectPersonalRecords(logs: LogForRecords[]): PrEvent[] {
  const sorted = [...logs].sort(
    (a, b) =>
      a.performedOn.localeCompare(b.performedOn) ||
      (a.createdAt ?? "").localeCompare(b.createdAt ?? "") ||
      a.id.localeCompare(b.id),
  );
  const running = new Map<string, { weight: number; e1rm: number | null }>();
  const events: PrEvent[] = [];
  for (const log of sorted) {
    for (const [key, best] of bestsInLog(log.entries)) {
      const prev = running.get(key);
      if (prev) {
        const weightPr = best.weight > prev.weight;
        const e1rmPr = best.e1rm != null && prev.e1rm != null && best.e1rm > prev.e1rm;
        if (weightPr || e1rmPr) {
          events.push({
            exerciseKey: key,
            exerciseName: best.name,
            prType: weightPr ? "weight" : "e1rm",
            weightKg: best.weight,
            reps: best.reps,
            e1rm: best.e1rm,
            sourceLogId: log.id,
            achievedOn: log.performedOn,
          });
        }
      }
      running.set(key, {
        weight: Math.max(prev?.weight ?? 0, best.weight),
        e1rm: best.e1rm == null ? (prev?.e1rm ?? null) : Math.max(prev?.e1rm ?? 0, best.e1rm),
      });
    }
  }
  return events;
}

/** Súčet zdvihnutého objemu (kg × opakovania) zo sérií s váhou — vstup odznakov „1 t / 10 t…“. */
export function totalVolumeKg(logs: { entries: unknown }[]): number {
  let sum = 0;
  for (const log of logs) {
    for (const entry of Array.isArray(log.entries) ? (log.entries as LoggedEntry[]) : []) {
      for (const s of entry?.sets ?? []) {
        if (s?.weight != null && s.weight > 0 && s.reps != null && s.reps >= 1) sum += s.weight * s.reps;
      }
    }
  }
  return Math.round(sum);
}

export interface RecordSummary {
  exerciseKey: string;
  exerciseName: string;
  bestWeightKg: number;
  bestWeightReps: number;
  bestE1rm: number | null;
  /** dátum posledného rekordu v cviku */
  lastOn: string;
  count: number;
}

/** Zoznam „Rekordy“: za cvik najlepšia váha a odhad 1RM, najnovšie rekordy hore. */
export function summarizeRecords(
  events: { exerciseKey: string; exerciseName: string; weightKg: number; reps: number; e1rm: number | null; achievedOn: string }[],
): RecordSummary[] {
  const map = new Map<string, RecordSummary>();
  for (const e of events) {
    const cur = map.get(e.exerciseKey);
    if (!cur) {
      map.set(e.exerciseKey, {
        exerciseKey: e.exerciseKey,
        exerciseName: e.exerciseName,
        bestWeightKg: e.weightKg,
        bestWeightReps: e.reps,
        bestE1rm: e.e1rm,
        lastOn: e.achievedOn,
        count: 1,
      });
      continue;
    }
    cur.count++;
    if (e.weightKg > cur.bestWeightKg || (e.weightKg === cur.bestWeightKg && e.reps > cur.bestWeightReps)) {
      cur.bestWeightKg = e.weightKg;
      cur.bestWeightReps = e.reps;
    }
    if (e.e1rm != null && (cur.bestE1rm == null || e.e1rm > cur.bestE1rm)) cur.bestE1rm = e.e1rm;
    if (e.achievedOn > cur.lastOn) {
      cur.lastOn = e.achievedOn;
      cur.exerciseName = e.exerciseName;
    }
  }
  return [...map.values()].sort((a, b) => b.lastOn.localeCompare(a.lastOn) || a.exerciseName.localeCompare(b.exerciseName, "sk"));
}
