// Import globálnych základných potravín (surové/nespracované suroviny) z CIQUAL —
// oficiálna francúzska/EÚ tabuľka zloženia potravín ANSES (Licence Ouverte / Etalab),
// https://ciqual.anses.fr , dataset na https://www.data.gouv.fr (Table Ciqual 2020).
// Nahrádza pôvodný USDA import (americké hodnoty). Značkové produkty rieši Open Food
// Facts (source = 'off'); tento skript plní len `source = 'import'` — generické suroviny
// (kuracie prsia, ryža, jablko, vajcia, ...), ktoré v OFF chýbajú.
//
// Zoznam potravín: scripts/staples-ciqual.json (nameSk, nameCs, ciqualCode, ciqualName; alebo
// id + manual {kcal, protein, carbs, fat, source} pre položky, ktoré CIQUAL nemá — external_id 'fitpilot:<id>').
//
// Spustenie (raz, lokálne, nikdy za behu appky):
//   node scripts/import-staples.mjs                    # DRY RUN — len vypíše tabuľku, nič nezapisuje
//   node scripts/import-staples.mjs --apply            # zapíše/aktualizuje riadky v DB (idempotentné)
//   node scripts/import-staples.mjs --source <cesta>   # lokálny .zip s XML alebo priečinok s XML
//
// Jednotky porcií (migrácia 0066): každá položka má "unit" ("g" | "ml" — základná jednotka
// hodnôt na 100) a "pieceG" (typická hmotnosť jedného kusu jedlej časti, null = kus nedáva zmysel).
// Zapisujú sa do foods.unit_base a foods.piece_g. Pri "ml" sa hodnoty z CIQUAL (na 100 g) berú
// ako na 100 ml (bez prepočtu hustoty).
//
// --apply vyžaduje v .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// PORADIE: najprv migrácie 0064_foods_ciqual_staples.sql (stĺpec name_cs + zmazanie USDA
// riadkov) a 0066_portion_units.sql (unit_base, piece_g), potom `node scripts/import-staples.mjs --apply`.
//
// Zdroj: XML tabuľka CIQUAL 2020 (verzia 2020-07-07; súbory alim_*, compo_*, const_* v ZIP-e).
// Ak je ciqual.anses.fr nedostupný (údržba), skript skúsi archív web.archive.org. ZIP sa
// ukladá do dočasného priečinka, takže ďalšie spustenia sú rýchle.
//
// Ako sa čítajú hodnoty (na 100 g jedlej časti):
//   energia   const 328 (kcal, Nariadenie EÚ 1169/2011); ak chýba -> const 333 (kcal, Jones,
//             s vlákninou); ak chýba aj to -> výpočet 4*B + 4*S + 9*T + 2*vláknina + 2,4*polyoly + 7*alkohol + 3*org. kyseliny (EÚ faktory).
//             Overené: CIQUAL 2020 energiu (328/333, ani kJ 327/332) pri časti položiek naozaj nemá
//             (suché orechy, med, suché strukoviny ...) — nie je to chyba parsovania.
//             Takto odvodená energia je v dry-run výpise označená (E=jones / E=calc) — CIQUAL
//             nemá energiu pri všetkých položkách (napr. jablko, orechy, med).
//   bielkoviny  const 25003 (N x 6,25); ak chýba -> 25000 (N x Jones)
//   sacharidy  const 31000, tuky const 40000, vláknina 34100, cukry 32000, soľ 10004
//   "traces"  -> 0 (stopy, pod hranicou kvantifikácie)
//   "< 0,5"   -> polovica limitu (0,25) — presná hodnota je niekde pod hranicou
//   "-" alebo chýba -> null; pri B/S/T sa do DB zapíše 0 (stĺpce sú NOT NULL) a riadok je
//             v dry-run označený "?" (napr. tuky pri ovocí často nie sú uvedené);
//             pri vláknine/cukroch/soli sa zapíše NULL.

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";
import { tmpdir } from "node:os";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const CIQUAL_URLS = [
  "https://ciqual.anses.fr/cms/sites/default/files/inline-files/XML_2020_07_07.zip",
  "https://web.archive.org/web/2024id_/https://ciqual.anses.fr/cms/sites/default/files/inline-files/XML_2020_07_07.zip",
];

// ---------- argumenty ----------
const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const srcIdx = args.indexOf("--source");
const SOURCE = srcIdx !== -1 ? args[srcIdx + 1] : null;

