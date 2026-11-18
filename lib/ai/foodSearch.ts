// FitPilot — AI Kouč: nástroj search_foods. Potraviny, ktoré smie AI pomenovať, sú
// len tie z databáz appky: globálne základné potraviny + vlastné potraviny trénera
// (tabuľka foods, viď foodContext.ts) a offline balík Open Food Facts z public/food-data
// (to isté, čo klient hľadá v denníku). Balík sa načíta SERVER-SIDE z disku (fs + zlib),
// rozparsuje raz a drží sa v pamäti procesu — ďalšie správy ho už len prehľadávajú.
// Súbory musí Vercel pribaliť k serverless funkcii: next.config.ts → outputFileTracingIncludes.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { gunzip } from "node:zlib";
import { promisify } from "node:util";
import type { Locale } from "@/lib/i18n/locales";
import {
  buildIndex,
  filterByQuery,
  foodAt,
  searchIndex,
  type FoodBundle,
  type FoodSearchIndex,
  type IndexedFood,
} from "@/lib/foodIndexCore";
import { baseUnitOf, type PortionFood } from "@/lib/portions";
import { formatPortionUnits, type FoodCandidate } from "./foodContext";
import { promptSafe } from "./promptSafety";

const gunzipAsync = promisify(gunzip);

export const SEARCH_FOODS_MAX = 15;
const FOOD_DATA_DIR = ["public", "food-data"] as const;

export interface FoodSearchHit {
  /** "kniznica" = základná potravina / potravina trénera, "off" = Open Food Facts balík */
  source: "kniznica" | "off";
  /** foods.id (knižnica) alebo čiarový kód (OFF) */
  id: string;
  name: string;
  kcal100: number;
  protein100: number;
  carbs100: number;
  fat100: number;
  /** vláknina na 100 (null = neznáma) */
  fiber100?: number | null;
  /** na 100 g alebo 100 ml */
  unit: "g" | "ml";
  /** „1 ks = 55 g; 1 balenie = 150 g“ (len jednotky, ktoré potravina má) */
  portions: string;
  /** slovenský názov z databázy (bez lokalizácie) — na klasifikáciu diéty a kategórií */
  nameBase?: string;
  /** strojovo: veľkosti ks/porcie/balenia — generátor jedálničkov z nich počíta gramáž (lib/portions.ts) */
  portion: PortionFood;
  /** len OFF: celý riadok z balíka (názov, značka, vláknina… pre založenie riadku vo `foods`) */
  offFood?: IndexedFood;
}

// ---------------------------------------------------------------- OFF balík (server)

let offIndexPromise: Promise<FoodSearchIndex | null> | null = null;

/** Prečíta manifest + gzip balík z disku a postaví index. Pri chybe vráti null (AI potom hľadá len v knižnici). */
export async function loadOffIndexFromDisk(baseDir = process.cwd()): Promise<FoodSearchIndex | null> {
  try {
    const dir = path.join(baseDir, ...FOOD_DATA_DIR);
    const manifest = JSON.parse(await readFile(path.join(dir, "manifest.json"), "utf8")) as { file?: string };
    if (!manifest.file) return null;
    // manifest.file je URL cesta ("/food-data/off-eu-….json.gz") — z disku berieme len názov súboru
    const raw = await readFile(path.join(dir, path.basename(manifest.file)));
    const bundle = JSON.parse((await gunzipAsync(raw)).toString("utf8")) as FoodBundle;
    return buildIndex(bundle);
  } catch (err) {
    console.error("loadOffIndexFromDisk:", err instanceof Error ? err.message : err);
    return null;
  }
}

/** Index OFF balíka, načítaný lenivo a jednorazovo na proces (zlyhanie sa nekešuje — skúsi sa znova). */
export function getOffIndex(): Promise<FoodSearchIndex | null> {
  if (!offIndexPromise) {
    offIndexPromise = loadOffIndexFromDisk().then((idx) => {
      if (!idx) offIndexPromise = null;
      return idx;
    });
  }
  return offIndexPromise;
}

// ---------------------------------------------------------------- hľadanie

const LIB_NAME_MAX = 80;

function libraryHit(f: FoodCandidate, locale: Locale): FoodSearchHit {
  const name = locale === "cs" && f.nameCs?.trim() ? f.nameCs : f.name;
  return {
    source: "kniznica",
    id: f.id,
    name: promptSafe(name, LIB_NAME_MAX),
    nameBase: promptSafe(f.name, LIB_NAME_MAX),
    kcal100: f.kcal100g,
    protein100: f.protein100g,
    carbs100: f.carbs100g,
    fat100: f.fat100g,
    fiber100: f.fiber100g ?? null,
    unit: baseUnitOf(f.portion),
    portions: formatPortionUnits(f.portion),
    portion: f.portion,
  };
}

/**
 * Hľadá `query` najprv v knižnici (základné potraviny + trénerove — sú kurátorované, majú
 * kusy/porcie), potom dopĺňa z OFF balíka do `limit`. `library` sa predáva zvonku (načítava
 * sa raz na správu), `off` môže byť null (balík sa nepodarilo načítať).
 */
export function searchFoodsIn(
  library: FoodCandidate[],
  off: FoodSearchIndex | null,
  query: string,
  limit: number,
  locale: Locale,
): FoodSearchHit[] {
  const n = Math.min(Math.max(Math.floor(limit), 1), SEARCH_FOODS_MAX);
  const q = query.trim().slice(0, 80);
  if (!q) return [];

  // názov v oboch jazykoch, nech nájde aj "kuřecí" aj "kuracie"
  const libHits = filterByQuery(library, q, (f) => (f.nameCs ? `${f.name} ${f.nameCs}` : f.name))
    .slice(0, n)
    .map((f) => libraryHit(f, locale));
  const out: FoodSearchHit[] = [...libHits];

  if (off && out.length < n) {
    for (const i of searchIndex(off, q, n - out.length)) {
      const f = foodAt(off, i);
      const portion: PortionFood = { unitBase: f.unit, servingGrams: f.servingGrams, packageGrams: f.packageGrams };
      out.push({
        source: "off",
        id: f.code,
        name: promptSafe(f.brand ? `${f.name} (${f.brand})` : f.name, 90),
        nameBase: promptSafe(f.name, 90),
        kcal100: f.kcal,
        protein100: f.protein,
        carbs100: f.carbs,
        fat100: f.fat,
        fiber100: f.fiber,
        unit: f.unit,
        portions: formatPortionUnits(portion),
        portion,
        offFood: f,
      });
    }
  }
  return out;
}

/** Kompaktný text výsledku pre model: jeden riadok na potravinu. */
export function formatFoodHits(hits: FoodSearchHit[]): string {
  if (hits.length === 0) return "Nenájdené (skús iné slovo, jednoduchší názov alebo anglický/nemecký výraz).";
  return hits
    .map(
      (h) =>
        `- ${h.name} [${h.source === "off" ? "OFF" : "knižnica"}]: ${h.kcal100} kcal, ${h.protein100} g B, ${h.carbs100} g S, ${h.fat100} g T (na 100 ${h.unit})${h.portions ? `; ${h.portions}` : ""}`,
    )
    .join("\n");
}
