import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { tryCreateAdminClient } from "@/lib/supabase/admin";
import { resolveActivePlanId } from "@/lib/portal/activePlan";
import { addDaysIso, todayIso, weekStartOf } from "@/lib/reports/period";
import { BADGES, buildBadgeViews, missingBadges, satisfiedBadges, type BadgeTrigger, type BadgeView } from "./badges";
import { detectPersonalRecords, summarizeRecords, type PrEvent, type RecordSummary } from "./records";
import {
  buildGamificationHome,
  computeBadgeStats,
  proteinByDay,
  ringTarget,
  type GamificationHome,
  type GamificationRaw,
  type StatsLog,
} from "./stats";
import { computeXp, levelFor, type LevelInfo, type XpBreakdown } from "./xp";

// FitPilot — gamifikácia, serverová časť (fáza A).
//
// Zápis: VÝLUČNE tu a výlučne cez service role (tabuľky nemajú write politiky ani práva,
// 0078). Každý vstup je z už overenej session volajúceho (clientId nesie volajúca akcia
// po vlastnej kontrole `clients.user_id = auth.uid()`), klient teda nikdy nepošle, čo sa
// má pripísať — server si všetko dopočíta z workout_logs / food_logs / body_metrics.
// Čítanie: bežným klientom (RLS), takže klient vidí len svoje a tréner len svojich klientov.
//
// Odolnosť: keď migrácia 0078 ešte nebeží (tabuľka/funkcia chýba) alebo chýba service role
// kľúč, všetko ticho skončí bez efektu — gamifikácia je dekorácia, nikdy nesmie zhodiť zápis
// tréningu ani kartu Dnes.

const HISTORY_LIMIT = 2000;
const FOOD_DAYS_BACK = 799;
const CHUNK = 400;

type Sb = SupabaseClient;

interface HistoryRow {
  id: string;
  performed_on: string;
  created_at: string | null;
  workout_day_id: string | null;
  entries: unknown;
}

async function loadHistory(supabase: Sb, clientId: string): Promise<HistoryRow[] | null> {
  const { data, error } = await supabase
    .from("workout_logs")
    .select("id, performed_on, created_at, workout_day_id, entries")
    .eq("client_id", clientId)
    .eq("status", "completed")
    .order("performed_on", { ascending: false })
    .order("id", { ascending: true })
    .limit(HISTORY_LIMIT);
  if (error) return null;
  return (data ?? []) as HistoryRow[];
}

function chunks<T>(rows: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += CHUNK) out.push(rows.slice(i, i + CHUNK));
  return out;
}

export interface SyncContext {
  clientId: string;
  /** clients.active_plan_id — určuje týždenný cieľ (dni aktívneho plánu) */
  activePlanId?: string | null;
}

/**
 * Vyhodnotí a pripíše rekordy a odznaky po zápise. Idempotentné: opakované volanie nič
 * nezdvojí (UNIQUE v DB + `missingBadges`). Prvé volanie klienta s históriou je tichý
 * backfill (backfilled = true, seen_at hneď) — okrem toho, čo spôsobil práve ukončený tréning
 * (`logId`), to sa oslávi normálne.
 */
export async function syncGamification(
  supabase: Sb,
  ctx: SyncContext,
  trigger: BadgeTrigger,
  opts: { logId?: string | null } = {},
): Promise<number> {
  try {
    return await run(supabase, ctx, trigger, opts.logId ?? null);
  } catch (err) {
    console.error("syncGamification:", err instanceof Error ? err.message : err);
    return 0;
  }
}

