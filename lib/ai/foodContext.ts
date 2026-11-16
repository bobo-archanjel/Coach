// FitPilot — AI blok, Krok 6: reálne potraviny z knižnice pre AI Kouča, aby
// vedel navrhnúť KONKRÉTNE jedlo a gramáž (nie len povedať "spýtaj sa trénera").
// Rovnaký princíp ako lib/ai/exerciseAlternatives.ts — model dostane skutočné
// dáta a smie si vyberať LEN z nich, nikdy si nevymýšľa potravinu, ktorá v
// appke neexistuje (inak by klient nevedel jedlo dohľadať/pridať do denníka).
//
// Knižnica potravín má len ~80-100 položiek (na rozdiel od 876 cvikov) — oplatí
// sa poslať celý zoznam vždy, keď má klient nastavený makro cieľ, namiesto
// fuzzy hľadania podľa textu správy (tá by pri jedle často zlyhala/bola zbytočná).

import type { SupabaseClient } from "@supabase/supabase-js";
import { baseUnitOf, type PortionFood } from "@/lib/portions";

export interface FoodCandidate {
  id: string;
  name: string;
  /** české meno (migrácia 0064) — null, keď chýba */
  nameCs?: string | null;
  kcal100g: number;
  protein100g: number;
  carbs100g: number;
  fat100g: number;
  /** g/ml + ks/porcia/balenie — pred migráciou 0066 prázdne (len gramy). */
  portion: PortionFood;
}

/**
 * Globálna knižnica + vlastné potraviny trénera klienta (rovnaká viditeľnosť ako v jedálničku).
 * Bez produktov uložených skenerom (source='off', 0050) — celý zoznam ide do promptu
 * a skeny všetkých používateľov by ho nafukovali.
 */
export async function getFoodCandidates(supabase: SupabaseClient, trainerId: string): Promise<FoodCandidate[]> {
  const base = "id, name, kcal_100g, protein_100g, carbs_100g, fat_100g";
  type Row = Record<string, unknown> & { id: string; name: string };
  // name_cs (0064) a unit_base / piece_g / serving_g / package_g (0066) — kým nie sú spustené,
  // select zlyhá, preto sa zopakuje bez nich (AI potom pozná len gramy).
  let rows: Row[] | null = null;
  let errMsg = "";
  for (const cols of [`${base}, name_cs, unit_base, piece_g, serving_g, package_g`, `${base}, unit_base, piece_g, serving_g, package_g`, base]) {
    const res = await supabase
      .from("foods")
      .select(cols)
      .or(`trainer_id.is.null,trainer_id.eq.${trainerId}`)
      .neq("source", "off")
      .order("name", { ascending: true });
    if (!res.error) {
      rows = res.data as unknown as Row[] | null;
      errMsg = "";
      break;
    }
    errMsg = res.error.message;
  }
  if (errMsg) {
    console.error("getFoodCandidates:", errMsg);
    return [];
  }
  const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return (rows ?? []).map((f) => ({
    id: f.id,
    name: f.name,
    nameCs: typeof f.name_cs === "string" ? f.name_cs : null,
    kcal100g: Number(f.kcal_100g),
    protein100g: Number(f.protein_100g),
    carbs100g: Number(f.carbs_100g),
    fat100g: Number(f.fat_100g),
    portion: {
      unitBase: f.unit_base === "ml" ? "ml" : "g",
      pieceGrams: n(f.piece_g),
      servingGrams: n(f.serving_g),
      packageGrams: n(f.package_g),
    },
  }));
}

/** Dostupné jednotky potraviny: „1 ks = 55 g“, „1 porcia = 30 g“, „1 balenie = 330 ml“ (len tie, ktoré potravina má). */
export function formatPortionUnits(f: PortionFood): string {
  const base = baseUnitOf(f);
  const parts: string[] = [];
  if (f.pieceGrams && f.pieceGrams > 0) parts.push(`1 ks = ${f.pieceGrams} ${base}`);
  if (f.servingGrams && f.servingGrams > 0) parts.push(`1 porcia = ${f.servingGrams} ${base}`);
  if (f.packageGrams && f.packageGrams > 0) parts.push(`1 balenie = ${f.packageGrams} ${base}`);
  return parts.join("; ");
}

/** Kompaktný textový zoznam pre systémový prompt — "Názov: kcal/B/S/T na 100 g; 1 ks = 55 g". */
export function formatFoodCandidates(foods: FoodCandidate[]): string {
  return foods
    .map((f) => {
      const base = baseUnitOf(f.portion);
      const units = formatPortionUnits(f.portion);
      return `- ${f.name}: ${f.kcal100g} kcal, ${f.protein100g} g B, ${f.carbs100g} g S, ${f.fat100g} g T (na 100 ${base})${units ? `; ${units}` : ""}`;
    })
    .join("\n");
}
