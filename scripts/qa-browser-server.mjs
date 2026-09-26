#!/usr/bin/env node
// QA dual-agent harness — perzistentný browser-control server (test/qa-dual-agent).
// NIE je súčasťou appky, len pomôcka pre tento test beh.
//
// Prečo server a nie jednorazový skript: appka je SPA (taby, modály, viackrokové
// formuláre držia stav v Reacte) — zakaždým reloadovať stránku medzi krokmi by stratilo
// napr. prepnutý register/login tab alebo otvorený "+ Nový klient" panel. Server drží
// JEDNU stránku (page) živú počas celého behu agenta, príkazy prichádzajú cez HTTP.
//
// Spustenie: node scripts/qa-browser-server.mjs <profil> <appPort> <controlPort>
// Potom: curl -s localhost:<controlPort>/do -d '{"cmd":"goto","path":"/prihlasenie"}'
//
// Príkazy (POST /do, JSON body {cmd, ...}):
//   goto        {path}                 — path môže byť "/portal" alebo plná URL
//   click       {selector}
//   fill        {selector, value}
//   press       {selector, key}        — napr. key:"Enter"
//   select      {selector, value}
//   check       {selector}             — zaškrtne checkbox/radio
//   text        {selector}             — vráti innerText elementu
//   snapshot    {}                     — len vráti aktuálny stav (bez akcie)
//   screenshot  {}                     — uloží PNG, vráti cestu
//   wait        {ms}
//   waitFor     {selector, ms?}        — čaká kým selector existuje (default 8000ms)
//   viewport    {width, height}        — zmena veľkosti (napr. 390×844 mobil, 1280×900 desktop)
//   errors      {}                     — vráti a vyprázdni zachytené JS chyby / console.error
//
// Odpoveď vždy obsahuje {ok, url, title, elements[], bodyText} (okrem screenshot/text),
// elements = interaktívne prvky viditeľné na stránke s podnetmi na selector.

import { chromium } from "playwright";
import { createServer } from "node:http";
import { mkdirSync } from "node:fs";
import path from "node:path";

const [, , profile, appPortArg, controlPortArg] = process.argv;
if (!profile || !appPortArg || !controlPortArg) {
  console.error("Použitie: qa-browser-server.mjs <profil> <appPort> <controlPort>");
  process.exit(1);
}
const appPort = Number(appPortArg);
const controlPort = Number(controlPortArg);
const root = path.join(process.cwd(), ".qa-profiles", profile);
const userDataDir = path.join(root, "chrome-profile");
const shotDir = path.join(root, "screenshots");
mkdirSync(userDataDir, { recursive: true });
mkdirSync(shotDir, { recursive: true });

async function buildSnapshot(page) {
  const title = await page.title().catch(() => "");
  const url = page.url();
  const elements = await page
    .evaluate(() => {
      function label(el) {
        const text = (el.innerText || el.value || el.getAttribute("aria-label") || el.getAttribute("placeholder") || "").trim().slice(0, 60);
        return text.replace(/\s+/g, " ");
      }
      const sel = "button, a[href], input, select, textarea, [role=button], [role=tab], [role=link]";
      return Array.from(document.querySelectorAll(sel))
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && !el.disabled;
        })
        .slice(0, 200)
        .map((el) => ({
          tag: el.tagName.toLowerCase(),
          type: el.getAttribute("type") || undefined,
          name: el.getAttribute("name") || undefined,
          id: el.id || undefined,
          text: label(el),
        }));
    })
    .catch(() => []);
  const bodyText = await page
    .evaluate(() => document.body.innerText.slice(0, 4000))
    .catch(() => "");
  return { url, title, elements, bodyText };
}

(async () => {
  // QA_HEADED=1 otvorí reálne okno Chromia (beží priamo na tomto Macu, nie v
  // izolovanom kontajneri) — užitočné keď chce človek vizuálne sledovať test naživo.
  const headed = process.env.QA_HEADED === "1";
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: !headed,
    viewport: headed ? null : { width: 1280, height: 900 },
    ...(headed ? { args: ["--window-size=1280,900", "--window-position=100,100"] } : {}),
  });
  const page = context.pages()[0] || (await context.newPage());
  const jsErrors = [];
  page.on("pageerror", (e) => jsErrors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") jsErrors.push(`console: ${m.text()}`);
  });
  await page.goto(`http://localhost:${appPort}/`, { waitUntil: "domcontentloaded" }).catch(() => {});

  const server = createServer(async (req, res) => {
    if (req.method !== "POST" || req.url !== "/do") {
      res.writeHead(404).end();
      return;
    }
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      let payload;
      try {
        payload = JSON.parse(body || "{}");
      } catch {
        res.writeHead(400).end(JSON.stringify({ ok: false, error: "invalid JSON" }));
        return;
      }
      const { cmd } = payload;
      try {
        let extra = {};
        if (cmd === "goto") {
          const p = payload.path || "/";
          const url = p.startsWith("http") ? p : `http://localhost:${appPort}${p}`;
          await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
          await page.waitForTimeout(400);
        } else if (cmd === "click") {
          await page.locator(payload.selector).first().click({ timeout: 10000 });
          await page.waitForTimeout(500);
        } else if (cmd === "fill") {
          await page.locator(payload.selector).first().fill(payload.value ?? "", { timeout: 10000 });
        } else if (cmd === "press") {
          await page.locator(payload.selector).first().press(payload.key, { timeout: 10000 });
          await page.waitForTimeout(400);
        } else if (cmd === "select") {
          await page.locator(payload.selector).first().selectOption(payload.value, { timeout: 10000 });
        } else if (cmd === "check") {
          await page.locator(payload.selector).first().check({ timeout: 10000 });
        } else if (cmd === "wait") {
          await page.waitForTimeout(Number(payload.ms) || 1000);
        } else if (cmd === "waitFor") {
          await page.locator(payload.selector).first().waitFor({ timeout: Number(payload.ms) || 8000 });
        } else if (cmd === "text") {
          const t = await page.locator(payload.selector).first().innerText({ timeout: 10000 });
          res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ ok: true, text: t }));
          return;
        } else if (cmd === "screenshot") {
          const file = path.join(shotDir, `${Date.now()}.png`);
          await page.screenshot({ path: file, fullPage: true });
          res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ ok: true, file }));
          return;
        } else if (cmd === "viewport") {
          await page.setViewportSize({ width: Number(payload.width) || 1280, height: Number(payload.height) || 900 });
          await page.waitForTimeout(300);
        } else if (cmd === "errors") {
          const list = jsErrors.splice(0);
          res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ ok: true, errors: list }));
          return;
        } else if (cmd === "snapshot") {
          // no-op
        } else {
          res.writeHead(400).end(JSON.stringify({ ok: false, error: `neznámy cmd: ${cmd}` }));
          return;
        }
        const snap = await buildSnapshot(page);
        res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ ok: true, ...snap, ...extra }));
      } catch (err) {
        const snap = await buildSnapshot(page).catch(() => ({}));
        res
          .writeHead(200, { "Content-Type": "application/json" })
          .end(JSON.stringify({ ok: false, error: err.message, ...snap }));
      }
    });
  });

  server.listen(controlPort, () => {
    console.log(`qa-browser-server[${profile}] ready: control=http://localhost:${controlPort} app=http://localhost:${appPort}`);
  });

  process.on("SIGTERM", async () => {
    await context.close();
    process.exit(0);
  });
  process.on("SIGINT", async () => {
    await context.close();
    process.exit(0);
  });
})();
