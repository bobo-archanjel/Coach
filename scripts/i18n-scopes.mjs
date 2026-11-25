#!/usr/bin/env node
/**
 * Rozsahy klientskych textov (výkon): koreňový layout posiela do prehliadača len menné priestory, ktoré
 * potrebujú verejné stránky; /dashboard a /portal si doplnia svoje (app/components/ScopedMessages.tsx).
 * Predtým sa do KAŽDÉHO HTML (aj prihlásenia) vkladalo ~190 kB JSON so všetkými textami.
 *
 * Skript prejde importy (tranzitívne) z koreňov každej oblasti, zistí `useTranslations("<priestor>…")`
 * a porovná s lib/i18n/clientMessages.ts. Pridáš do komponentu nový priestor → `--check` zlyhá, kým ho
 * nepridáš do správneho rozsahu (alebo `node scripts/i18n-scopes.mjs` vypíše aktuálne zoznamy).
 *
 * Použitie: node scripts/i18n-scopes.mjs [--check]
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const check = process.argv.includes("--check");

function walk(dir, out = []) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return out;
  const st = fs.statSync(abs);
  if (st.isFile()) return out.push(dir.split(path.sep).join("/")), out;
  for (const name of fs.readdirSync(abs)) {
    const rel = path.join(dir, name);
    if (fs.statSync(path.join(ROOT, rel)).isDirectory()) walk(rel, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.d\.ts$/.test(name)) out.push(rel.split(path.sep).join("/"));
  }
  return out;
}

const EXT = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"];
function resolveImport(from, spec) {
  let base;
  if (spec.startsWith("@/")) base = spec.slice(2);
  else if (spec.startsWith(".")) base = path.posix.normalize(path.posix.join(path.posix.dirname(from), spec));
  else return null;
  for (const e of EXT) {
    const p = base + e;
    const abs = path.join(ROOT, p);
    if (fs.existsSync(abs) && fs.statSync(abs).isFile() && /\.(ts|tsx)$/.test(p)) return p;
  }
  return null;
}

const cache = new Map();
function info(file) {
  if (cache.has(file)) return cache.get(file);
  const src = fs.readFileSync(path.join(ROOT, file), "utf8");
  const imports = [];
  for (const m of src.matchAll(/(?:from\s+|import\s*\(\s*|import\s+)["']([^"']+)["']/g)) {
    const r = resolveImport(file, m[1]);
    if (r) imports.push(r);
  }
  const ns = new Set();
  const bad = [];
  for (const m of src.matchAll(/useTranslations\(\s*([^)]*)\)/g)) {
    const arg = m[1].trim();
    const lit = arg.match(/^["'`]([A-Za-z]+)[.\w]*["'`]$/);
    if (lit) ns.add(lit[1]);
    else bad.push(`${file}: useTranslations(${arg})`);
  }
  const v = { imports, ns, bad };
  cache.set(file, v);
  return v;
}

function closure(entries) {
  const seen = new Set();
  const stack = [...entries];
  const ns = new Set();
  const bad = [];
  while (stack.length) {
    const f = stack.pop();
    if (seen.has(f)) continue;
    seen.add(f);
    const i = info(f);
    i.ns.forEach((n) => ns.add(n));
    bad.push(...i.bad);
    stack.push(...i.imports);
  }
  return { ns, bad };
}

const publicEntries = [
  "app/layout.tsx",
  "app/page.tsx",
  "app/not-found.tsx",
  ...["app/prihlasenie", "app/t", "app/cookies", "app/obchodne-podmienky", "app/ochrana-sukromia", "app/pozvanka", "app/auth", "app/v2", "app/v3", "app/v4", "app/v5", "app/v6design"].flatMap((d) => walk(d)),
].filter((f) => fs.existsSync(path.join(ROOT, f)));

const pub = closure(publicEntries);
const dash = closure(walk("app/dashboard"));
const portal = closure(walk("app/portal"));
const bad = [...pub.bad, ...dash.bad, ...portal.bad];
if (bad.length) {
  console.error("useTranslations s nelitrálnym priestorom (rozsahy ho nevedia overiť):\n" + bad.join("\n"));
  process.exit(1);
}

const base = [...pub.ns].sort();
const dashExtra = [...dash.ns].filter((n) => !pub.ns.has(n)).sort();
const portalExtra = [...portal.ns].filter((n) => !pub.ns.has(n)).sort();

// aktuálne zoznamy z lib/i18n/clientMessages.ts
const cm = fs.existsSync(path.join(ROOT, "lib/i18n/clientMessages.ts")) ? fs.readFileSync(path.join(ROOT, "lib/i18n/clientMessages.ts"), "utf8") : "";
function listOf(name) {
  const start = cm.indexOf(`export const ${name}`);
  if (start < 0) return [];
  const end = cm.indexOf("as const", start);
  const body = cm.slice(cm.indexOf("[", start), end);
  return [...body.matchAll(/"([A-Za-z]+)"/g)].map((x) => x[1]);
}
const cur = { BASE: listOf("CLIENT_BASE"), DASH: listOf("CLIENT_DASHBOARD"), PORTAL: listOf("CLIENT_PORTAL") };

if (!check) {
  console.log("CLIENT_BASE =", JSON.stringify(base));
  console.log("CLIENT_DASHBOARD (navyše) =", JSON.stringify(dashExtra));
  console.log("CLIENT_PORTAL (navyše) =", JSON.stringify(portalExtra));
  process.exit(0);
}

let fail = 0;
const miss = (label, need, have) => {
  const m = need.filter((n) => !have.includes(n));
  if (m.length) {
    fail++;
    console.error(`${label}: chýbajú priestory ${m.join(", ")} (pridaj ich do lib/i18n/clientMessages.ts)`);
  }
};
miss("CLIENT_BASE (verejné stránky)", base, cur.BASE);
miss("/dashboard", [...dash.ns], [...cur.BASE, ...cur.DASH]);
miss("/portal", [...portal.ns], [...cur.BASE, ...cur.PORTAL]);
if (fail) process.exit(1);
console.log("i18n-scopes: OK");
