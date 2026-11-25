import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { tryCreateAdminClient } from "@/lib/supabase/admin";
import { TRAINING_WEEK_TARGET } from "@/lib/portal/streak";
import { addDaysIso, weekStartOf } from "@/lib/reports/period";
import { trainerTierForClients } from "./access";
import { loadFreezes } from "./freezesServer";
import { allowedLeaderboardMetrics } from "./limits";
import { defaultNickname, displayNickname } from "./nickname";
import { cachedStreakValid, streakSnapshot } from "./streakCache";
import { GLOBAL_TOP_N, toPublicBoard, type GlobalRanking, type RankedRow } from "./leaderboardGlobal";
import { normalizeTitleLevel } from "./rewards";
import type { Board, LeaderboardMetric } from "./leaderboard";

// FitPilot — CELOAPPKOVÝ rebríček klientov, serverová časť (gamifikácia v2, rozhodnutie vlastníka).
//
// Poradie počíta DB (gamification_global_leaderboard, 0084): TOP N + poradie volajúceho + počet v poradí, nad
// ohraničeným obdobím (týždeň / mesiac) a s indexmi. Funkcia je dostupná IBA service role; server z nej poskladá
// len verejný tvar „prezývka + číslo“ (lib/gamification/leaderboardGlobal.ts) — id klientov ani celé mená, tréner,
// fotka či čokoľvek iné sa klientovi nikdy neposielajú. Skrytí klienti (opt-out) sa filtrujú v SQL pred poradím;
// skrytý klient rebríček nevidí (vzájomnosť) a dostane len kartu s prepínačom.
// Tarifa: záložky podľa tarify TRÉNERA klienta (lib/billing/plans.ts), klient bez trénera má sadu Starter.
// Nastavenie trénera „rebríček zap/vyp“ sa už NEČÍTA (rebríček je celoappkový; rozhoduje opt-out klienta).

type Sb = SupabaseClient;

export interface LeaderboardMe {
  /** vlastná prezývka (null = predvolená) */
  nickname: string | null;
  /** predvolená „Meno P.“ (pre náhľad a tlačidlo „vrátiť predvolenú“) */
  defaultName: string;
  /** zobrazená prezývka */
  shownName: string;
}

export type LeaderboardView =
  | { state: "unavailable" }
  /** klient sa skryl — rebríček nevidí (vzájomnosť), len prepínač na zapnutie */
  | { state: "hidden"; me: LeaderboardMe }
  /** boards a metrics obsahujú LEN metriky povolené tarifou trénera (bez trénera / Starter: len workoutsWeek) */
  | { state: "ready"; metrics: LeaderboardMetric[]; boards: Partial<Record<LeaderboardMetric, Board>>; me: LeaderboardMe };

interface RpcRow {
  row_kind: "top" | "me";
  place: number | string;
  member_id: string;
  member_value: number | string;
  member_total: number | string;
}

function rankingFrom(rows: RpcRow[]): GlobalRanking {
  const top: RankedRow[] = rows
    .filter((r) => r.row_kind === "top")
    .map((r) => ({ id: r.member_id, rank: Number(r.place), value: Number(r.member_value) }))
    .sort((a, b) => a.rank - b.rank);
  const me = rows.find((r) => r.row_kind === "me");
  const total = rows.reduce((m, r) => Math.max(m, Number(r.member_total)), 0);
  return { top, me: me ? { id: me.member_id, rank: Number(me.place), value: Number(me.member_value) } : null, total };
}

/**
 * Obnoví uloženú sériu volajúceho (client_streak_cache), ak chýba alebo je stará — rebríček série tak zahŕňa
 * aj klientov, ktorí appku otvárajú, no netrénovali práve teraz. Zápis robí service role.
 */
