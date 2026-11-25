// FitPilot — týždenné misie klienta (gamifikácia v2). Čisté funkcie, žiadna DB
// (testy: e2e/gamification-v2.spec.ts); dáta a ukladanie rieši lib/gamification/missionsServer.ts.
//
// Každý týždeň (od pondelka) dostane klient 3 osobné misie. Výber je DETERMINISTICKÝ —
// seed = klient + pondelok týždňa — takže nepotrebuje cron: server ich pri prvom zobrazení
// týždňa vygeneruje a uloží (ďalšie zobrazenia už len čítajú). Ciele vychádzajú z posledných
// 4 týždňov klienta a z plánu (spravodlivo: o krok nad bežným tempom, nikdy nad plán).
//
// Zásady: len pozitívne, nikdy misia za chudnutie ani za trafenie kalórií. Jedlo sa počíta
// ako „zapísal si“, bielkoviny len ako dosiahnutý minimálny cieľ.

import { addDaysIso, diffDays, weekStartOf } from "@/lib/reports/period";
import type { LoggedEntry } from "@/lib/reports/aggregate";
import { exerciseKeyOf, totalVolumeKg } from "./records";
import { XP_MISSION_BONUS } from "./xp";

export const MISSION_KINDS = ["workouts", "food_days", "pr_exercise", "protein_days", "workout_by_wed", "volume", "measurement", "sets"] as const;
export type MissionKind = (typeof MISSION_KINDS)[number];

export const MISSIONS_PER_WEEK = 3;
/** XP za splnenú misiu podľa druhu. */
export const MISSION_XP: Readonly<Record<MissionKind, number>> = {
  workouts: 40,
  food_days: 30,
  pr_exercise: 50,
  protein_days: 30,
  workout_by_wed: 25,
  volume: 40,
  measurement: 20,
  sets: 30,
};
export { XP_MISSION_BONUS };

/** Bez nových meraní tak dlho sa ponúkne misia „Zapíš meranie“. */
export const MEASUREMENT_STALE_DAYS = 28;
/** Cvik sa pre misiu rekordu ponúkne, až keď ho klient za posledných 60 dní odcvičil aspoň takto veľakrát. */
export const PR_MISSION_MIN_SESSIONS = 3;

export interface MissionSpec {
  kind: MissionKind;
  target: number;
  xp: number;
  params: { exerciseKey?: string; exerciseName?: string };
}

export function isMissionKind(v: unknown): v is MissionKind {
  return typeof v === "string" && (MISSION_KINDS as readonly string[]).includes(v);
}

// ---------- seed ----------

/** FNV-1a 32-bit hash reťazca. */
export function hashSeed(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 — malý deterministický generátor čísel v <0, 1). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- kontext (z dát klienta) ----------

export interface MissionContext {
  /** pondelok týždňa misií */
  weekStart: string;
  /** dnešok (rozhoduje, čo sa ešte stihne) */
  today: string;
  /** týždenný cieľ tréningov z plánu (1–7) */
  planTarget: number;
  /** posledné 4 CELÉ týždne, najnovší prvý */
  last4: { workouts: number[]; foodDays: number[]; proteinDays: number[]; volumeKg: number[]; sets: number[] };
  proteinTarget: number | null;
  /** často cvičené cviky s váhou (za posledných 60 dní) */
  topExercises: { key: string; name: string; sessions: number }[];
  /** dni od posledného merania; null = ešte žiadne */
  daysSinceMeasurement: number | null;
  /** už splnené v tomto týždni (pri prvom zobrazení uprostred týždňa) */
  doneThisWeek: { workoutDays: number; foodDays: number; proteinDays: number };
}

export interface MissionContextInput {
  today: string;
  planTarget: number;
  /** tréningy za posledných ~60 dní (aspoň 4 celé týždne + tento) */
  logs: { performedOn: string; entries: unknown }[];
  /** dni so zápisom jedla a bielkoviny (aspoň posledných 5 týždňov) */
  foodDaily: { date: string; protein: number }[];
  proteinTarget: number | null;
  lastMeasurementOn: string | null;
  /** úroveň splnenia dňa bielkovín (rovnaké pravidlo ako prstence) */
  proteinMet: (protein: number, target: number | null) => boolean;
}

