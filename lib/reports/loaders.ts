import "server-only";
import { loadMacroTarget } from "@/lib/macroTarget";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildExerciseNameResolver, type StrengthLogRow } from "@/lib/dashboard/bodyMetrics";
import { getClientAnalyticsOverview } from "@/lib/dashboard/analytics";
import { clientStatus, sortScore } from "@/lib/dashboard/portfolioStatus";
import { computeTrainingStreak, TRAINING_WEEK_TARGET } from "@/lib/portal/streak";
import {
  aggregateFoodDaily,
  assessRisk,
  compareSeries,
  countDistinctDays,
  dropWindows,
  monthlyCooperations,
  nutritionSummary,
  strengthSeries,
  strengthValueSeries,
  trainingSummary,
  weeklyActivity,
  weeklyTarget,
  weeklyTrainingAdherence,
  type SeriesPoint,
} from "./aggregate";
import { addDaysIso, lastMonths, periodRange, todayIso, weekStartOf, weekStartsBetween, type PeriodKey, type ReportRange } from "./period";
import { MEASURE_KEYS, type ClientReport, type MeasureKey, type PortfolioClientRow, type PortfolioReport, type StrengthExerciseReport } from "./types";

// Pokročilé reporty — načítanie dát (feature/Stripe). Vždy volaj až po `requireReports()`
// (lib/reports/guard.ts): tarifu overuje stráž, tu sa rieši vlastníctvo (RLS + explicitný
// trainer_id) a efektívne dopyty — ohraničené dátumy, len potrebné stĺpce, jeden dopyt na
// VŠETKÝCH klientov (nie N+1) a stránkovanie, aby PostgREST strop riadkov nič potichu neorezal.

const PAGE = 1000;
const MAX_PAGES = 30;
/** Predvolený týždenný cieľ, keď klient nemá aktívny plán s dňami (rovnaký ako séria v portáli). */
const DEFAULT_WEEKLY_TARGET = TRAINING_WEEK_TARGET;
/** Denné hodnoty stravy sa posielajú len pre krátke rozsahy (mesačný report). */
const DAILY_MAX_DAYS = 62;
const MAX_STRENGTH_EXERCISES = 40;
const PORTFOLIO_WEEKS = 12;
const PORTFOLIO_MONTHS = 12;

type PagedResult<T> = PromiseLike<{ data: T[] | null; error: unknown }>;

/** Načíta všetky stránky dopytu (range po 1000). `null` pri chybe. */
async function fetchAll<T>(build: (from: number, to: number) => PagedResult<T>): Promise<T[] | null> {
  const out: T[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await build(page * PAGE, page * PAGE + PAGE - 1);
    if (error) return null;
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) return out;
  }
  return out;
}

const emptyMeasures = (): Record<MeasureKey, SeriesPoint[]> => ({ weight: [], waist: [], chest: [], hips: [], arm: [], thigh: [] });

interface ClientHeader {
  id: string;
  full_name: string;
  paired_at: string | null;
  created_at: string | null;
  active_plan_id: string | null;
}

/** Klient tohto trénera (explicitný trainer_id navyše k RLS), alebo `null`. */
export async function getOwnedClient(supabase: SupabaseClient, trainerId: string, clientId: string): Promise<ClientHeader | null> {
  const { data } = await supabase
    .from("clients")
    .select("id, full_name, paired_at, created_at, active_plan_id")
    .eq("id", clientId)
    .eq("trainer_id", trainerId)
    .maybeSingle();
  return (data as ClientHeader | null) ?? null;
}

export interface ClientReportOptions {
  /** obdobie z UI; "month" = pevný kalendárny mesiac (PDF) */
  period: PeriodKey | "month";
  /** rozsah dní (z periodRange / monthRange) */
  range: ReportRange;
  /** body/sila bez dolnej hranice (obdobie „celá história“) */
  unboundedHistory?: boolean;
}

/** Rozsah „celá história“ potrebuje najstarší záznam klienta (inak by sa týždne ťahali od nuly). */
export async function earliestActivity(supabase: SupabaseClient, client: ClientHeader): Promise<string | null> {
  const [{ data: w }, { data: f }] = await Promise.all([
    supabase.from("workout_logs").select("performed_on").eq("client_id", client.id).order("performed_on", { ascending: true }).limit(1).maybeSingle(),
    supabase.from("food_logs").select("eaten_on").eq("client_id", client.id).order("eaten_on", { ascending: true }).limit(1).maybeSingle(),
  ]);
  return [w?.performed_on as string | undefined, f?.eaten_on as string | undefined, client.paired_at?.slice(0, 10), client.created_at?.slice(0, 10)]
    .filter((d): d is string => !!d)
    .sort()[0] ?? null;
}

