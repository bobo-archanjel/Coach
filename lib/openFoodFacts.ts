// Živé vyhľadávanie značkových potravín cez Open Food Facts — Fáza C.
// Voľné, bez API kľúča, dáta pod ODbL licenciou. Fair-use politika OFF:
// 1 API volanie = 1 reálne vyhľadávanie používateľa (nie hromadné sťahovanie) —
// preto sa volá len naživo z formulára pridania jedla, nič sa nekešuje do DB.
//
// Endpoint: search.openfoodfacts.org (Search-a-licious) — nástupca staršieho
// world.openfoodfacts.org/api/v2/search, ktorý OFF sám označuje za zastaraný
// a v praxi občas vracia 503. Krajinu nefiltrujeme na úrovni dopytu (presná
// query syntax pre countries_tags nie je zdokumentovaná/spoľahlivá), namiesto
// toho SK/CZ výsledky len uprednostníme v triedení — nič sa tak nestratí, ak
// je lokálne pokrytie pre daný produkt tenké.

import type { PortalFoodOption } from "@/lib/portal/types";

const SEARCH_URL = "https://search.openfoodfacts.org/search";
// Identifikuje appku podľa OFF pravidiel (odporúčané, nie API kľúč).
const USER_AGENT = "FitPilot/1.0 (fitness coaching app; contact via app)";

interface OffHit {
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
    fields: "product_name,brands,nutriments,countries_tags",
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
