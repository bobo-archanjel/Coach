// FitPilot — AI generátor jedálničkov: PEVNÉ pravidlá (kód, nie model) a mäkké upozornenia.
// Deň, ktorý hard pravidlá nespĺňa, sa NIKDY neuloží (viď mealPortions.ts a mealGenerator.ts).
// Čisté funkcie bez siete — testované v e2e/mealRules.spec.ts.
//
// HARD (na deň): kcal ±5 % cieľa, bielkoviny −10 % / +15 %, tuky ≥ 18 % energie (pod 20 % mäkké upozornenie), podiel jedla na dennej
// energii (raňajky 15–35 %, obed/večera 20–40 %, desiata/olovrant/iné ≤ 20 %, nikdy > 40 %),
// realistické stropy (uvarená ryža/cestoviny/obilniny ≤ 400 g na jedlo — suchá surovina
// (> 300 kcal/100 g) ≤ 150 g; mäso/ryby ≤ 300 g na jedlo; oleje a maslo ≤ 20 g na jedlo a ≤ 30 g
// za deň; orechy/semienka ≤ 60 g za deň). HARD (na týždeň): priemer kcal ±3 % cieľa.
// KOMPOZÍCIA (nutričné pravidlá, HARD): hlavné jedlo = presne 1 zdroj bielkovín + presne 1 príloha + zelenina
// (≥ 150 g, najviac 2 druhy) + najviac 1 tuk, bez mliečnych a ovocia; strukoviny sú bielkovina len pri
// vegetariánskej/vegánskej diéte, inak len príloha (1×/deň, nie s mäsom); raňajky = 1 bielkovina (+ 1 mliečne) +
// 1 príloha + ovocie, bez mäsa; desiata bez uvarených príloh; najviac 1 mliečne v jedle a 3 za deň; jedna
// potravina najviac 2× za deň, ten istý zdroj bielkovín najviac 1×; ovocie + zelenina ≥ 400 g; bielkoviny na jedlo
// ≥ 25 g (hlavné) / 20 g (raňajky) / 10 g (desiata); uvarená a suchá forma tej istej potraviny nie v jednom dni.
// Potraviny sa triedia podľa kľúčových slov v názve (SK/CZ/EN) + makro profilu — je to heuristika,
// nie databáza; neznáme potraviny spadajú do „iné“ a stropy sa na ne neuplatňujú.

import { normalize } from "@/lib/foodIndexCore";
import { MEAL_SLOT_ORDER, type MealSlot } from "@/lib/meals";
import { baseUnitOf, portionGrams, type PortionFood, type PortionUnit } from "@/lib/portions";
import { hasTerm, MEAT, type DietType } from "./mealPlanValidation";

