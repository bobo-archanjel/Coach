import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { tryCreateAdminClient } from "@/lib/supabase/admin";
import { resolveActivePlanId } from "@/lib/portal/activePlan";
import { addDaysIso, todayIso } from "@/lib/reports/period";
import {
  EMPTY_BADGE_STATS,
  buildBadgeViews,
  missingBadges,
  nextBadges,
  satisfiedBadges,
  unownedBadges,
  type BadgeStats,
  type BadgeTrigger,
  type BadgeView,
  type NextBadge,
} from "./badges";
import { detectPersonalRecords, summarizeRecords, type PrEvent, type RecordSummary } from "./records";
import {
  buildGamificationHome,
  computeBadgeStats,
  ringTarget,
  type GamificationHome,
  type GamificationRaw,
  type StatsLog,
} from "./stats";
import { challengeNameOf, levelFromOf, levelOf, type AchievementKind } from "./kinds";
import { computeXp, levelDetail, levelFor, type LevelDetail, type LevelInfo, type XpBreakdown } from "./xp";
import { syncChallenges } from "./challengesServer";
import { loadRingsXp } from "./ringsServer";
import { loadMissionXp, syncMissions, type MissionsResult } from "./missionsServer";
import { grantFreezes, loadFreezes, type FreezeState } from "./freezesServer";
import { freezeSourcesForLevel } from "./rewards";
import { streakSnapshot } from "./streakCache";
import { TRAINING_WEEK_TARGET } from "@/lib/portal/streak";
import { loadProteinTargetRow } from "@/lib/macroTarget";

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
  completed_at: string | null;
  workout_day_id: string | null;
  entries: unknown;
}

async function loadHistory(supabase: Sb, clientId: string): Promise<HistoryRow[] | null> {
  const { data, error } = await supabase
    .from("workout_logs")
    .select("id, performed_on, created_at, completed_at, workout_day_id, entries")
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
  opts: { logId?: string | null; report?: SyncReport } = {},
): Promise<number> {
  let fresh = 0;
  const report: SyncReport = opts.report ?? emptyReport();
  try {
    fresh = await run(supabase, ctx, trigger, opts.logId ?? null, report);
  } catch (err) {
    console.error("syncGamification:", err instanceof Error ? err.message : err);
  }
  // výzvy trénera (fáza B): po tréningu / zápise jedla; chyba nikdy nezhodí zápis
  if (trigger === "workout" || trigger === "food") fresh += await syncChallenges(supabase, ctx.clientId, todayIso());
  // v2: týždenné misie (progres z dát, splnenie idempotentne) a postup na vyššiu úroveň
  const missions = await syncMissions(supabase, ctx, todayIso(), { trigger });
  if (missions) {
    report.missions = missions;
    fresh += missions.completedNow.length + (missions.bonusNow ? 1 : 0);
  }
  if (trigger === "workout" || fresh > 0) {
    const level = await syncLevel(supabase, ctx.clientId);
    if (level) {
      report.levelUp = level;
      fresh++;
    }
  }
  return fresh;
}

/** Čo sa pri zápise zmenilo — podklad pre obrazovku „Tréning v číslach“. */
export interface SyncReport {
  /** osobné rekordy tohto tréningu */
  prs: number;
  /** nové (oslavované) odznaky */
  badgeIds: string[];
  missions: MissionsResult | null;
  levelUp: { from: number; to: number } | null;
}

export function emptyReport(): SyncReport {
  return { prs: 0, badgeIds: [], missions: null, levelUp: null };
}

// ---------- úroveň ----------

/** XP z databázy (rovnaké zložky ako karta Dnes); null = nedostupné. */
export async function loadXpBreakdown(supabase: Sb, clientId: string): Promise<XpBreakdown | null> {
  try {
    const [totals, badges, prs, missionXp, ringXp] = await Promise.all([
      supabase.rpc("gamification_totals", { p_client_id: clientId }),
      supabase.from("client_achievements").select("badge_id").eq("client_id", clientId).eq("kind", "badge"),
      supabase.from("client_achievements").select("id", { count: "exact", head: true }).eq("client_id", clientId).eq("kind", "pr"),
      loadMissionXp(supabase, clientId),
      loadRingsXp(supabase, clientId),
    ]);
    if (totals.error || badges.error || prs.error) return null;
    const t = (Array.isArray(totals.data) ? totals.data[0] : totals.data) as { workouts: number | string; food_days: number | string } | null;
    return computeXp({
      workouts: Number(t?.workouts ?? 0),
      foodDays: Number(t?.food_days ?? 0),
      prs: prs.count ?? 0,
      badgeIds: (badges.data ?? []).map((r) => r.badge_id as string),
      missionXp,
      ringXp,
    });
  } catch {
    return null;
  }
}

