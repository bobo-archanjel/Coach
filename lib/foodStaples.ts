import type { SupabaseClient } from "@supabase/supabase-js";
import type { Locale } from "@/lib/i18n/locales";
import type { PortalFoodOption } from "@/lib/portal/types";

/**
 * Zobrazený názov potraviny podľa jazyka: čeština → name_cs, inak (alebo keď český názov
 * chýba) name. Platí pre generické potraviny (CIQUAL, source='import').
 */
export const foodNameForLocale = (row: { name: string; name_cs?: string | null }, locale: Locale): string =>
  (locale === "cs" && row.name_cs?.trim()) || row.name;

/**
 * Generické potraviny (kuracie prsia, ryža, jablko…) — source='import'. RLS (0050) globálne
 * 'import' riadky ukazuje každému prihlásenému, klient denníka teda nepotrebuje trénera.
 * POZOR: stĺpec `name_cs` vznikne až migráciou 0064 a `unit_base`/`piece_g`/`package_g` až
 * 0066 — pred ich spustením sa select zopakuje bez nich (slovenské názvy, len gramy).
 */
export async function loadStaples(supabase: SupabaseClient, locale: Locale): Promise<PortalFoodOption[]> {
  const cols = "id, name, kcal_100g, protein_100g, carbs_100g, fat_100g, fiber_100g, sugars_100g, salt_100g, serving_g";
  const query = (select: string) => supabase.from("foods").select(select).eq("source", "import").order("name").limit(2000);
  const portionCols = "unit_base, piece_g, package_g";
  let { data, error } = await query(`${cols}, name_cs, ${portionCols}`);
  // nové stĺpce ešte neexistujú (migrácie 0064 / 0066 nespustené) — postupne bez nich
  if (error) ({ data, error } = await query(`${cols}, name_cs`));
  if (error) ({ data, error } = await query(cols));
  if (error || !data) return [];
  return (data as unknown as Record<string, unknown>[]).map((f) => ({
    foodId: f.id as string,
    name: foodNameForLocale(f as { name: string; name_cs?: string | null }, locale),
    kcal100g: Number(f.kcal_100g),
    protein100g: Number(f.protein_100g),
    carbs100g: Number(f.carbs_100g),
    fat100g: Number(f.fat_100g),
    fiber100g: f.fiber_100g === null ? null : Number(f.fiber_100g),
    sugars100g: f.sugars_100g === null ? null : Number(f.sugars_100g),
    salt100g: f.salt_100g === null ? null : Number(f.salt_100g),
    servingGrams: f.serving_g === null ? null : Number(f.serving_g),
    ...portionFields(f),
    source: "import" as const,
    barcode: null,
  }));
}

/** unit_base / piece_g / package_g z riadku `foods` (pred migráciou 0066 chýbajú → len gramy). */
export function portionFields(f: Record<string, unknown>): Pick<PortalFoodOption, "unitBase" | "pieceGrams" | "packageGrams"> {
  const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return { unitBase: f.unit_base === "ml" ? "ml" : "g", pieceGrams: n(f.piece_g), packageGrams: n(f.package_g) };
}
