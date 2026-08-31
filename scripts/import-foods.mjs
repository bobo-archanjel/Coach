// Jednorazový import globálnej knižnice potravín (surové/nespracované) z USDA
// FoodData Central — https://fdc.nal.usda.gov. Makrá surových potravín sú
// prakticky univerzálne (nezávisia od fortifikácie ani značky), preto sú vhodné
// ako základ aj pre SK/CZ trh; názvy sú ručne preložené (scripts/food-list-sk.json).
// Značkové SK/CZ produkty rieši samostatná Fáza C (Open Food Facts live search
// v /portal/dennik), tá túto tabuľku vôbec nepoužíva.
//
// Spustenie (raz, lokálne, nikdy za behu appky):
//   node scripts/import-foods.mjs
//
// Vyžaduje v .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// Odporúčané (nie povinné): USDA_API_KEY — vlastný voľný kľúč z
// https://fdc.nal.usda.gov/api-key-signup.html (30 sekúnd, žiadne schvaľovanie).
// Bez neho sa použije zdieľaný "DEMO_KEY", ktorý má prísny rate limit
// (cca 30 požiadaviek/hodinu na IP) — pri ~90 potravinách by to trvalo hodiny
// a padalo na 429. S vlastným kľúčom (1000/h) prebehne za pár desiatok sekúnd.

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

function loadEnvLocal() {
  const envPath = path.join(repoRoot, ".env.local");
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadEnvLocal();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const USDA_API_KEY = process.env.USDA_API_KEY || "DEMO_KEY";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Chýba NEXT_PUBLIC_SUPABASE_URL alebo SUPABASE_SERVICE_ROLE_KEY v .env.local");
  process.exit(1);
}
if (USDA_API_KEY === "DEMO_KEY") {
  console.warn(
    "Pozor: beží sa na zdieľanom DEMO_KEY (prísny rate limit). Odporúčam vlastný " +
      "voľný kľúč z https://fdc.nal.usda.gov/api-key-signup.html do .env.local ako USDA_API_KEY.",
  );
}

const NUTRIENT = { KCAL: 208, PROTEIN: 203, CARBS: 205, FAT: 204 };

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function extractMacros(food) {
  const byNum = new Map((food.foodNutrients ?? []).map((n) => [n.nutrientNumber, n.value]));
  return {
    kcal_100g: byNum.get(String(NUTRIENT.KCAL)) ?? byNum.get(NUTRIENT.KCAL) ?? 0,
    protein_100g: byNum.get(String(NUTRIENT.PROTEIN)) ?? byNum.get(NUTRIENT.PROTEIN) ?? 0,
    carbs_100g: byNum.get(String(NUTRIENT.CARBS)) ?? byNum.get(NUTRIENT.CARBS) ?? 0,
    fat_100g: byNum.get(String(NUTRIENT.FAT)) ?? byNum.get(NUTRIENT.FAT) ?? 0,
  };
}

/** USDA API vracia 400 (WAF) na `"` a `%` v query, aj keď sú URL-encoded — vyhnúť sa im. */
function sanitizeQuery(q) {
  return q.replace(/"/g, "").replace(/%/g, " percent ").replace(/\s+/g, " ").trim();
}

async function searchFood(entry) {
  const params = new URLSearchParams({
    query: sanitizeQuery(entry.query),
    pageSize: "3",
    api_key: USDA_API_KEY,
  });
  for (const dt of entry.dataType ?? []) params.append("dataType", dt);

  const res = await fetch(`https://api.nal.usda.gov/fdc/v1/foods/search?${params.toString()}`);
  if (res.status === 429) throw new Error("RATE_LIMIT");
  if (!res.ok) throw new Error(`USDA ${res.status} ${res.statusText}`);
  const json = await res.json();
  return json.foods?.[0] ?? null;
}

async function main() {
  const listPath = path.join(repoRoot, "scripts", "food-list-sk.json");
  const list = JSON.parse(readFileSync(listPath, "utf8"));
  console.log(`Spracúvam ${list.length} potravín z USDA FoodData Central...`);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const delayMs = USDA_API_KEY === "DEMO_KEY" ? 4000 : 250;
  let imported = 0;
  let skipped = 0;

  for (const entry of list) {
    let food;
    try {
      food = await searchFood(entry);
    } catch (err) {
      console.error(`  ✗ ${entry.nameSk}: ${err.message}`);
      skipped++;
      await sleep(delayMs);
      continue;
    }
    if (!food) {
      console.warn(`  ✗ ${entry.nameSk}: nič nenájdené pre "${entry.query}"`);
      skipped++;
      await sleep(delayMs);
      continue;
    }

    const macros = extractMacros(food);
    const { error } = await supabase.from("foods").upsert(
      {
        trainer_id: null,
        external_id: String(food.fdcId),
        name: entry.nameSk,
        ...macros,
      },
      { onConflict: "external_id" },
    );

    if (error) {
      console.error(`  ✗ ${entry.nameSk}: ${error.message}`);
      skipped++;
    } else {
      console.log(`  ✓ ${entry.nameSk} ← "${food.description}" (fdcId ${food.fdcId})`);
      imported++;
    }
    await sleep(delayMs);
  }

  console.log(`\nHotovo. Importovaných ${imported}, preskočených ${skipped} z ${list.length}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
