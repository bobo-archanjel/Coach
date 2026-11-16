// Porcie potravín: množstvo × jednotka (g/ml, ks, porcia, balenie) ako v Kalorických tabuľkách,
// MyFitnessPal či Yazio. Čisté funkcie bez závislostí — používa ich výber potravín (klient),
// server (prepočet gramáže zo vzorových hodnôt potraviny v DB), PDF aj AI generátor.
//
// Zdroj pravdy ostáva `grams` (v DB `food_logs.grams` / `meals[].grams`) — makrá sa rátajú len
// z neho (pri tekutinách 1 ml = 1 jednotka na 100 ml, bez hustoty). `portion_unit` + `portion_qty`
// sú len to, ako to používateľ zadal, aby sa dalo zobraziť „2 ks (110 g)“.

export type PortionUnit = "g" | "ml" | "piece" | "serving" | "package";
export type BaseUnit = "g" | "ml";

/** Čo o potravine treba na výpočet porcií — podmnožina PortalFoodOption / riadku `foods`. */
export interface PortionFood {
  /** základná jednotka na 100 (predvolene g) */
  unitBase?: BaseUnit | null;
  /** hmotnosť jedného kusu (ks) */
  pieceGrams?: number | null;
  /** veľkosť porcie */
  servingGrams?: number | null;
  /** veľkosť celého balenia */
  packageGrams?: number | null;
}

export const PORTION_UNITS: readonly PortionUnit[] = ["g", "ml", "piece", "serving", "package"];
export const MAX_PORTION_GRAMS = 5000;

export const isPortionUnit = (v: unknown): v is PortionUnit => PORTION_UNITS.includes(v as PortionUnit);

const pos = (n: number | null | undefined): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Základná jednotka potraviny („g“ alebo „ml“). */
export const baseUnitOf = (food: PortionFood): BaseUnit => (food.unitBase === "ml" ? "ml" : "g");

/** Jednotky, ktoré sa pre potravinu ponúkajú — vždy základná, ďalej ks / porcia / balenie len ak ich potravina má. */
export function portionOptions(food: PortionFood): PortionUnit[] {
  const out: PortionUnit[] = [baseUnitOf(food)];
  if (pos(food.pieceGrams)) out.push("piece");
  if (pos(food.servingGrams)) out.push("serving");
  if (pos(food.packageGrams)) out.push("package");
  return out;
}

/**
 * Predvolené množstvo po výbere potraviny: 1 ks, inak 1 porcia, inak 1 balenie — porcia aj
 * balenie len ak sú ≤ 400 g/ml (väčšie nikto nezje naraz; OFF má pri niektorých produktoch
 * porciu zle zadanú ako celé balenie, napr. mlieko 1000 ml), inak 100 g/ml.
 */
export function defaultPortion(food: PortionFood): { unit: PortionUnit; qty: number } {
  if (pos(food.pieceGrams)) return { unit: "piece", qty: 1 };
  if (pos(food.servingGrams) && food.servingGrams <= 400) return { unit: "serving", qty: 1 };
  if (pos(food.packageGrams) && food.packageGrams <= 400) return { unit: "package", qty: 1 };
  return { unit: baseUnitOf(food), qty: 100 };
}

/**
 * Gramy (resp. ml) pre `qty` × `unit`, zaokrúhlené na 0,1. null = neplatné množstvo alebo
 * jednotka, ktorú potravina nemá (napr. „ks“ bez piece_g) — volajúci má vtedy padnúť na zadané gramy.
 */
export function portionGrams(unit: PortionUnit, qty: number, food: PortionFood): number | null {
  if (!Number.isFinite(qty) || qty <= 0) return null;
  let per: number;
  if (unit === "g" || unit === "ml") {
    if (unit !== baseUnitOf(food)) return null;
    per = 1;
  } else {
    const v = unit === "piece" ? food.pieceGrams : unit === "serving" ? food.servingGrams : food.packageGrams;
    if (!pos(v)) return null;
    per = v;
  }
  return round1(qty * per);
}

/** Porcia tak, ako ju používateľ zadal — `base` je základná jednotka potraviny (g/ml) v čase zápisu. */
export interface Portion {
  unit: PortionUnit;
  qty: number;
  base?: BaseUnit;
}

/** Zobrazenie záznamu — `t` je prekladač nad kľúčmi g | ml | piece | serving | package (viď messages food.portion / pdf meal.portion). */
export type PortionTranslator = (key: PortionUnit, values: { qty: number; grams: number; base: BaseUnit }) => string;

/**
 * Text porcie: „2 ks (110 g)“, „1 balenie (150 g)“, „1 porcia (30 g)“, „250 ml“, „120 g“.
 * Záznam bez jednotky (starý) alebo v g/ml → len gramy; ks/porcia/balenie bez množstva tiež.
 */
export function formatPortion(
  t: PortionTranslator,
  p: { grams: number; unit?: string | null; qty?: number | null; base?: string | null },
): string {
  const grams = round1(p.grams);
  // uložená základná jednotka záznamu (portion_base); starý záznam / null = g
  const base: BaseUnit = p.base === "ml" ? "ml" : "g";
  const unit = p.unit;
  if ((unit === "piece" || unit === "serving" || unit === "package") && pos(p.qty)) {
    return t(unit, { qty: Math.round(p.qty * 100) / 100, grams, base });
  }
  return t(unit === "ml" ? "ml" : "g", { qty: grams, grams, base });
}
