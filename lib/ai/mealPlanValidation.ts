// FitPilot — AI generátor jedálničkov: serverová kontrola návrhu od modelu. Model je len
// „skladateľ“ — NIKDY mu neveríme na slovo: potraviny smú byť len tie, ktoré mu vrátil
// search_foods v tejto generácii (food_ref), jednotka musí patriť potravine, gramáž aj
// makrá počíta kód (lib/portions.ts, lib/meals.ts), nie model. Čisté funkcie bez siete —
// testované v e2e/mealGenerator.spec.ts.

import { normalize } from "@/lib/foodIndexCore";
import { MEAL_SLOT_ORDER, scaleFoodMacros, sumMacros, type MealSlot, type ScaledMacros } from "@/lib/meals";
import { isPortionUnit, portionGrams, portionOptions, baseUnitOf, type PortionFood, type PortionUnit } from "@/lib/portions";
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
  kcal100: number;
  protein100: number;
  carbs100: number;
  fat100: number;
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

export type DropReason = "unknown_ref" | "bad_unit" | "bad_qty" | "bad_slot" | "excluded" | "diet";
export interface DroppedItem {
  /** 1-based poradie dňa */
  day: number;
  reason: DropReason;
  detail: string;
}

export interface ParsedSubmission {
  days: PlanDay[];
  dropped: DroppedItem[];
  /** false = návrh nemal použiteľný tvar `days` */
  shapeOk: boolean;
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

// ---------------------------------------------------------------- porcie

export const MAX_ITEM_GRAMS = 800;
const MAX_PIECE_QTY = 20;

/**
 * Množstvo × jednotka → gramy, s obmedzením na rozumné hodnoty: g/ml po 5, ks/porcia/balenie
 * po 0,5 (aspoň 0,5), položka najviac MAX_ITEM_GRAMS. null = jednotku potravina nemá / neplatné množstvo.
 */
export function normalizePortion(
  unit: PortionUnit,
  qty: number,
  food: PortionFood,
): { unit: PortionUnit; qty: number; grams: number } | null {
  if (!Number.isFinite(qty) || qty <= 0) return null;
  if (!portionOptions(food).includes(unit)) return null;
  const isBase = unit === baseUnitOf(food);
  const step = isBase ? 5 : 0.5;
  const max = isBase ? MAX_ITEM_GRAMS : MAX_PIECE_QTY;
  let q = Math.min(Math.max(Math.round(qty / step) * step, step), max);
  let g = portionGrams(unit, q, food);
  if (g === null) return null;
  if (g > MAX_ITEM_GRAMS) {
    q = Math.max(step, Math.floor((MAX_ITEM_GRAMS / (g / q)) / step) * step);
    g = portionGrams(unit, q, food);
    if (g === null || g > MAX_ITEM_GRAMS) return null;
  }
  return { unit, qty: q, grams: g };
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
const MEAT = [
  "kurac", "kuracie", "kure", "kureci", "moriak", "morci", "hovadz", "hovezi", "bravcov", "veprov", "sunka", "sunky", "sunk",
  "salam", "klobas", "slanin", "parok", "parky", "telac", "teleci", "jahnac", "jehnec", "kacac", "kachni", "husac", "husi",
  "maso", "masov", "steak", "rezen", "gulas", "pastet", "tunak", "tuniak", "losos", "lososa", "treska", "makrel",
  "sardink", "sardel", "pstruh", "kapor", "krevet", "kalamar", "ryba", "ryby", "rybac", "rybi", "bacon", "prsut", "sekan",
];
const DAIRY = [
  "mlieko", "mleko", "mliecn", "mlecn", "jogurt", "kefir", "tvaroh", "syr", "syry", "syra", "syrov", "smotan", "smetan",
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
const GLUTEN_FREE = /(bezlep|bez lepku|bez lepk|gluten free|glutenfree|bezgluten)/;
// i18n-ignore-end

function hasTerm(name: string, list: string[]): string | null {
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

// ---------------------------------------------------------------- parsovanie návrhu

interface RawMeal {
  slot?: unknown;
  items?: unknown;
}
interface RawDay {
  name?: unknown;
  copy_of_day?: unknown;
  meals?: unknown;
}

export interface ParseOptions {
  /** počet dní, ktorý tréner žiada (nadbytočné sa zahodia) */
  days: number;
  diet: DietType;
  excluded: string[];
  /** názov dňa, keď ho model nevyplnil: (1-based poradie) => "Deň 1" */
  dayName: (n: number) => string;
}

const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Model občas `days` zabalí ako stringifikovaný JSON (pozorované aj pri plánoch cvikov). */
export function unwrapDays(input: unknown): unknown[] | null {
  if (!isObj(input)) return null;
  let days: unknown = input.days;
  if (typeof days === "string") {
    try {
      days = JSON.parse(days);
    } catch {
      return null;
    }
  }
  return Array.isArray(days) ? days : null;
}

/**
 * Surový návrh → dni s overenými položkami. Neznáme `food_ref` (mimo výsledkov search_foods),
 * jednotka, ktorú potravina nemá, neplatné množstvo, vylúčená potravina a očividné porušenie
 * diéty sa zahodia a zapíšu do `dropped` (na opravné kolo a upozornenie trénerovi).
 */
export function parseSubmission(input: unknown, known: ReadonlyMap<string, KnownFood>, opts: ParseOptions): ParsedSubmission {
  const rawDays = unwrapDays(input);
  if (!rawDays || rawDays.length === 0) return { days: [], dropped: [], shapeOk: false };

  const dropped: DroppedItem[] = [];
  const days: PlanDay[] = [];

  for (const [i, rd] of rawDays.slice(0, opts.days).entries()) {
    const dayNo = i + 1;
    const day: RawDay = isObj(rd) ? rd : {};
    const name = typeof day.name === "string" && day.name.trim() ? day.name.trim().slice(0, 120) : opts.dayName(dayNo);

    // „rovnaký ako deň N“ (režim meal prep) — kópia skôr overeného dňa, model nemusí všetko písať znova
    const copyOf = typeof day.copy_of_day === "number" ? Math.floor(day.copy_of_day) : null;
    if (copyOf !== null && copyOf >= 1 && copyOf < dayNo && days[copyOf - 1]) {
      days.push({ name, items: days[copyOf - 1].items.map((it) => ({ ...it })) });
      continue;
    }

    const items: PlanItem[] = [];
    for (const rm of asArray(day.meals)) {
      const meal: RawMeal = isObj(rm) ? rm : {};
      const slot = meal.slot as MealSlot;
      for (const ri of asArray(meal.items)) {
        const it = isObj(ri) ? ri : {};
        const ref = typeof it.food_ref === "string" ? it.food_ref.trim() : "";
        if (!MEAL_SLOT_ORDER.includes(slot)) {
          dropped.push({ day: dayNo, reason: "bad_slot", detail: String(meal.slot) });
          continue;
        }
        const food = known.get(ref);
        if (!food) {
          dropped.push({ day: dayNo, reason: "unknown_ref", detail: ref || "?" });
          continue;
        }
        const unit = it.portion_unit;
        const qty = typeof it.portion_qty === "number" ? it.portion_qty : Number(it.portion_qty);
        if (!isPortionUnit(unit) || !portionOptions(food.portion).includes(unit)) {
          dropped.push({ day: dayNo, reason: "bad_unit", detail: `${food.name}: ${String(unit)}` });
          continue;
        }
        const portion = normalizePortion(unit, qty, food.portion);
        if (!portion) {
          dropped.push({ day: dayNo, reason: "bad_qty", detail: `${food.name}: ${String(it.portion_qty)}` });
          continue;
        }
        const ex = findExcludedWord(food.name, opts.excluded);
        if (ex) {
          dropped.push({ day: dayNo, reason: "excluded", detail: `${food.name} (${ex})` });
          continue;
        }
        const dv = dietViolation(food.name, opts.diet);
        if (dv) {
          dropped.push({ day: dayNo, reason: "diet", detail: `${food.name} (${dv})` });
          continue;
        }
        items.push({
          ref,
          food,
          slot,
          unit: portion.unit,
          qty: portion.qty,
          grams: portion.grams,
          macros: scaleFoodMacros(
            { kcal_100g: food.kcal100, protein_100g: food.protein100, carbs_100g: food.carbs100, fat_100g: food.fat100 },
            portion.grams,
          ),
        });
      }
    }
    days.push({ name, items });
  }
  return { days, dropped, shapeOk: true };
}

// ---------------------------------------------------------------- makrá a odchýlky

export const KCAL_TOLERANCE = 0.1;
export const PROTEIN_TOLERANCE = 0.1;

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
      ok: !empty && Math.abs(kcalDev) <= KCAL_TOLERANCE && Math.abs(proteinDev) <= PROTEIN_TOLERANCE,
    };
  });
}