export async function refreshStreakCache(supabase: Sb, clientId: string, today: string): Promise<void> {
  try {
    const admin = tryCreateAdminClient();
    if (!admin) return;
    const weekNow = weekStartOf(today);
    const { data: row, error } = await admin.from("client_streak_cache").select("streak_weeks, expires_week, computed_at").eq("client_id", clientId).maybeSingle();
    if (error) return; // migrácia 0084 ešte nebeží
    const fresh = row && Date.now() - Date.parse(row.computed_at as string) < 6 * 3600_000 && cachedStreakValid({ streakWeeks: row.streak_weeks as number, expiresWeek: row.expires_week as string }, weekNow);
    if (fresh) return;
    const { data: dates, error: dErr } = await supabase
      .from("workout_logs")
      .select("performed_on")
      .eq("client_id", clientId)
      .eq("status", "completed")
      .gte("performed_on", addDaysIso(weekNow, -7 * 52))
      .limit(2000);
    if (dErr) return;
    const freezes = await loadFreezes(supabase, clientId);
    const snap = streakSnapshot(
      (dates ?? []).map((d) => d.performed_on as string),
      today,
      freezes.frozenWeeks,
      TRAINING_WEEK_TARGET,
    );
    await admin
      .from("client_streak_cache")
      .upsert({ client_id: clientId, streak_weeks: snap.weeks, expires_week: snap.expiresWeek, computed_at: new Date().toISOString() }, { onConflict: "client_id" });
  } catch {
    /* rebríček je dekorácia — chyba nikdy nezhodí stránku */
  }
}

export async function loadLeaderboard(
  supabase: Sb,
  input: { clientId: string; trainerId: string | null; fullName: string | null; today: string },
  fallbackName: string,
): Promise<LeaderboardView> {
  const none: LeaderboardView = { state: "unavailable" };
  try {
    const admin = tryCreateAdminClient();
    if (!admin) return none;
    const { clientId, trainerId, fullName, today } = input;

    const setRes = await admin.from("gamification_settings").select("leaderboard_visible, nickname").eq("client_id", clientId).maybeSingle();
    if (setRes.error) return none; // migrácia 0079 / 0084 ešte nebeží
    const nickname = (setRes.data?.nickname as string | null | undefined) ?? null;
    const defaultName = defaultNickname(fullName) ?? fallbackName;
    const me: LeaderboardMe = { nickname, defaultName, shownName: displayNickname(nickname, fullName, fallbackName) };
    if (setRes.data && setRes.data.leaderboard_visible === false) return { state: "hidden", me };

    // záložky podľa tarify trénera; bez trénera (alebo bez prístupu) sada Starter
    const tier = trainerId ? await trainerTierForClients(trainerId) : null;
    const metrics = [...allowedLeaderboardMetrics(tier)] as LeaderboardMetric[];
    if (metrics.length === 0) return none;

    if (metrics.includes("streakWeeks")) await refreshStreakCache(supabase, clientId, today);

    const weekFrom = weekStartOf(today);
    const monthFrom = `${today.slice(0, 7)}-01`;
    const results = await Promise.all(
      metrics.map((metric) =>
        admin.rpc("gamification_global_leaderboard", {
          p_metric: metric,
          p_client_id: clientId,
          p_week_from: weekFrom,
          p_month_from: monthFrom,
          p_to: today,
          p_week_now: weekFrom,
          p_top: GLOBAL_TOP_N,
        }),
      ),
    );
    if (results.some((r) => r.error)) return none;
    const rankings = results.map((r) => rankingFrom((r.data ?? []) as RpcRow[]));

    // mená len pre klientov, ktorí sa dostali do TOP N (najviac 4 × 10)
    const ids = [...new Set(rankings.flatMap((r) => r.top.map((t) => t.id)))];
    const names = new Map<string, { nickname: string | null; fullName: string | null; title: number | null }>();
    if (ids.length > 0) {
      const [cl, st0] = await Promise.all([
        admin.from("clients").select("id, full_name").in("id", ids),
        admin.from("gamification_settings").select("client_id, nickname, leaderboard_title").in("client_id", ids),
      ]);
      // migrácia 0086 (stĺpec leaderboard_title) ešte nebeží → rebríček funguje bez titulov
      const st = st0.error ? await admin.from("gamification_settings").select("client_id, nickname").in("client_id", ids) : st0;
      if (cl.error || st.error) return none;
      for (const c of (cl.data ?? []) as { id: string; full_name: string | null }[]) names.set(c.id, { nickname: null, fullName: c.full_name, title: null });
      for (const s of (st.data ?? []) as { client_id: string; nickname: string | null; leaderboard_title?: number | null }[]) {
        const cur = names.get(s.client_id);
        if (cur) {
          cur.nickname = s.nickname;
          cur.title = normalizeTitleLevel(s.leaderboard_title);
        }
      }
    }
    const boards: Partial<Record<LeaderboardMetric, Board>> = {};
    metrics.forEach((metric, i) => {
      boards[metric] = toPublicBoard(metric, rankings[i], clientId, names, fallbackName);
    });
    return { state: "ready", metrics, boards, me };
  } catch {
    return none;
  }
}
