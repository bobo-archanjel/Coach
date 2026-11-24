import "server-only";
import { tryCreateAdminClient } from "@/lib/supabase/admin";
import { addDaysIso, weekStartOf } from "@/lib/reports/period";
import { trainerHasFeatureForClients, trainerTierForClients } from "./access";
import { allowedLeaderboardMetrics } from "./limits";
import {
  STREAK_WINDOW_WEEKS,
  buildLeaderboard,
  streakFromWeeks,
  type Board,
  type BoardClient,
  type LeaderboardMetric,
} from "./leaderboard";

// FitPilot — rebríček klientov jedného trénera, serverová časť (gamifikácia, fáza B).
//
// Bezpečnosť: žiadne rozšírenie RLS. Po overení volajúceho (clientId + trainerId pochádzajú
// z jeho vlastného riadka clients) server cez service role zavolá agregačné funkcie, ktoré sú
// dostupné IBA service role (0079), a do výstupu pustí len maskované meno + číslo metriky
// (lib/gamification/leaderboard.ts). Skrytí klienti sa vyfiltrujú pred poradím. Rebríček sa
// ukáže len keď: tréner má platnú tarifu (Starter len týždenný rebríček, limity v limits.ts), nevypol ho a klient sa sám neskryl.

export type LeaderboardView =
  | { state: "unavailable" }
  /** klient sa skryl — rebríček nevidí (vzájomnosť), len prepínač na zapnutie */
  | { state: "hidden" }
  /** boards a metrics obsahujú LEN metriky povolené tarifou trénera (Starter: len workoutsWeek) */
  | { state: "ready"; metrics: LeaderboardMetric[]; boards: Partial<Record<LeaderboardMetric, Board>> };

export async function loadLeaderboard(clientId: string, trainerId: string | null, today: string): Promise<LeaderboardView> {
  const none: LeaderboardView = { state: "unavailable" };
  try {
    if (!trainerId || !(await trainerHasFeatureForClients(trainerId, "leaderboard"))) return none;
    const admin = tryCreateAdminClient();
    if (!admin) return none;

    const [trainerSet, clientsRes] = await Promise.all([
      admin.from("trainer_gamification_settings").select("leaderboard_enabled").eq("trainer_id", trainerId).maybeSingle(),
      admin
        .from("clients")
        .select("id, full_name")
        .eq("trainer_id", trainerId)
        .is("ended_at", null)
        .is("deletion_requested_at", null)
        .limit(500),
    ]);
    if (trainerSet.error || clientsRes.error) return none; // migrácia 0079 ešte nebeží
    if (trainerSet.data && trainerSet.data.leaderboard_enabled === false) return none;
    const group = (clientsRes.data ?? []) as { id: string; full_name: string }[];
    // volajúci musí byť súčasným klientom tohto trénera
    if (!group.some((c) => c.id === clientId)) return none;

    const ids = group.map((c) => c.id);
    const monday = weekStartOf(today);
    const monthFrom = `${today.slice(0, 7)}-01`;
    const [setRes, weeksRes, periodRes] = await Promise.all([
      admin.from("gamification_settings").select("client_id, leaderboard_visible").in("client_id", ids),
      admin.rpc("gamification_group_weeks", { p_trainer_id: trainerId, p_since: addDaysIso(monday, -7 * (STREAK_WINDOW_WEEKS - 1)) }),
      admin.rpc("gamification_group_period", { p_trainer_id: trainerId, p_week_from: monday, p_month_from: monthFrom, p_to: today }),
    ]);
    if (setRes.error || weeksRes.error || periodRes.error) return none;

    const hiddenIds = new Set(
      ((setRes.data ?? []) as { client_id: string; leaderboard_visible: boolean }[]).filter((s) => s.leaderboard_visible === false).map((s) => s.client_id),
    );
    if (hiddenIds.has(clientId)) return { state: "hidden" };

    const weekDays = new Map<string, Map<string, number>>();
    for (const r of (weeksRes.data ?? []) as { client_id: string; week_start: string; trained_days: number }[]) {
      const m = weekDays.get(r.client_id) ?? new Map<string, number>();
      m.set(r.week_start, Number(r.trained_days));
      weekDays.set(r.client_id, m);
    }
    const period = new Map(
      ((periodRes.data ?? []) as { client_id: string; workouts_week: number | string; workouts_month: number | string; prs_month: number | string }[]).map((r) => [
        r.client_id,
        { week: Number(r.workouts_week), month: Number(r.workouts_month), prs: Number(r.prs_month) },
      ]),
    );

    const clients: BoardClient[] = group.map((c) => {
      const p = period.get(c.id);
      return {
        clientId: c.id,
        fullName: c.full_name,
        visible: !hiddenIds.has(c.id),
        workoutsWeek: p?.week ?? 0,
        workoutsMonth: p?.month ?? 0,
        streakWeeks: streakFromWeeks(weekDays.get(c.id) ?? new Map(), today),
        prsMonth: p?.prs ?? 0,
      };
    });
    // zakázané metriky sa ani nepočítajú — do klienta ide len to, čo tarifa dovoľuje
    const metrics = [...allowedLeaderboardMetrics(await trainerTierForClients(trainerId))] as LeaderboardMetric[];
    if (metrics.length === 0) return none;
    const boards = Object.fromEntries(metrics.map((m) => [m, buildLeaderboard(clients, m, clientId)])) as Partial<Record<LeaderboardMetric, Board>>;
    return { state: "ready", metrics, boards };
  } catch {
    return none;
  }
}
