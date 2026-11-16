"use client";

// Offline databáza potravín (Open Food Facts) v telefóne. Statický balík
// /food-data/off-eu-YYYYMMDD.json.gz (~100 000 produktov, ~4 MB) sa stiahne raz,
// uloží do IndexedDB a hľadá sa v ňom bez siete — slabý signál v obchode neprekáža.
// (Appka nemá service worker; „offline“ platí po otvorení stránky. Uloženie jedla
// stále potrebuje sieť.)
//
// Načíta sa lenivo až pri otvorení panela „Pridať jedlo“ (`ensureFoodIndex`), nie
// pri každej stránke. Ak už IndexedDB balík má, použije sa hneď a či vyšla novšia
// verzia sa zistí v pozadí — štart je teda bez čakania na sieť.
//
// Do IndexedDB ukladáme celý JSON ako jeden reťazec (nie 100 000 polí): structured
// clone reťazca je rýchly a Safari s ním nemá problémy; parsovanie ~8 MB ide ~100 ms.

import { buildIndex, foodAt, lookupCodeIn, searchIndex, type FoodBundle, type FoodSearchIndex, type IndexedFood } from "@/lib/foodIndexCore";
import { foodDisplayName } from "@/lib/offProduct";
import type { PortalFoodOption } from "@/lib/portal/types";

export type FoodIndexStatus = "idle" | "loading" | "ready" | "error";

interface Manifest {
  version: string;
  file: string;
}

const MANIFEST_URL = "/food-data/manifest.json";
const DB_NAME = "fitpilot-food-index";
const STORE = "bundle";

let status: FoodIndexStatus = "idle";
let index: FoodSearchIndex | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function setStatus(next: FoodIndexStatus) {
  if (status === next) return;
  status = next;
  listeners.forEach((l) => l());
}

/** Pre useSyncExternalStore. */
export function subscribeFoodIndex(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export const getFoodIndexStatus = (): FoodIndexStatus => status;

// ---------------------------------------------------------------- IndexedDB

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Uložená verzia balíka (najnovšia, ak ich je viac), alebo null — chyba IndexedDB (súkromný režim…) = null. */
async function readStored(): Promise<{ version: string; json: string } | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve) => {
      const store = db.transaction(STORE, "readonly").objectStore(STORE);
      const keysReq = store.getAllKeys();
      keysReq.onsuccess = () => {
        const keys = (keysReq.result as string[]).sort();
        const latest = keys[keys.length - 1];
        if (!latest) return resolve(null);
        const get = store.get(latest);
        get.onsuccess = () => resolve(typeof get.result === "string" ? { version: latest, json: get.result } : null);
        get.onerror = () => resolve(null);
      };
      keysReq.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/** Uloží novú verziu a zmaže staré (jeden object store, kľúč = verzia). Zlyhanie ukladania nie je fatálne. */
async function writeStored(version: string, json: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      store.put(json, version);
      const keysReq = store.getAllKeys();
      keysReq.onsuccess = () => {
        for (const k of keysReq.result) if (k !== version) store.delete(k);
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } catch {
    // bez uloženia sa balík stiahne znova pri ďalšom otvorení — hľadanie teraz funguje aj tak
  }
}

// ---------------------------------------------------------------- sťahovanie

/** Server môže poslať balík ešte gzipnutý (Content-Type application/gzip), alebo ho prehliadač už rozbalil. */
async function decodeBundle(buf: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(buf);
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    // i18n-ignore — interná chyba (zachytí ju load(), UI ukáže indexError z food.json)
    if (typeof DecompressionStream === "undefined") throw new Error("DecompressionStream chýba");
    const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"));
    return await new Response(stream).text();
  }
  return new TextDecoder().decode(bytes);
}

function install(json: string): string {
  const bundle = JSON.parse(json) as FoodBundle;
  index = buildIndex(bundle);
  return bundle.v;
}

async function fetchManifest(): Promise<Manifest | null> {
  try {
    // no-cache: manifest je malý a musí byť čerstvý, inak by sa nová verzia nezistila
    const res = await fetch(MANIFEST_URL, { cache: "no-cache" });
    if (!res.ok) return null;
    const m = (await res.json()) as Partial<Manifest>;
    return m.version && m.file ? { version: m.version, file: m.file } : null;
  } catch {
    return null;
  }
}

async function downloadAndInstall(m: Manifest): Promise<void> {
  const res = await fetch(m.file);
  if (!res.ok) throw new Error(`food bundle ${res.status}`);
  const json = await decodeBundle(await res.arrayBuffer());
  install(json);
  await writeStored(m.version, json);
}

async function load(): Promise<void> {
  const stored = await readStored();
  if (stored) {
    try {
      install(stored.json);
      setStatus("ready");
      // novšia verzia v pozadí — hľadanie medzitým beží nad uloženou
      void fetchManifest().then((m) => {
        if (m && m.version > stored.version) downloadAndInstall(m).catch(() => {});
      });
      return;
    } catch {
      // poškodený záznam — stiahneme znova
    }
  }
  setStatus("loading");
  const manifest = await fetchManifest();
  if (!manifest) throw new Error("manifest");
  await downloadAndInstall(manifest);
  setStatus("ready");
}

/** Spustí načítanie (raz). Volá sa pri otvorení panela; opakované volania vrátia ten istý promise. */
export function ensureFoodIndex(): Promise<void> {
  if (status === "ready") return Promise.resolve();
  if (typeof window === "undefined") return Promise.resolve();
  if (!loading) {
    loading = load().catch(() => {
      setStatus("error");
      loading = null; // ďalšie otvorenie panela skúsi znova
    });
  }
  return loading;
}

// ---------------------------------------------------------------- dopyty

/** Produkt z balíka → položka výberu (foodId null — do DB sa dostane až cez sken route / snapshot). */
export function indexedToOption(f: IndexedFood): PortalFoodOption {
  return {
    foodId: null,
    name: foodDisplayName(f.name, f.brand),
    kcal100g: f.kcal,
    protein100g: f.protein,
    carbs100g: f.carbs,
    fat100g: f.fat,
    fiber100g: f.fiber,
    sugars100g: f.sugars,
    salt100g: f.salt,
    servingGrams: f.servingGrams,
    packageGrams: f.packageGrams,
    unitBase: f.unit,
    source: "off",
    barcode: f.code,
  };
}

/** Okamžité hľadanie v offline balíku; kým nie je pripravený, vráti prázdny zoznam. */
export function searchFoodIndex(query: string, limit = 30): PortalFoodOption[] {
  if (!index) return [];
  return searchIndex(index, query, limit).map((i) => indexedToOption(foodAt(index!, i)));
}

/** Čiarový kód v offline balíku, null = nepripravený balík alebo kód v ňom nie je. */
export function lookupFoodIndexBarcode(code: string): PortalFoodOption | null {
  if (!index) return null;
  const hit = lookupCodeIn(index, code);
  return hit ? indexedToOption(hit) : null;
}
