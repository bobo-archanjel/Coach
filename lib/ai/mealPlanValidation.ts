// FitPilot — AI generátor jedálničkov: spoločné typy, diéta a vylúčené potraviny. Model len VYBERÁ
// potraviny (food_ref z search_foods); gramáž a makrá počíta kód (lib/ai/mealPortions.ts,
// lib/meals.ts). Čisté funkcie bez siete — testované v e2e/mealGenerator.spec.ts.

import { normalize } from "@/lib/foodIndexCore";
import { sumMacros, type MealSlot, type ScaledMacros } from "@/lib/meals";
import type { PortionFood, PortionUnit } from "@/lib/portions";
import type { IndexedFood } from "@/lib/foodIndexCore";

// ---------------------------------------------------------------- typy

/** Najviac znakov v poli „čo klient nejí“ (formulár aj server). */
export const EXCLUDED_TEXT_MAX = 200;

/** Potravina, ktorú v tejto generácii vrátil search_foods (kľúč v mape = krátky `ref`, napr. "F12"). */
export interface KnownFood {
  ref: string;
  source: "kniznica" | "off";
  /** foods.id (knižnica); OFF produkt ho nemá, kým sa nezaloží riadok (lib/offFoodStore.ts) */
  foodId: string | null;
  /** čiarový kód (OFF) */
  barcode: string | null;
  name: string;
  /** slovenský názov z DB (bez lokalizácie) — diéta a kategórie sa vyhodnocujú z neho */
  baseName?: string;
  kcal100: number;
  protein100: number;
  carbs100: number;
  fat100: number;
  /** vláknina na 100 (null/chýba = neznáma) */
  fiber100?: number | null;
  portion: PortionFood;
  /** len OFF: riadok z balíka na založenie vo `foods` */
  offFood?: IndexedFood;
}

export type DietType = "none" | "vegetarian" | "vegan" | "lactose_free" | "gluten_free";
export const DIET_TYPES: readonly DietType[] = ["none", "vegetarian", "vegan", "lactose_free", "gluten_free"];
export type RepeatMode = "varied" | "meal_prep";

