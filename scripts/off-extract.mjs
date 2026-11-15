// Extrakcia kompaktného offline súboru potravín z Open Food Facts (OFF).
// Zdroj: oficiálny OFF Parquet export na Hugging Face
//   https://huggingface.co/datasets/openfoodfacts/product-database (food.parquet, ~8 GB)
// DuckDB číta Parquet cez HTTP range requesty — stiahnu sa len potrebné stĺpce
// (nie celý dump). Žiadny scraping OFF API.
//
// Predfilter (SQL): potraviny predávané v SK, CZ, DE, AT, PL, HU s kompletnými hodnotami na
// 100 g (kcal 0–900, bielkoviny, sacharidy, tuky; súčet makier <= 105 g).
// Názov: sk > cs > en > main > ľubovoľný. Zoradenie podľa popularity (unique_scans_n,
// potom popularity_key).
//
// Filtre kvality (JS, pri --bundle aj pri --limit; počty vyradených riadkov sa vypíšu):
//   1. názov je prázdny alebo "odpad" (obsahuje "Code-Barres", "non valide", "unknown product",
//      iba čísla/interpunkcia, menej ako 2 písmená);
//   2. kcal, bielkoviny, sacharidy a tuky sú všetky 0 (okrem prípadu, keď je výslovne uvedený
//      údaj o cukroch — vtedy ide o skutočne nulový produkt: voda, Coca-Cola Zero);
//   3. energetická konzistencia (Atwater): |4*B + 4*S + 9*T - kcal| > max(40, 0.35*kcal)
//      (tolerancia pokrýva vlákninu, polyoly, light nápoje; zjavné chyby ako "Vajcia" 72 kcal
//      pri 12 g B + 1 g S + 10 g T vypadnú).
//   Čísla sa zaokrúhľujú na 1 desatinné miesto (soľ na 2), chýbajúce voliteľné hodnoty = null.
//
// Záznam: [kód, názov, značka, kcal, bielkoviny, sacharidy, tuky, vláknina, cukry, soľ, porcia_g]
//
// === Regenerácia balíka (odporúčané raz týždenne / mesačne) ===
//   npm run food-data
//   (= node scripts/off-extract.mjs --out public/food-data --limit 100000 --bundle)
// Vytvorí public/food-data/off-eu-<YYYYMMDD>.json.gz + manifest.json; staršie off-eu-*.json.gz
// sa zmažú (vždy len jeden balík). Formát: {"v","cols":[...],"rows":[[...],...]} gzip.
// Voliteľné: --cache <súbor.parquet> (opätovne použije predfiltrovaný Parquet, inak sa zapíše
// do <out>/off-cache.parquet — pri --bundle sa cache NEzapisuje do public, ak chýba --cache,
// použije sa dočasný priečinok OS).
//
// Licencia: dáta sú © Open Food Facts contributors, ODbL 1.0. Aplikácia MUSÍ zobraziť
// atribúciu "Open Food Facts" (odkaz https://world.openfoodfacts.org) a licenciu ODbL.
//
// Ďalšie režimy (iba meranie, nič nezapisujú do repa okrem --out):
//   node scripts/off-extract.mjs --out <priečinok> [--limit N] [--countries sk,cz,...]
//   node scripts/off-extract.mjs --out <priečinok> --stats
//   node scripts/off-extract.mjs --out <priečinok> --limits 50000,100000,all

import { DuckDBInstance } from "@duckdb/node-api";
import { writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync } from "node:fs";
import os from "node:os";
import { gzipSync, brotliCompressSync, constants as z } from "node:zlib";
import path from "node:path";

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf("--" + n); return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : d; };
const out = opt("out");
if (!out) { console.error("Chýba --out <priečinok>"); process.exit(1); }
const limit = opt("limit") ? Number(opt("limit")) : null;
const stats = args.includes("--stats");
const bundle = args.includes("--bundle");
const limits = opt("limits"); // napr. 50000,100000,200000,all — iba meranie veľkostí
const CC = { sk: "en:slovakia", cz: "en:czech-republic", de: "en:germany", at: "en:austria", pl: "en:poland", hu: "en:hungary" };
const countries = opt("countries", "sk,cz,de,at,pl,hu").split(",").map((c) => c.trim());
const tags = countries.map((c) => CC[c]).filter(Boolean);
const HF_URL = "https://huggingface.co/datasets/openfoodfacts/product-database/resolve/main/food.parquet";
// HF resolver má limit 3000 požiadaviek / 5 min na IP (DuckDB robí veľa range requestov),
// preto raz vyriešime presmerovanie na CDN (podpísaná URL, platí ~1 h) a čítame z nej.
mkdirSync(out, { recursive: true });

