// Dokončený tréning: plán (workout_logs.plan_snapshot, 0048) vs. realita
// (workout_logs.entries). Čistá logika bez next/supabase importov — zdieľaná medzi
// detailom trénera, portálom a e2e testom (e2e/training-done.spec.ts).

/** Plánovaný cvik tak, ako bol v `workout_days.exercises` v čase ukončenia tréningu. */
export interface SnapshotExercise {
  entryId: string | null;
  exerciseId: string | null;
  name: string;
  sets: number;
  reps: string | null;
  loadKg: number | null;
  tempo: string | null;
  restSeconds: number | null;
}

export interface PlanSnapshot {
  planId: string | null;
  planName: string | null;
  dayId: string | null;
  dayName: string | null;
  exercises: SnapshotExercise[];
  /** Záznam spred 0048 — snapshot doplnený z aktuálnej verzie plánu, nie z času tréningu. */
  backfilled: boolean;
}

/** Jedna zapísaná séria. Čas/vzdialenosť/RPE sú voliteľné (zatiaľ ich zapisujú len niektoré toky). */
export interface LoggedSetValues {
  reps: number | null;
  weight: number | null;
  durationS?: number | null;
  distanceM?: number | null;
  rpe?: number | null;
}

export interface LoggedEntry {
  entryId: string | null;
  name: string;
  note?: string | null;
  sets: LoggedSetValues[];
}

export type CompareStatus = "planned" | "extra" | "skipped";

export interface CompareRow {
  /** 1-based poradie série */
  index: number;
  planned: { reps: string | null; loadKg: number | null } | null;
  actual: LoggedSetValues | null;
}

export interface CompareExercise {
  key: string;
  name: string;
  /** planned = v pláne aj zapísané, skipped = v pláne, klient nič nezapísal, extra = mimo plánu */
  status: CompareStatus;
  planned: SnapshotExercise | null;
  note: string | null;
  rows: CompareRow[];
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function parsePlanSnapshot(raw: unknown): PlanSnapshot | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const s = raw as Record<string, unknown>;
  const exercises = (Array.isArray(s.exercises) ? s.exercises : [])
    .map((e): SnapshotExercise | null => {
      if (!e || typeof e !== "object") return null;
      const x = e as Record<string, unknown>;
      return {
        entryId: str(x.entry_id),
        exerciseId: str(x.exercise_id),
        name: str(x.exercise_name) ?? "Cvik",
        sets: Math.max(1, num(x.sets) ?? 1),
        // Builder ukladá reps ako text ("8-10"), staršie/AI plány niekedy ako číslo.
        reps: str(x.reps) ?? (num(x.reps) != null ? String(x.reps) : null),
        loadKg: num(x.load_kg),
        tempo: str(x.tempo),
        restSeconds: num(x.rest_seconds),
      };
    })
    .filter((e): e is SnapshotExercise => e !== null);
  return {
    planId: str(s.plan_id),
    planName: str(s.plan_name),
    dayId: str(s.day_id),
    dayName: str(s.day_name),
    exercises,
    backfilled: s.backfilled === true,
  };
}

/** workout_logs.entries — nový tvar `{entryId, name, note?, sets}` aj starší `{exercise_name}`. */
export function parseLoggedEntries(raw: unknown): LoggedEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((e): LoggedEntry | null => {
      if (!e || typeof e !== "object") return null;
      const x = e as Record<string, unknown>;
      const sets = (Array.isArray(x.sets) ? x.sets : [])
        .map((s): LoggedSetValues | null => {
          if (!s || typeof s !== "object") return null;
          const r = s as Record<string, unknown>;
          const set: LoggedSetValues = {
            reps: num(r.reps),
            weight: num(r.weight),
            durationS: num(r.durationS),
            distanceM: num(r.distanceM),
            rpe: num(r.rpe),
          };
          return hasValue(set) ? set : null;
        })
        .filter((s): s is LoggedSetValues => s !== null);
      return {
        entryId: str(x.entryId),
        name: str(x.name) ?? str(x.exercise_name) ?? "Cvik",
        note: str(x.note),
        sets,
      };
    })
    .filter((e): e is LoggedEntry => e !== null);
}

