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
  /** veľkosť balenia v g/ml (OFF ju drží ako číslo/reťazec), jednotka v product_quantity_unit */
  product_quantity?: number | string | null;
  product_quantity_unit?: string | null;
  /** text na obale, napr. "500 g", "1,5 l", "4 x 125 g" */
  quantity?: string | null;
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
  /** veľkosť celého balenia v g/ml (v `unitBase`), null = neznáma/nepravdepodobná */
  packageGrams: number | null;
  /** základná jednotka hodnôt na 100: 'ml' pre nápoje, inak 'g' */
  unitBase: "g" | "ml";
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

const UNIT_MUL: Record<string, ["g" | "ml", number]> = {
  g: ["g", 1],
  kg: ["g", 1000],
  ml: ["ml", 1],
  cl: ["ml", 10],
  dl: ["ml", 100],
  l: ["ml", 1000],
};

/** "500 g", "1,5 l", "4 x 125 g" → { unit, value } (prvé množstvo; násobok "N x" sa započíta), inak null. */
export function parseQuantityText(text: string | null | undefined): { unit: "g" | "ml"; value: number } | null {
  const m = (text ?? "").toLowerCase().replace(",", ".").match(/(?:(d+)s*[x×]s*)?(d+(?:.d+)?)s*(kg|g|ml|cl|dl|l)/);
  if (!m) return null;
  const [unit, mul] = UNIT_MUL[m[3]];
  return { unit, value: Number(m[2]) * mul * (m[1] ? Number(m[1]) : 1) };
}

/**
 * Základná jednotka hodnôt na 100 — rovnaké pravidlo ako scripts/off-extract.mjs: OFF nemá
 * pole "na 100 ml" (nutrition_data_per je len 100g|serving), preto sa berie z jednotky balenia
 * (product_quantity_unit, potom text quantity, potom porcia v ml); inak 'g'.
 */
export function detectUnitBase(p: OffProduct): "g" | "ml" {
  const pqu = p.product_quantity_unit?.toLowerCase().trim();
  if (pqu === "ml") return "ml";
  if (pqu === "g") return "g";
  const q = parseQuantityText(p.quantity);
  if (q) return q.unit;
  const sv = (p.serving_size ?? "").toLowerCase();
  return /ds*(ml|cl|dl|l)/.test(sv) && !/ds*(g|kg)/.test(sv) ? "ml" : "g";
}

/** Veľkosť balenia v g/ml (0 < x ≤ 5000, jednotka musí sedieť s `unit`), inak null. */
function packageSize(p: OffProduct, unit: "g" | "ml"): number | null {
  const pqu = p.product_quantity_unit?.toLowerCase().trim();
  let v: number | null = null;
  if (p.product_quantity != null && p.product_quantity !== "" && (!pqu || pqu === unit)) {
    const n = Number(String(p.product_quantity).replace(",", "."));
    if (Number.isFinite(n)) v = n;
  }
  if (v === null) {
    const q = parseQuantityText(p.quantity);
    if (q && q.unit === unit) v = q.value;
  }
  return v !== null && v > 0 && v <= 5000 ? round1(v) : null;
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
  const unitBase = detectUnitBase(p);

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
    packageGrams: packageSize(p, unitBase),
    unitBase,
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