/** Vráti počet NOVÝCH (nie tichých) úspechov — akcia podľa toho vie, či má obnoviť layout s oslavou. */
async function run(supabase: Sb, ctx: SyncContext, trigger: BadgeTrigger, logId: string | null): Promise<number> {
  const admin = tryCreateAdminClient();
  if (!admin) return 0;
  let fresh = 0;
  const { clientId } = ctx;

  const [stateRes, ownedRes] = await Promise.all([
    supabase.from("client_gamification").select("client_id").eq("client_id", clientId).maybeSingle(),
    supabase.from("client_achievements").select("badge_id").eq("client_id", clientId).eq("kind", "badge"),
  ]);
  if (stateRes.error || ownedRes.error) return 0; // migrácia 0078 ešte nebeží
  const initialized = Boolean(stateRes.data);
  const owned = new Set((ownedRes.data ?? []).map((r) => r.badge_id as string));

  // Už zabehnutý klient: pri zápise jedla/merania stačí zistiť, či ešte nejaký odznak čaká.
  if (initialized && trigger !== "workout" && !BADGES.some((b) => b.trigger === trigger && !owned.has(b.id))) return fresh;

  const needWorkouts = !initialized || trigger === "workout";
  const needFood = !initialized || trigger === "food";
  const needBody = !initialized || trigger === "body";
  const today = todayIso();
  const nowIso = new Date().toISOString();

  const [history, foodRes, profileRes, bodyRes, plansRes] = await Promise.all([
    needWorkouts ? loadHistory(supabase, clientId) : Promise.resolve([] as HistoryRow[]),
    needFood
      ? supabase.rpc("gamification_food_daily", { p_client_id: clientId, p_since: addDaysIso(today, -FOOD_DAYS_BACK) })
      : Promise.resolve({ data: [], error: null }),
    needFood ? supabase.from("nutrition_profiles").select("protein_g").eq("client_id", clientId).maybeSingle() : Promise.resolve({ data: null }),
    needBody
      ? supabase.from("body_metrics").select("id", { count: "exact", head: true }).eq("client_id", clientId)
      : Promise.resolve({ count: 0, error: null }),
    needWorkouts
      ? supabase
          .from("workout_plans")
          .select("id, published, created_at, workout_days(id)")
          .eq("client_id", clientId)
          .is("edit_of", null)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (history === null || foodRes.error || bodyRes.error || plansRes.error) return fresh;

  const logs: StatsLog[] = history.map((h) => ({ id: h.id, performedOn: h.performed_on, workoutDayId: h.workout_day_id, entries: h.entries }));
  const events = needWorkouts
    ? detectPersonalRecords(history.map((h) => ({ id: h.id, performedOn: h.performed_on, createdAt: h.created_at, entries: h.entries })))
    : [];

  // ---------- osobné rekordy ----------
  if (!initialized && events.length > 0) {
    const rows = events.map((e) => prRow(clientId, e, e.sourceLogId !== logId, nowIso));
    fresh += events.filter((e) => e.sourceLogId === logId).length;
    for (const part of chunks(rows)) {
      const { error } = await admin.from("client_achievements").upsert(part, { onConflict: "client_id,exercise_key,source_log_id", ignoreDuplicates: true });
      if (error) return fresh;
    }
  } else if (initialized && trigger === "workout" && logId) {
    const mine = events.filter((e) => e.sourceLogId === logId);
    const { data: existing, error } = await supabase
      .from("client_achievements")
      .select("id, exercise_key")
      .eq("client_id", clientId)
      .eq("kind", "pr")
      .eq("source_log_id", logId);
    if (error) return fresh;
    const have = new Map((existing ?? []).map((r) => [r.exercise_key as string, r.id as string]));
    const keep = new Set(mine.map((e) => e.exerciseKey));
    // úprava hodnôt do 24 h môže rekord zrušiť (nižšia váha) alebo zmeniť jeho hodnotu
    const stale = [...have].filter(([key]) => !keep.has(key)).map(([, id]) => id);
    if (stale.length > 0) await admin.from("client_achievements").delete().eq("client_id", clientId).in("id", stale);
    for (const e of mine) {
      const id = have.get(e.exerciseKey);
      if (id) {
        await admin
          .from("client_achievements")
          .update({ exercise_name: e.exerciseName, pr_type: e.prType, value: e.weightKg, reps: e.reps, e1rm: e.e1rm })
          .eq("client_id", clientId)
          .eq("id", id);
      } else {
        await admin
          .from("client_achievements")
          .upsert(prRow(clientId, e, false, nowIso), { onConflict: "client_id,exercise_key,source_log_id", ignoreDuplicates: true });
        fresh++;
      }
    }
  }

  // ---------- odznaky ----------
  const planRows = ((plansRes.data ?? []) as unknown as { id: string; published: boolean; workout_days: { id: string }[] | null }[]).map((p) => ({
    id: p.id,
    published: p.published,
    dayIds: (p.workout_days ?? []).map((d) => d.id),
  }));
  const activeId = resolveActivePlanId(ctx.activePlanId, planRows.filter((p) => p.published));
  const planDays = planRows.find((p) => p.id === activeId)?.dayIds.length ?? null;
  const base = {
    foodDaily: ((foodRes.data ?? []) as { eaten_on: string; protein_g: number | string }[]).map((r) => ({ date: r.eaten_on, protein: Number(r.protein_g) })),
    proteinTarget: (profileRes.data as { protein_g: number | null } | null)?.protein_g != null ? Number((profileRes.data as { protein_g: number }).protein_g) : null,
    bodyMetricCount: (bodyRes as { count: number | null }).count ?? 0,
    plans: planRows.map((p) => ({ dayIds: p.dayIds })),
    weeklyTarget: ringTarget(planDays),
    today,
  };
  const after = computeBadgeStats({ ...base, logs, prCount: events.length });
  const triggers: BadgeTrigger[] = initialized ? [trigger] : ["workout", "food", "body"];
  const missing = missingBadges(after, owned, triggers);

  if (missing.length > 0) {
    // Tichý backfill: čo bolo splnené už PRED týmto tréningom, sa neoslavuje.
    let silent = new Set(missing);
    if (!initialized && logId) {
      const before = computeBadgeStats({
        ...base,
        logs: logs.filter((l) => l.id !== logId),
        prCount: events.filter((e) => e.sourceLogId !== logId).length,
      });
      silent = new Set(satisfiedBadges(before));
    } else if (initialized) {
      silent = new Set();
    }
    const rows = missing.map((id) => ({
      client_id: clientId,
      kind: "badge",
      badge_id: id,
      achieved_on: today,
      backfilled: silent.has(id),
      seen_at: silent.has(id) ? nowIso : null,
    }));
    const { error } = await admin.from("client_achievements").upsert(rows, { onConflict: "client_id,badge_id", ignoreDuplicates: true });
    if (error) return fresh;
    fresh += rows.filter((r) => !r.backfilled).length;
  }

  if (!initialized) {
    await admin.from("client_gamification").upsert({ client_id: clientId }, { onConflict: "client_id", ignoreDuplicates: true });
  }
  return fresh;
}

function prRow(clientId: string, e: PrEvent, silent: boolean, nowIso: string) {
  return {
    client_id: clientId,
    kind: "pr",
    exercise_key: e.exerciseKey,
    exercise_name: e.exerciseName,
    pr_type: e.prType,
    value: e.weightKg,
    reps: e.reps,
    e1rm: e.e1rm,
    source_log_id: e.sourceLogId,
    achieved_on: e.achievedOn,
    // spätne dopočítané rekordy dostanú dátum tréningu, živé „teraz“ (default)
    ...(silent ? { achieved_at: `${e.achievedOn}T12:00:00Z`, seen_at: nowIso } : {}),
    backfilled: silent,
  };
}

// ---------- karta Dnes ----------

/**
 * Surové čísla pre kartu Dnes — jeden súbeh dopytov (stav, súčty, odznaky, počet rekordov,
 * cieľ bielkovín, jedlo tohto týždňa). `null` = gamifikácia nedostupná (migrácia nebeží).
 * Pri prvom zobrazení klienta s históriou najprv prebehne tichý backfill.
 */
export async function loadGamificationRaw(supabase: Sb, ctx: SyncContext, today: string): Promise<GamificationRaw | null> {
  try {
    const monday = weekStartOf(today);
    const sunday = addDaysIso(monday, 6);
    const fetchAll = () =>
      Promise.all([
        supabase.from("client_gamification").select("client_id").eq("client_id", ctx.clientId).maybeSingle(),
        supabase.rpc("gamification_totals", { p_client_id: ctx.clientId }),
        supabase.from("client_achievements").select("badge_id").eq("client_id", ctx.clientId).eq("kind", "badge"),
        supabase.from("client_achievements").select("id", { count: "exact", head: true }).eq("client_id", ctx.clientId).eq("kind", "pr"),
        supabase.from("nutrition_profiles").select("protein_g").eq("client_id", ctx.clientId).maybeSingle(),
        supabase
          .from("food_logs")
          .select("eaten_on, grams, protein_100g")
          .eq("client_id", ctx.clientId)
          .gte("eaten_on", monday)
          .lte("eaten_on", sunday),
      ]);
    let [state, totals, badges, prs, profile, week] = await fetchAll();
    if (state.error || totals.error || badges.error || prs.error) return null;
    if (!state.data) {
      await syncGamification(supabase, ctx, "workout");
      [state, totals, badges, prs, profile, week] = await fetchAll();
      if (state.error || totals.error || badges.error || prs.error) return null;
    }
    const t = (Array.isArray(totals.data) ? totals.data[0] : totals.data) as { workouts: number | string; food_days: number | string } | null;
    return {
      workouts: Number(t?.workouts ?? 0),
      foodDays: Number(t?.food_days ?? 0),
      prCount: prs.count ?? 0,
      badgeIds: (badges.data ?? []).map((r) => r.badge_id as string),
      proteinTarget: profile.data?.protein_g != null ? Number(profile.data.protein_g) : null,
      weekFood: proteinByDay((week.data ?? []) as { eaten_on: string; grams: number; protein_100g: number }[]),
    };
  } catch {
    return null;
  }
}

export { buildGamificationHome };
export type { GamificationHome, GamificationRaw };

// ---------- oslavy (modal po novom úspechu) ----------

export interface UnseenAchievement {
  id: string;
  kind: "pr" | "badge";
  badgeId: string | null;
  exerciseName: string | null;
  value: number | null;
  reps: number | null;
}

/** Nezobrazené oslavy klienta (layout portálu); prázdne, keď migrácia nebeží. */
export async function loadUnseenAchievements(supabase: Sb, clientId: string): Promise<UnseenAchievement[]> {
  const { data, error } = await supabase
    .from("client_achievements")
    .select("id, kind, badge_id, exercise_name, value, reps")
    .eq("client_id", clientId)
    .is("seen_at", null)
    .order("achieved_at", { ascending: true })
    .limit(12);
  if (error) return [];
  return (data ?? []).map((r) => ({
    id: r.id as string,
    kind: r.kind as "pr" | "badge",
    badgeId: (r.badge_id as string | null) ?? null,
    exerciseName: (r.exercise_name as string | null) ?? null,
    value: r.value != null ? Number(r.value) : null,
    reps: r.reps != null ? Number(r.reps) : null,
  }));
}

// ---------- galéria odznakov a rekordov ----------

export interface GalleryRecentItem {
  id: string;
  kind: "pr" | "badge";
  badgeId: string | null;
  exerciseName: string | null;
  value: number | null;
  reps: number | null;
  achievedOn: string;
  highFived: boolean;
}

export interface GalleryData {
  badges: (BadgeView & { backfilled: boolean })[];
  records: RecordSummary[];
  recent: GalleryRecentItem[];
  level: LevelInfo;
  xp: XpBreakdown;
}

interface AchievementRow {
  id: string;
  kind: "pr" | "badge";
  badge_id: string | null;
  exercise_key: string | null;
  exercise_name: string | null;
  value: number | string | null;
  reps: number | null;
  e1rm: number | string | null;
  achieved_on: string;
  backfilled: boolean;
  high_fives: { id: string } | { id: string }[] | null;
}

/** Galéria: odznaky (získané/zamknuté), zoznam rekordov, posledné úspechy, úroveň. `null` = nedostupné. */
export async function loadGalleryData(supabase: Sb, ctx: SyncContext, today: string): Promise<GalleryData | null> {
  const raw = await loadGamificationRaw(supabase, ctx, today); // zároveň zabezpečí backfill
  if (!raw) return null;
  const { data, error } = await supabase
    .from("client_achievements")
    .select("id, kind, badge_id, exercise_key, exercise_name, value, reps, e1rm, achieved_on, backfilled, high_fives(id)")
    .eq("client_id", ctx.clientId)
    .order("achieved_at", { ascending: false })
    .limit(1500);
  if (error) return null;
  const rows = (data ?? []) as unknown as AchievementRow[];

  const earnedOn = new Map<string, string>();
  const backfilledBy = new Map<string, boolean>();
  for (const r of rows) {
    if (r.kind === "badge" && r.badge_id) {
      earnedOn.set(r.badge_id, r.achieved_on);
      backfilledBy.set(r.badge_id, r.backfilled);
    }
  }
  const prRows = rows.filter((r) => r.kind === "pr" && r.exercise_key && r.exercise_name && r.value != null);
  const records = summarizeRecords(
    prRows.map((r) => ({
      exerciseKey: r.exercise_key!,
      exerciseName: r.exercise_name!,
      weightKg: Number(r.value),
      reps: r.reps ?? 0,
      e1rm: r.e1rm != null ? Number(r.e1rm) : null,
      achievedOn: r.achieved_on,
    })),
  );
  const xp = computeXp({ workouts: raw.workouts, foodDays: raw.foodDays, prs: raw.prCount, badgeIds: raw.badgeIds });
  return {
    badges: buildBadgeViews(earnedOn).map((b) => ({ ...b, backfilled: backfilledBy.get(b.id) ?? false })),
    records,
    recent: rows
      .filter((r) => !r.backfilled)
      .slice(0, 8)
      .map((r) => ({
        id: r.id,
        kind: r.kind,
        badgeId: r.badge_id,
        exerciseName: r.exercise_name,
        value: r.value != null ? Number(r.value) : null,
        reps: r.reps,
        achievedOn: r.achieved_on,
        highFived: Array.isArray(r.high_fives) ? r.high_fives.length > 0 : Boolean(r.high_fives),
      })),
    level: levelFor(xp.total),
    xp,
  };
}
