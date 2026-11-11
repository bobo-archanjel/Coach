"use server";

import { getTranslations } from "next-intl/server";
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
  const t = await getTranslations("food.errors");
  const {
    data: { user },
  } = await getUser();
  if (!user) return fail((await getTranslations("errors"))("notSignedIn"));

  const rawBarcode = input.barcode.trim();
  const parsed = rawBarcode ? parseBarcode(rawBarcode) : null;
  if (rawBarcode && !parsed) return fail(t("invalidBarcode"));
  const name = input.name.trim();
  const brand = input.brand.trim();
  if (!name || name.length > 100) return fail(t("name"));
  if (brand.length > 60) return fail(t("brand"));
  if (input.kcal.trim() === "") return fail(t("kcalRequired"));
  const vals = [input.kcal, input.protein, input.carbs, input.fat].map((v) => Number(v.trim().replace(",", ".") || 0));
  if (vals.some((v) => !Number.isFinite(v) || v < 0)) return fail(t("numbers"));
  const [kcal, protein, carbs, fat] = vals;
  if (kcal > 900) return fail(t("kcalMax"));
  if (protein + carbs + fat > 100) return fail(t("macrosMax"));

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
    if (error.code === "23505") return fail(t("duplicate"));
    return fail(await dbErr(error, "actions"));
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
