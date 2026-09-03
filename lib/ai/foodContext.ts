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

export interface FoodCandidate {
  id: string;
  name: string;
  kcal100g: number;
  protein100g: number;
  carbs100g: number;
  fat100g: number;
}

/** Globálna knižnica + vlastné potraviny trénera klienta (rovnaká viditeľnosť ako v jedálničku). */
export async function getFoodCandidates(supabase: SupabaseClient, trainerId: string): Promise<FoodCandidate[]> {
  const { data, error } = await supabase
    .from("foods")
    .select("id, name, kcal_100g, protein_100g, carbs_100g, fat_100g")
    .or(`trainer_id.is.null,trainer_id.eq.${trainerId}`)
    .order("name", { ascending: true });
  if (error) {
    console.error("getFoodCandidates:", error.message);
    return [];
  }
  return (data ?? []).map((f) => ({
    id: f.id,
    name: f.name,
    kcal100g: f.kcal_100g,
    protein100g: f.protein_100g,
    carbs100g: f.carbs_100g,
    fat100g: f.fat_100g,
  }));
}

/** Kompaktný textový zoznam pre systémový prompt — "Názov: kcal/B/S/T na 100 g". */
export function formatFoodCandidates(foods: FoodCandidate[]): string {
  return foods
    .map((f) => `- ${f.name}: ${f.kcal100g} kcal, ${f.protein100g} g B, ${f.carbs100g} g S, ${f.fat100g} g T (na 100 g)`)
    .join("\n");
}