export function hasValue(s: LoggedSetValues): boolean {
  return [s.reps, s.weight, s.durationS, s.distanceM, s.rpe].some((v) => v != null);
}

/**
 * Spáruje plánované cviky so zapísanými — podľa entryId, s fallbackom na názov
 * (starší záznam bez entryId). Série sa párujú podľa poradia: plánovaných je
 * `sets` rovnakých (plán nemá hodnoty po sériách), navyše odcvičené majú planned = null.
 */
export function comparePlanWithActual(snapshot: PlanSnapshot | null, entries: LoggedEntry[]): CompareExercise[] {
  const used = new Set<number>();
  const takeMatch = (p: SnapshotExercise): LoggedEntry | null => {
    let idx = p.entryId ? entries.findIndex((e, i) => !used.has(i) && e.entryId === p.entryId) : -1;
    if (idx === -1) idx = entries.findIndex((e, i) => !used.has(i) && e.name.toLowerCase() === p.name.toLowerCase());
    if (idx === -1) return null;
    used.add(idx);
    return entries[idx];
  };

  const result: CompareExercise[] = (snapshot?.exercises ?? []).map((p, i) => {
    const logged = takeMatch(p);
    const actualSets = logged?.sets ?? [];
    const count = Math.max(p.sets, actualSets.length);
    return {
      key: p.entryId ?? `p${i}`,
      name: p.name,
      status: actualSets.length > 0 ? "planned" : "skipped",
      planned: p,
      note: logged?.note ?? null,
      rows: Array.from({ length: count }, (_, j) => ({
        index: j + 1,
        planned: j < p.sets ? { reps: p.reps, loadKg: p.loadKg } : null,
        actual: actualSets[j] ?? null,
      })),
    };
  });

  entries.forEach((e, i) => {
    if (used.has(i)) return;
    result.push({
      key: e.entryId ?? `x${i}`,
      name: e.name,
      status: "extra",
      planned: null,
      note: e.note ?? null,
      rows: e.sets.map((s, j) => ({ index: j + 1, planned: null, actual: s })),
    });
  });

  return result;
}

/** Nový plán z dokončeného tréningu: plánované cviky so zachovanými hodnotami, bez výsledkov klienta. */
export function snapshotToPlanEntries(snapshot: PlanSnapshot, newId: () => string) {
  return snapshot.exercises.map((e) => ({
    entry_id: newId(),
    exercise_id: e.exerciseId,
    exercise_name: e.name,
    sets: e.sets,
    reps: e.reps ?? "10",
    load_kg: e.loadKg,
    tempo: e.tempo,
    rest_seconds: e.restSeconds,
  }));
}

/** "24. 9. 2026" — dátum dokončenia v Europe/Bratislava. */
export function formatCompletedDate(iso: string | null): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("sk-SK", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    timeZone: "Europe/Bratislava",
  }).format(new Date(iso));
}

export function formatDuration(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return m > 0 ? `${m}:${String(sec).padStart(2, "0")} min` : `${sec} s`;
}

export function formatDistance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toLocaleString("sk-SK", { maximumFractionDigits: 2 })} km` : `${m} m`;
}

/** Spodná hranica plánovaných opakovaní: "8-10" → 8, "12" → 12, "max" → null. */
export function plannedRepsMin(reps: string | null): number | null {
  const m = reps?.match(/\d+/);
  return m ? Number(m[0]) : null;
}

/**
 * Ako séria dopadla oproti plánu — pre jemné zvýraznenie v detaile trénera.
 * below = menej opakovaní alebo nižšia váha než plán, above = viac (a nič menej),
 * met = presne podľa plánu; null keď niet s čím porovnať.
 */
export function rowTone(row: CompareRow): "below" | "above" | "met" | null {
  if (!row.planned || !row.actual) return null;
  const cmp: number[] = [];
  const reps = plannedRepsMin(row.planned.reps);
  if (reps != null && row.actual.reps != null) cmp.push(Math.sign(row.actual.reps - reps));
  if (row.planned.loadKg != null && row.actual.weight != null) cmp.push(Math.sign(row.actual.weight - row.planned.loadKg));
  if (cmp.length === 0) return null;
  if (cmp.some((c) => c < 0)) return "below";
  if (cmp.some((c) => c > 0)) return "above";
  return "met";
}
