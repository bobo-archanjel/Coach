import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveActivePlanId } from "@/lib/portal/activePlan";
import { TRAINING_WEEK_TARGET, computeTrainingStreak } from "@/lib/portal/streak";
import { addDaysIso } from "@/lib/reports/period";
import { loadFreezes } from "./freezesServer";
import { challengeNameOf } from "./kinds";
import { proteinMet } from "./rings";
import { ringTarget } from "./stats";
import { buildWeeklySummary, isSummaryDue, summaryWeekFor, type WeeklySummary } from "./weekly";
import { loadProteinTargetRow } from "@/lib/macroTarget";

// FitPilot — týždenný súhrn klienta, serverová časť (gamifikácia, fáza B). Jediná funkcia
// `loadWeeklySummary` vyrobí celé dáta súhrnu — rovnaké sa dá neskôr poslať ako push/e-mail
// (zatiaľ len v appke). Čítanie cez bežný klient (RLS: klient vidí len svoje), ohraničené
// obdobie (2 týždne tréningov + 52 týždňov dátumov na sériu), žiadny zápis.

type Sb = SupabaseClient;

const SERIES_WEEKS = 52;

export interface WeeklyCtx {
  clientId: string;
  activePlanId?: string | null;
}

/** Súhrn pre daný pondelok; `null` = nedostupné (migrácia/chyba). */
export async function loadWeeklySummary(supabase: Sb, ctx: WeeklyCtx, weekStart: string, today: string): Promise<WeeklySummary | null> {
  try {
    const weekEnd = addDaysIso(weekStart, 6);
    const prevStart = addDaysIso(weekStart, -7);
    const seriesSince = addDaysIso(weekStart, -7 * SERIES_WEEKS);
    const [logsRes, datesRes, foodRes, profileRes, achRes, plansRes] = await Promise.all([
      supabase
        .from("workout_logs")
        .select("performed_on, entries")
        .eq("client_id", ctx.clientId)
        .eq("status", "completed")
        .gte("performed_on", prevStart)
        .lte("performed_on", weekEnd)
        .limit(400),
      supabase
        .from("workout_logs")
        .select("performed_on")
        .eq("client_id", ctx.clientId)
        .eq("status", "completed")
        .gte("performed_on", seriesSince)
        .lte("performed_on", weekEnd)
        .limit(1500),
      supabase.rpc("gamification_food_daily", { p_client_id: ctx.clientId, p_since: weekStart }),
      loadProteinTargetRow(supabase, ctx.clientId),
      supabase
        .from("client_achievements")
        .select("kind, badge_id, exercise_name, value, reps, meta")
        .eq("client_id", ctx.clientId)
        .eq("backfilled", false)
        .gte("achieved_on", weekStart)
        .lte("achieved_on", weekEnd)
        .limit(200),
      supabase
        .from("workout_plans")
        .select("id, published, workout_days(id)")
        .eq("client_id", ctx.clientId)
        .is("edit_of", null)
        .order("created_at", { ascending: false }),
    ]);
    if (logsRes.error || datesRes.error || foodRes.error || achRes.error || plansRes.error) return null;

    const logs = (logsRes.data ?? []) as { performed_on: string; entries: unknown }[];
    const food = ((foodRes.data ?? []) as { eaten_on: string; protein_g: number | string }[]).filter((r) => r.eaten_on <= weekEnd);
    const target = profileRes.data?.protein_g != null ? Number(profileRes.data.protein_g) : null;
    const planRows = ((plansRes.data ?? []) as unknown as { id: string; published: boolean; workout_days: { id: string }[] | null }[]).map((p) => ({
      id: p.id,
      published: p.published,
      dayCount: (p.workout_days ?? []).length,
    }));
    const activeId = resolveActivePlanId(ctx.activePlanId, planRows.filter((p) => p.published));
    const workoutTarget = ringTarget(planRows.find((p) => p.id === activeId)?.dayCount ?? null);

    const ach = (achRes.data ?? []) as {
      kind: string;
      badge_id: string | null;
      exercise_name: string | null;
      value: number | string | null;
      reps: number | null;
      meta: unknown;
    }[];
    const asOf = today < weekEnd ? today : weekEnd;
    const freezes = await loadFreezes(supabase, ctx.clientId);
    const streak = computeTrainingStreak(
      (datesRes.data ?? []).map((r) => r.performed_on as string),
      asOf,
      TRAINING_WEEK_TARGET,
      freezes.frozenWeeks,
    );

    return buildWeeklySummary({
      weekStart,
      logsWeek: logs.filter((l) => l.performed_on >= weekStart).map((l) => ({ performedOn: l.performed_on, entries: l.entries })),
      logsPrev: logs.filter((l) => l.performed_on < weekStart).map((l) => ({ performedOn: l.performed_on, entries: l.entries })),
      foodDates: food.map((r) => r.eaten_on),
      proteinDays: food.filter((r) => proteinMet(Number(r.protein_g), target)).length,
      proteinTarget: target,
      workoutTarget,
      prs: ach
        .filter((a) => a.kind === "pr" && a.exercise_name && a.value != null)
        .map((a) => ({ exerciseName: a.exercise_name!, weightKg: Number(a.value), reps: a.reps })),
      badgeIds: ach.filter((a) => a.kind === "badge" && a.badge_id).map((a) => a.badge_id!),
      challengeNames: ach.filter((a) => a.kind === "challenge").map((a) => challengeNameOf(a.meta)).filter((n): n is string => Boolean(n)),
      streakWeeks: streak.count,
    });
  } catch {
    return null;
  }
}

/** Súhrn, ktorý sa má klientovi TERAZ ukázať (raz za týždeň); inak null. */
export async function loadDueWeeklySummary(supabase: Sb, ctx: WeeklyCtx, today: string): Promise<WeeklySummary | null> {
  const { data, error } = await supabase.from("gamification_settings").select("summary_seen_week").eq("client_id", ctx.clientId).maybeSingle();
  if (error) return null; // migrácia 0079 ešte nebeží
  const seen = (data?.summary_seen_week as string | null | undefined) ?? null;
  if (!isSummaryDue(today, seen)) return null;
  const summary = await loadWeeklySummary(supabase, ctx, summaryWeekFor(today), today);
  return summary?.hasActivity ? summary : null;
}