/**
 * Postup na vyššiu úroveň: pri zmene vloží oslavu (client_achievements kind 'level', zobrazí sa modalom) a pripíše
 * zmrazenia za úroveň. Prvé vyhodnotenie klienta len zapíše aktuálnu úroveň (bez oslavy — história sa neoslavuje).
 * Bez migrácie 0084 (stĺpec level_seen chýba) ticho skončí.
 */
async function syncLevel(supabase: Sb, clientId: string): Promise<{ from: number; to: number } | null> {
  try {
    const admin = tryCreateAdminClient();
    if (!admin) return null;
    const xp = await loadXpBreakdown(supabase, clientId);
    if (!xp) return null;
    const n = levelDetail(xp.total).n;
    const { data, error } = await admin.from("gamification_settings").select("level_seen").eq("client_id", clientId).maybeSingle();
    if (error) return null;
    const seen = (data?.level_seen as number | null | undefined) ?? null;
    const nowIso = new Date().toISOString();
    if (seen == null) {
      await admin.from("gamification_settings").upsert({ client_id: clientId, level_seen: n, updated_at: nowIso }, { onConflict: "client_id" });
      await grantFreezes(supabase, clientId, freezeSourcesForLevel(n));
      return null;
    }
    if (n <= seen) return null;
    const { error: insErr } = await admin.from("client_achievements").insert({
      client_id: clientId,
      kind: "level",
      achieved_on: todayIso(),
      meta: { level: n, from: seen },
    });
    // 23505 = oslava tejto úrovne už existuje (súbeh) — stále ide o jeden postup
    if (insErr && insErr.code !== "23505") return null;
    await admin.from("gamification_settings").upsert({ client_id: clientId, level_seen: n, updated_at: nowIso }, { onConflict: "client_id" });
    await grantFreezes(supabase, clientId, freezeSourcesForLevel(n));
    return { from: seen, to: n };
  } catch {
    return null;
  }
}

/** Uloží sériu týždňov klienta pre rebríček (client_streak_cache). Chyba nikdy nezhodí zápis. */
async function writeStreakCache(supabase: Sb, admin: Sb, clientId: string, trainedDates: string[], today: string): Promise<void> {
  try {
    const freezes = await loadFreezes(supabase, clientId);
    const snap = streakSnapshot(trainedDates, today, freezes.frozenWeeks, TRAINING_WEEK_TARGET);
    await admin
      .from("client_streak_cache")
      .upsert({ client_id: clientId, streak_weeks: snap.weeks, expires_week: snap.expiresWeek, computed_at: new Date().toISOString() }, { onConflict: "client_id" });
  } catch {
    /* rebríček je dekorácia */
  }
}