const pct = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(Math.round(v * 100))} %`;

// i18n-ignore-start — pokyn pre model (interný)
/** Text opravného kola: skutočné čísla vypočítané kódom + zahodené položky. Prázdny reťazec = netreba opravu. */
export function buildRepairFeedback(
  analysis: DayAnalysis[],
  targets: MacroTargets,
  dropped: DroppedItem[],
  expectedDays: number,
  toolName = "submit_meal_plan",
): string {
  const lines: string[] = [];
  const bad = analysis.filter((a) => !a.ok);
  for (const a of bad) {
    lines.push(
      a.empty
        ? `Deň ${a.day}: po kontrole nezostala žiadna platná položka.`
        : `Deň ${a.day}: ${a.totals.kcal} kcal (cieľ ${targets.kcal}, ${pct(a.kcalDev)}), bielkoviny ${Math.round(a.totals.proteinG)} g (cieľ ${targets.proteinG}, ${pct(a.proteinDev)}), sacharidy ${Math.round(a.totals.carbsG)} g (cieľ ${targets.carbsG}), tuky ${Math.round(a.totals.fatG)} g (cieľ ${targets.fatG}).`,
    );
  }
  if (analysis.length < expectedDays) lines.push(`Chýbajú dni: odovzdal si ${analysis.length} z ${expectedDays}.`);
  if (lines.length === 0) return "";
  if (dropped.length > 0) {
    const sample = dropped.slice(0, 8).map((d) => `deň ${d.day}: ${d.detail}`);
    lines.push(`Tieto položky appka zahodila (neplatný food_ref/jednotka/množstvo alebo porušenie obmedzení): ${sample.join("; ")}.`);
  }
  return [
    "Kontrola súčtov (počítané appkou z reálnych hodnôt potravín) — tieto dni sú mimo cieľa o viac ako 10 % (kcal alebo bielkoviny):",
    ...lines,
    `Oprav LEN toto a zavolaj ${toolName} znova s CELÝM obsahom: uprav množstvá, pridaj alebo odober položky (smieš použiť len food_ref, ktoré si už našiel). Dni, ktoré sedia, nechaj tak.`,
  ].join("\n");
}
// i18n-ignore-end
