// Mapovanie produktu z Open Food Facts (API v2 /product/{kód}) na hodnoty potraviny
// na 100 g — čisté funkcie bez next/supabase importov (route aj unit testy,
// e2e/barcode.spec.ts). Chýbajúce alebo nezmyselné hodnoty ostávajú null; či sa dá
// produkt rovno použiť, rozhoduje `isCompleteFood` (DB vyžaduje kcal aj B/S/T).

export interface OffProduct {
  code?: string;
  product_name?: string;
  product_name_sk?: string;
  product_name_cs?: string;
  brands?: string | string[];
  nutriments?: Record<string, number | string | null | undefined>;
  serving_size?: string;
  serving_quantity?: number | string | null;
}

export interface FoodPer100g {
  name: string | null;
  brand: string | null;
  kcal: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  fiber: number | null;
  sugars: number | null;
  salt: number | null;
  /** veľkosť porcie v gramoch (serving_quantity), null = neuvedená */
  servingGrams: number | null;
}

export type CompleteFood = FoodPer100g & { name: string; kcal: number; protein: number; carbs: number; fat: number };

const KJ_PER_KCAL = 4.184;

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Číslo z OFF (býva aj reťazec) v rozsahu 0…max, inak null. */
function num(value: unknown, max: number): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  if (!Number.isFinite(n) || n < 0 || n > max) return null;
  return round1(n);
}

function firstBrand(brands: OffProduct["brands"]): string | null {
  if (!brands) return null;
  const first = Array.isArray(brands) ? brands[0] : brands.split(",")[0];
  return first?.trim() || null;
}

function pickName(p: OffProduct): string | null {
  for (const candidate of [p.product_name_sk, p.product_name_cs, p.product_name]) {
    const name = candidate?.trim();
    if (name) return name;
  }
  return null;
}

/** Hodnoty na 100 g z OFF produktu; kcal prípadne z kJ, soľ prípadne zo sodíka (× 2,5). */
export function mapOffProduct(p: OffProduct): FoodPer100g {
  const n = p.nutriments ?? {};
  const kcalDirect = num(n["energy-kcal_100g"], 900);
  // "energy_100g" je v OFF vždy v kJ
  const kj = num(n["energy-kj_100g"], 900 * KJ_PER_KCAL) ?? num(n["energy_100g"], 900 * KJ_PER_KCAL);
  const kcal = kcalDirect ?? (kj !== null ? round1(kj / KJ_PER_KCAL) : null);
  const sodium = num(n["sodium_100g"], 40);
  const serving = num(p.serving_quantity, 5000);

  return {
    name: pickName(p),
    brand: firstBrand(p.brands),
    kcal,
    protein: num(n["proteins_100g"], 100),
    carbs: num(n["carbohydrates_100g"], 100),
    fat: num(n["fat_100g"], 100),
    fiber: num(n["fiber_100g"], 100),
    sugars: num(n["sugars_100g"], 100),
    salt: num(n["salt_100g"], 100) ?? (sodium !== null ? round1(sodium * 2.5) : null),
    servingGrams: serving && serving > 0 ? Math.round(serving) : null,
  };
}

/** Dá sa rovno zapísať do denníka/uložiť — má názov, kcal aj bielkoviny/sacharidy/tuky. */
export function isCompleteFood(food: FoodPer100g): food is CompleteFood {
  return food.name !== null && food.kcal !== null && food.protein !== null && food.carbs !== null && food.fat !== null;
}

/** "Názov (Značka)" — značku nepridá, ak už je v názve. */
export function foodDisplayName(name: string, brand: string | null): string {
  if (!brand || name.toLowerCase().includes(brand.toLowerCase())) return name;
  return `${name} (${brand})`;
}

/**
 * Odpoveď OFF /api/v2/product/{kód}.json → produkt, alebo null keď ho OFF nepozná
 * (status 0 / "product not found"). Neznámy tvar odpovede = null.
 */
export function parseOffProductResponse(json: unknown): OffProduct | null {
  if (!json || typeof json !== "object") return null;
  const body = json as { status?: number | string; product?: unknown };
  if (Number(body.status) !== 1 || !body.product || typeof body.product !== "object") return null;
  return body.product as OffProduct;
}
