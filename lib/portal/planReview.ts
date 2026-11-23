// Vyhodnotenie celého odcvičeného vlastného plánu (Náhľad v Tréningu, feature/nahlad-analytika).
// Čistý výpočet bez DB — dáta načíta lib/portal/planReviewData.ts, DEV náhľad ho volá
// so statickými zápismi. Klient sa na hotový plán pozerá, aby videl, ako mu išiel a čo ďalej:
// súhrn, nové rekordy oproti obdobiu pred plánom, krátke zistenia (plán vs. skutočnosť),
// históriu cvikov (najťažšia séria + objem) a cviky pripravené na progresiu („Zopakovať s progresiou“).

import { compareLog, hasValue, parseLoggedEntries, setTones, type CompareExercise } from "@/lib/workouts/completed";

/** Jeden tréning (dátum) pri cviku: najťažšia séria a celkový objem (Σ opakovania × kg). */
export interface ReviewPoint {
  date: string;
  bestKg: number;
  reps: number;
  volumeKg: number;
}

export interface ReviewRecord {
  name: string;
  kg: number;
  reps: number;
  date: string;
  /** najťažšia séria pred začiatkom plánu */
  prevKg: number;
}

export type ReviewInsight =
  /** všetky plánované série splnené — pripravené na vyššiu záťaž */
  | { kind: "progress"; name: string; kg: number }
  /** cvik bez záťaže, opakovaní vždy viac než v pláne */
  | { kind: "moreReps"; name: string }
  /** pri poslednom tréningu menej sérií, než bolo v pláne */
  | { kind: "fewerSets"; name: string; done: number; planned: number }
  /** cvik z plánu ani raz nezapísaný (koľkokrát) */
  | { kind: "skipped"; name: string; times: number };

export interface ReviewWorkout {
  date: string;
  dayId: string;
  dayName: string;
  rpe: number | null;
  note: string | null;
}

export interface PlanReview {
  from: string | null;
  to: string | null;
  workouts: number;
  /** všetky zapísané série (aj navyše) */
  sets: number;
  /** plánované série / z nich odcvičené — splnenosť plánu */
  plannedSets: number;
  plannedSetsDone: number;
  volumeKg: number;
  avgRpe: number | null;
  records: ReviewRecord[];
  insights: ReviewInsight[];
  /** história cviku (zjednotený názov) zo VŠETKÝCH tréningov klienta, najstaršie prvé */
  series: Record<string, ReviewPoint[]>;
  /** entryId (cviky plánu aj zápisov) → zjednotený názov — kľúč do `series` */
  names: Record<string, string>;
  /** cviky pripravené na progresiu (všetky série splnené pri poslednom tréningu): entryId → plánovaná záťaž (kg) */
  ready: Record<string, number>;
  timeline: ReviewWorkout[];
}

export interface ReviewLogInput {
  id: string;
  dayId: string | null;
  performedOn: string;
  completedAt: string | null;
  rpe: number | null;
  note: string | null;
  entries: unknown;
  planSnapshot: unknown;
}

export interface ReviewDayInput {
  id: string;
  name: string;
  exercises: unknown;
}

/** voľby progresie v okne „Zopakovať s progresiou“ (%) a predvolená */
export const PROGRESSION_OPTIONS = [2.5, 5, 7.5, 10] as const;
export const DEFAULT_PROGRESSION = 5;

/**
 * Nová záťaž po progresii o `pct` %: zaokrúhlená na 0,5 kg (kotúče), pri malej váhe
 * aspoň o 0,5 kg vyššia — inak by 2,5 % z 10 kg ostalo na 10 kg.
 */
export function progressLoad(kg: number, pct: number): number {
  if (pct <= 0) return kg;
  const raw = kg * (1 + pct / 100);
  return Math.max(Math.round(raw * 2) / 2, kg + 0.5);
}
const MAX_RECORDS = 4;
const MAX_INSIGHTS = 6;

