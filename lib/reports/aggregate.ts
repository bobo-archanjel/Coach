// FitPilot — Pokročilé reporty: agregácie (čisté funkcie nad už načítanými riadkami — žiadna DB,
// žiadny Supabase import; testy: e2e/reports.spec.ts). Načítanie dát robí lib/reports/loaders.ts.
//
// Zásady:
//  - Tréning sa počíta po TÝŽDŇOCH a odlišných DŇOCH (klient si sám volí kedy cvičí — rotačný model,
//    rovnako ako lib/portal/streak.ts); viac záznamov v ten istý deň = jeden tréning.
//  - Strava: „v pásme“ = príjem v ±10 % cieľa. Hodnotí sa len dosiahnutie cieľa, nič nad rámec
//    (žiadna gamifikácia kalórií — viď zdravotné hranice appky).

import { addDaysIso, diffDays, weekStartOf } from "./period";

export const NUTRITION_TOLERANCE = 0.1;
/** Bez zápisu aktivity (tréning aj strava) aspoň toľko dní = klient je „v riziku“. */
export const INACTIVITY_DAYS = 7;
/** Pokles tréningov: posledných 14 dní oproti predošlým 14 (viď assessRisk). */
export const DROP_WINDOW_DAYS = 14;

export const round1 = (n: number) => Math.round(n * 10) / 10;

// ---------- sila: odhad 1RM ----------

/** Nad toto číslo opakovaní je Epleyho odhad nespoľahlivý — séria sa do 1RM nerátá. */
export const MAX_E1RM_REPS = 12;

/**
 * Odhad jednoopakovacieho maxima (Epley): váha × (1 + opakovania / 30). Pre 1 opakovanie je to
 * samotná váha. `null` pri nulovej/zápornej váhe, 0 opakovaniach alebo > 12 opakovaniach.
 */
export function epley1RM(weight: number | null | undefined, reps: number | null | undefined): number | null {
  if (weight == null || reps == null || !(weight > 0) || !(reps >= 1) || reps > MAX_E1RM_REPS) return null;
  return reps === 1 ? round1(weight) : round1(weight * (1 + reps / 30));
}

type LoggedSet = { reps?: number | null; weight?: number | null };
export type LoggedEntry = { entryId?: string | null; name?: string; sets?: LoggedSet[] };

export interface StrengthSessionPoint {
  /** performed_on */
  date: string;
  /** najťažšia séria dňa (kg) */
  bestWeightKg: number;
  /** opakovania na tej sérii */
  reps: number;
  /** najvyšší odhad 1RM zo sérií dňa; null, keď sa nedal vypočítať (len veľa opakovaní) */
  e1rm: number | null;
}

/**
 * Časový rad sily per cvik z workout_logs.entries. Za deň a cvik jeden bod: najťažšia séria
 * (pri zhode viac opakovaní) a najvyšší odhad 1RM. Série bez váhy (vlastná váha) sa preskočia.
 * `nameOf` zjednocuje názov cviku (viď buildExerciseNameResolver v lib/dashboard/bodyMetrics.ts).
 */
