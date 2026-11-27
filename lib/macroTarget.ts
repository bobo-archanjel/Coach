// Efektívny makro cieľ klienta: vlastný (client_macro_goals, 0089), ak je aktívny, inak trénerov
// (nutrition_profiles). Všetko, čo čerpá z makro cieľa (portál, prstence, misie, adherencia, reporty,
// AI, PDF), ide cez tento súbor — nikde inde sa cieľ z tabuliek nečíta. Pred spustením 0089 tabuľka
// client_macro_goals neexistuje → chyba sa ticho ignoruje a platí trénerov cieľ.

import type { SupabaseClient } from "@supabase/supabase-js";

export type MacroSource = "client" | "trainer";

export interface MacroTarget {
  source: MacroSource;
  bmr: number;
  tdee: number;
  caloriesTarget: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface MacroRow {
  bmr: number | string;
  tdee: number | string;
  calories_target: number | string;
  protein_g: number | string;
  carbs_g: number | string;
  fat_g: number | string;
}

export type OwnMacroRow = MacroRow & { active: boolean };

export const MACRO_COLS = "bmr, tdee, calories_target, protein_g, carbs_g, fat_g";

function toTarget(source: MacroSource, r: MacroRow): MacroTarget {
  return {
    source,
    bmr: Number(r.bmr),
    tdee: Number(r.tdee),
    caloriesTarget: Number(r.calories_target),
    proteinG: Number(r.protein_g),
    carbsG: Number(r.carbs_g),
    fatG: Number(r.fat_g),
  };
}

/** Čistý výber: aktívne vlastné makrá klienta majú prednosť pred trénerovými. */
export function pickMacroTarget(own: OwnMacroRow | null | undefined, trainer: MacroRow | null | undefined): MacroTarget | null {
  if (own && own.active) return toTarget("client", own);
  if (trainer) return toTarget("trainer", trainer);
  return null;
}

/** Chýbajúca tabuľka (migrácia 0089 ešte nebehla): PostgREST PGRST205 / Postgres 42P01. */
export function isMissingMacroTable(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return error.code === "PGRST205" || error.code === "42P01" || /client_macro_goals/.test(error.message ?? "") && /does not exist|schema cache/i.test(error.message ?? "");
}

type Client = Pick<SupabaseClient, "from">;

/** Vlastné makrá klientov — chyba (aj chýbajúca tabuľka) = žiadne vlastné makrá. */
async function loadOwnRows(supabase: Client, clientIds: string[]): Promise<Map<string, OwnMacroRow>> {
  const out = new Map<string, OwnMacroRow>();
  if (clientIds.length === 0) return out;
  const { data, error } = await supabase.from("client_macro_goals").select(`client_id, active, ${MACRO_COLS}`).in("client_id", clientIds);
  if (error) {
    if (!isMissingMacroTable(error)) console.error("loadMacroTargets own:", error.message);
    return out;
  }
  for (const r of (data ?? []) as unknown as (OwnMacroRow & { client_id: string })[]) out.set(r.client_id, r);
  return out;
}

/** Efektívne makrá viacerých klientov naraz (2 dotazy, bez N+1). Klienti bez cieľa v mape nie sú. */
export async function loadMacroTargets(supabase: Client, clientIds: string[]): Promise<Map<string, MacroTarget>> {
  const ids = [...new Set(clientIds)];
  const out = new Map<string, MacroTarget>();
  if (ids.length === 0) return out;
  const [own, trainerRes] = await Promise.all([
    loadOwnRows(supabase, ids),
    supabase.from("nutrition_profiles").select(`client_id, ${MACRO_COLS}`).in("client_id", ids),
  ]);
  if (trainerRes.error) console.error("loadMacroTargets trainer:", trainerRes.error.message);
  const trainer = new Map<string, MacroRow>();
  for (const r of (trainerRes.data ?? []) as unknown as (MacroRow & { client_id: string })[]) trainer.set(r.client_id, r);
  for (const id of ids) {
    const t = pickMacroTarget(own.get(id), trainer.get(id));
    if (t) out.set(id, t);
  }
  return out;
}

/** Efektívny makro cieľ jedného klienta (alebo null). */
export async function loadMacroTarget(supabase: Client, clientId: string): Promise<MacroTarget | null> {
  return (await loadMacroTargets(supabase, [clientId])).get(clientId) ?? null;
}

/** Tvar `{ data: { protein_g } | null, error }` ako po predošlom `.from("nutrition_profiles").select("protein_g")` — pre prstence/misie. */
export async function loadProteinTargetRow(supabase: Client, clientId: string): Promise<{ data: { protein_g: number } | null; error: null }> {
  const t = await loadMacroTarget(supabase, clientId);
  return { data: t ? { protein_g: t.proteinG } : null, error: null };
}