/** Počet zapísaných sérií (s opakovaniami alebo časom) v jednom tréningu. */
export function setsInLog(entries: unknown): number {
  let n = 0;
  for (const e of Array.isArray(entries) ? (entries as { sets?: { reps?: number | null; durationS?: number | null }[] }[]) : []) {
    for (const s of e?.sets ?? []) if (s && ((s.reps ?? 0) > 0 || (s.durationS ?? 0) > 0)) n++;
  }
  return n;
}

/** Zloží kontext misií zo surových dát (čistá funkcia — rovnaký vstup = rovnaký kontext). */
export function buildMissionContext(i: MissionContextInput): MissionContext {
  const weekStart = weekStartOf(i.today);
  const prevStarts = [1, 2, 3, 4].map((k) => addDaysIso(weekStart, -7 * k));
  const weekOf = (d: string) => weekStartOf(d);
  const idx = new Map(prevStarts.map((w, k) => [w, k]));

  // počty tréningov (každý dokončený tréning sa rátá, aj viac za deň)
  const counts = [0, 0, 0, 0];
  const volume = [0, 0, 0, 0];
  const sets = [0, 0, 0, 0];
  let thisWeekCount = 0;
  const sessions = new Map<string, { name: string; n: number }>();
  const sixty = addDaysIso(i.today, -60);

  for (const log of i.logs) {
    const w = weekOf(log.performedOn);
    const k = idx.get(w);
    if (k !== undefined) {
      counts[k]++;
      volume[k] += totalVolumeKg([log]);
      sets[k] += setsInLog(log.entries);
    }
    if (w === weekStart) thisWeekCount++;
    if (log.performedOn >= sixty) {
      const seen = new Set<string>();
      for (const e of Array.isArray(log.entries) ? (log.entries as LoggedEntry[]) : []) {
        const name = typeof e?.name === "string" ? e.name.trim() : "";
        if (!name) continue;
        const hasLoad = (e.sets ?? []).some((s) => s?.weight != null && s.weight > 0 && s.reps != null && s.reps >= 1);
        const key = exerciseKeyOf(name);
        if (!hasLoad || seen.has(key)) continue;
        seen.add(key);
        const cur = sessions.get(key);
        sessions.set(key, { name: cur?.name ?? name, n: (cur?.n ?? 0) + 1 });
      }
    }
  }

  const foodDays = [0, 1, 2, 3].map(() => 0);
  const proteinDays = [0, 1, 2, 3].map(() => 0);
  let foodNow = 0;
  let proteinNow = 0;
  for (const f of i.foodDaily) {
    const w = weekOf(f.date);
    const met = i.proteinMet(f.protein, i.proteinTarget);
    const k = idx.get(w);
    if (k !== undefined) {
      foodDays[k]++;
      if (met) proteinDays[k]++;
    }
    if (w === weekStart) {
      foodNow++;
      if (met) proteinNow++;
    }
  }

  return {
    weekStart,
    today: i.today,
    planTarget: Math.min(7, Math.max(1, Math.round(i.planTarget))),
    last4: { workouts: counts, foodDays, proteinDays, volumeKg: volume.map(Math.round), sets },
    proteinTarget: i.proteinTarget,
    topExercises: [...sessions]
      .map(([key, v]) => ({ key, name: v.name, sessions: v.n }))
      .filter((e) => e.sessions >= PR_MISSION_MIN_SESSIONS)
      .sort((a, b) => b.sessions - a.sessions || a.key.localeCompare(b.key))
      .slice(0, 5),
    daysSinceMeasurement: i.lastMeasurementOn ? Math.max(0, diffDays(i.lastMeasurementOn, i.today)) : null,
    doneThisWeek: { workoutDays: thisWeekCount, foodDays: foodNow, proteinDays: proteinNow },
  };
}

// ---------- generovanie ----------

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Dni do konca týždňa vrátane dneška (pondelok = 7 … nedeľa = 1). */
export function daysLeftInWeek(weekStart: string, today: string): number {
  return clamp(7 - diffDays(weekStart, today), 1, 7);
}

/** Spravodlivý cieľ tréningov: o 1 nad bežným tempom (posledné 4 týždne), nikdy nad plán a nikdy viac, než sa tento týždeň stihne. */
export function fairWorkoutTarget(ctx: MissionContext): number {
  const base = clamp(ctx.planTarget, 1, 5);
  const hasHistory = ctx.last4.workouts.some((n) => n > 0);
  const fair = hasHistory ? clamp(Math.round(mean(ctx.last4.workouts)) + 1, 1, base) : Math.min(base, 2);
  return Math.max(1, Math.min(fair, ctx.doneThisWeek.workoutDays + daysLeftInWeek(ctx.weekStart, ctx.today)));
}

