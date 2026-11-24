import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { tryCreateAdminClient } from "@/lib/supabase/admin";
import { resolveActivePlanId } from "@/lib/portal/activePlan";
import { addDaysIso, weekStartOf } from "@/lib/reports/period";
import { grantFreezes } from "./freezesServer";
import {
  allMissionsDone,
  buildMissionContext,
  evaluateMissions,
  generateMissions,
  isMissionKind,
  newlyCompleted,
  type MissionData,
  type MissionKind,
  type MissionRow,
  type MissionView,
} from "./missions";
import { proteinMet } from "./rings";
import { freezeSourceMissionWeek } from "./rewards";
import { ringTarget } from "./stats";
import { XP_MISSION_BONUS } from "./xp";
import type { BadgeTrigger } from "./badges";

// FitPilot — týždenné misie, serverová časť (gamifikácia v2).
//
// Generovanie: pri prvom zobrazení týždňa server z dát klienta (posledné 4 týždne, plán, cieľ bielkovín)
// vyrobí 3 misie deterministicky (seed klient + pondelok) a uloží ich (UNIQUE client+týždeň+slot, takže
// súbeh dvoch požiadaviek nič nezdvojí). Progres sa NIKDY neukladá ani neposiela od klienta: počíta sa
// z tréningov, jedla, rekordov a meraní. Do DB sa zapíše len moment splnenia (idempotentne) a bonus
// týždňa. Zápis robí výlučne service role.
// Odolnosť: bez migrácie 0084 všetko ticho skončí (null) — misie sú dekorácia, nikdy nezhodia zápis.

type Sb = SupabaseClient;

export interface MissionCtx {
  clientId: string;
  activePlanId?: string | null;
}

export interface MissionsResult {
  weekStart: string;
  views: MissionView[];
  /** všetky tri splnené */
  allDone: boolean;
  /** bonus týždňa je pripísaný */
  bonusAwarded: boolean;
  /** práve teraz splnené (pre súhrn po tréningu) */
  completedNow: MissionView[];
  /** bonus bol pripísaný práve teraz */
  bonusNow: boolean;
}

/** Ktoré druhy misií môže zmeniť zápis daného typu (podľa toho sa načítajú len potrebné dáta). */
export const MISSION_KINDS_BY_TRIGGER: Record<BadgeTrigger, MissionKind[]> = {
  workout: ["workouts", "workout_by_wed", "volume", "sets", "pr_exercise"],
  food: ["food_days", "protein_days"],
  body: ["measurement"],
};

interface DbRow {
  id: string;
  slot: number;
  kind: string;
  target: number;
  xp: number;
  params: unknown;
  completed_at: string | null;
}

function toRow(r: DbRow): MissionRow | null {
  if (!isMissionKind(r.kind)) return null;
  const p = (r.params ?? {}) as { exerciseKey?: unknown; exerciseName?: unknown };
  return {
    id: r.id,
    slot: r.slot,
    kind: r.kind,
    target: r.target,
    xp: r.xp,
    params: {
      ...(typeof p.exerciseKey === "string" ? { exerciseKey: p.exerciseKey.slice(0, 200) } : {}),
      ...(typeof p.exerciseName === "string" ? { exerciseName: p.exerciseName.slice(0, 200) } : {}),
    },
    completedAt: r.completed_at,
  };
}

async function readRows(supabase: Sb, clientId: string, weekStart: string): Promise<MissionRow[] | null> {
  const { data, error } = await supabase
    .from("weekly_missions")
    .select("id, slot, kind, target, xp, params, completed_at")
    .eq("client_id", clientId)
    .eq("week_start", weekStart)
    .order("slot", { ascending: true });
  if (error) return null;
  return ((data ?? []) as DbRow[]).map(toRow).filter((r): r is MissionRow => r !== null);
}

