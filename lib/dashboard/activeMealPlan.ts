import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * clients.active_meal_plan_id (0067) pre trénerove pohľady — samostatný dopyt, nie v
 * existujúcich výberoch klienta: pred spustením migrácie stĺpec chýba a dopyt zlyhá,
 * vtedy sa vráti prázdna mapa (= ako doteraz najnovší zverejnený jedálniček).
 */
export async function getActiveMealPlanIds(supabase: SupabaseClient, clientIds: string[]): Promise<Map<string, string | null>> {
  if (clientIds.length === 0) return new Map();
  const { data, error } = await supabase.from("clients").select("id, active_meal_plan_id").in("id", clientIds);
  if (error || !data) return new Map();
  return new Map((data as { id: string; active_meal_plan_id: string | null }[]).map((r) => [r.id, r.active_meal_plan_id]));
}