export function fairFoodTarget(ctx: MissionContext): number {
  const hasHistory = ctx.last4.foodDays.some((n) => n > 0);
  const fair = hasHistory ? clamp(Math.round(mean(ctx.last4.foodDays)) + 1, 3, 6) : 3;
  return Math.max(1, Math.min(fair, ctx.doneThisWeek.foodDays + daysLeftInWeek(ctx.weekStart, ctx.today)));
}

export function fairProteinTarget(ctx: MissionContext): number {
  const hasHistory = ctx.last4.proteinDays.some((n) => n > 0);
  const fair = hasHistory ? clamp(Math.round(mean(ctx.last4.proteinDays)) + 1, 2, 5) : 2;
  return Math.max(1, Math.min(fair, ctx.doneThisWeek.proteinDays + daysLeftInWeek(ctx.weekStart, ctx.today)));
}

/** Cieľový týždenný objem: bežný objem (priemer nenulových týždňov) × 1,1, zaokrúhlený na 50 kg; null = nemá z čoho vychádzať. */
export function fairVolumeTarget(ctx: MissionContext): number | null {
  const typical = mean(ctx.last4.volumeKg.filter((v) => v > 0));
  if (typical < 400) return null;
  return Math.max(500, Math.round((typical * 1.1) / 50) * 50);
}

export function fairSetsTarget(ctx: MissionContext): number {
  const nonZero = ctx.last4.sets.filter((v) => v > 0);
  if (nonZero.length === 0) return 10;
  return clamp(Math.round((mean(nonZero) * 1.1) / 5) * 5, 5, 80);
}

interface Candidate {
  spec: MissionSpec;
  weight: number;
}

/** Kandidáti misií (okrem kotvy `workouts`), ktoré sa pre klienta hodia — s váhou výberu. */
export function missionCandidates(ctx: MissionContext): Candidate[] {
  const out: Candidate[] = [];
  const spec = (kind: MissionKind, target: number, params: MissionSpec["params"] = {}): MissionSpec => ({ kind, target, xp: MISSION_XP[kind], params });
  const left = daysLeftInWeek(ctx.weekStart, ctx.today);

  out.push({ spec: spec("food_days", fairFoodTarget(ctx)), weight: 3 });
  if (ctx.proteinTarget != null && ctx.proteinTarget > 0) out.push({ spec: spec("protein_days", fairProteinTarget(ctx)), weight: 2 });
  if (ctx.topExercises.length > 0) {
    // rekord sa ponúka len pre často cvičený cvik; výber cviku rozhoduje seed (v `generateMissions`)
    out.push({ spec: spec("pr_exercise", 1), weight: 2 });
  }
  const weekday = diffDays(ctx.weekStart, ctx.today); // 0 = pondelok
  const avg = mean(ctx.last4.workouts);
  if (ctx.planTarget >= 2 && avg >= 1 && weekday <= 2 && ctx.doneThisWeek.workoutDays === 0) {
    out.push({ spec: spec("workout_by_wed", 1), weight: 1 });
  }
  const vol = fairVolumeTarget(ctx);
  if (vol != null && left >= 4) out.push({ spec: spec("volume", vol), weight: 2 });
  if (ctx.daysSinceMeasurement == null || ctx.daysSinceMeasurement >= MEASUREMENT_STALE_DAYS) {
    out.push({ spec: spec("measurement", 1), weight: 3 });
  }
  out.push({ spec: spec("sets", fairSetsTarget(ctx)), weight: 1 });
  return out;
}

/**
 * 3 misie pre klienta a týždeň. Deterministické: rovnaké (clientId, weekStart, kontext) = rovnaký výsledok.
 * Slot 1 je vždy „Odcvič N tréningov“ (kotva), ďalšie dve sa vyberú váženým náhodným výberom bez opakovania.
 */