export interface MacroTargets {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface PlanItem {
  ref: string;
  food: KnownFood;
  slot: MealSlot;
  unit: PortionUnit;
  qty: number;
  grams: number;
  macros: ScaledMacros;
}

export interface PlanDay {
  name: string;
  items: PlanItem[];
}

export type DropReason = "unknown_ref" | "bad_slot" | "bad_group" | "rule" | "excluded" | "diet";
export interface DroppedItem {
  /** 1-based poradie dňa */
  day: number;
  reason: DropReason;
  detail: string;
}

// ---------------------------------------------------------------- jedlá počas dňa

/** Počet jedál denne (3–6) → sloty appky. 6. jedlo = „Iné“ (druhá večera / pred spaním). */
export function slotsForMealCount(n: number): MealSlot[] {
  const count = Math.min(Math.max(Math.round(n), 3), 6);
  const sets: Record<number, MealSlot[]> = {
    3: ["ranajky", "obed", "vecera"],
    4: ["ranajky", "obed", "olovrant", "vecera"],
    5: ["ranajky", "desiata", "obed", "olovrant", "vecera"],
    6: ["ranajky", "desiata", "obed", "olovrant", "vecera", "ine"],
  };
  return sets[count];
}

// ---------------------------------------------------------------- vylúčené potraviny a diéta

const EXCLUSION_STOPWORDS = new Set(["bez", "aj", "nie", "alebo", "ani", "ale", "nejem", "nechcem", "nema", "nesmie", "pre", "rad", "mam"]);

/** Slová z textu „vylúčené potraviny“ (bez diakritiky, krátke a spojky preč). */
export function exclusionWords(text: string | null | undefined): string[] {
  return normalize(text ?? "")
    .split(" ")
    .filter((w) => w.length >= 3 && !EXCLUSION_STOPWORDS.has(w));
}

/** Slovo z názvu potraviny patrí k pojmu: zhoda koreňa (skloňovanie: orech/orechy/orechový). */
function wordMatches(word: string, term: string): boolean {
  if (word === term) return true;
  const stem = term.length > 5 ? term.slice(0, term.length - 2) : term.length > 3 ? term.slice(0, term.length - 1) : term;
  return stem.length >= 3 && word.startsWith(stem);
}

/** Prvé vylúčené slovo, ktoré sa nachádza v názve potraviny (alebo null). */
export function findExcludedWord(foodName: string, words: string[]): string | null {
  if (words.length === 0) return null;
  const nameWords = normalize(foodName).split(" ").filter(Boolean);
  for (const w of words) if (nameWords.some((nw) => wordMatches(nw, w))) return w;
  return null;
}

// Hrubá heuristika podľa názvu (nie databáza alergénov!) — chytá len očividné prešmyky.
// Položka dĺžky < 5 sa porovnáva presne, dlhšia ako predpona slova.
// i18n-ignore-start — kľúčové slová názvov potravín (SK/CZ) pre kontrolu diéty, nie text UI
export const MEAT = [
  "kurac", "kuracie", "kure", "kureci", "moriak", "morci", "hovadz", "hovezi", "bravcov", "veprov", "sunka", "sunky", "sunk",
  "salam", "klobas", "slanin", "parok", "parky", "telac", "teleci", "jahnac", "jehnec", "kacac", "kachni", "husac", "husi",
  "maso", "masov", "steak", "rezen", "gulas", "pastet", "tunak", "tuniak", "losos", "lososa", "treska", "makrel",
  "sardink", "sardel", "pstruh", "kapor", "krevet", "kalamar", "ryba", "ryby", "rybac", "rybi", "bacon", "prsut", "sekan",
];
const DAIRY = [
  "mlieko", "mleko", "mliecn", "mlecn", "jogurt", "kefir", "tvaroh", "syr", "syry", "syra", "syre", "syrom", "smotan", "smetan",
  "maslo", "maslov", "cottage", "mozzarel", "parmez", "eidam", "emental", "gouda", "feta", "ricott", "mascarpon", "skyr",
  "zakysan", "srvatk", "whey", "kazein", "casein", "cheddar",
];
const EGG_HONEY = ["vajce", "vajec", "vejce", "vajic", "vejc", "med", "medov", "zelatin", "majonez"];
const GLUTEN = [
  "psen", "psenic", "psenn", "razn", "razny", "jecmen", "jecm", "spalda", "spalden", "chlieb", "chleb", "pecivo", "rozok",
  "rohlik", "bageta", "toast", "cestovin", "spaghetti", "spagety", "penne", "makarony", "musli", "tortil", "pita", "kuskus",
  "bulgur", "seitan", "pizza", "kruton", "strukan", "piskot", "cestoviny",
];
// rastlinné alternatívy a „bez…“ varianty výslovne vyhovujú
const PLANT_BASED = /(arasid|burac|mandl|orech|kesu|sezam|kakaov|kokos|rastlin|sojov|ovsen|ryzov|bezlakt|bez lakt|lactose free|laktoz free|vegan)/;
const GLUTEN_FREE = /(bezlep|bez lepku|bez lepk|gluten free|glutenfree|bezgluten|ryzov|kukuric|pohank|quinoa|kinoa|jahel)/;
// i18n-ignore-end

export function hasTerm(name: string, list: string[]): string | null {
  const words = normalize(name).split(" ").filter(Boolean);
  for (const w of words) {
    for (const t of list) {
      if (w === t || (t.length >= 5 && w.startsWith(t))) return t;
    }
  }
  return null;
}

/** Názov potraviny, ktorý očividne porušuje diétu (vráti nájdené slovo), inak null. */
export function dietViolation(foodName: string, diet: DietType): string | null {
  if (diet === "none") return null;
  const n = normalize(foodName);
  if (diet === "gluten_free") return GLUTEN_FREE.test(n) ? null : hasTerm(foodName, GLUTEN);
  if (diet === "vegetarian") return hasTerm(foodName, MEAT);
  const plant = PLANT_BASED.test(n);
  if (diet === "lactose_free") return plant ? null : hasTerm(foodName, DAIRY);
  // vegan
  return hasTerm(foodName, MEAT) ?? (plant ? null : (hasTerm(foodName, DAIRY) ?? hasTerm(foodName, EGG_HONEY)));
}

// ---------------------------------------------------------------- makrá a odchýlky

export const KCAL_TOLERANCE = 0.05;
export const PROTEIN_TOLERANCE_LOW = 0.1;
export const PROTEIN_TOLERANCE_HIGH = 0.15;

export interface DayAnalysis {
  /** 1-based */
  day: number;
  totals: ScaledMacros;
  kcalDev: number;
  proteinDev: number;
  ok: boolean;
  empty: boolean;
}

const dev = (actual: number, target: number) => (target > 0 ? (actual - target) / target : 0);

export function analyzeDays(days: PlanDay[], targets: MacroTargets): DayAnalysis[] {
  return days.map((d, i) => {
    const totals = sumMacros(d.items.map((it) => it.macros));
    const kcalDev = dev(totals.kcal, targets.kcal);
    const proteinDev = dev(totals.proteinG, targets.proteinG);
    const empty = d.items.length === 0;
    return {
      day: i + 1,
      totals,
      kcalDev,
      proteinDev,
      empty,
      ok: !empty && Math.abs(kcalDev) <= KCAL_TOLERANCE && proteinDev >= -PROTEIN_TOLERANCE_LOW && proteinDev <= PROTEIN_TOLERANCE_HIGH,
    };
  });
}