const db = await DuckDBInstance.create(":memory:");
const c = await db.connect();
const q = async (sql) => (await c.runAndReadAll(sql)).getRowObjects();
const t0 = Date.now();
await c.run("INSTALL httpfs; LOAD httpfs; SET allow_asterisks_in_http_paths = true;");
const tagList = tags.map((t) => `'${t}'`).join(",");
const nut = (n) => `list_extract([x."100g" for x in nutriments if x.name='${n}'],1)`;
// Slovenské/české produkty majú často text len pod "main" (jazyk produktu v stĺpci lang)
const nm = (l) => `coalesce(list_extract([x.text for x in product_name if x.lang='${l}' and x.text<>''],1), CASE WHEN lang='${l}' THEN list_extract([x.text for x in product_name if x.lang='main' and x.text<>''],1) END)`;

const cache = (opt("cache") ?? path.join(bundle ? os.tmpdir() : out, "off-cache.parquet")).split(path.sep).join("/");
if (existsSync(cache)) { console.log("Používam cache", cache); await c.run(`CREATE TABLE p AS SELECT * FROM read_parquet('${cache}')`); } else {
console.log("Čítam Parquet cez HTTP...");
const res = await fetch(HF_URL, { method: "HEAD", redirect: "manual", headers: process.env.HF_TOKEN ? { Authorization: `Bearer ${process.env.HF_TOKEN}` } : {} });
const URL_ = res.headers.get("location") || HF_URL;
await c.run(`CREATE TABLE p AS SELECT * FROM (
  SELECT code,
    coalesce(${nm("sk")}, ${nm("cs")}, ${nm("en")}, ${nm("main")}, list_extract([x.text for x in product_name if x.text<>''],1)) AS name,
    (${nm("sk")} IS NOT NULL) AS has_sk, (${nm("cs")} IS NOT NULL) AS has_cs,
    list_extract(string_split(brands, ','),1) AS brand,
    ${nut("energy-kcal")} AS kcal, ${nut("proteins")} AS prot, ${nut("carbohydrates")} AS carb, ${nut("fat")} AS fat,
    ${nut("fiber")} AS fiber, ${nut("sugars")} AS sugars, ${nut("salt")} AS salt,
    try_cast(serving_quantity AS DOUBLE) AS serving,
    coalesce(unique_scans_n,0) AS scans, coalesce(popularity_key,0) AS pop, countries_tags
  FROM read_parquet('${URL_}')
  WHERE list_has_any(countries_tags, [${tagList}]) AND coalesce(obsolete,false)=false
) WHERE name IS NOT NULL AND kcal BETWEEN 0 AND 900 AND prot BETWEEN 0 AND 100 AND carb BETWEEN 0 AND 100
  AND fat BETWEEN 0 AND 100 AND prot+carb+fat <= 105 AND code ~ '^[0-9]{8,14}$'`);
await c.run(`COPY p TO '${cache}' (FORMAT parquet, COMPRESSION zstd)`);}
console.log(`Hotovo za ${((Date.now() - t0) / 1000).toFixed(0)} s`);

if (stats) {
  console.log("Dedup spolu:", (await q("SELECT count(*)::INT n, count(fiber)::INT fiber, count(sugars)::INT sugars, count(salt)::INT salt, count(serving)::INT serving, sum(has_sk::INT)::INT sk, sum(has_cs::INT)::INT cs, sum((has_sk or has_cs)::INT)::INT skcs, sum((scans>0)::INT)::INT scanned, sum((pop>0)::INT)::INT pop FROM p"))[0]);
  for (const [k, t] of Object.entries(CC)) if (tags.includes(t))
    console.log(k, (await q(`SELECT count(*)::INT n FROM p WHERE list_contains(countries_tags,'${t}')`))[0].n);
  for (const s of ["rožok", "jogurt", "kuracie prsia", "ryža", "Milka", "Rama", "jablko", "kurací", "Joghurt", "Reis"]) {
    console.log("\n== " + s);
    for (const r of await q(`SELECT code,name,brand,kcal,prot,carb,fat,scans FROM p WHERE strip_accents(lower(name||' '||coalesce(brand,''))) LIKE '%'||strip_accents(lower('${s}'))||'%' ORDER BY scans DESC LIMIT 10`))
      console.log(JSON.stringify(Object.values(r).map((v) => typeof v === "bigint" ? Number(v) : v)));
  }
}

