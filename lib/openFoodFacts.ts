// Živé vyhľadávanie značkových potravín cez Open Food Facts — Fáza C.
// Voľné, bez API kľúča, dáta pod ODbL licenciou. Fair-use politika OFF:
// 1 API volanie = 1 reálne vyhľadávanie používateľa (nie hromadné sťahovanie) —
// preto sa volá len naživo z formulára pridania jedla, nič sa neukladá do DB.
// Rovnaký dopyt sa hodinu berie z Next data cache (searchOpenFoodFactsCached) —
// "rožok", "jogurt" hľadá veľa klientov, OFF tak dostane menej volaní, nie viac.
//
// Endpoint: search.openfoodfacts.org (Search-a-licious) — nástupca staršieho
// world.openfoodfacts.org/api/v2/search, ktorý OFF sám označuje za zastaraný
// a v praxi občas vracia 503. Krajinu nefiltrujeme na úrovni dopytu (presná
// query syntax pre countries_tags nie je zdokumentovaná/spoľahlivá), namiesto
// toho SK/CZ výsledky len uprednostníme v triedení — nič sa tak nestratí, ak
// je lokálne pokrytie pre daný produkt tenké.

import { unstable_cache } from "next/cache";
import type { PortalFoodOption } from "@/lib/portal/types";
import { parseOffProductResponse, type OffProduct } from "@/lib/offProduct";

const SEARCH_URL = "https://search.openfoodfacts.org/search";
// Identifikuje appku podľa OFF pravidiel (odporúčané, nie API kľúč) — s kontaktným
// e-mailom z env, nech nás OFF vie pri probléme osloviť namiesto zablokovania IP.
const OFF_CONTACT = process.env.OFF_CONTACT_EMAIL?.trim();
const USER_AGENT = `FitPilot/1.0 (${OFF_CONTACT || "fitness coaching app; contact via app"})`;

interface OffHit {
  code?: string;
  product_name?: string;
  brands?: string[] | string;
  countries_tags?: string[];
  nutriments?: Record<string, number | string | undefined>;
}

const LOCAL_COUNTRIES = new Set(["en:slovakia", "en:czech-republic"]);

function brandLabel(brands: OffHit["brands"]): string | null {
  if (!brands) return null;
  const first = Array.isArray(brands) ? brands[0] : brands.split(",")[0];
  return first?.trim() || null;
}

function toOption(hit: OffHit): PortalFoodOption | null {
  const name = hit.product_name?.trim();
  if (!name) return null;
  const n = hit.nutriments ?? {};
  const kcal = Number(n["energy-kcal_100g"]);
  if (!Number.isFinite(kcal)) return null; // bez energetickej hodnoty nie je na čo logovať
  const brand = brandLabel(hit.brands);
  return {
    foodId: null,
    name: brand ? `${name} (${brand})` : name,
    kcal100g: kcal,
    protein100g: Number(n["proteins_100g"]) || 0,
    carbs100g: Number(n["carbohydrates_100g"]) || 0,
    fat100g: Number(n["fat_100g"]) || 0,
    // kód produktu — builder jedálnička si podľa neho produkt uloží (potrebuje food_id)
    barcode: hit.code && /^\d{8,13}$/.test(hit.code) ? hit.code : null,
  };
}

function isLocal(hit: OffHit): boolean {
  return (hit.countries_tags ?? []).some((t) => LOCAL_COUNTRIES.has(t));
}

/** Vyhľadá potraviny, SK/CZ produkty uprednostní v poradí výsledkov. */
export async function searchOpenFoodFacts(query: string): Promise<PortalFoodOption[]> {
  const trimmed = query.trim();
  if (trimmed.length < 3) return [];

  const params = new URLSearchParams({
    q: trimmed,
    page_size: "20",
    fields: "code,product_name,brands,nutriments,countries_tags",
  });

  const res = await fetch(`${SEARCH_URL}?${params.toString()}`, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) throw new Error(`Open Food Facts ${res.status}`);
  const json = await res.json();
  const hits: OffHit[] = json.hits ?? [];

  const sorted = [...hits].sort((a, b) => Number(isLocal(b)) - Number(isLocal(a)));

  const seen = new Set<string>();
  const options: PortalFoodOption[] = [];
  for (const hit of sorted) {
    const opt = toOption(hit);
    if (!opt || seen.has(opt.name)) continue;
    seen.add(opt.name);
    options.push(opt);
    if (options.length >= 12) break;
  }
  return options;
}

const searchCached = unstable_cache(
  (normalized: string) => searchOpenFoodFacts(normalized),
  ["open-food-facts-search-v2"], // v2: výsledky nesú aj čiarový kód
  { revalidate: 3600 },
);

/**
 * `searchOpenFoodFacts` s hodinovou cache podľa normalizovaného dopytu (bez ohľadu
 * na veľkosť písmen a medzery). Chyba sa vyhodí, nie uloží — `unstable_cache`
 * výnimku necachuje, takže výpadok OFF nezamrzne prázdny výsledok na hodinu.
 */
export async function searchOpenFoodFactsCached(query: string): Promise<PortalFoodOption[]> {
  const normalized = query.trim().toLowerCase().replace(/\s+/g, " ");
  if (normalized.length < 3) return [];
  return searchCached(normalized);
}

// ---------------------------------------------------------------- produkt podľa kódu
// Skener v denníku (feature/barcode-scanner): jeden produkt podľa čiarového kódu.
// Výsledok si route /api/potraviny/kod/[ean] uloží do `foods` (source='off'), takže
// OFF sa pýtame len pri prvom skene daného kódu — OFF má limit na IP a Vercel ju zdieľa.
const PRODUCT_URL = "https://world.openfoodfacts.org/api/v2/product";
const PRODUCT_FIELDS =
  "code,product_name,product_name_sk,product_name_cs,brands,nutriments,serving_size,serving_quantity";

/** Produkt z OFF, null = OFF ho nepozná. Výpadok/timeout (5 s) vyhodí výnimku. */
export async function fetchOpenFoodFactsProduct(code: string): Promise<OffProduct | null> {
  const res = await fetch(`${PRODUCT_URL}/${encodeURIComponent(code)}.json?fields=${PRODUCT_FIELDS}`, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(5000),
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Open Food Facts ${res.status}`);
  return parseOffProductResponse(await res.json());
}
