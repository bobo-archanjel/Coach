"use server";

import { getUser, createClient } from "@/lib/supabase/server";
import { parseBarcode } from "@/lib/barcode";
import { foodDisplayName } from "@/lib/offProduct";
import { dbErr } from "@/lib/dbError";
import type { PortalFoodOption } from "@/lib/portal/types";

export interface UserFoodInput {
  /** prázdny = bez čiarového kódu (tréner zakladá potravinu ručne) */
  barcode: string;
  name: string;
  brand: string;
  kcal: string;
  protein: string;
  carbs: string;
  fat: string;
}

/**
 * Vlastná potravina (source='user', 0050) — klient po skene, ktorý produkt nenašiel,
 * tréner aj ručne v builderi jedálnička. Vidí ju len autor (RLS 0050/0051); s kódom ju
 * ďalší sken toho istého kódu nájde. Vráti ju ako možnosť na pridanie — denník aj
 * builder ju potom zapíšu rovnako ako potravinu z vyhľadávania (s food_id).
 */
export async function createUserFoodAction(
  input: UserFoodInput,
): Promise<{ error: string | null; food: PortalFoodOption | null }> {
  const fail = (error: string) => ({ error, food: null });
  const {
    data: { user },
  } = await getUser();
  if (!user) return fail("Nie si prihlásený.");

  const rawBarcode = input.barcode.trim();
  const parsed = rawBarcode ? parseBarcode(rawBarcode) : null;
  if (rawBarcode && !parsed) return fail("Neplatný čiarový kód — zadaj 8, 12 alebo 13 číslic, alebo ho nechaj prázdny.");
  const name = input.name.trim();
  const brand = input.brand.trim();
  if (!name || name.length > 100) return fail("Zadaj názov potraviny (max 100 znakov).");
  if (brand.length > 60) return fail("Značka môže mať najviac 60 znakov.");
  if (input.kcal.trim() === "") return fail("Zadaj kalórie na 100 g.");
  const vals = [input.kcal, input.protein, input.carbs, input.fat].map((v) => Number(v.trim().replace(",", ".") || 0));
  if (vals.some((v) => !Number.isFinite(v) || v < 0)) return fail("Hodnoty musia byť čísla 0 alebo viac.");
  const [kcal, protein, carbs, fat] = vals;
  if (kcal > 900) return fail("Kalórie na 100 g môžu byť najviac 900.");
  if (protein + carbs + fat > 100) return fail("Bielkoviny, sacharidy a tuky spolu nemôžu mať viac ako 100 g na 100 g.");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("foods")
    .insert({
      name: foodDisplayName(name, brand || null),
      kcal_100g: kcal,
      protein_100g: protein,
      carbs_100g: carbs,
      fat_100g: fat,
      barcode: parsed?.code ?? null,
      source: "user",
      created_by: user.id,
      trainer_id: null,
    })
    .select("id, name")
    .single();
  if (error) {
    if (error.code === "23505") return fail("Potravinu s týmto kódom už máš uloženú — naskenuj ho znova.");
    return fail(dbErr(error, "actions"));
  }

  return {
    error: null,
    food: {
      foodId: data.id,
      name: data.name,
      kcal100g: kcal,
      protein100g: protein,
      carbs100g: carbs,
      fat100g: fat,
      source: "user",
      barcode: parsed?.code ?? null,
      servingGrams: null,
    },
  };
}