export function strengthSeries<R extends { performed_on: string; entries: unknown }>(
  rows: R[],
  nameOf: (row: R, entry: LoggedEntry) => string | null,
): Record<string, StrengthSessionPoint[]> {
  const byName = new Map<string, Map<string, StrengthSessionPoint>>();
  for (const row of rows) {
    const entries = Array.isArray(row.entries) ? (row.entries as LoggedEntry[]) : [];
    for (const entry of entries) {
      const name = nameOf(row, entry);
      if (!name) continue;
      let best: { weight: number; reps: number } | null = null;
      let bestE1rm: number | null = null;
      for (const s of entry.sets ?? []) {
        if (s.weight == null || !(s.weight > 0)) continue;
        const reps = s.reps ?? 0;
        if (!best || s.weight > best.weight || (s.weight === best.weight && reps > best.reps)) best = { weight: s.weight, reps };
        const e = epley1RM(s.weight, reps);
        if (e != null && (bestE1rm == null || e > bestE1rm)) bestE1rm = e;
      }
      if (!best) continue;
      const days = byName.get(name) ?? new Map<string, StrengthSessionPoint>();
      const prev = days.get(row.performed_on);
      if (!prev) {
        days.set(row.performed_on, { date: row.performed_on, bestWeightKg: best.weight, reps: best.reps, e1rm: bestE1rm });
      } else {
        // ten istý cvik dvakrát v jednom dni (zlúčené duplicity knižnice) — ponechá sa to najlepšie
        const heavier = best.weight > prev.bestWeightKg || (best.weight === prev.bestWeightKg && best.reps > prev.reps);
        days.set(row.performed_on, {
          date: row.performed_on,
          bestWeightKg: heavier ? best.weight : prev.bestWeightKg,
          reps: heavier ? best.reps : prev.reps,
          e1rm: bestE1rm == null ? prev.e1rm : prev.e1rm == null ? bestE1rm : Math.max(prev.e1rm, bestE1rm),
        });
      }
      byName.set(name, days);
    }
  }
  const out: Record<string, StrengthSessionPoint[]> = {};
  for (const [name, days] of byName) out[name] = [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

export interface SeriesPoint {
  date: string;
  value: number;
}

export interface Comparison {
  startDate: string;
  endDate: string;
  start: number;
  end: number;
  /** end − start, 1 desatinné miesto */
  delta: number;
  /** zmena v % z počiatku, null pri nulovom počiatku */
  pct: number | null;
}

/** Začiatok vs. koniec obdobia (prvý vs. posledný bod); `null` pod 2 bodmi — nie je čo porovnať. */
export function compareSeries(points: SeriesPoint[]): Comparison | null {
  if (points.length < 2) return null;
  const first = points[0];
  const last = points[points.length - 1];
  const delta = round1(last.value - first.value);
  return {
    startDate: first.date,
    endDate: last.date,
    start: first.value,
    end: last.value,
    delta,
    pct: first.value !== 0 ? round1((delta / first.value) * 100) : null,
  };
}

/** Rad pre graf/porovnanie sily: odhad 1RM (kde sa dá), inak najťažšia séria. */
export function strengthValueSeries(points: StrengthSessionPoint[]): SeriesPoint[] {
  return points.map((p) => ({ date: p.date, value: p.e1rm ?? p.bestWeightKg }));
}

// ---------- adherencia tréningu ----------

export interface WeekAdherence {
  weekStart: string;
  /** odlišné tréningové dni v týždni */
  sessions: number;
  /** týždenný cieľ (plánované tréningy za týždeň) */
  target: number;
  /** splnenie cieľa v % (max. 100) */
  pct: number;
  met: boolean;
  /** týždeň ešte prebieha — do priemeru sa nerátá, kým neskončí */
  current: boolean;
}

/**
 * Splnené tréningy oproti cieľu po týždňoch. `weeks` = pondelky; `target` = koľko tréningov
 * za týždeň sa očakáva (dni aktívneho plánu, viď weeklyTarget), minimum 1.
 */
export function weeklyTrainingAdherence(trainedDates: Iterable<string>, weeks: string[], target: number, today: string): WeekAdherence[] {
  const goal = Math.max(1, Math.round(target));
  const daysByWeek = new Map<string, Set<string>>();
  for (const d of trainedDates) {
    const w = weekStartOf(d);
    const set = daysByWeek.get(w) ?? new Set<string>();
    set.add(d);
    daysByWeek.set(w, set);
  }
  const thisWeek = weekStartOf(today);
  return weeks.map((weekStart) => {
    const sessions = daysByWeek.get(weekStart)?.size ?? 0;
    return {
      weekStart,
      sessions,
      target: goal,
      pct: Math.min(100, Math.round((sessions / goal) * 100)),
      met: sessions >= goal,
      current: weekStart === thisWeek,
    };
  });
}

export interface TrainingSummary {
  /** priemerné splnenie týždňov v %; null bez jediného týždňa */
  pct: number | null;
  /** odcvičené tréningy v období */
  sessions: number;
  /** splnené týždne z ukončených */
  weeksMet: number;
  weeksCounted: number;
}

/** Súhrn týždňov: priemer % ukončených týždňov (prebiehajúci len ak je jediný). */
export function trainingSummary(weeks: WeekAdherence[]): TrainingSummary {
  const completed = weeks.filter((w) => !w.current);
  const counted = completed.length > 0 ? completed : weeks;
  if (counted.length === 0) return { pct: null, sessions: 0, weeksMet: 0, weeksCounted: 0 };
  return {
    pct: Math.round(counted.reduce((s, w) => s + w.pct, 0) / counted.length),
    sessions: weeks.reduce((s, w) => s + w.sessions, 0),
    weeksMet: counted.filter((w) => w.met).length,
    weeksCounted: counted.length,
  };
}

// ---------- adherencia stravy ----------

export interface FoodRowLike {
  eaten_on: string;
  grams: number;
  kcal_100g: number;
  protein_100g: number;
}

export interface DailyIntake {
  kcal: number;
  protein: number;
}

/** Súčet kcal a bielkovín po dňoch z riadkov food_logs (gramáž × hodnoty na 100 g). */
export function aggregateFoodDaily(rows: FoodRowLike[]): Map<string, DailyIntake> {
  const out = new Map<string, DailyIntake>();
  for (const r of rows) {
    const cur = out.get(r.eaten_on) ?? { kcal: 0, protein: 0 };
    cur.kcal += (r.grams * r.kcal_100g) / 100;
    cur.protein += (r.grams * r.protein_100g) / 100;
    out.set(r.eaten_on, cur);
  }
  return out;
}

export interface NutritionSummary {
  hasGoal: boolean;
  kcalTarget: number | null;
  proteinTarget: number | null;
  /** dní v období (po dnešok) */
  daysTotal: number;
  /** dni so zapísanou aspoň jednou položkou */
  daysLogged: number;
  /** podiel dní so zápisom v % */
  loggedPct: number | null;
  /** priemerný príjem za dni so zápisom */
  avgKcal: number | null;
  avgProtein: number | null;
  /** priemerný príjem v % cieľa (kcal / bielkoviny) */
  avgKcalPct: number | null;
  avgProteinPct: number | null;
  /** dni so zápisom, kde bol príjem v ±10 % cieľa */
  daysWithin: number;
  /** podiel dní v pásme z dní so zápisom, % */
  withinPct: number | null;
}

/** Strava oproti cieľom z nutrition_profiles (kcal/bielkoviny) v rozsahu <from, to>. */
export function nutritionSummary(
  daily: Map<string, DailyIntake>,
  range: { from: string; to: string },
  targets: { kcal: number | null; protein: number | null },
): NutritionSummary {
  const daysTotal = Math.max(0, diffDays(range.from, range.to) + 1);
  let daysLogged = 0;
  let kcalSum = 0;
  let proteinSum = 0;
  let within = 0;
  for (const [date, v] of daily) {
    if (date < range.from || date > range.to) continue;
    daysLogged++;
    kcalSum += v.kcal;
    proteinSum += v.protein;
    if (targets.kcal && Math.abs(v.kcal / targets.kcal - 1) <= NUTRITION_TOLERANCE + 1e-9) within++;
  }
  const avgKcal = daysLogged > 0 ? Math.round(kcalSum / daysLogged) : null;
  const avgProtein = daysLogged > 0 ? Math.round(proteinSum / daysLogged) : null;
  return {
    hasGoal: targets.kcal != null && targets.kcal > 0,
    kcalTarget: targets.kcal,
    proteinTarget: targets.protein,
    daysTotal,
    daysLogged,
    loggedPct: daysTotal > 0 ? Math.round((daysLogged / daysTotal) * 100) : null,
    avgKcal,
    avgProtein,
    avgKcalPct: avgKcal != null && targets.kcal ? Math.round((avgKcal / targets.kcal) * 100) : null,
    avgProteinPct: avgProtein != null && targets.protein ? Math.round((avgProtein / targets.protein) * 100) : null,
    daysWithin: targets.kcal ? within : 0,
    withinPct: targets.kcal && daysLogged > 0 ? Math.round((within / daysLogged) * 100) : null,
  };
}

// ---------- riziko ----------

export type RiskReason = "inactive" | "trainingDrop" | "lowAdherence";

export interface RiskInput {
  today: string;
  /** posledný odcvičený tréning (performed_on) */
  lastWorkoutOn: string | null;
  /** posledný zápis jedla (eaten_on) */
  lastFoodOn: string | null;
  /** kedy sa klient spároval — nový klient nie je „neaktívny“, kým neuplynie lehota */
  pairedOn: string | null;
  /** odlišné tréningové dni v posledných DROP_WINDOW_DAYS dňoch */
  recentSessions: number;
  /** odlišné tréningové dni v DROP_WINDOW_DAYS dňoch pred nimi */
  previousSessions: number;
  /** skóre portfólia je v koši „Riziko“ (lib/dashboard/portfolioStatus.ts → clientStatus === "risk") */
  lowAdherence?: boolean;
}

export interface RiskAssessment {
  atRisk: boolean;
  reasons: RiskReason[];
  /** dní od poslednej aktivity (tréning/jedlo, inak od spárovania); null = nedá sa určiť */
  daysInactive: number | null;
}

/**
 * Klient „v riziku“, ak: (1) žiadny tréning ani zápis jedla INACTIVITY_DAYS+ dní (pri úplne
 * novom klientovi sa počíta od spárovania), (2) tréningy v posledných 14 dňoch klesli pod
 * polovicu predošlých 14 (aspoň 2 predtým), alebo (3) celkové skóre je v koši „Riziko“.
 */
export function assessRisk(input: RiskInput): RiskAssessment {
  const reasons: RiskReason[] = [];
  const lastActivity = [input.lastWorkoutOn, input.lastFoodOn].filter((d): d is string => !!d).sort().at(-1) ?? input.pairedOn;
  const daysInactive = lastActivity ? Math.max(0, diffDays(lastActivity, input.today)) : null;
  if (daysInactive != null && daysInactive >= INACTIVITY_DAYS) reasons.push("inactive");
  if (input.previousSessions >= 2 && input.recentSessions * 2 < input.previousSessions) reasons.push("trainingDrop");
  if (input.lowAdherence) reasons.push("lowAdherence");
  return { atRisk: reasons.length > 0, reasons, daysInactive };
}

/** Počet odlišných dní z dátumov v <from, to> (vrátane). */
export function countDistinctDays(dates: Iterable<string>, from: string, to: string): number {
  const set = new Set<string>();
  for (const d of dates) if (d >= from && d <= to) set.add(d);
  return set.size;
}

/** Okná pre pokles tréningov: [posledných 14 dní] a [14 dní pred nimi]. */
export function dropWindows(today: string): { recent: { from: string; to: string }; previous: { from: string; to: string } } {
  const recentFrom = addDaysIso(today, -(DROP_WINDOW_DAYS - 1));
  return {
    recent: { from: recentFrom, to: today },
    previous: { from: addDaysIso(recentFrom, -DROP_WINDOW_DAYS), to: addDaysIso(recentFrom, -1) },
  };
}

// ---------- portfólio ----------

export interface MonthlyCooperation {
  month: string;
  started: number;
  ended: number;
}

/** Nové a ukončené spolupráce po mesiacoch (paired_at / ended_at klientov). */
export function monthlyCooperations(
  clients: { paired_at: string | null; ended_at: string | null }[],
  months: string[],
): MonthlyCooperation[] {
  const idx = new Map(months.map((m, i) => [m, i]));
  const out: MonthlyCooperation[] = months.map((month) => ({ month, started: 0, ended: 0 }));
  for (const c of clients) {
    const s = c.paired_at ? idx.get(c.paired_at.slice(0, 7)) : undefined;
    if (s != null) out[s].started++;
    const e = c.ended_at ? idx.get(c.ended_at.slice(0, 7)) : undefined;
    if (e != null) out[e].ended++;
  }
  return out;
}

export interface WeeklyActivity {
  weekStart: string;
  /** tréningové dni všetkých klientov (klient × deň) */
  workouts: number;
  /** koľko klientov v týždni cvičilo */
  trainedClients: number;
}

/** Aktivita portfólia po týždňoch z workout_logs (client_id, performed_on). */
export function weeklyActivity(logs: { client_id: string; performed_on: string }[], weeks: string[]): WeeklyActivity[] {
  const byWeek = new Map<string, { days: Set<string>; clients: Set<string> }>();
  for (const l of logs) {
    const w = weekStartOf(l.performed_on);
    const cur = byWeek.get(w) ?? { days: new Set<string>(), clients: new Set<string>() };
    cur.days.add(`${l.client_id}|${l.performed_on}`);
    cur.clients.add(l.client_id);
    byWeek.set(w, cur);
  }
  return weeks.map((weekStart) => {
    const cur = byWeek.get(weekStart);
    return { weekStart, workouts: cur?.days.size ?? 0, trainedClients: cur?.clients.size ?? 0 };
  });
}

/** Cieľ tréningov za týždeň z počtu dní aktívneho plánu (1–7); bez plánu predvolený cieľ. */
export function weeklyTarget(planDays: number | null | undefined, fallback: number): number {
  if (!planDays || planDays < 1) return fallback;
  return Math.min(7, Math.max(1, Math.round(planDays)));
}