export function generateMissions(clientId: string, ctx: MissionContext): MissionSpec[] {
  const rand = seededRandom(hashSeed(`${clientId}|${ctx.weekStart}`));
  const anchor: MissionSpec = { kind: "workouts", target: fairWorkoutTarget(ctx), xp: MISSION_XP.workouts, params: {} };
  const pool = missionCandidates(ctx);
  const picked: MissionSpec[] = [anchor];
  while (picked.length < MISSIONS_PER_WEEK && pool.length > 0) {
    const total = pool.reduce((a, c) => a + c.weight, 0);
    let r = rand() * total;
    let at = 0;
    for (let k = 0; k < pool.length; k++) {
      r -= pool[k].weight;
      if (r < 0) {
        at = k;
        break;
      }
      at = k;
    }
    const [chosen] = pool.splice(at, 1);
    if (chosen.spec.kind === "pr_exercise") {
      const ex = ctx.topExercises[Math.floor(rand() * Math.min(3, ctx.topExercises.length))];
      picked.push({ ...chosen.spec, params: { exerciseKey: ex.key, exerciseName: ex.name } });
    } else {
      picked.push(chosen.spec);
    }
  }
  return picked;
}

// ---------- progres ----------

export interface MissionRow {
  id: string;
  slot: number;
  kind: MissionKind;
  target: number;
  xp: number;
  params: { exerciseKey?: string; exerciseName?: string };
  completedAt: string | null;
}

export interface MissionData {
  weekStart: string;
  /** tréningy tohto týždňa */
  logs: { performedOn: string; entries: unknown }[];
  /** dni so zápisom jedla tohto týždňa */
  foodDates: string[];
  /** dni tohto týždňa so splneným cieľom bielkovín */
  proteinMetDates: string[];
  /** rekordy tohto týždňa (client_achievements kind 'pr') */
  prEvents: { exerciseKey: string; achievedOn: string }[];
  /** dátumy meraní tela */
  bodyMetricDates: string[];
}

export interface MissionProgress {
  value: number;
  goal: number;
  done: boolean;
}

export function missionProgress(m: Pick<MissionRow, "kind" | "target" | "params">, d: MissionData): MissionProgress {
  const monday = d.weekStart;
  const sunday = addDaysIso(monday, 6);
  const inWeek = (date: string) => date >= monday && date <= sunday;
  const weekLogs = d.logs.filter((l) => inWeek(l.performedOn));
  let value = 0;
  switch (m.kind) {
    case "workouts":
      value = weekLogs.length; // každý dokončený tréning, aj viac za deň
      break;
    case "food_days":
      value = new Set(d.foodDates.filter(inWeek)).size;
      break;
    case "protein_days":
      value = new Set(d.proteinMetDates.filter(inWeek)).size;
      break;
    case "pr_exercise":
      value = d.prEvents.some((e) => inWeek(e.achievedOn) && e.exerciseKey === m.params.exerciseKey) ? 1 : 0;
      break;
    case "workout_by_wed":
      value = weekLogs.some((l) => l.performedOn <= addDaysIso(monday, 2)) ? 1 : 0;
      break;
    case "volume":
      value = totalVolumeKg(weekLogs);
      break;
    case "measurement":
      value = d.bodyMetricDates.some(inWeek) ? 1 : 0;
      break;
    case "sets":
      value = weekLogs.reduce((a, l) => a + setsInLog(l.entries), 0);
      break;
  }
  const goal = Math.max(1, m.target);
  return { value: Math.min(value, goal), goal, done: value >= goal };
}

export interface MissionView extends MissionRow {
  progress: MissionProgress;
}

export function evaluateMissions(rows: MissionRow[], d: MissionData): MissionView[] {
  return [...rows].sort((a, b) => a.slot - b.slot).map((r) => {
    const progress = missionProgress(r, d);
    // už uložené splnenie sa nikdy nevracia (aj keď údaj klient neskôr upraví)
    return { ...r, progress: r.completedAt ? { ...progress, value: progress.goal, done: true } : progress };
  });
}

/** Misie, ktoré sú podľa dát splnené, ale v DB ešte nie — server ich zapíše (idempotentne). */
export function newlyCompleted(views: MissionView[]): MissionView[] {
  return views.filter((v) => !v.completedAt && v.progress.done);
}

export function allMissionsDone(views: MissionView[]): boolean {
  return views.length === MISSIONS_PER_WEEK && views.every((v) => v.completedAt != null || v.progress.done);
}

/** XP z misií: splnené misie + bonus za týždne, v ktorých boli splnené všetky tri. */
export function missionXpTotal(rows: { xp: number; completedAt: string | null }[], bonusWeeks: number): number {
  return rows.reduce((a, r) => a + (r.completedAt ? r.xp : 0), 0) + Math.max(0, bonusWeeks) * XP_MISSION_BONUS;
}