const r1 = (v) => (v == null ? null : Math.round(Number(v) * 10) / 10);
const sz = (b) => ({ raw: b.length, gz: gzipSync(b, { level: 9 }).length, br: brotliCompressSync(b, { params: { [z.BROTLI_PARAM_QUALITY]: 11 } }).length });
const all = await q(`SELECT * FROM p ORDER BY scans DESC, pop DESC, code`);
const drops = { name: [], zero: [], atwater: [] };
const badName = (n) => { const t = (n ?? "").trim(); return t.length < 2 || /code-barres|non valide|unknown product|produit inconnu/i.test(t) || (t.match(/\p{L}/gu) ?? []).length < 2; };
const kept = all.filter((r) => {
  const k = Number(r.kcal), p = Number(r.prot), cb = Number(r.carb), f = Number(r.fat);
  const ex = (a) => a.length < 10 && a.push(`${r.code} | ${r.name} | ${k} kcal B${p} S${cb} T${f}`);
  if (badName(r.name)) { ex(drops.name); drops.name.n = (drops.name.n ?? 0) + 1; return false; }
  if (!k && !p && !cb && !f && r.sugars == null) { ex(drops.zero); drops.zero.n = (drops.zero.n ?? 0) + 1; return false; }
  if (Math.abs(4 * p + 4 * cb + 9 * f - k) > Math.max(40, 0.35 * k)) { ex(drops.atwater); drops.atwater.n = (drops.atwater.n ?? 0) + 1; return false; }
  return true;
});
console.log(`Filtre: vstup ${all.length}, názov ${drops.name.n ?? 0}, samé nuly ${drops.zero.n ?? 0}, Atwater ${drops.atwater.n ?? 0}, zostalo ${kept.length}`);
for (const [k, a] of Object.entries(drops)) { console.log("-- vyradené (" + k + ") príklady:"); a.forEach((x) => console.log("   " + x)); }
const recs = kept.map((r) => [r.code, r.name.trim(), (r.brand ?? "").trim() || null, r1(r.kcal), r1(r.prot), r1(r.carb), r1(r.fat), r1(r.fiber), r1(r.sugars), r.salt == null ? null : Math.round(Number(r.salt) * 100) / 100, r.serving ? Math.round(r.serving) : null]);
if (bundle) {
  const rows = limit ? recs.slice(0, limit) : recs;
  const d = new Date(); const v = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const cols = ["code", "name", "brand", "kcal", "protein", "carbs", "fat", "fiber", "sugars", "salt", "serving_g"];
  const file = `off-eu-${v}.json.gz`;
  for (const f of readdirSync(out)) if (/^off-eu-.*\.json\.gz$/.test(f)) unlinkSync(path.join(out, f));
  const gz = gzipSync(Buffer.from(JSON.stringify({ v, cols, rows })), { level: 9 });
  writeFileSync(path.join(out, file), gz);
  writeFileSync(path.join(out, "manifest.json"), JSON.stringify({ version: v, file: "/food-data/" + file, count: rows.length, source: "Open Food Facts", license: "ODbL 1.0", url: "https://world.openfoodfacts.org" }, null, 2) + "\n");
  console.log(`Balík ${file}: ${rows.length} riadkov, ${gz.length} B (gz)`);
  process.exit(0);
}
const sizes = limits ? limits.split(",").map((x) => (x === "all" ? null : Number(x))) : [limit];
for (const l of sizes) {
  const part = l ? recs.slice(0, l) : recs;
  const json = Buffer.from(JSON.stringify(part));
  const tsv = Buffer.from(part.map((r) => r.map((v) => v ?? "").join("\t")).join("\n"));
  const tag = l ? String(l) : "all";
  if (!limits) { writeFileSync(path.join(out, `foods-${tag}.json`), json); writeFileSync(path.join(out, `foods-${tag}.tsv`), tsv); }
  console.log(`[${tag}] záznamov ${part.length}; JSON`, sz(json), "TSV", sz(tsv));
}
console.log(`Celkový čas ${((Date.now() - t0) / 1000).toFixed(0)} s`);