/** Vyrobí a uloží misie týždňa (idempotentne); vráti uložené riadky alebo null. */
async function generateAndStore(supabase: Sb, ctx: MissionCtx, weekStart: string, today: string): Promise<MissionRow[] | null> {
  const admin = tryCreateAdminClient();
  if (!admin) return null;
  const since = addDaysIso(weekStart, -35);
  const [logsRes, foodRes, profileRes, bodyRes, plansRes] = await Promise.all([
    supabase
      .from("workout_logs")
      .select("performed_on, entries")
      .eq("client_id", ctx.clientId)
      .eq("status", "completed")
      .gte("performed_on", addDaysIso(today, -62))
      .order("performed_on", { ascending: false })
      .limit(300),
    supabase.rpc("gamification_food_daily", { p_client_id: ctx.clientId, p_since: since }),
    supabase.from("nutrition_profiles").select("protein_g").eq("client_id", ctx.clientId).maybeSingle(),
    supabase.from("body_metrics").select("measured_on").eq("client_id", ctx.clientId).order("measured_on", { ascending: false }).limit(1),
    supabase
      .from("workout_plans")
      .select("id, published, workout_days(id)")
      .eq("client_id", ctx.clientId)
      .eq("published", true)
      .is("edit_of", null)
      .order("created_at", { ascending: false }),
  ]);
  if (logsRes.error || foodRes.error || bodyRes.error) return null;
  const plans = ((plansRes.data ?? []) as unknown as { id: string; workout_days: { id: string }[] | null }[]).map((p) => ({
    id: p.id,
    days: (p.workout_days ?? []).length,
  }));
  const activeId = resolveActivePlanId(ctx.activePlanId, plans);
  const planDays = plans.find((p) => p.id === activeId)?.days ?? null;
  const protein = (profileRes.data as { protein_g: number | null } | null)?.protein_g;
  const proteinTarget = protein != null ? Number(protein) : null;

  const mctx = buildMissionContext({
    today,
    planTarget: ringTarget(planDays),
    logs: ((logsRes.data ?? []) as { performed_on: string; entries: unknown }[]).map((l) => ({ performedOn: l.performed_on, entries: l.entries })),
    foodDaily: ((foodRes.data ?? []) as { eaten_on: string; protein_g: number | string }[]).map((r) => ({ date: r.eaten_on, protein: Number(r.protein_g) })),
    proteinTarget,
    lastMeasurementOn: ((bodyRes.data ?? [])[0] as { measured_on: string } | undefined)?.measured_on ?? null,
    proteinMet,
  });
  const specs = generateMissions(ctx.clientId, mctx);
  const { error } = await admin.from("weekly_missions").upsert(
    specs.map((s, i) => ({
      client_id: ctx.clientId,
      week_start: weekStart,
      slot: i + 1,
      kind: s.kind,
      target: s.target,
      xp: s.xp,
      params: s.params,
    })),
    { onConflict: "client_id,week_start,slot", ignoreDuplicates: true },
  );
  if (error) return null;
  return readRows(supabase, ctx.clientId, weekStart);
}