/** Report jedného klienta — progres (telo, sila), adherencia (tréning, strava) a riziko. `null` = nie je jeho klient / chyba. */
export async function buildClientReport(
  supabase: SupabaseClient,
  trainerId: string,
  clientId: string,
  opts: ClientReportOptions,
): Promise<ClientReport | null> {
  const client = await getOwnedClient(supabase, trainerId, clientId);
  if (!client) return null;

  const { range } = opts;
  const today = todayIso();
  const streakFrom = addDaysIso(today, -(52 * 7));
  const strengthFrom = opts.unboundedHistory ? null : range.from;
  const drops = dropWindows(today);

  const [metricsRes, strengthRows, trainedRes, foodRows, lastFoodRes, profileRes, planDaysRes] = await Promise.all([
    (() => {
      let q = supabase
        .from("body_metrics")
        .select("measured_on, weight_kg, waist_cm, chest_cm, hips_cm, arm_cm, thigh_cm")
        .eq("client_id", clientId)
        .lte("measured_on", range.to)
        .order("measured_on", { ascending: true });
      if (!opts.unboundedHistory) q = q.gte("measured_on", range.from);
      return q;
    })(),
    fetchAll<StrengthLogRow>((a, b) => {
      let q = supabase
        .from("workout_logs")
        .select("performed_on, entries, workout_days(exercises)")
        .eq("client_id", clientId)
        .lte("performed_on", range.to)
        .order("performed_on", { ascending: true })
        .order("id", { ascending: true })
        .range(a, b);
      if (strengthFrom) q = q.gte("performed_on", strengthFrom);
      return q as unknown as PagedResult<StrengthLogRow>;
    }),
    // len dátumy tréningov za posledný rok — séria, týždenná adherencia, riziko
    fetchAll<{ performed_on: string }>((a, b) =>
      supabase
        .from("workout_logs")
        .select("performed_on")
        .eq("client_id", clientId)
        .gte("performed_on", range.from < streakFrom ? range.from : streakFrom)
        .lte("performed_on", today)
        .order("performed_on", { ascending: true })
        .order("id", { ascending: true })
        .range(a, b) as unknown as PagedResult<{ performed_on: string }>,
    ),
    fetchAll<{ eaten_on: string; grams: number; kcal_100g: number; protein_100g: number }>((a, b) =>
      supabase
        .from("food_logs")
        .select("eaten_on, grams, kcal_100g, protein_100g")
        .eq("client_id", clientId)
        .gte("eaten_on", range.from)
        .lte("eaten_on", range.to)
        .order("eaten_on", { ascending: true })
        .order("id", { ascending: true })
        .range(a, b) as unknown as PagedResult<{ eaten_on: string; grams: number; kcal_100g: number; protein_100g: number }>,
    ),
    supabase.from("food_logs").select("eaten_on").eq("client_id", clientId).order("eaten_on", { ascending: false }).limit(1).maybeSingle(),
    loadMacroTarget(supabase, clientId).then((data) => ({ data })),
    client.active_plan_id
      ? supabase.from("workout_days").select("id", { count: "exact", head: true }).eq("plan_id", client.active_plan_id)
      : Promise.resolve({ count: null as number | null }),
  ]);

  if (metricsRes.error || !strengthRows || !trainedRes || !foodRows) return null;

  // ---------- telo ----------
  const measures = emptyMeasures();
  const colOf: Record<MeasureKey, string> = { weight: "weight_kg", waist: "waist_cm", chest: "chest_cm", hips: "hips_cm", arm: "arm_cm", thigh: "thigh_cm" };
  for (const row of (metricsRes.data ?? []) as Record<string, unknown>[]) {
    for (const key of MEASURE_KEYS) {
      const v = row[colOf[key]];
      if (typeof v === "number") measures[key].push({ date: row.measured_on as string, value: v });
    }
  }
  const comparisons = Object.fromEntries(MEASURE_KEYS.map((k) => [k, compareSeries(measures[k])])) as ClientReport["comparisons"];

  // ---------- sila ----------
  const nameOf = await buildExerciseNameResolver(supabase as unknown as Parameters<typeof buildExerciseNameResolver>[0], strengthRows);
  const series = strengthSeries(strengthRows as (StrengthLogRow & { performed_on: string })[], nameOf as unknown as Parameters<typeof strengthSeries>[1]);
  const strength: StrengthExerciseReport[] = Object.entries(series)
    .map(([name, pts]) => ({
      name,
      points: pts.map((p) => ({ date: p.date, value: p.e1rm ?? p.bestWeightKg, weightKg: p.bestWeightKg, reps: p.reps })),
      comparison: compareSeries(strengthValueSeries(pts)),
      bestWeightKg: Math.max(...pts.map((p) => p.bestWeightKg)),
    }))
    .sort((a, b) => b.points.length - a.points.length || a.name.localeCompare(b.name, "sk"))
    .slice(0, MAX_STRENGTH_EXERCISES);

  // ---------- adherencia tréningu ----------
  const trainedDates = trainedRes.map((r) => r.performed_on);
  const planDays = (planDaysRes as { count: number | null }).count;
  const target = weeklyTarget(planDays, DEFAULT_WEEKLY_TARGET);
  const weeks = weeklyTrainingAdherence(
    trainedDates.filter((d) => d >= range.from && d <= range.to),
    range.weeks,
    target,
    today,
  );
  const streak = computeTrainingStreak(trainedDates, today, target);
  const lastWorkoutOn = trainedDates.length > 0 ? [...trainedDates].sort().at(-1)! : null;

  // ---------- strava ----------
  const daily = aggregateFoodDaily(foodRows);
  const kcalTarget = profileRes.data?.caloriesTarget != null ? profileRes.data.caloriesTarget : null;
  const proteinTarget = profileRes.data?.proteinG != null ? profileRes.data.proteinG : null;
  const nutrition = nutritionSummary(daily, range, { kcal: kcalTarget, protein: proteinTarget });
  const weekly = range.weeks.map((weekStart) => {
    let kcal = 0;
    let n = 0;
    for (let i = 0; i < 7; i++) {
      const d = addDaysIso(weekStart, i);
      if (d < range.from || d > range.to) continue;
      const v = daily.get(d);
      if (v) {
        kcal += v.kcal;
        n++;
      }
    }
    return { weekStart, avgKcal: n > 0 ? Math.round(kcal / n) : null, daysLogged: n };
  });
  const dailyList =
    range.days <= DAILY_MAX_DAYS
      ? [...daily.entries()]
          .filter(([d]) => d >= range.from && d <= range.to)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, v]) => ({ date, kcal: Math.round(v.kcal), protein: Math.round(v.protein) }))
      : [];

  // ---------- riziko ----------
  const lastFoodOn = (lastFoodRes.data?.eaten_on as string | undefined) ?? null;
  const risk = assessRisk({
    today,
    lastWorkoutOn,
    lastFoodOn,
    pairedOn: client.paired_at?.slice(0, 10) ?? null,
    recentSessions: countDistinctDays(trainedDates, drops.recent.from, drops.recent.to),
    previousSessions: countDistinctDays(trainedDates, drops.previous.from, drops.previous.to),
  });

  return {
    clientId,
    clientName: client.full_name,
    period: opts.period,
    from: range.from,
    to: range.to,
    today,
    measures,
    comparisons,
    strength,
    training: { weeks, summary: trainingSummary(weeks), weeklyTarget: target, hasPlan: (planDays ?? 0) > 0, streakWeeks: streak.count, lastWorkoutOn },
    nutrition: { ...nutrition, weekly, daily: dailyList },
    lastFoodOn,
    risk,
  };
}