/** Vráti počet NOVÝCH (nie tichých) úspechov — akcia podľa toho vie, či má obnoviť layout s oslavou. */
async function run(supabase: Sb, ctx: SyncContext, trigger: BadgeTrigger, logId: string | null, report: SyncReport): Promise<number> {
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
  if (initialized && trigger !== "workout" && unownedBadges(owned, trigger).length === 0) return fresh;

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
    needFood ? loadProteinTargetRow(supabase, clientId) : Promise.resolve({ data: null }),
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

  const logs: StatsLog[] = history.map((h) => ({
    id: h.id,
    performedOn: h.performed_on,
    workoutDayId: h.workout_day_id,
    entries: h.entries,
    completedAt: h.completed_at,
  }));
  // séria týždňov pre celoappkový rebríček (len pri zápise tréningu)
  if (needWorkouts) await writeStreakCache(supabase, admin as unknown as Sb, clientId, [...new Set(logs.map((l) => l.performedOn))], today);
  const events = needWorkouts
    ? detectPersonalRecords(history.map((h) => ({ id: h.id, performedOn: h.performed_on, createdAt: h.created_at, entries: h.entries })))
    : [];

  // ---------- osobné rekordy ----------
  if (!initialized && events.length > 0) {
    const rows = events.map((e) => prRow(clientId, e, e.sourceLogId !== logId, nowIso));
    fresh += events.filter((e) => e.sourceLogId === logId).length;
    report.prs = events.filter((e) => e.sourceLogId === logId).length;
    for (const part of chunks(rows)) {
      const { error } = await admin.from("client_achievements").upsert(part, { onConflict: "client_id,exercise_key,source_log_id", ignoreDuplicates: true });
      if (error) return fresh;
    }
  } else if (initialized && trigger === "workout" && logId) {
    const mine = events.filter((e) => e.sourceLogId === logId);
    report.prs = mine.length;
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
    // Tichý backfill: čo bolo splnené už PRED týmto tréningom, sa neoslavuje (platí aj pre zabehnutého klienta, ktorému
    // nový odznak v2 — napr. Nočná sova — patrí z histórie: oslávi sa len to, čo spôsobil práve tento tréning).
    let silent = new Set(missing);
    if (logId && needWorkouts) {
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
    report.badgeIds = rows.filter((r) => !r.backfilled).map((r) => r.badge_id);
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
 * Surové čísla pre kartu Dnes — jeden súbeh dopytov (stav, súčty, odznaky, počet rekordov, XP z misií a prstencov).
 * Denné prstence sa načítajú zvlášť (lib/gamification/ringsServer.ts, loadTodayRings). `null` = gamifikácia
 * nedostupná (migrácia nebeží). Pri prvom zobrazení klienta s históriou najprv prebehne tichý backfill.
 */
export async function loadGamificationRaw(supabase: Sb, ctx: SyncContext, _today: string): Promise<GamificationRaw | null> {
  try {
    const fetchAll = () =>
      Promise.all([
        supabase.from("client_gamification").select("client_id").eq("client_id", ctx.clientId).maybeSingle(),
        supabase.rpc("gamification_totals", { p_client_id: ctx.clientId }),
        supabase.from("client_achievements").select("badge_id").eq("client_id", ctx.clientId).eq("kind", "badge"),
        supabase.from("client_achievements").select("id", { count: "exact", head: true }).eq("client_id", ctx.clientId).eq("kind", "pr"),
        loadMissionXp(supabase, ctx.clientId),
        loadRingsXp(supabase, ctx.clientId),
      ]);
    let [state, totals, badges, prs, missionXp, ringXp] = await fetchAll();
    if (state.error || totals.error || badges.error || prs.error) return null;
    if (!state.data) {
      await syncGamification(supabase, ctx, "workout");
      [state, totals, badges, prs, missionXp, ringXp] = await fetchAll();
      if (state.error || totals.error || badges.error || prs.error) return null;
    }
    const t = (Array.isArray(totals.data) ? totals.data[0] : totals.data) as { workouts: number | string; food_days: number | string } | null;
    return {
      workouts: Number(t?.workouts ?? 0),
      foodDays: Number(t?.food_days ?? 0),
      prCount: prs.count ?? 0,
      badgeIds: (badges.data ?? []).map((r) => r.badge_id as string),
      missionXp,
      ringXp,
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
  kind: AchievementKind;
  /** názov výzvy (kind 'challenge') */
  challengeName: string | null;
  badgeId: string | null;
  exerciseName: string | null;
  value: number | null;
  reps: number | null;
  /** úroveň (kind 'level') a predošlá úroveň */
  level: number | null;
  levelFrom: number | null;
}

/** Nezobrazené oslavy klienta (layout portálu); prázdne, keď migrácia nebeží. */
export async function loadUnseenAchievements(supabase: Sb, clientId: string): Promise<UnseenAchievement[]> {
  const { data, error } = await supabase
    .from("client_achievements")
    .select("id, kind, badge_id, exercise_name, value, reps, meta")
    .eq("client_id", clientId)
    .is("seen_at", null)
    .order("achieved_at", { ascending: true })
    .limit(12);
  if (error) return [];
  return (data ?? []).map((r) => ({
    id: r.id as string,
    kind: r.kind as AchievementKind,
    challengeName: challengeNameOf(r.meta),
    badgeId: (r.badge_id as string | null) ?? null,
    exerciseName: (r.exercise_name as string | null) ?? null,
    value: r.value != null ? Number(r.value) : null,
    reps: r.reps != null ? Number(r.reps) : null,
    level: r.kind === "level" ? levelOf(r.meta) : null,
    levelFrom: r.kind === "level" ? levelFromOf(r.meta) : null,
  }));
}

// ---------- galéria odznakov a rekordov ----------

/** Štatistiky odznakov z celej histórie (postup k odznakom v galérii); null = nedostupné. */
async function loadBadgeStats(supabase: Sb, ctx: SyncContext, today: string, prCount: number): Promise<BadgeStats | null> {
  try {
    const [history, foodRes, profileRes, bodyRes, plansRes] = await Promise.all([
      loadHistory(supabase, ctx.clientId),
      supabase.rpc("gamification_food_daily", { p_client_id: ctx.clientId, p_since: addDaysIso(today, -FOOD_DAYS_BACK) }),
      loadProteinTargetRow(supabase, ctx.clientId),
      supabase.from("body_metrics").select("id", { count: "exact", head: true }).eq("client_id", ctx.clientId),
      supabase
        .from("workout_plans")
        .select("id, published, created_at, workout_days(id)")
        .eq("client_id", ctx.clientId)
        .is("edit_of", null)
        .order("created_at", { ascending: false }),
    ]);
    if (history === null || foodRes.error || bodyRes.error || plansRes.error) return null;
    const planRows = ((plansRes.data ?? []) as unknown as { id: string; published: boolean; workout_days: { id: string }[] | null }[]).map((p) => ({
      id: p.id,
      published: p.published,
      dayIds: (p.workout_days ?? []).map((d) => d.id),
    }));
    const activeId = resolveActivePlanId(ctx.activePlanId, planRows.filter((p) => p.published));
    const planDays = planRows.find((p) => p.id === activeId)?.dayIds.length ?? null;
    return computeBadgeStats({
      logs: history.map((h) => ({ id: h.id, performedOn: h.performed_on, workoutDayId: h.workout_day_id, entries: h.entries, completedAt: h.completed_at })),
      prCount,
      foodDaily: ((foodRes.data ?? []) as { eaten_on: string; protein_g: number | string }[]).map((r) => ({ date: r.eaten_on, protein: Number(r.protein_g) })),
      proteinTarget: (profileRes.data as { protein_g: number | null } | null)?.protein_g != null ? Number((profileRes.data as { protein_g: number }).protein_g) : null,
      bodyMetricCount: (bodyRes as { count: number | null }).count ?? 0,
      plans: planRows.map((p) => ({ dayIds: p.dayIds })),
      weeklyTarget: ringTarget(planDays),
      today,
    });
  } catch {
    return null;
  }
}

export interface GalleryRecentItem {
  id: string;
  kind: AchievementKind;
  level: number | null;
  challengeName: string | null;
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
  detail: LevelDetail;
  xp: XpBreakdown;
  /** štatistiky odznakov (postup k ďalšiemu odznaku) */
  stats: BadgeStats;
  /** najbližšie odznaky („Ešte 3 tréningy do …“) */
  next: NextBadge[];
  freezes: FreezeState;
}

interface AchievementRow {
  id: string;
  kind: AchievementKind;
  meta: unknown;
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
  const [stats, freezes] = await Promise.all([loadBadgeStats(supabase, ctx, today, raw.prCount), loadFreezes(supabase, ctx.clientId)]);
  const { data, error } = await supabase
    .from("client_achievements")
    .select("id, kind, meta, badge_id, exercise_key, exercise_name, value, reps, e1rm, achieved_on, backfilled, high_fives(id)")
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
  const xp = computeXp({ workouts: raw.workouts, foodDays: raw.foodDays, prs: raw.prCount, badgeIds: raw.badgeIds, missionXp: raw.missionXp, ringXp: raw.ringXp });
  return {
    badges: buildBadgeViews(earnedOn, stats ?? undefined).map((b) => ({ ...b, backfilled: backfilledBy.get(b.id) ?? false })),
    stats: stats ?? EMPTY_BADGE_STATS,
    next: stats ? nextBadges(stats, new Set(raw.badgeIds), 3) : [],
    freezes,
    detail: levelDetail(xp.total),
    records,
    recent: rows
      .filter((r) => !r.backfilled)
      .slice(0, 8)
      .map((r) => ({
        id: r.id,
        kind: r.kind,
        level: r.kind === "level" ? levelOf(r.meta) : null,
        challengeName: challengeNameOf(r.meta),
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