/** Dáta pre progres len pre misie, ktoré ich potrebujú. */
async function loadProgressData(supabase: Sb, clientId: string, weekStart: string, rows: MissionRow[]): Promise<MissionData | null> {
  const sunday = addDaysIso(weekStart, 6);
  const has = (...kinds: MissionKind[]) => rows.some((r) => kinds.includes(r.kind));
  const [logsRes, foodRes, profileRes, prRes, bodyRes] = await Promise.all([
    has("workouts", "workout_by_wed", "volume", "sets")
      ? supabase.from("workout_logs").select("performed_on, entries").eq("client_id", clientId).eq("status", "completed").gte("performed_on", weekStart).lte("performed_on", sunday).limit(60)
      : Promise.resolve({ data: [], error: null }),
    has("food_days", "protein_days") ? supabase.rpc("gamification_food_daily", { p_client_id: clientId, p_since: weekStart }) : Promise.resolve({ data: [], error: null }),
    has("protein_days") ? supabase.from("nutrition_profiles").select("protein_g").eq("client_id", clientId).maybeSingle() : Promise.resolve({ data: null, error: null }),
    has("pr_exercise")
      ? supabase.from("client_achievements").select("exercise_key, achieved_on").eq("client_id", clientId).eq("kind", "pr").gte("achieved_on", weekStart).lte("achieved_on", sunday).limit(200)
      : Promise.resolve({ data: [], error: null }),
    has("measurement")
      ? supabase.from("body_metrics").select("measured_on").eq("client_id", clientId).gte("measured_on", weekStart).lte("measured_on", sunday).limit(14)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (logsRes.error || foodRes.error || prRes.error || bodyRes.error) return null;
  const foodDaily = ((foodRes.data ?? []) as { eaten_on: string; protein_g: number | string }[])
    .filter((r) => r.eaten_on >= weekStart && r.eaten_on <= sunday)
    .map((r) => ({ date: r.eaten_on, protein: Number(r.protein_g) }));
  const target = (profileRes.data as { protein_g: number | null } | null)?.protein_g;
  const proteinTarget = target != null ? Number(target) : null;
  return {
    weekStart,
    logs: ((logsRes.data ?? []) as { performed_on: string; entries: unknown }[]).map((l) => ({ performedOn: l.performed_on, entries: l.entries })),
    foodDates: foodDaily.map((d) => d.date),
    proteinMetDates: foodDaily.filter((d) => proteinMet(d.protein, proteinTarget)).map((d) => d.date),
    prEvents: ((prRes.data ?? []) as { exercise_key: string; achieved_on: string }[]).map((p) => ({ exerciseKey: p.exercise_key, achievedOn: p.achieved_on })),
    bodyMetricDates: ((bodyRes.data ?? []) as { measured_on: string }[]).map((b) => b.measured_on),
  };
}

/**
 * Misie aktuálneho týždňa s progresom. `trigger` = čo sa práve zapísalo: zápis sa pokúsi dokončiť len misie, ktoré
 * sa tým mohli zmeniť (zápis jedla nenačíta tréningy). Bez `trigger` (zobrazenie) sa prekontrolujú všetky.
 * `persist: false` = len čítanie bez zápisu splnenia.
 */
export async function syncMissions(
  supabase: Sb,
  ctx: MissionCtx,
  today: string,
  opts: { trigger?: BadgeTrigger; persist?: boolean } = {},
): Promise<MissionsResult | null> {
  try {
    const weekStart = weekStartOf(today);
    let rows = await readRows(supabase, ctx.clientId, weekStart);
    if (rows === null) return null; // migrácia 0084 ešte nebeží
    if (rows.length === 0) {
      rows = await generateAndStore(supabase, ctx, weekStart, today);
      if (!rows || rows.length === 0) return null;
    }
    const relevant = opts.trigger ? new Set(MISSION_KINDS_BY_TRIGGER[opts.trigger]) : null;
    const open = rows.filter((r) => !r.completedAt && (!relevant || relevant.has(r.kind)));
    const data = open.length > 0 ? await loadProgressData(supabase, ctx.clientId, weekStart, open) : null;
    const empty: MissionData = { weekStart, logs: [], foodDates: [], proteinMetDates: [], prEvents: [], bodyMetricDates: [] };
    const openIds = new Set(open.map((o) => o.id));
    // progres ukazujeme vždy pre všetky misie, ktoré sme vedeli vyhodnotiť (načítané dáta); pri zápise
    // jedla sa tréningové misie nevyhodnocujú (ostanú na predošlom stave, dokým ich neprepočíta zobrazenie)
    const views = evaluateMissions(rows, data ?? empty);
    const done = data ? newlyCompleted(views.filter((v) => openIds.has(v.id))) : [];

    const completedNow: MissionView[] = [];
    const admin = opts.persist === false ? null : tryCreateAdminClient();
    if (admin) {
      for (const v of done) {
        const nowIso = new Date().toISOString();
        // prechod sa podarí len raz (podmienka completed_at is null)
        const { data: flipped, error } = await admin
          .from("weekly_missions")
          .update({ completed_at: nowIso })
          .eq("id", v.id)
          .eq("client_id", ctx.clientId)
          .is("completed_at", null)
          .select("id");
        if (!error && flipped?.length) completedNow.push({ ...v, completedAt: nowIso });
      }
    }
    const finalViews = views.map((v) => completedNow.find((c) => c.id === v.id) ?? v);
    const allDone = allMissionsDone(finalViews);

    let bonusAwarded = false;
    let bonusNow = false;
    if (allDone) {
      if (admin) {
        const { error } = await admin.from("mission_weeks").insert({ client_id: ctx.clientId, week_start: weekStart });
        if (!error) {
          bonusAwarded = true;
          bonusNow = true;
          await grantFreezes(supabase, ctx.clientId, [freezeSourceMissionWeek(weekStart)]);
        } else if (error.code === "23505") {
          bonusAwarded = true;
        }
      } else {
        bonusAwarded = true;
      }
    }
    return { weekStart, views: finalViews, allDone, bonusAwarded, completedNow, bonusNow };
  } catch (err) {
    console.error("syncMissions:", err instanceof Error ? err.message : err);
    return null;
  }
}

/** XP zo všetkých splnených misií a bonusov týždňa (0 pri chýbajúcej migrácii). */
export async function loadMissionXp(supabase: Sb, clientId: string): Promise<number> {
  try {
    const [done, weeks] = await Promise.all([
      supabase.from("weekly_missions").select("xp").eq("client_id", clientId).not("completed_at", "is", null).limit(3000),
      supabase.from("mission_weeks").select("week_start", { count: "exact", head: true }).eq("client_id", clientId),
    ]);
    if (done.error || weeks.error) return 0;
    const sum = ((done.data ?? []) as { xp: number }[]).reduce((a, r) => a + (Number(r.xp) || 0), 0);
    return sum + (weeks.count ?? 0) * XP_MISSION_BONUS;
  } catch {
    return 0;
  }
}