/** Report podľa obdobia z UI (4/12/26 týždňov, celá história). */
export async function loadClientPeriodReport(
  supabase: SupabaseClient,
  trainerId: string,
  clientId: string,
  period: PeriodKey,
): Promise<ClientReport | null> {
  const today = todayIso();
  let earliest: string | null = null;
  if (period === "all") {
    const client = await getOwnedClient(supabase, trainerId, clientId);
    if (!client) return null;
    earliest = await earliestActivity(supabase, client);
  }
  const range = periodRange(period, today, earliest);
  return buildClientReport(supabase, trainerId, clientId, { period, range, unboundedHistory: period === "all" });
}

/**
 * Prehľad portfólia: počty, nové/ukončené spolupráce po mesiacoch, aktivita po týždňoch a rebríček
 * klientov. Jeden dopyt na klientov, jeden na posledný zápis jedla (embed s limitom), jeden na
 * tréningy všetkých klientov za 12 týždňov + existujúci agregát adherencie (analytics.ts) —
 * žiadne dopyty na klienta.
 */
export async function buildPortfolioReport(supabase: SupabaseClient, trainerId: string): Promise<PortfolioReport | null> {
  const today = todayIso();
  const { data: clientRows, error } = await supabase
    .from("clients")
    .select("id, full_name, paired_at, ended_at, deletion_requested_at")
    .eq("trainer_id", trainerId)
    .order("full_name");
  if (error) return null;
  const all = (clientRows ?? []) as { id: string; full_name: string; paired_at: string | null; ended_at: string | null; deletion_requested_at: string | null }[];
  // rovnaké vylúčenie ako /dashboard/analytika: ukončená spolupráca / žiadosť o zmazanie nie je aktuálna starostlivosť
  const active = all.filter((c) => !c.ended_at && !c.deletion_requested_at);
  const ids = active.map((c) => c.id);

  const thisMonday = weekStartOf(today);
  const weeksList = weekStartsBetween(addDaysIso(thisMonday, -7 * (PORTFOLIO_WEEKS - 1)), today);
  const logsFrom = weeksList[0];
  const drops = dropWindows(today);

  const [overview, logs, lastFoodRes] =
    ids.length === 0
      ? [new Map(), [], { data: [] as { id: string; food_logs: { eaten_on: string }[] | null }[], error: null }]
      : await Promise.all([
          getClientAnalyticsOverview(ids),
          fetchAll<{ client_id: string; performed_on: string }>((a, b) =>
            supabase
              .from("workout_logs")
              .select("client_id, performed_on")
              .in("client_id", ids)
              .gte("performed_on", logsFrom)
              .lte("performed_on", today)
              .order("performed_on", { ascending: true })
              .order("id", { ascending: true })
              .range(a, b) as unknown as PagedResult<{ client_id: string; performed_on: string }>,
          ),
          // posledný zápis jedla na klienta — embed s limitom na rodiča (rovnaký vzor ako lib/dashboard/lateStatus.ts)
          supabase
            .from("clients")
            .select("id, food_logs(eaten_on)")
            .in("id", ids)
            .order("eaten_on", { referencedTable: "food_logs", ascending: false })
            .limit(1, { referencedTable: "food_logs" }),
        ]);
  if (!overview || !logs) return null;

  const lastFoodBy = new Map<string, string>();
  for (const r of (lastFoodRes.data ?? []) as { id: string; food_logs: { eaten_on: string }[] | null }[]) {
    const d = r.food_logs?.[0]?.eaten_on;
    if (d) lastFoodBy.set(r.id, d);
  }
  const datesBy = new Map<string, string[]>();
  for (const l of logs) {
    const list = datesBy.get(l.client_id) ?? [];
    list.push(l.performed_on);
    datesBy.set(l.client_id, list);
  }

  const rows: PortfolioClientRow[] = [];
  for (const c of active) {
    const o = overview.get(c.id);
    if (!o) continue;
    const dates = datesBy.get(c.id) ?? [];
    const status = clientStatus(o);
    const lastFoodOn = lastFoodBy.get(c.id) ?? null;
    rows.push({
      id: c.id,
      name: c.full_name,
      pairedOn: c.paired_at?.slice(0, 10) ?? null,
      trainingPct30: o.trainingPct30,
      nutritionPct30: o.nutritionPct30,
      planPct30: o.planCompletionPct30,
      score: Math.round(sortScore(o)),
      status,
      lastTrainedOn: o.lastTrainedOn,
      lastFoodOn,
      sessions14: countDistinctDays(dates, drops.recent.from, drops.recent.to),
      weightDeltaKg: o.weightDeltaKg,
      risk: assessRisk({
        today,
        lastWorkoutOn: o.lastTrainedOn,
        lastFoodOn,
        pairedOn: c.paired_at?.slice(0, 10) ?? null,
        recentSessions: countDistinctDays(dates, drops.recent.from, drops.recent.to),
        previousSessions: countDistinctDays(dates, drops.previous.from, drops.previous.to),
        lowAdherence: status === "risk",
      }),
    });
  }

  const months = monthlyCooperations(all, lastMonths(today, PORTFOLIO_MONTHS));
  const thisMonth = months[months.length - 1];
  return {
    today,
    activeClients: active.length,
    endedClients: all.filter((c) => c.ended_at).length,
    startedThisMonth: thisMonth.started,
    endedThisMonth: thisMonth.ended,
    months,
    weeks: weeklyActivity(logs, weeksList),
    clients: rows,
  };
}