export interface MacroTargetsLike {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export const KCAL_DAY_TOL = 0.05;
export const PROTEIN_DAY_TOL_LOW = 0.1;
export const PROTEIN_DAY_TOL_HIGH = 0.15;
export const KCAL_WEEK_TOL = 0.03;
/** Tvrdé minimum podielu tukov na energii; pod FAT_SOFT_SHARE len upozornenie. */
export const FAT_MIN_SHARE = 0.18;
export const FAT_SOFT_SHARE = 0.2;
/** Najmenej bielkovín v jedle (g): hlavné 25, raňajky 20, desiata 10 (ISSN 0,25–0,4 g/kg na jedlo). */
export const MIN_MAIN_MEAL_PROTEIN_G = 25;
export const MIN_BREAKFAST_PROTEIN_G = 20;
export const MIN_SNACK_PROTEIN_G = 10;
export const FRUITVEG_HARD_MIN_G = 400;
export const MAIN_VEG_MIN_G = 150;
export const MAX_DAIRY_PER_DAY = 3;
export const MAX_FOOD_REPEAT_PER_DAY = 2;
export const MAIN_MEAL_SLOTS: readonly MealSlot[] = ["obed", "vecera"];
export const SNACK_SLOTS: readonly MealSlot[] = ["desiata", "olovrant", "ine"];
/** Jedlo (g/ml) nad týmto sa nikdy neponúka (zhodné s lib/ai/mealPlanValidation MAX_ITEM_GRAMS). */
export const ABSOLUTE_MAX_GRAMS = 800;

/** Položka jedálnička v tvare, s ktorým pracujú pravidlá aj jemné doladenie (gramáž = qty × jednotka). */
export interface RuleItem {
  key: string;
  /** slovenský názov z databázy (na klasifikáciu; `name` môže byť lokalizovaný, napr. český) */
  baseName?: string;
  /** ref potraviny z poolu */
  ref?: string;
  name: string;
  slot: MealSlot;
  unit: PortionUnit;
  qty: number;
  grams: number;
  kcal100: number;
  protein100: number;
  carbs100: number;
  fat100: number;
  fiber100?: number | null;
  portion: PortionFood;
  /** značkový produkt (OFF) — pri základných potravinách znižuje sanity skóre */
  branded?: boolean;
}

// ---------------------------------------------------------------- klasifikácia potravín

export type FoodCategory =
  | "oil"
  | "nuts"
  | "grain"
  | "grainDry"
  | "meat"
  | "egg"
  | "coldcut"
  | "tofu"
  | "dairy"
  | "cheese"
  | "legume"
  | "bread"
  | "potato"
  | "fruit"
  | "avocado"
  | "vegetable"
  | "other";

// i18n-ignore-start — kľúčové slová názvov potravín (SK/CZ/EN) pre klasifikáciu, nie text UI.
// Klasifikuje sa SLOVENSKÝ názov z databázy (RuleItem.baseName), nie lokalizovaný zobrazený názov
// (české „syrová“ = surová, nie syr). Porovnáva sa po celých slovách / koreňoch ≥ 5 znakov.
const NUT_WORDS = ["orech", "orechy", "mandl", "kesu", "arasid", "pistac", "lieskov", "seminka", "semiack", "chia", "slnecnic", "tekvic", "sezam", "almond", "peanut", "nuts", "seeds", "lan", "lanene"];
const OIL_WORDS = ["olej", "olivovy", "olivove", "maslo", "maslov", "ghee", "margarin", "oil", "butter", "tuk", "sadlo"];
const GRAIN_WORDS = ["ryza", "ryze", "cestovin", "cestoviny", "spaghetti", "spagety", "penne", "makarony", "kuskus", "couscous", "bulgur", "pohank", "quinoa", "kinoa", "ovsen", "vlocky", "krupic", "jahly", "jahel", "kasa", "rice", "pasta", "oats", "musli", "granola", "pseno", "proso"];
const EGG_WORDS = ["vajce", "vajec", "vejce", "vajicko", "egg", "eggs"];
const COLDCUT_WORDS = ["sunka", "sunky", "salam", "klobas", "parok", "parky", "slanin", "prsut", "mortadel", "bacon", "uzenina", "uzeniny", "sunk"];
const TOFU_WORDS = ["tofu", "tempeh", "seitan"];
const DAIRY_WORDS = ["jogurt", "jogurty", "skyr", "tvaroh", "kefir", "cottage", "smotana", "smetana", "mlieko", "mleko", "srvatk", "kazein"];
const CHEESE_WORDS = ["syr", "syry", "syra", "mozzarell", "eidam", "parmez", "cheddar", "feta", "gouda", "emental", "ricott", "mascarpon", "cheese"];
const LEGUME_WORDS = ["cicer", "sosovic", "fazul", "fazula", "hrach", "hrasok", "bob", "lupin", "strukovin"];
const BREAD_WORDS = ["chlieb", "chleb", "pecivo", "rozok", "rohlik", "bageta", "toast", "tortil", "croissant", "zemla", "pita"];
const POTATO_WORDS = ["zemiak", "zemiaky", "batat", "brambor", "brambory"];
const FRUIT_WORDS = ["jablk", "jablko", "hrusk", "banan", "pomaranc", "mandarink", "citron", "grep", "kiwi", "jahod", "malin", "boruvk", "cucoried", "cucorie", "hrozn", "broskyn", "marhul", "slivk", "cresn", "visn", "melon", "ananas", "mango", "avokado", "ovocie", "ovoce", "smoothie", "datl", "figy", "hrozienk"];
const VEG_WORDS = [
  "zelenin", "zelenina", "zeleni", "brokolic", "karfiol", "mrkv", "mrkva", "mrkvy", "mrkev", "tykva", "tykev", "rajce", "rajcata", "kelj", "paprik", "paradaj", "rajc", "uhork", "salat", "spenat", "cibul", "cesnak", "cuket", "cukin", "baklazan", "kapust", "kelj", "rukola", "repa", "redkv", "zeler", "tykv", "huby", "hriby", "sampin", "kukuric", "sparg", "fenikel", "pastinak", "vegetable", "salad", "ceker", "lahodk",
];
// i18n-ignore-end

/** Strop na JEDNU položku v jedle (g) — hard pravidlo „žiadne absurdné porcie“. */
export const ITEM_CAP_G: Record<FoodCategory, number> = {
  oil: 20,
  nuts: 60,
  grain: 400,
  grainDry: 150,
  meat: 300,
  egg: 240, // 4 ks
  coldcut: 150,
  tofu: 250,
  dairy: 300,
  cheese: 80,
  legume: 300,
  bread: 160, // 4 krajce/kusy
  potato: 400,
  fruit: 300,
  avocado: 120, // ~ 1 avokádo
  vegetable: 300,
  other: 350,
};
/** Strop na SÚČET kategórie v jednom jedle (g); null = len strop na položku. */
export const MEAL_CAP_G: Record<FoodCategory, number | null> = {
  oil: 20,
  nuts: null,
  grain: 400,
  grainDry: 150,
  meat: 300,
  egg: null,
  coldcut: null,
  tofu: null,
  dairy: null,
  cheese: null,
  legume: null,
  bread: null,
  potato: null,
  fruit: 350,
  avocado: null,
  vegetable: null,
  other: null,
};
/** Najviac kusov jednej položky v jedle (len keď je zadaná v ks). */
export const ITEM_MAX_PIECES: Partial<Record<FoodCategory, number>> = { egg: 4, bread: 4, fruit: 2 };
/** Najviac položiek mäsa/rýb v jednom jedle a najviac bielkovinových položiek spolu (nie päť druhov rýb po 50 g). */
export const MAX_MEAT_ITEMS_PER_MEAL = 2;
export const MAX_PROTEIN_ITEMS_PER_MEAL = 3;

/** Najmenšia zmysluplná porcia jednej položky (g) — žiadnych „5 g šunky“. */
export const ITEM_MIN_G: Record<FoodCategory, number> = {
  oil: 5,
  nuts: 10,
  grain: 50,
  grainDry: 30,
  meat: 50,
  egg: 25,
  coldcut: 30,
  tofu: 50,
  dairy: 50,
  cheese: 20,
  legume: 50,
  bread: 30,
  potato: 80,
  fruit: 50,
  avocado: 30,
  vegetable: 50,
  other: 20,
};
export const DAY_CAP_G: Partial<Record<FoodCategory, number>> = { oil: 30, nuts: 60, egg: 240 };
/** Jedna položka nesmie tvoriť viac než toto z energie svojho jedla (platí pri hlavnom jedle a raňajkách s ≥ 2 položkami, nie pri desiate). */
export const MAX_ITEM_MEAL_SHARE = 0.6;
export const MAX_SNACK_ITEMS = 3;
export const MIN_MAIN_PROTEIN_ITEMS_G = 20;
/** Najmenej bielkovín z jedného zdroja v hlavnom jedle: 20 g, pri veľmi nízkom dennom cieli menej (20 % cieľa). */
export const mainSourceMinG = (proteinTargetG: number) => Math.min(MIN_MAIN_PROTEIN_ITEMS_G, Math.max(10, proteinTargetG * 0.2));

const wordsOf = (name: string) => normalize(name).split(" ").filter(Boolean);
const matches = (words: string[], list: string[]) => words.some((w) => list.some((t) => w === t || (t.length >= 5 && w.startsWith(t))));

const categoryCache = new Map<string, FoodCategory>();

/** Kategória potraviny podľa (slovenského) názvu a makro profilu (suchá surovina > 300 kcal/100 g); výsledok sa kešuje (doladenie volá často). */
export function foodCategory(name: string, kcal100: number): FoodCategory {
  const key = `${kcal100 >= 600 ? 2 : kcal100 > 300 ? 1 : 0}|${name}`;
  let cat = categoryCache.get(key);
  if (cat === undefined) {
    if (categoryCache.size > 5000) categoryCache.clear();
    cat = classifyFood(name, kcal100);
    categoryCache.set(key, cat);
  }
  return cat;
}

function classifyFood(name: string, kcal100: number): FoodCategory {
  const words = wordsOf(name);
  if (matches(words, NUT_WORDS)) return "nuts";
  if (matches(words, OIL_WORDS) && kcal100 >= 600) return "oil";
  if (matches(words, EGG_WORDS)) return "egg";
  if (matches(words, TOFU_WORDS)) return "tofu";
  if (matches(words, COLDCUT_WORDS)) return "coldcut";
  if (matches(words, CHEESE_WORDS)) return "cheese";
  if (matches(words, DAIRY_WORDS)) return "dairy";
  if (matches(words, GRAIN_WORDS)) return kcal100 > 300 ? "grainDry" : "grain";
  if (matches(words, POTATO_WORDS)) return "potato";
  if (matches(words, BREAD_WORDS)) return "bread";
  if (matches(words, LEGUME_WORDS)) return "legume";
  if (hasTerm(name, MEAT)) return "meat";
  if (words.some((w) => w.startsWith("avokad"))) return "avocado";
  if (matches(words, FRUIT_WORDS)) return "fruit";
  if (matches(words, VEG_WORDS)) return "vegetable";
  return "other";
}

export const itemCategory = (it: Pick<RuleItem, "name" | "baseName" | "kcal100">) => foodCategory(it.baseName ?? it.name, it.kcal100);
export const isFruitVeg = (c: FoodCategory) => c === "fruit" || c === "vegetable";
export type Role = "protein" | "starch" | "vegetable" | "fruit" | "fat" | "dairy" | "other";
export const isVegDiet = (d?: DietType) => d === "vegetarian" || d === "vegan";

/** Úloha potraviny v jedle podľa kategórie a diéty (strukoviny: bielkovina len pri vegetariánskej/vegánskej diéte). */
export function roleOfFood(name: string, cat: FoodCategory, fat100: number, diet?: DietType): Role {
  switch (cat) {
    case "meat": case "egg": case "coldcut": case "tofu": return "protein";
    case "legume": return isVegDiet(diet) ? "protein" : "starch";
    case "grain": case "grainDry": case "bread": case "potato": return "starch";
    case "vegetable": return "vegetable";
    case "fruit": return "fruit";
    case "avocado": return "fat";
    case "oil": case "nuts": case "cheese": return "fat";
    case "dairy": return "dairy";
    default: return "other";
  }
}

export const roleOfItem = (it: Pick<RuleItem, "name" | "baseName" | "kcal100" | "fat100">, diet?: DietType): Role =>
  roleOfFood(it.baseName ?? it.name, foodCategory(it.baseName ?? it.name, it.kcal100), it.fat100, diet);

/** Ryby (do týždenného minima 2 jedál z rýb). */
const FISH_WORDS = ["losos", "treska", "tunak", "tuniak", "makrel", "sardink", "sardel", "pstruh", "kapor", "ryba", "ryby", "rybi", "sekan", "platys", "halibut", "morsk", "kreve", "ostriez", "zubac"];
export const isFish = (name: string) => matches(wordsOf(name), FISH_WORDS);

/** Kľúč potraviny pre kontrolu opakovania (normalizovaný názov bez zátvoriek). */
export const foodKeyOf = (name: string) => normalize(name.replace(/\(.*?\)/g, " ")).trim();
/** Rodina potraviny (prvé slovo, 4 znaky: „ryža“/„rýže“ → ryz) — uvarená a suchá forma jednej rodiny nejdú spolu. */
export const foodFamilyOf = (name: string) => (wordsOf(name)[0] ?? "").slice(0, 4);
/** Suchá (surová) forma obilniny/strukoviny/zemiakov; uvarená je každá iná. */
export function isDryForm(name: string, cat: FoodCategory): boolean {
  if (cat !== "grain" && cat !== "grainDry" && cat !== "legume" && cat !== "potato") return false;
  return /(syrov|surov|such)/.test(normalize(name)) || cat === "grainDry";
}

/** Položky, ktoré sa počítajú ako zdroj bielkovín jedla. */
export const isProteinCategory = (c: FoodCategory) => c === "meat" || c === "egg" || c === "coldcut" || c === "tofu" || c === "dairy" || c === "cheese" || c === "legume";
/** Zdroj sacharidov v jedle (príloha). */
export const isCarbCategory = (c: FoodCategory) => c === "grain" || c === "grainDry" || c === "bread" || c === "potato" || c === "legume";

// ---------------------------------------------------------------- makrá

export const itemKcal = (it: RuleItem) => (it.kcal100 * it.grams) / 100;
export const itemProtein = (it: RuleItem) => (it.protein100 * it.grams) / 100;
export const itemCarbs = (it: RuleItem) => (it.carbs100 * it.grams) / 100;
export const itemFat = (it: RuleItem) => (it.fat100 * it.grams) / 100;

export interface DayTotals {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export function dayTotals(items: RuleItem[]): DayTotals {
  return items.reduce(
    (a, it) => ({ kcal: a.kcal + itemKcal(it), proteinG: a.proteinG + itemProtein(it), carbsG: a.carbsG + itemCarbs(it), fatG: a.fatG + itemFat(it) }),
    { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  );
}

/** Ideálny podiel slotu na dennej energii (normalizuje sa na prítomné sloty). */
const IDEAL_WEIGHT: Record<MealSlot, number> = { ranajky: 0.24, desiata: 0.07, obed: 0.32, olovrant: 0.07, vecera: 0.3, ine: 0.06 };

export function idealSlotShares(slots: MealSlot[]): Map<MealSlot, number> {
  const total = slots.reduce((s, x) => s + IDEAL_WEIGHT[x], 0);
  return new Map(slots.map((s) => [s, IDEAL_WEIGHT[s] / total]));
}

export function slotShareRange(slot: MealSlot): { min: number; max: number } {
  if (slot === "ranajky") return { min: 0.15, max: 0.35 };
  if (MAIN_MEAL_SLOTS.includes(slot)) return { min: 0.2, max: 0.4 };
  return { min: 0, max: 0.2 };
}

// ---------------------------------------------------------------- hard pravidlá

export type ViolationCode =
  | "kcal"
  | "protein"
  | "fat_share"
  | "slot_share"
  | "missing_slot"
  | "slot_protein"
  | "cap_item"
  | "too_many_protein"
  | "tiny_item"
  | "item_share"
  | "comp_protein"
  | "comp_carb"
  | "comp_veg"
  | "snack_items"
  | "cap_meal"
  | "cap_day"
  | "main_protein_count"
  | "main_starch_count"
  | "main_veg"
  | "main_fat_count"
  | "main_sweet"
  | "legume_rule"
  | "bf_protein"
  | "bf_meat"
  | "bf_starch"
  | "snack_forbidden"
  | "dairy_meal"
  | "dairy_day"
  | "food_repeat"
  | "protein_repeat"
  | "fruitveg"
  | "form_mix"
  | "empty";

export interface Violation {
  code: ViolationCode;
  slot?: MealSlot;
  /** čitateľný popis pre model (opravné kolo) */
  detail: string;
}

export interface DayCheck {
  ok: boolean;
  violations: Violation[];
  totals: DayTotals;
  slotKcal: Map<MealSlot, number>;
}

export interface CheckOptions {
  targets: MacroTargetsLike;
  /** sloty, ktoré musia mať aspoň jednu položku */
  requiredSlots?: MealSlot[];
  /** kcal cieľ pre tento deň (týždňový posun); predvolene targets.kcal */
  kcalAim?: number;
  /** diéta (vplýva na úlohu strukovín); chýba = bez obmedzení */
  diet?: DietType;
}

/** Najmenšie bielkoviny podľa jedla (pri veľmi nízkom dennom cieli úmerne menej, aby sa dali splniť). */
export function mealProteinMins(slots: MealSlot[], proteinTarget: number): Map<MealSlot, number> {
  const nominal = (s: MealSlot) => (MAIN_MEAL_SLOTS.includes(s) ? MIN_MAIN_MEAL_PROTEIN_G : s === "ranajky" ? MIN_BREAKFAST_PROTEIN_G : MIN_SNACK_PROTEIN_G);
  const sum = slots.reduce((a, s) => a + nominal(s), 0);
  const scale = proteinTarget > 0 && sum > proteinTarget * 0.85 ? (proteinTarget * 0.85) / sum : 1;
  return new Map(slots.map((s) => [s, nominal(s) * scale]));
}

const r0 = (n: number) => Math.round(n);
const pctText = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(Math.round(v * 100))} %`;

/** Skladba jedného jedla (nutričné pravidlá) — viď hlavička súboru. */
function compositionViolations(slot: MealSlot, list: RuleItem[], diet?: DietType): Violation[] {
  const out: Violation[] = [];
  const v = (code: ViolationCode, detail: string) => out.push({ code, slot, detail });
  const cats = list.map((i) => itemCategory(i));
  const roles = list.map((i) => roleOfItem(i, diet));
  const count = (r: Role) => roles.filter((x) => x === r).length;
  const veg = isVegDiet(diet);
  if (count("dairy") > 1) v("dairy_meal", `${slot}: viac než jedno mliečne (max 1 na jedlo)`);
  if (MAIN_MEAL_SLOTS.includes(slot)) {
    if (count("protein") !== 1) v("main_protein_count", `${slot}: ${count("protein")} zdrojov bielkovín (presne 1: mäso/ryba/vajce/tofu${veg ? " alebo strukovina" : ""})`);
    if (count("starch") !== 1) v("main_starch_count", `${slot}: ${count("starch")} príloh (presne 1)`);
    const vegItems = list.filter((_, k) => roles[k] === "vegetable");
    const vegG = vegItems.reduce((s, i) => s + i.grams, 0);
    if (vegItems.length > 0 && vegG < MAIN_VEG_MIN_G - 1e-9) v("main_veg", `${slot}: zeleniny len ${r0(vegG)} g (minimum ${MAIN_VEG_MIN_G} g)`);
    if (new Set(vegItems.map((i) => foodKeyOf(i.baseName ?? i.name))).size > 2) v("main_veg", `${slot}: viac než 2 druhy zeleniny`);
    if (count("fat") > 1) v("main_fat_count", `${slot}: ${count("fat")} zdrojov tuku (max 1)`);
    if (count("dairy") > 0 || count("fruit") > 0) v("main_sweet", `${slot}: mliečne/ovocie nepatrí do teplého hlavného jedla`);
    if (cats.includes("coldcut")) v("main_protein_count", `${slot}: údeniny nie sú hlavný zdroj bielkovín`);
  }
  if (!veg && cats.includes("legume") && (cats.includes("meat") || cats.includes("coldcut"))) v("legume_rule", `${slot}: strukoviny nepatria do jedla s mäsom/rybou`);
  if (slot === "ranajky") {
    if (count("protein") > 1) v("bf_protein", `${slot}: viac než 1 zdroj bielkovín (max 1 + mliečne)`);
    if (cats.includes("meat") || cats.includes("legume")) v("bf_meat", `${slot}: mäso/ryba/strukoviny nepatria na raňajky (len vajcia, údeniny, tofu, mliečne)`);
    if (count("starch") !== 1) v("bf_starch", `${slot}: ${count("starch")} príloh (presne 1: vločky/pečivo)`);
  }
  if (SNACK_SLOTS.includes(slot) && cats.some((c) => c === "grain" || c === "potato" || c === "legume" || c === "meat")) {
    v("snack_forbidden", `${slot}: uvarená príloha/mäso/strukoviny do desiaty nepatria`);
  }
  return out;
}

/** Skladba celého dňa: mliečne, opakovanie, strukoviny, ovocie + zelenina, formy potravín. */
function dayCompositionViolations(items: RuleItem[], diet?: DietType): Violation[] {
  const out: Violation[] = [];
  const v = (code: ViolationCode, detail: string) => out.push({ code, detail });
  const dairy = items.filter((i) => roleOfItem(i, diet) === "dairy").length;
  if (dairy > MAX_DAIRY_PER_DAY) v("dairy_day", `mliečne ${dairy}× za deň (max ${MAX_DAIRY_PER_DAY})`);
  const byKey = new Map<string, number>();
  const proteinKeys = new Map<string, number>();
  for (const it of items) {
    const key = foodKeyOf(it.baseName ?? it.name);
    byKey.set(key, (byKey.get(key) ?? 0) + 1);
    if (roleOfItem(it, diet) === "protein") proteinKeys.set(key, (proteinKeys.get(key) ?? 0) + 1);
  }
  for (const [k, n] of byKey) if (n > MAX_FOOD_REPEAT_PER_DAY) v("food_repeat", `${k} ${n}× za deň (max ${MAX_FOOD_REPEAT_PER_DAY})`);
  for (const [k, n] of proteinKeys) if (n > 1) v("protein_repeat", `zdroj bielkovín ${k} ${n}× za deň (max 1)`);
  if (!isVegDiet(diet) && items.filter((i) => itemCategory(i) === "legume").length > 1) v("legume_rule", "strukoviny najviac 1× za deň");
  const fv = items.filter((i) => { const r = roleOfItem(i, diet); return r === "vegetable" || r === "fruit"; }).reduce((s, i) => s + i.grams, 0);
  if (fv < FRUITVEG_HARD_MIN_G - 1e-9) v("fruitveg", `ovocie + zelenina ${r0(fv)} g (minimum ${FRUITVEG_HARD_MIN_G} g)`);
  const forms = new Map<string, Set<string>>();
  for (const it of items) {
    const name = it.baseName ?? it.name;
    const cat = itemCategory(it);
    if (cat !== "grain" && cat !== "grainDry" && cat !== "legume" && cat !== "potato") continue;
    const fam = foodFamilyOf(name);
    forms.set(fam, (forms.get(fam) ?? new Set()).add(isDryForm(name, cat) ? "dry" : "cooked"));
  }
  for (const [fam, f] of forms) if (f.size > 1) v("form_mix", `${fam}: suchá aj uvarená forma v jednom dni`);
  return out;
}

export function checkDay(items: RuleItem[], opts: CheckOptions): DayCheck {
  const t = opts.targets;
  const totals = dayTotals(items);
  const violations: Violation[] = [];
  const slotKcal = new Map<MealSlot, number>();
  for (const it of items) slotKcal.set(it.slot, (slotKcal.get(it.slot) ?? 0) + itemKcal(it));

  if (items.length === 0) {
    return { ok: false, violations: [{ code: "empty", detail: "deň je prázdny" }], totals, slotKcal };
  }

  const kcalDev = t.kcal > 0 ? (totals.kcal - t.kcal) / t.kcal : 0;
  if (Math.abs(kcalDev) > KCAL_DAY_TOL) {
    violations.push({ code: "kcal", detail: `energia ${r0(totals.kcal)} kcal, cieľ ${r0(t.kcal)} (${pctText(kcalDev)}, povolené ±5 %)` });
  }
  const pDev = t.proteinG > 0 ? (totals.proteinG - t.proteinG) / t.proteinG : 0;
  if (pDev < -PROTEIN_DAY_TOL_LOW || pDev > PROTEIN_DAY_TOL_HIGH) {
    violations.push({ code: "protein", detail: `bielkoviny ${r0(totals.proteinG)} g, cieľ ${r0(t.proteinG)} (${pctText(pDev)}, povolené −10 % až +15 %)` });
  }
  const fatShare = totals.kcal > 0 ? (totals.fatG * 9) / totals.kcal : 0;
  if (fatShare < FAT_MIN_SHARE) {
    violations.push({ code: "fat_share", detail: `tuky tvoria ${Math.round(fatShare * 100)} % energie (minimum 18 %)` });
  }
  for (const slot of opts.requiredSlots ?? []) {
    if (!slotKcal.has(slot)) violations.push({ code: "missing_slot", slot, detail: `chýba jedlo ${slot}` });
  }
  for (const [slot, k] of slotKcal) {
    const share = totals.kcal > 0 ? k / totals.kcal : 0;
    const { min, max } = slotShareRange(slot);
    if (share > Math.min(max, 0.4) + 1e-9 || share < min - 1e-9) {
      violations.push({
        code: "slot_share",
        slot,
        detail: `${slot} tvorí ${Math.round(share * 100)} % dennej energie (povolené ${Math.round(min * 100)}–${Math.round(Math.min(max, 0.4) * 100)} %)`,
      });
    }
  }

  // bielkoviny na jedlo: hlavné ≥ 25 g, raňajky ≥ 20 g, desiata ≥ 10 g (pri nízkom dennom cieli úmerne menej)
  const diet = opts.diet;
  const mins = mealProteinMins([...new Set([...(opts.requiredSlots ?? []), ...slotKcal.keys()])], t.proteinG);
  for (const slot of slotKcal.keys()) {
    const p = items.filter((i) => i.slot === slot).reduce((s, i) => s + itemProtein(i), 0);
    const min = mins.get(slot) ?? MIN_SNACK_PROTEIN_G;
    if (p < min - 1e-9) violations.push({ code: "slot_protein", slot, detail: `${slot} má len ${r0(p)} g bielkovín (minimum ${r0(min)} g) — pridaj zdroj bielkovín` });
  }

  // stropy na JEDNU položku, podiel jednej položky na jedle a skladba jedla
  const bySlot = new Map<MealSlot, RuleItem[]>();
  for (const it of items) bySlot.set(it.slot, [...(bySlot.get(it.slot) ?? []), it]);
  for (const [slot, list] of bySlot) {
    const mealKcal = list.reduce((s, i) => s + itemKcal(i), 0);
    for (const it of list) {
      const cat = itemCategory(it);
      if (it.grams > ITEM_CAP_G[cat] + 1e-9) violations.push({ code: "cap_item", slot, detail: `${it.name} v jedle ${slot}: ${r0(it.grams)} g (strop ${ITEM_CAP_G[cat]} g)` });
      const maxPieces = ITEM_MAX_PIECES[cat];
      if (maxPieces !== undefined && it.unit === "piece" && it.qty > maxPieces + 1e-9) violations.push({ code: "cap_item", slot, detail: `${it.name} v jedle ${slot}: ${it.qty} ks (max ${maxPieces} ks)` });
      if (it.grams < ITEM_MIN_G[cat] - 1e-9) violations.push({ code: "tiny_item", slot, detail: `${it.name} v jedle ${slot}: len ${r0(it.grams)} g (minimum ${ITEM_MIN_G[cat]} g)` });
      if (list.length >= 2 && !SNACK_SLOTS.includes(slot) && mealKcal > 0 && itemKcal(it) / mealKcal > MAX_ITEM_MEAL_SHARE + 1e-9) {
        violations.push({ code: "item_share", slot, detail: `${it.name} tvorí ${Math.round((itemKcal(it) / mealKcal) * 100)} % energie jedla ${slot} (max 60 %)` });
      }
    }
    const cats = list.map((i) => itemCategory(i));
    const meatItems = cats.filter((c) => c === "meat").length;
    const proteinItems = cats.filter((c) => isProteinCategory(c)).length;
    if (meatItems > MAX_MEAT_ITEMS_PER_MEAL || proteinItems > MAX_PROTEIN_ITEMS_PER_MEAL) {
      violations.push({ code: "too_many_protein", slot, detail: `${slot}: príliš veľa zdrojov bielkovín (${meatItems} druhov mäsa/rýb, ${proteinItems} bielkovinových položiek; max ${MAX_MEAT_ITEMS_PER_MEAL} / ${MAX_PROTEIN_ITEMS_PER_MEAL}) — vyber 1–2 hlavné a dorovnaj množstvom` });
    }
    const proteinFromProteinItems = list.reduce((s, i) => s + (isProteinCategory(itemCategory(i)) ? itemProtein(i) : 0), 0);
    if (MAIN_MEAL_SLOTS.includes(slot)) {
      const minSource = mainSourceMinG(t.proteinG);
      if (proteinFromProteinItems < minSource - 1e-9) violations.push({ code: "comp_protein", slot, detail: `${slot}: zdroj bielkovín dáva len ${r0(proteinFromProteinItems)} g (minimum ${r0(minSource)} g)` });
      if (!cats.some((c) => isCarbCategory(c))) violations.push({ code: "comp_carb", slot, detail: `${slot} nemá prílohu (ryža, cestoviny, zemiaky, pečivo, strukoviny)` });
      if (!cats.some((c) => c === "vegetable")) violations.push({ code: "comp_veg", slot, detail: `${slot} nemá zeleninu` });
    } else if (slot === "ranajky") {
      if (!cats.some((c) => isProteinCategory(c))) violations.push({ code: "comp_protein", slot, detail: `${slot} nemá zdroj bielkovín` });
      if (!cats.some((c) => isCarbCategory(c) || c === "fruit")) violations.push({ code: "comp_carb", slot, detail: `${slot} nemá zdroj sacharidov (ovsené vločky, pečivo, ovocie)` });
    } else if (list.length > MAX_SNACK_ITEMS) {
      violations.push({ code: "snack_items", slot, detail: `${slot} má ${list.length} položiek (max ${MAX_SNACK_ITEMS})` });
    }
    violations.push(...compositionViolations(slot, list, diet));
  }
  violations.push(...dayCompositionViolations(items, diet));

  // stropy na jedlo (kategória × slot) a na deň
  const perMeal = new Map<string, number>();
  const perDay = new Map<FoodCategory, number>();
  for (const it of items) {
    const cat = itemCategory(it);
    perMeal.set(`${cat}|${it.slot}`, (perMeal.get(`${cat}|${it.slot}`) ?? 0) + it.grams);
    perDay.set(cat, (perDay.get(cat) ?? 0) + it.grams);
  }
  for (const [key, g] of perMeal) {
    const [cat, slot] = key.split("|") as [FoodCategory, MealSlot];
    const cap = MEAL_CAP_G[cat];
    if (cap !== null && g > cap + 1e-9) violations.push({ code: "cap_meal", slot, detail: `${cat} v jedle ${slot}: ${r0(g)} g (strop ${cap} g)` });
  }
  for (const [cat, g] of perDay) {
    const cap = DAY_CAP_G[cat];
    if (cap !== undefined && g > cap + 1e-9) violations.push({ code: "cap_day", detail: `${cat} za deň: ${r0(g)} g (strop ${cap} g)` });
  }
  return { ok: violations.length === 0, violations, totals, slotKcal };
}

/** Týždenný priemer kcal ±3 % cieľa (počíta sa z dní, ktoré prešli). */
export function checkWeek(dayKcals: number[], targetKcal: number): { ok: boolean; avgDev: number } {
  if (dayKcals.length === 0 || targetKcal <= 0) return { ok: true, avgDev: 0 };
  const avg = dayKcals.reduce((a, b) => a + b, 0) / dayKcals.length;
  const avgDev = (avg - targetKcal) / targetKcal;
  return { ok: Math.abs(avgDev) <= KCAL_WEEK_TOL, avgDev };
}

// ---------------------------------------------------------------- mäkké upozornenia

export type SoftCode = "fiber" | "fruitveg" | "protein_meal" | "macro_split" | "fat_share";
export interface SoftWarning {
  code: SoftCode;
  /** 1-based dni, ktorých sa upozornenie týka */
  days: number[];
}

export const FRUITVEG_MIN_G = 400;
export const FIBER_MIN_G = 25;

/** Mäkké upozornenia po dňoch zlúčené podľa druhu (neblokujú ukladanie). */
export function softWarnings(days: { dayNo: number; items: RuleItem[] }[], targets?: MacroTargetsLike): SoftWarning[] {
  const found = new Map<SoftCode, number[]>();
  const add = (c: SoftCode, d: number) => found.set(c, [...(found.get(c) ?? []), d]);
  for (const { dayNo, items } of days) {
    if (items.length === 0) continue;
    const totals = dayTotals(items);
    // vláknina: len keď ju poznáme aspoň pri 80 % energie (knižnica ju nemusí mať vyplnenú)
    const known = items.filter((it) => it.fiber100 !== null && it.fiber100 !== undefined);
    const knownKcal = known.reduce((s, it) => s + itemKcal(it), 0);
    if (totals.kcal > 0 && knownKcal / totals.kcal >= 0.8) {
      const fiber = known.reduce((s, it) => s + ((it.fiber100 as number) * it.grams) / 100, 0);
      if (fiber < FIBER_MIN_G) add("fiber", dayNo);
    }
    const fv = items.filter((it) => isFruitVeg(itemCategory(it))).reduce((s, it) => s + it.grams, 0);
    if (fv < FRUITVEG_MIN_G) add("fruitveg", dayNo);
    {
      const share = totals.kcal > 0 ? (totals.fatG * 9) / totals.kcal : 0;
      const wanted = targets && targets.kcal > 0 ? Math.max(FAT_SOFT_SHARE, (targets.fatG * 9) / targets.kcal - 0.03) : FAT_SOFT_SHARE;
      if (share < wanted - 1e-9) add("fat_share", dayNo);
    }
    const bySlot = new Map<MealSlot, number>();
    for (const it of items) bySlot.set(it.slot, (bySlot.get(it.slot) ?? 0) + itemProtein(it));
    for (const [slot, p] of bySlot) {
      if (SNACK_SLOTS.includes(slot)) continue;
      if (p > Math.max(60, (targets?.proteinG ?? 0) * 0.4)) {
        add("protein_meal", dayNo);
        break;
      }
    }
    // makrá sú trénerov cieľ — upozorni len keď sa sacharidy/tuky líšia od cieľa o viac než 15 %
    if (targets && targets.carbsG > 0 && targets.fatG > 0) {
      const dev = (a: number, b: number) => Math.abs(a - b) / b;
      if (dev(totals.carbsG, targets.carbsG) > 0.15 || dev(totals.fatG, targets.fatG) > 0.15) add("macro_split", dayNo);
    }
  }
  return [...found.entries()].map(([code, d]) => ({ code, days: [...new Set(d)] }));
}

/** Najnižší bezpečný denný príjem: max(BMR, 1200 kcal ženy / 1500 kcal muži). null = nepoznáme pohlavie. */
export function safeMinKcal(sex: string | null | undefined, bmr: number | null | undefined): number | null {
  if (sex !== "muz" && sex !== "zena") return null;
  return Math.max(Number.isFinite(bmr) && bmr ? Number(bmr) : 0, sex === "zena" ? 1200 : 1500);
}

export function targetBelowSafeMin(kcal: number, sex: string | null | undefined, bmr: number | null | undefined): number | null {
  const min = safeMinKcal(sex, bmr);
  return min !== null && kcal < min ? Math.round(min) : null;
}

// ---------------------------------------------------------------- uložené položky (verify-after-save)

export interface SavedEntryLike {
  entry_id: string;
  food_name: string;
  meal_slot: string;
  grams: number;
  portion_unit?: string;
  portion_qty?: number;
  portion_base?: string;
  kcal_100g: number;
  protein_100g: number;
  carbs_100g: number;
  fat_100g: number;
}

/** Uložená položka jedálnička (snapshot z meal_days.meals) → RuleItem; jednotku ks/porcia/balenie zrekonštruuje z gramáže a množstva. */
export function savedEntryToItem(e: SavedEntryLike): RuleItem | null {
  if (!MEAL_SLOT_ORDER.includes(e.meal_slot as MealSlot)) return null;
  const base = e.portion_base === "ml" ? "ml" : "g";
  const grams = Number(e.grams);
  if (!(grams > 0)) return null;
  let unit: PortionUnit = base;
  let qty = grams;
  const portion: PortionFood = { unitBase: base };
  const pu = e.portion_unit;
  const pq = Number(e.portion_qty);
  if ((pu === "piece" || pu === "serving" || pu === "package") && pq > 0) {
    unit = pu;
    qty = pq;
    const per = grams / pq;
    if (pu === "piece") portion.pieceGrams = per;
    else if (pu === "serving") portion.servingGrams = per;
    else portion.packageGrams = per;
  } else if (pu === "ml" || pu === "g") {
    unit = base;
  }
  return {
    key: e.entry_id,
    baseName: e.food_name,
    name: e.food_name,
    slot: e.meal_slot as MealSlot,
    unit,
    qty,
    grams,
    kcal100: Number(e.kcal_100g),
    protein100: Number(e.protein_100g),
    carbs100: Number(e.carbs_100g),
    fat100: Number(e.fat_100g),
    portion,
  };
}

/** Gramáž pre množstvo (nikdy null: pri neplatnej jednotke padne na množstvo ako základnú jednotku). */
export function gramsFor(it: Pick<RuleItem, "unit" | "portion">, qty: number): number {
  return portionGrams(it.unit, qty, it.portion) ?? (it.unit === baseUnitOf(it.portion) ? Math.round(qty * 10) / 10 : qty);
}

// ---------------------------------------------------------------- sanity skóre (mäkké hodnotenie chuťovej a nutričnej zmysluplnosti)

export interface SanityResult {
  /** 0–100 (100 = bez výhrad) */
  score: number;
  notes: string[];
}

/**
 * Mäkké hodnotenie dňa nad rámec hard pravidiel: podiel tukov oproti cieľu trénera, rozloženie bielkovín medzi jedlá,
 * rozmanitosť, vláknina, značkové produkty namiesto základných potravín, suchá vs. uvarená forma. Slúži na porovnanie
 * dní a na diagnostiku (nič neblokuje).
 */
export function sanityScore(items: RuleItem[], opts: { targets: MacroTargetsLike; diet?: DietType }): SanityResult {
  const notes: string[] = [];
  let score = 100;
  const ding = (pts: number, note: string) => {
    score -= pts;
    notes.push(note);
  };
  const totals = dayTotals(items);
  if (items.length === 0 || totals.kcal <= 0) return { score: 0, notes: ["prázdny deň"] };
  const share = (totals.fatG * 9) / totals.kcal;
  const wanted = opts.targets.kcal > 0 ? (opts.targets.fatG * 9) / opts.targets.kcal : FAT_SOFT_SHARE;
  const dev = Math.abs(share - wanted);
  if (dev > 0.03) ding(Math.min(15, Math.round((dev - 0.03) * 150)), `tuky ${Math.round(share * 100)} % vs cieľ ${Math.round(wanted * 100)} %`);
  const bySlot = new Map<MealSlot, number>();
  for (const it of items) bySlot.set(it.slot, (bySlot.get(it.slot) ?? 0) + itemProtein(it));
  const meals = [...bySlot.entries()].filter(([s]) => !SNACK_SLOTS.includes(s)).map(([, p]) => p);
  if (meals.length > 1) {
    const avg = meals.reduce((a, b) => a + b, 0) / meals.length;
    const spread = Math.max(...meals) / Math.max(1, Math.min(...meals));
    if (avg > 0 && spread > 2) ding(8, "bielkoviny sú v jedlách nerovnomerne rozložené");
  }
  const distinct = new Set(items.map((i) => foodKeyOf(i.baseName ?? i.name))).size;
  if (distinct < items.length * 0.8) ding(8, "veľa opakovaných potravín");
  const known = items.filter((i) => i.fiber100 !== null && i.fiber100 !== undefined);
  if (known.length === items.length) {
    const fiber = known.reduce((s, i) => s + ((i.fiber100 as number) * i.grams) / 100, 0);
    if (fiber < FIBER_MIN_G) ding(6, `vláknina ${r0(fiber)} g`);
  }
  const branded = items.filter((i) => i.branded && ["meat", "egg", "grain", "grainDry", "potato", "fruit", "vegetable", "oil"].includes(itemCategory(i)));
  if (branded.length > 0) ding(Math.min(15, branded.length * 5), "značkový produkt namiesto základnej potraviny");
  const fv = items.filter((i) => { const r = roleOfItem(i, opts.diet); return r === "vegetable" || r === "fruit"; }).reduce((s, i) => s + i.grams, 0);
  if (fv < 500) ding(4, `ovocie + zelenina len ${r0(fv)} g (odporúčané 500 g)`);
  const fat = new Set(items.filter((i) => roleOfItem(i, opts.diet) === "fat").map((i) => itemCategory(i)));
  if (fat.size < 2 && items.filter((i) => roleOfItem(i, opts.diet) === "fat").length >= 2) ding(4, "tuky z jedného druhu (olej/orechy/avokádo striedať)");
  return { score: Math.max(0, Math.round(score)), notes };
}
