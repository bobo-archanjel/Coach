// Zápis produktu Open Food Facts do tabuľky `foods` ako globálny záznam source='off' (0050).
// Zdieľa ho sken čiarového kódu (app/api/potraviny/kod/[ean]/route.ts) a AI generátor
// jedálničkov (offline balík OFF nemá riadok vo `foods`, a položka jedálnička potrebuje food_id).
// Klienta (service role) dostane zvonku — modul nič neimportuje zo servera, dá sa testovať.
//
// Používatelia 'off' riadky zapisovať nesmú (RLS), preto volajúci musí poslať service-role
// klienta. Súbežný zápis toho istého kódu (unikátny barcode) skončí na 23505 — vtedy sa
// záznam, ktorý medzitým vznikol, jednoducho prečíta.

import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingColumn } from "@/lib/dbError";
import { foodDisplayName, type CompleteFood } from "@/lib/offProduct";

// package_g/unit_base pribudli v migrácii 0066 — kým nebeží, dopyty idú bez nich (BASE).
export const OFF_BASE_COLUMNS =
  "id, name, kcal_100g, protein_100g, carbs_100g, fat_100g, fiber_100g, sugars_100g, salt_100g, serving_g, source, created_by";
export const OFF_FOOD_COLUMNS = `${OFF_BASE_COLUMNS}, package_g, unit_base, off_synced_at`;

export type OffFoodRowData = Record<string, unknown> & { id: string };

export type InsertOffFoodResult =
  | { status: "saved"; row: OffFoodRowData; legacy: boolean }
  | { status: "duplicate"; row: OffFoodRowData | null; legacy: boolean }
  | { status: "error"; message: string; legacy: boolean };

/** Riadok na vloženie — `legacyRow` je bez stĺpcov z migrácie 0066. */
export function buildOffFoodRows(mapped: CompleteFood, code: string) {
  const legacyRow = {
    name: foodDisplayName(mapped.name, mapped.brand).slice(0, 120),
    kcal_100g: mapped.kcal,
    protein_100g: mapped.protein,
    carbs_100g: mapped.carbs,
    fat_100g: mapped.fat,
    fiber_100g: mapped.fiber,
    sugars_100g: mapped.sugars,
    salt_100g: mapped.salt,
    serving_g: mapped.servingGrams,
    barcode: code,
    source: "off" as const,
    trainer_id: null,
    created_by: null,
    off_synced_at: new Date().toISOString(),
  };
  return { legacyRow, row: { ...legacyRow, package_g: mapped.packageGrams, unit_base: mapped.unitBase } };
}

/** Globálny (import/off) záznam s týmto kódom — nikdy nie cudzia „user“ potravina. */
export async function findGlobalFoodByBarcode(
  admin: SupabaseClient,
  code: string,
  legacy = false,
): Promise<OffFoodRowData | null> {
  const run = (cols: string) =>
    admin.from("foods").select(cols).eq("barcode", code).in("source", ["import", "off"]).limit(1).maybeSingle();
  let { data, error } = await run(legacy ? OFF_BASE_COLUMNS : OFF_FOOD_COLUMNS);
  if (!legacy && isMissingColumn(error)) ({ data, error } = await run(OFF_BASE_COLUMNS));
  if (error) console.error("findGlobalFoodByBarcode:", error.message);
  return (data as unknown as OffFoodRowData | null) ?? null;
}

export async function insertOffFood(admin: SupabaseClient, mapped: CompleteFood, code: string): Promise<InsertOffFoodResult> {
  const { legacyRow, row } = buildOffFoodRows(mapped, code);
  let { data: saved, error } = await admin.from("foods").insert(row).select(OFF_FOOD_COLUMNS).single();
  const legacy = isMissingColumn(error);
  if (legacy) {
    ({ data: saved, error } = await admin.from("foods").insert(legacyRow).select(OFF_BASE_COLUMNS).single());
  }
  if (saved) return { status: "saved", row: saved as unknown as OffFoodRowData, legacy };
  if (error?.code === "23505") {
    // súbežný zápis toho istého kódu — záznam už medzitým vznikol
    return { status: "duplicate", row: await findGlobalFoodByBarcode(admin, code, legacy), legacy };
  }
  return { status: "error", message: error?.message ?? "insert failed", legacy };
}

/** food_id pre OFF produkt: existujúci globálny záznam, inak ho založí. null = nepodarilo sa. */
export async function ensureOffFoodId(admin: SupabaseClient, mapped: CompleteFood, code: string): Promise<string | null> {
  const existing = await findGlobalFoodByBarcode(admin, code);
  if (existing) return existing.id;
  const res = await insertOffFood(admin, mapped, code);
  if (res.status === "saved") return res.row.id;
  if (res.status === "duplicate") return res.row?.id ?? null;
  console.error("ensureOffFoodId:", res.message);
  return null;
}
