// Živé vyhľadávanie značkových potravín cez Open Food Facts (world.openfoodfacts.org)
// — Fáza C. Voľné, bez API kľúča, dáta pod ODbL licenciou. Fair-use politika OFF:
// 1 API volanie = 1 reálne vyhľadávanie používateľa (nie hromadné sťahovanie) —
// preto sa volá len naživo z formulára pridania jedla, nič sa nekešuje do DB.
// Silné pokrytie SK trhu (skenované produkty z Tesco/Kaufland/Lidl a pod.).

import type { PortalFoodOption } from "@/lib/portal/types";

const SEARCH_URL = "https://world.openfoodfacts.org/api/v2/search";
// Identifikuje appku podľa OFF pravidiel (odporúčané, nie API kľúč).
const USER_AGENT = "FitPilot/1.0 (fitness coaching app; contact via app)";

interface OffProduct {
  product_name?: string;
  brands?: string;
  nutriments?: Record<string, number | string | undefined>;
}

function toOption(p: OffProduct): PortalFoodOption | null {
  const name = p.product_name?.trim();
  if (!name) return null;
  const n = p.nutriments ?? {};
  const kcal = Number(n["energy-kcal_100g"]);
  if (!Number.isFinite(kcal)) return null; // bez energetickej hodnoty nie je na čo logovať
  const label = p.brands ? `${name} (${p.brands.split(",")[0].trim()})` : name;
  return {
    foodId: null,
    name: label,
    kcal100g: kcal,
    protein100g: Number(n["proteins_100g"]) || 0,
    carbs100g: Number(n["carbohydrates_100g"]) || 0,
    fat100g: Number(n["fat_100g"]) || 0,
  };
}

/** Vyhľadá potraviny na SK trhu; ak nič nenájde, skúsi bez obmedzenia na krajinu. */
export async function searchOpenFoodFacts(query: string): Promise<PortalFoodOption[]> {
  const trimmed = query.trim();
  if (trimmed.length < 3) return [];

  const fields = "product_name,brands,nutriments";
  const base = { search_terms: trimmed, page_size: "12", fields };

  const skParams = new URLSearchParams({ ...base, countries_tags: "slovakia" });
  const res = await fetch(`${SEARCH_URL}?${skParams.toString()}`, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) throw new Error(`Open Food Facts ${res.status}`);
  const json = await res.json();
  let products: OffProduct[] = json.products ?? [];

  if (products.length === 0) {
    const globalParams = new URLSearchParams(base);
    const res2 = await fetch(`${SEARCH_URL}?${globalParams.toString()}`, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(6000),
    });
    if (res2.ok) {
      const json2 = await res2.json();
      products = json2.products ?? [];
    }
  }

  const seen = new Set<string>();
  const options: PortalFoodOption[] = [];
  for (const p of products) {
    const opt = toOption(p);
    if (!opt || seen.has(opt.name)) continue;
    seen.add(opt.name);
    options.push(opt);
  }
  return options;
}
