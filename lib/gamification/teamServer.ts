import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDaysIso, weekStartOf } from "@/lib/reports/period";
import { buildTeamWeek, type TeamWeek } from "./weekly";

// FitPilot — „Tím tento týždeň“ pre trénera (dashboard, všetky tarify). Jeden RPC dopyt
// (team_week_summary, SECURITY INVOKER — RLS scopuje na klientov trénera) za bežiaci týždeň
// pondelok–dnes. `needAttention` dodá volajúci z už načítaných dát dashboardu (meškajúci klienti).

export async function loadTeamWeek(
  supabase: SupabaseClient,
  today: string,
  totalClients: number,
  needAttention: number,
): Promise<TeamWeek | null> {
  try {
    const from = weekStartOf(today);
    const { data, error } = await supabase.rpc("team_week_summary", { p_from: from, p_to: addDaysIso(from, 6) });
    if (error) return null; // migrácia 0079 ešte nebeží
    const r = (Array.isArray(data) ? data[0] : data) as
      | { workouts: number | string; active_clients: number | string; prs: number | string; badges: number | string; challenges_done: number | string }
      | null;
    if (!r) return null;
    return buildTeamWeek(
      {
        workouts: Number(r.workouts),
        activeClients: Number(r.active_clients),
        prs: Number(r.prs),
        badges: Number(r.badges),
        challengesDone: Number(r.challenges_done),
      },
      totalClients,
      needAttention,
    );
  } catch {
    return null;
  }
}
