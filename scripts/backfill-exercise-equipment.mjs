// Jednorazové doplnenie exercises.equipment (migrácia 0031) pre už importované cviky.
//
// Prečo nie `import-exercises.mjs`: ten robí upsert CELÉHO riadku podľa external_id,
// takže by prepísal aj name_sk, description, instructions a image_url — čokoľvek, čo
// sa v DB po prvom importe zmenilo. Tento skript zapisuje VÝHRADNE stĺpec `equipment`
// a len tam, kde je teraz NULL (nikdy neprepíše už vyplnenú hodnotu).
//
// Spustenie (lokálne, nikdy za behu appky):
//   node scripts/backfill-exercise-equipment.mjs            # dry-run, nič nezapíše
//   node scripts/backfill-exercise-equipment.mjs --apply    # zapíše
//
// Vyžaduje v .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (obchádza RLS).
// Návrat (ak treba): UPDATE exercises SET equipment = NULL WHERE external_id IN (<ids zo súboru,
// ktorý skript pri --apply uloží ako scripts/.equipment-backfill-<čas>.json — negitované>).

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const APPLY = process.argv.includes("--apply");
const CONCURRENCY = 8;

function loadEnvLocal() {
  const envPath = path.join(repoRoot, ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    let value = t.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Chýba NEXT_PUBLIC_SUPABASE_URL alebo SUPABASE_SERVICE_ROLE_KEY v .env.local");
  process.exit(1);
}

const SOURCE = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json";
const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

async function main() {
  const res = await fetch(SOURCE);
  if (!res.ok) throw new Error(`Stiahnutie zlyhalo: ${res.status}`);
  const source = await res.json();
  const equipmentById = new Map();
  for (const ex of source) {
    const eq = typeof ex.equipment === "string" && ex.equipment.trim() ? ex.equipment.trim() : null;
    if (eq) equipmentById.set(ex.id, eq);
  }
  console.log(`Zdroj: ${source.length} cvikov, ${equipmentById.size} má equipment.`);

  // Globálna knižnica = riadky s external_id (vlastné cviky trénerov ho nemajú a ostanú nedotknuté).
  const { data: rows, error } = await supabase
    .from("exercises")
    .select("external_id, equipment")
    .not("external_id", "is", null)
    .range(0, 4999);
  if (error) throw new Error(`Čítanie exercises zlyhalo: ${error.message}`);

  const empty = rows.filter((r) => r.equipment == null);
  const filled = rows.length - empty.length;
  const todo = empty.filter((r) => equipmentById.has(r.external_id));
  const notInSource = empty.filter((r) => !equipmentById.has(r.external_id));

  const dist = {};
  for (const r of todo) dist[equipmentById.get(r.external_id)] = (dist[equipmentById.get(r.external_id)] ?? 0) + 1;

  console.log(`DB: ${rows.length} globálnych cvikov, ${filled} už má equipment, ${empty.length} ho nemá.`);
  console.log(`Doplní sa: ${todo.length} (bez zdrojovej hodnoty ostane prázdne: ${notInSource.length}).`);
  console.log("Rozdelenie:", dist);

  if (!APPLY) {
    console.log("\nDRY-RUN — nič sa nezapísalo. Na zápis spusti s --apply.");
    return;
  }
  if (todo.length === 0) {
    console.log("Nie je čo doplniť.");
    return;
  }

  const logPath = path.join(repoRoot, "scripts", `.equipment-backfill-${Date.now()}.json`);
  writeFileSync(logPath, JSON.stringify(todo.map((r) => r.external_id), null, 0));
  console.log(`Zoznam upravených ID pre prípadný návrat: ${path.relative(repoRoot, logPath)}`);

  let done = 0;
  let failed = 0;
  const queue = [...todo];
  async function worker() {
    while (queue.length) {
      const r = queue.shift();
      // `.is("equipment", null)` v podmienke = nikdy neprepíše hodnotu, ktorá medzitým pribudla.
      const { error: upErr } = await supabase
        .from("exercises")
        .update({ equipment: equipmentById.get(r.external_id) })
        .eq("external_id", r.external_id)
        .is("equipment", null);
      if (upErr) {
        failed++;
        console.error(`  ${r.external_id}: ${upErr.message}`);
      } else {
        done++;
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log(`Hotovo. Zapísaných ${done}, chýb ${failed}.`);
  if (failed) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
