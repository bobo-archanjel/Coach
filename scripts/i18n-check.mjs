#!/usr/bin/env node
/**
 * Kontrola úplnosti prekladu (feature/cestina): v app/ a lib/ nesmie ostať používateľský
 * text so slovenskou diakritikou napísaný priamo v kóde — patrí do messages/<jazyk>/*.json.
 *
 * Parsuje TS/TSX cez TypeScript compiler API (komentáre sa ignorujú samé) a hlási
 * reťazce, šablóny a JSX text s diakritikou. Neráta sa:
 *  - argumenty console.* (vývojárske logy),
 *  - súbory/priečinky v IGNORED_PATHS (interné staré náhľady v2–v5, DEV náhľady),
 *  - súbor s komentárom `i18n-ignore-file: <dôvod>` (napr. kľúčové slová pre AI filter),
 *  - riadok s komentárom `i18n-ignore` na tom istom alebo predchádzajúcom riadku,
 *  - oblasť medzi `i18n-ignore-start` a `i18n-ignore-end`.
 *
 * Použitie: node scripts/i18n-check.mjs [--summary] [cesta…]
 * Exit 1, ak sa niečo našlo (spúšťa ho aj e2e/i18n.spec.ts).
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const DIACRITICS = /[áäčďéíĺľňóôŕšťúýžÁÄČĎÉÍĹĽŇÓÔŔŠŤÚÝŽ]/;
const IGNORED_PATHS = [
  /^app\/v[2-5]\//, // staré interné náhľady dizajnu
  /(^|\/)preview\.ts$/, // DEV ?preview= fixtúry (vymyslené dáta)
];

const args = process.argv.slice(2);
const summary = args.includes("--summary");
const targets = args.filter((a) => !a.startsWith("--"));
const roots = targets.length ? targets : ["app", "lib"];

function walk(dir, out) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return out;
  if (fs.statSync(abs).isFile()) {
    out.push(dir);
    return out;
  }
  for (const name of fs.readdirSync(abs)) {
    const rel = path.join(dir, name);
    const st = fs.statSync(path.join(ROOT, rel));
    if (st.isDirectory()) walk(rel, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.d\.ts$/.test(name)) out.push(rel);
  }
  return out;
}

function ignoredLines(text) {
  const lines = text.split("\n");
  const ignored = new Set();
  let inRegion = false;
  lines.forEach((line, i) => {
    if (line.includes("i18n-ignore-start")) inRegion = true;
    if (inRegion || /i18n-ignore(?!-)/.test(line)) {
      ignored.add(i + 1);
      if (!inRegion) ignored.add(i + 2); // komentár nad riadkom
    }
    if (line.includes("i18n-ignore-end")) inRegion = false;
  });
  return ignored;
}

function isConsoleArg(node) {
  for (let p = node.parent; p; p = p.parent) {
    if (ts.isCallExpression(p)) {
      const e = p.expression;
      if (ts.isPropertyAccessExpression(e) && ts.isIdentifier(e.expression) && e.expression.text === "console") return true;
    }
    if (ts.isFunctionLike(p) || ts.isSourceFile(p)) return false;
  }
  return false;
}

const findings = [];
for (const root of roots) {
  for (const rel of walk(root, [])) {
    const norm = rel.split(path.sep).join("/");
    if (IGNORED_PATHS.some((re) => re.test(norm))) continue;
    const text = fs.readFileSync(path.join(ROOT, rel), "utf8");
    if (text.includes("i18n-ignore-file")) continue;
    if (!DIACRITICS.test(text)) continue;
    const ignored = ignoredLines(text);
    const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, rel.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const visit = (node) => {
      let value = null;
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) value = node.text;
      else if (ts.isTemplateExpression(node)) value = [node.head.text, ...node.templateSpans.map((s) => s.literal.text)].join("…");
      else if (ts.isJsxText(node)) value = node.text.trim();
      if (value && DIACRITICS.test(value) && !isConsoleArg(node)) {
        const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
        if (!ignored.has(line)) findings.push({ file: norm, line, value: value.replace(/\s+/g, " ").slice(0, 90) });
      }
      if (!ts.isTemplateExpression(node)) ts.forEachChild(node, visit);
      else node.templateSpans.forEach((s) => ts.forEachChild(s.expression, visit));
    };
    visit(sf);
  }
}

if (summary) {
  const byFile = new Map();
  for (const f of findings) byFile.set(f.file, (byFile.get(f.file) ?? 0) + 1);
  [...byFile.entries()].sort((a, b) => b[1] - a[1]).forEach(([f, n]) => console.log(String(n).padStart(4), f));
  console.log(`\n${findings.length} textov v ${byFile.size} súboroch`);
} else {
  for (const f of findings) console.log(`${f.file}:${f.line}  ${f.value}`);
  if (findings.length) console.log(`\n${findings.length} neprekladaných textov`);
}
process.exit(findings.length ? 1 : 0);
