// Jednorazový import globálnej knižnice cvikov z Free Exercise DB (Unlicense,
// verejná doména) — https://github.com/yuhonas/free-exercise-db.
//
// Ukladá len EXTERNÉ URL na obrázky (raw.githubusercontent.com), NIE kopíruje
// obrázky do Supabase Storage — šetrí miesto na free tieri (2 GB limit).
//
// Spustenie (raz, lokálne, nikdy za behu appky):
//   node scripts/import-exercises.mjs
//
// Vyžaduje v .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// (service role kľúč obchádza RLS — treba na vloženie riadkov s trainer_id = null).

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

// ---------- .env.local (bez závislosti na dotenv) ----------
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

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Chýba NEXT_PUBLIC_SUPABASE_URL alebo SUPABASE_SERVICE_ROLE_KEY v .env.local");
  process.exit(1);
}

const RAW_BASE = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises";
const EXERCISES_JSON_URL = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json";

const MUSCLE_SK = {
  abdominals: "brucho",
  abductors: "abduktory (vonkajšie stehná)",
  adductors: "adduktory (vnútorné stehná)",
  biceps: "biceps",
  calves: "lýtka",
  chest: "hrudník",
  forearms: "predlaktia",
  glutes: "zadok",
  hamstrings: "zadné stehná",
  lats: "chrbát (širák)",
  "lower back": "spodný chrbát",
  "middle back": "stredný chrbát",
  neck: "krk",
  quadriceps: "stehná (kvadriceps)",
  shoulders: "ramená",
  traps: "trapézy",
  triceps: "triceps",
};

async function main() {
  const nameSkPath = path.join(repoRoot, "scripts", "exercise-name-sk.json");
  const nameSkMap = existsSync(nameSkPath) ? JSON.parse(readFileSync(nameSkPath, "utf8")) : {};

  console.log("Sťahujem exercises.json z Free Exercise DB...");
  const res = await fetch(EXERCISES_JSON_URL);
  if (!res.ok) throw new Error(`Stiahnutie zlyhalo: ${res.status} ${res.statusText}`);
  /** @type {Array<any>} */
  const list = await res.json();
  console.log(`Načítaných ${list.length} cvikov.`);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const rows = list.map((ex) => {
    const imageUrls = Array.isArray(ex.images) ? ex.images.map((rel) => `${RAW_BASE}/${rel}`) : [];
    const primary = Array.isArray(ex.primaryMuscles) && ex.primaryMuscles.length > 0 ? ex.primaryMuscles[0] : null;
    return {
      trainer_id: null, // globálna knižnica, viditeľná všetkým trénerom (exercises_select_global_or_own)
      external_id: ex.id,
      name: ex.name,
      name_sk: nameSkMap[ex.name] ?? null,
      muscle_group: primary ? (MUSCLE_SK[primary] ?? primary) : null,
      description: Array.isArray(ex.equipment) ? null : ex.equipment ? `Vybavenie: ${ex.equipment}` : null,
      instructions: Array.isArray(ex.instructions) ? ex.instructions : [],
      image_url: imageUrls,
    };
  });

  console.log(`Nahrávam ${rows.length} riadkov (upsert podľa external_id)...`);
  const BATCH = 100;
  let imported = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error } = await supabase.from("exercises").upsert(batch, { onConflict: "external_id" });
    if (error) {
      console.error(`Chyba pri dávke ${i}-${i + batch.length}:`, error.message);
      process.exitCode = 1;
      continue;
    }
    imported += batch.length;
    console.log(`  ${imported}/${rows.length}`);
  }

  const translated = rows.filter((r) => r.name_sk).length;
  console.log(`Hotovo. Importovaných/aktualizovaných ${imported} cvikov, ${translated} má slovenský preklad názvu.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