// ---------- .env.local (ako v ostatných skriptoch) ----------
function loadEnvLocal() {
  const envPath = path.join(repoRoot, ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
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

// ---------- ZIP (bez závislostí) ----------
function readZipEntries(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 70000); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) throw new Error("Neplatný ZIP (chýba end-of-central-directory).");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = new Map();
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("Poškodený ZIP (central directory).");
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    const lNameLen = buf.readUInt16LE(localOff + 26);
    const lExtraLen = buf.readUInt16LE(localOff + 28);
    const dataStart = localOff + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(dataStart, dataStart + compSize);
    files.set(name, method === 0 ? raw : inflateRawSync(raw));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

async function downloadZip() {
  const cachePath = path.join(tmpdir(), "fitpilot-ciqual-2020.zip");
  if (existsSync(cachePath)) {
    const cached = readFileSync(cachePath);
    if (cached.subarray(0, 2).toString() === "PK") {
      console.log(`CIQUAL: používam uloženú kópiu ${cachePath}`);
      return cached;
    }
  }
  for (const url of CIQUAL_URLS) {
    try {
      console.log(`CIQUAL: sťahujem ${url}`);
      const res = await fetch(url, { redirect: "follow" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.subarray(0, 2).toString() !== "PK") throw new Error("odpoveď nie je ZIP (údržba servera?)");
      writeFileSync(cachePath, buf);
      return buf;
    } catch (err) {
      console.warn(`  ✗ ${err.message}`);
    }
  }
  throw new Error("CIQUAL sa nepodarilo stiahnuť. Stiahni XML ZIP ručne a spusti s --source <cesta>.");
}

/** Vráti { alim, compo, cnst } ako texty (kódovanie windows-1252). */
async function loadCiqualXml() {
  const dec = new TextDecoder("windows-1252");
  const find = (names, prefix) => {
    const n = names.find((x) => path.basename(x).toLowerCase().startsWith(prefix) && x.toLowerCase().endsWith(".xml"));
    if (!n) throw new Error(`V zdroji chýba súbor ${prefix}*.xml`);
    return n;
  };
  if (SOURCE && existsSync(SOURCE) && statSync(SOURCE).isDirectory()) {
    const names = readdirSync(SOURCE).filter((f) => f.toLowerCase().endsWith(".xml"));
    const read = (prefix) => dec.decode(readFileSync(path.join(SOURCE, find(names, prefix))));
    return { alim: read("alim_2"), compo: read("compo_"), cnst: read("const_") };
  }
  const buf = SOURCE ? readFileSync(SOURCE) : await downloadZip();
  const files = readZipEntries(buf);
  const names = [...files.keys()];
  const read = (prefix) => dec.decode(files.get(find(names, prefix)));
  return { alim: read("alim_2"), compo: read("compo_"), cnst: read("const_") };
}

// ---------- parsovanie hodnôt ----------
/** "12,5" -> 12.5; "traces" -> 0; "< 0,5" -> 0.25; "-"/prázdne -> null. */
function parseTeneur(raw) {
  if (raw == null) return null;
  const s = raw.trim();
  if (s === "" || s === "-") return null;
  if (s.toLowerCase() === "traces") return 0;
  const lt = s.match(/^<\s*([\d,.]+)$/);
  if (lt) return Number(lt[1].replace(",", ".")) / 2;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

const round1 = (n) => Math.round(n * 10) / 10;

const C = { KCAL: 328, KCAL_JONES: 333, PROT: 25003, PROT_JONES: 25000, CARB: 31000, FAT: 40000, FIBER: 34100, POLYOL: 34000, ALCOHOL: 60000, ORGACID: 65000, SUGARS: 32000, SALT: 10004 };

function extract(wantCodes, texts) {
  const names = new Map();
  for (const m of texts.alim.matchAll(/<alim_code>\s*(\d+)\s*<\/alim_code>\s*<alim_nom_fr>([^<]*)<\/alim_nom_fr>/g)) {
    if (wantCodes.has(Number(m[1]))) names.set(Number(m[1]), m[2].trim());
  }
  const wantConst = new Set(Object.values(C));
  const vals = new Map(); // code -> { constCode: number|null }
  for (const m of texts.compo.matchAll(
    /<alim_code>\s*(\d+)\s*<\/alim_code>\s*<const_code>\s*(\d+)\s*<\/const_code>\s*<teneur>([^]*?)<\/teneur>/g,
  )) {
    const code = Number(m[1]);
    const cc = Number(m[2]);
    if (!wantCodes.has(code) || !wantConst.has(cc)) continue;
    if (!vals.has(code)) vals.set(code, {});
    vals.get(code)[cc] = parseTeneur(m[3]);
  }
  return { names, vals };
}

function buildRow(entry, ciqualName, v) {
  const flags = [];
  const g = (c) => (v ? v[c] ?? null : null);
  const protein = g(C.PROT) ?? g(C.PROT_JONES);
  const carbs = g(C.CARB);
  const fat = g(C.FAT);
  const fiber = g(C.FIBER);
  const missing = [];
  if (protein == null) missing.push("B");
  if (carbs == null) missing.push("S");
  if (fat == null) missing.push("T");
  if (missing.length) flags.push(`?${missing.join("")}`);

  const P = protein ?? 0;
  const Cb = carbs ?? 0;
  const F = fat ?? 0;
  const calc = 4 * P + 4 * Cb + 9 * F + 2 * (fiber ?? 0) + 2.4 * (g(C.POLYOL) ?? 0) + 7 * (g(C.ALCOHOL) ?? 0) + 3 * (g(C.ORGACID) ?? 0);

  let kcal = g(C.KCAL);
  if (kcal == null) {
    kcal = g(C.KCAL_JONES);
    if (kcal != null) flags.push("E=jones");
  }
  if (kcal == null) {
    kcal = calc;
    flags.push("E=calc");
  } else if (!flags.includes("E=jones") && Math.abs(kcal - calc) > Math.max(25, calc * 0.25)) {
    flags.push(`E?calc=${Math.round(calc)}`);
  }
  if (ciqualName != null && entry.ciqualName && entry.ciqualName !== ciqualName) flags.push("NAME≠");

  return {
    kcal_100g: round1(kcal),
    protein_100g: round1(P),
    carbs_100g: round1(Cb),
    fat_100g: round1(F),
    fiber_100g: fiber == null ? null : round1(fiber),
    sugars_100g: g(C.SUGARS) == null ? null : round1(g(C.SUGARS)),
    salt_100g: g(C.SALT) == null ? null : round1(g(C.SALT)),
    flags,
  };
}

const unitOf = (entry) => (entry.unit === "ml" ? "ml" : "g");

function printTable(rows) {
  const pad = (s, n) => String(s).padEnd(n).slice(0, n);
  const num = (x) => (x == null ? "  -  " : String(x).padStart(5));
  console.log(`\n${pad("kód", 6)} ${pad("názov (SK)", 40)} ${"jed".padStart(3)} ${"kus_g".padStart(5)} ${"kcal".padStart(5)} ${"B".padStart(5)} ${"S".padStart(5)} ${"T".padStart(5)} ${"vlk".padStart(5)} ${"cuk".padStart(5)} ${"soľ".padStart(5)}  poznámky`);
  for (const r of rows) {
    console.log(
      `${pad(r.entry.ciqualCode ?? "ručne", 6)} ${pad(r.entry.nameSk, 40)} ${unitOf(r.entry).padStart(3)} ${num(r.entry.pieceG ?? null)} ${num(r.kcal_100g)} ${num(r.protein_100g)} ${num(r.carbs_100g)} ${num(r.fat_100g)} ${num(r.fiber_100g)} ${num(r.sugars_100g)} ${num(r.salt_100g)}  ${r.flags.join(" ")}`,
    );
  }
}

/** Ručne zadané položky (`manual`) — CIQUAL ich nemá v našej podobe (napr. tvaroh: CIQUAL má len
 *  francúzsky fromage blanc s ~8 g bielkovín, náš tvaroh 10–17 g). Hodnoty sú medián reálnych
 *  SK/CZ produktov z Open Food Facts, zdroj v `manual.source`. external_id 'fitpilot:<id>'. */
function externalIdOf(entry) {
  return entry.manual ? `fitpilot:${entry.id}` : `ciqual:${entry.ciqualCode}`;
}

function manualRow(m) {
  return {
    kcal_100g: m.kcal,
    protein_100g: m.protein,
    carbs_100g: m.carbs,
    fat_100g: m.fat,
    fiber_100g: null,
    sugars_100g: null,
    salt_100g: null,
    flags: ["RUČNE"],
  };
}

async function main() {
  const list = JSON.parse(readFileSync(path.join(__dirname, "staples-ciqual.json"), "utf8"));
  console.log(`Zoznam: ${list.length} potravín (scripts/staples-ciqual.json). Režim: ${APPLY ? "APPLY (zápis do DB)" : "DRY RUN"}`);

  const badUnits = list.filter((e) => !["g", "ml"].includes(e.unit) || (e.pieceG != null && !(e.pieceG > 0 && e.pieceG <= 5000)));
  if (badUnits.length) throw new Error(`Neplatné unit/pieceG: ${badUnits.map((e) => e.nameSk).join(", ")}`);

  const dupes =list.map(externalIdOf).filter((c, i, a) => a.indexOf(c) !== i);
  if (dupes.length) throw new Error(`Duplicitné položky v zozname: ${[...new Set(dupes)].join(", ")}`);

  const texts = await loadCiqualXml();
  const { names, vals } = extract(new Set(list.filter((e) => !e.manual).map((e) => e.ciqualCode)), texts);

  const rows = [];
  const notFound = [];
  for (const entry of list) {
    if (entry.manual) {
      rows.push({ entry, ciqualName: null, ...manualRow(entry.manual) });
      continue;
    }
    const ciqualName = names.get(entry.ciqualCode);
    if (ciqualName == null) {
      notFound.push(entry);
      continue;
    }
    rows.push({ entry, ciqualName, ...buildRow(entry, ciqualName, vals.get(entry.ciqualCode)) });
  }

  printTable(rows);
  const flagged = rows.filter((r) => r.flags.length);
  console.log(`\nSpolu ${rows.length} OK z ${list.length}; ${flagged.length} s poznámkou; ${notFound.length} nenájdených v CIQUAL.`);
  console.log("Legenda: E=jones/E=calc = energia dopočítaná (CIQUAL ju pri položke nemá); ?BST = chýbajúca hodnota zapísaná ako 0; E?calc = energia sa líši od 4B+4S+9T+2vl; NAME≠ = názov v JSON nesedí s CIQUAL.");
  for (const e of notFound) console.error(`  ✗ kód ${e.ciqualCode} (${e.nameSk}) v CIQUAL neexistuje`);

  if (!APPLY) {
    console.log("\nDRY RUN — nič sa nezapísalo. Na zápis spusti s --apply (po migrácii 0064).");
    return;
  }
  if (notFound.length) throw new Error("Zoznam obsahuje neexistujúce kódy — oprav staples-ciqual.json a spusti znova.");

  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Chýba NEXT_PUBLIC_SUPABASE_URL alebo SUPABASE_SERVICE_ROLE_KEY v .env.local");
    process.exit(1);
  }
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  // Nikdy neprepisovať cudzie riadky (off/user) — external_id 'ciqual:<kód>' by sa tam nemalo
  // vyskytnúť, ale ak áno, riadok sa preskočí.
  const ids = rows.map((r) => externalIdOf(r.entry));
  const { data: existing, error: exErr } = await supabase.from("foods").select("external_id, source").in("external_id", ids);
  if (exErr) throw new Error(`Čítanie existujúcich riadkov zlyhalo: ${exErr.message} (bežala migrácia 0064?)`);
  const foreign = new Set((existing ?? []).filter((x) => x.source !== "import").map((x) => x.external_id));

  let ok = 0;
  let skipped = 0;
  for (const r of rows) {
    const externalId = externalIdOf(r.entry);
    if (foreign.has(externalId)) {
      console.warn(`  – ${r.entry.nameSk}: ${externalId} patrí riadku mimo 'import', preskakujem`);
      skipped++;
      continue;
    }
    const { error } = await supabase.from("foods").upsert(
      {
        trainer_id: null,
        created_by: null, // 0050: default auth.uid() — service role ho nemá, explicitne null
        source: "import",
        external_id: externalId,
        name: r.entry.nameSk,
        name_cs: r.entry.nameCs,
        kcal_100g: r.kcal_100g,
        protein_100g: r.protein_100g,
        carbs_100g: r.carbs_100g,
        fat_100g: r.fat_100g,
        fiber_100g: r.fiber_100g,
        sugars_100g: r.sugars_100g,
        salt_100g: r.salt_100g,
        unit_base: unitOf(r.entry),
        piece_g: r.entry.pieceG ?? null,
      },
      { onConflict: "external_id" },
    );
    if (error) {
      console.error(`  ✗ ${r.entry.nameSk}: ${error.message}`);
      skipped++;
    } else {
      ok++;
    }
  }
  // Upratanie: suroviny, ktoré zo zoznamu vypadli (napr. tvaroh z fromage blanc nahradený
  // ručnými hodnotami), by inak ostali v knižnici navždy. Len globálne 'import' riadky
  // s našimi prefixmi — denníky aj jedálničky majú vlastnú kópiu hodnôt, zmazanie ich nerozbije.
  const keep = new Set(ids);
  const { data: ours, error: oursErr } = await supabase
    .from("foods")
    .select("id, external_id, name")
    .eq("source", "import")
    .is("trainer_id", null)
    .or("external_id.like.ciqual:%,external_id.like.fitpilot:%");
  if (oursErr) throw new Error(`Čítanie na upratanie zlyhalo: ${oursErr.message}`);
  const stale = (ours ?? []).filter((x) => !keep.has(x.external_id));
  if (stale.length) {
    const { error: delErr } = await supabase.from("foods").delete().in("id", stale.map((x) => x.id));
    if (delErr) console.error(`  ✗ upratanie: ${delErr.message}`);
    else for (const x of stale) console.log(`  − odstránené (už nie je v zozname): ${x.name}`);
  }

  console.log(`\nHotovo. Zapísaných ${ok}, preskočených ${skipped} z ${rows.length}, odstránených ${stale.length}.`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