type NameOf = (entryId: string | null, storedName: string) => string;

/** Najťažšia séria (váha, pri zhode viac opakovaní) a objem jedného zápisu cviku. */
function entryStats(sets: { reps: number | null; weight: number | null }[]): { best: { kg: number; reps: number } | null; volume: number } {
  let best: { kg: number; reps: number } | null = null;
  let volume = 0;
  for (const s of sets) {
    if (s.weight == null) continue;
    if (s.reps != null) volume += s.reps * s.weight;
    const reps = s.reps ?? 0;
    if (!best || s.weight > best.kg || (s.weight === best.kg && reps > best.reps)) best = { kg: s.weight, reps };
  }
  return { best, volume };
}

export function buildPlanReview({
  days,
  logs,
  nameOf,
}: {
  days: ReviewDayInput[];
  /** všetky zápisy klienta (aj z iných plánov — história cvikov) */
  logs: ReviewLogInput[];
  nameOf: NameOf;
}): PlanReview {
  const dayById = new Map(days.map((d) => [d.id, d]));
  const ordered = [...logs].sort(
    (a, b) => a.performedOn.localeCompare(b.performedOn) || (a.completedAt ?? "").localeCompare(b.completedAt ?? ""),
  );
  const planLogs = ordered.filter((l) => l.dayId && dayById.has(l.dayId));

  // ---- história cvikov (všetky tréningy klienta), za dátum jeden bod ----
  const byName = new Map<string, Map<string, ReviewPoint>>();
  for (const log of ordered) {
    for (const e of parseLoggedEntries(log.entries)) {
      const name = nameOf(e.entryId, e.name);
      const { best, volume } = entryStats(e.sets);
      if (!best) continue;
      const byDate = byName.get(name) ?? new Map<string, ReviewPoint>();
      byName.set(name, byDate);
      const prev = byDate.get(log.performedOn);
      if (!prev) {
        byDate.set(log.performedOn, { date: log.performedOn, bestKg: best.kg, reps: best.reps, volumeKg: Math.round(volume) });
      } else {
        const heavier = best.kg > prev.bestKg || (best.kg === prev.bestKg && best.reps > prev.reps);
        byDate.set(log.performedOn, {
          date: log.performedOn,
          bestKg: heavier ? best.kg : prev.bestKg,
          reps: heavier ? best.reps : prev.reps,
          volumeKg: prev.volumeKg + Math.round(volume),
        });
      }
    }
  }
  const series: Record<string, ReviewPoint[]> = {};
  for (const [name, byDate] of byName) series[name] = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));

  const from = planLogs[0]?.performedOn ?? null;
  const to = planLogs[planLogs.length - 1]?.performedOn ?? null;

  // ---- súhrn plánu ----
  let sets = 0;
  let plannedSets = 0;
  let plannedSetsDone = 0;
  let volumeKg = 0;
  const rpes: number[] = [];
  const skippedTimes = new Map<string, number>();
  const names: Record<string, string> = {};
  const compares = new Map<string, CompareExercise[]>();
  for (const log of planLogs) {
    const { exercises } = compareLog(log.planSnapshot, log.entries);
    compares.set(log.id, exercises);
    if (log.rpe != null) rpes.push(log.rpe);
    for (const ex of exercises) {
      const name = nameOf(ex.planned?.entryId ?? (ex.status === "extra" ? ex.key : null), ex.name);
      if (ex.planned?.entryId) names[ex.planned.entryId] = name;
      else if (ex.status === "extra") names[ex.key] = name;
      if (ex.status === "skipped") skippedTimes.set(name, (skippedTimes.get(name) ?? 0) + 1);
      for (const row of ex.rows) {
        const done = row.actual != null && hasValue(row.actual);
        if (done) sets++;
        if (row.planned) {
          plannedSets++;
          if (done) plannedSetsDone++;
        }
        if (done && row.actual!.reps != null && row.actual!.weight != null) volumeKg += row.actual!.reps * row.actual!.weight;
      }
    }
  }
  for (const d of days) {
    for (const e of (Array.isArray(d.exercises) ? d.exercises : []) as { entry_id?: string; exercise_name?: string }[]) {
      if (e.entry_id && e.exercise_name && !names[e.entry_id]) names[e.entry_id] = nameOf(e.entry_id, e.exercise_name);
    }
  }

  // ---- rekordy: najťažšia séria počas plánu vs. pred ním ----
  const records: ReviewRecord[] = [];
  if (from && to) {
    const planNames = new Set(Object.values(names));
    for (const name of planNames) {
      const points = series[name] ?? [];
      const before = points.filter((p) => p.date < from);
      const during = points.filter((p) => p.date >= from && p.date <= to);
      if (before.length === 0 || during.length === 0) continue;
      const prevKg = Math.max(...before.map((p) => p.bestKg));
      const top = during.reduce((a, b) => (b.bestKg > a.bestKg || (b.bestKg === a.bestKg && b.reps > a.reps) ? b : a));
      if (top.bestKg > prevKg) records.push({ name, kg: top.bestKg, reps: top.reps, date: top.date, prevKg });
    }
    records.sort((a, b) => b.kg - b.prevKg - (a.kg - a.prevKg));
  }

  // ---- zistenia z posledného tréningu každého dňa + návrh záťaže ----
  const latestByDay = new Map<string, ReviewLogInput>();
  for (const log of planLogs) latestByDay.set(log.dayId!, log);
  const progress: ReviewInsight[] = [];
  const moreReps: ReviewInsight[] = [];
  const fewerSets: ReviewInsight[] = [];
  const ready: Record<string, number> = {};
  for (const log of latestByDay.values()) {
    for (const ex of compares.get(log.id) ?? []) {
      if (ex.status !== "planned" || !ex.planned) continue;
      const name = ex.planned.entryId ? (names[ex.planned.entryId] ?? ex.name) : ex.name;
      const planned = ex.rows.filter((r) => r.planned);
      const done = planned.filter((r) => r.actual && hasValue(r.actual));
      if (done.length < planned.length) {
        fewerSets.push({ kind: "fewerSets", name, done: done.length, planned: planned.length });
        continue;
      }
      const tones = planned.map(setTones);
      const load = ex.planned.loadKg;
      if (load != null && load > 0) {
        const allMet = tones.every((t) => (t.reps === "met" || t.reps === "above") && (t.weight === "met" || t.weight === "above"));
        if (allMet) {
          progress.push({ kind: "progress", name, kg: load });
          if (ex.planned.entryId) ready[ex.planned.entryId] = load;
        }
      } else if (tones.length > 0 && tones.every((t) => t.reps === "above")) {
        moreReps.push({ kind: "moreReps", name });
      }
    }
  }
  const skipped: ReviewInsight[] = [...skippedTimes].map(([name, times]) => ({ kind: "skipped", name, times }));
  const seen = new Set<string>();
  const insights = [...progress, ...moreReps, ...fewerSets, ...skipped]
    .filter((i) => (seen.has(i.name) ? false : (seen.add(i.name), true)))
    .slice(0, MAX_INSIGHTS);

  return {
    from,
    to,
    workouts: planLogs.length,
    sets,
    plannedSets,
    plannedSetsDone,
    volumeKg: Math.round(volumeKg),
    avgRpe: rpes.length ? Math.round((rpes.reduce((a, b) => a + b, 0) / rpes.length) * 10) / 10 : null,
    records: records.slice(0, MAX_RECORDS),
    insights,
    series,
    names,
    ready,
    timeline: planLogs.map((l) => ({
      date: l.performedOn,
      dayId: l.dayId!,
      dayName: dayById.get(l.dayId!)?.name ?? "",
      rpe: l.rpe,
      note: l.note,
    })),
  };
}
