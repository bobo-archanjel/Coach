// FitPilot — AI generátor jedálničkov: plánovanie porcií KÓDOM (výmenný systém: skupiny potravín
// s porciami — ADA exchange lists, Precision Nutrition „ruka“) a NUTRIČNÉ PRAVIDLÁ skladby jedál.
// Model potraviny len VYBERIE; gramáž počíta kód:
//  1. planMeals: z denných cieľov a slotov urobí pre každé jedlo šablónu skupín (bielkovina, mliečne,
//     príloha, zelenina, ovocie, tuk) s cieľom bielkovín/sacharidov na jedlo.
//  2. pickProblem + completePicks: výber modelu sa overí podľa pravidiel skladby (1 bielkovina a 1 príloha
//     v hlavnom jedle, strukoviny, mliečne, opakovanie, formy potravín…); čo model nevybral alebo porušuje
//     pravidlá, doplní kód deterministicky a vždy v súlade s pravidlami.
//  3. composeDay: z vybraných potravín spočíta gramy (cieľové makro skupiny ÷ makro na gram potraviny,
//     sekundárne makrá sa odpočítajú iteráciou), zaokrúhli na prirodzené jednotky, ošetrí stropy a doplní
//     ovocie + zeleninu na 400 g.
//  4. fineTuneDay: greedy doladenie po JEDNOM kroku (5 g / 0,5 ks) na položkách dňa.
// Čisté funkcie bez siete — testované v e2e/mealRules.spec.ts.

import { normalize } from "@/lib/foodIndexCore";
import type { MealSlot } from "@/lib/meals";
import { baseUnitOf, portionGrams, type PortionFood, type PortionUnit } from "@/lib/portions";
import type { DietType, KnownFood, MacroTargets } from "./mealPlanValidation";
import {
  checkDay,
  DAY_CAP_G,
  FAT_MIN_SHARE,
  FAT_SOFT_SHARE,
  FRUITVEG_HARD_MIN_G,
  foodCategory,
  foodFamilyOf,
  foodKeyOf,
  gramsFor,
  idealSlotShares,
  isDryForm,
  isFish,
  isProteinCategory,
  isVegDiet,
  itemCategory,
  ITEM_CAP_G,
  ITEM_MAX_PIECES,
  ITEM_MIN_G,
  itemKcal,
  itemProtein,
  KCAL_DAY_TOL,
  MAIN_MEAL_SLOTS,
  MAX_DAIRY_PER_DAY,
  MAX_FOOD_REPEAT_PER_DAY,
  MAX_ITEM_MEAL_SHARE,
  MEAL_CAP_G,
  mainSourceMinG,
  mealProteinMins,
  PROTEIN_DAY_TOL_HIGH,
  PROTEIN_DAY_TOL_LOW,
  roleOfFood,
  roleOfItem,
  slotShareRange,
  SNACK_SLOTS,
  type CheckOptions,
  type DayCheck,
  type FoodCategory,
  type RuleItem,
} from "./mealRules";

// ---------------------------------------------------------------- skupiny potravín

export type PortionGroup = "protein" | "dairy" | "starch" | "vegetable" | "fruit" | "fat";
/** Poradie skupín v jedle (aj v zobrazení). */
export const PORTION_GROUPS: readonly PortionGroup[] = ["protein", "dairy", "starch", "vegetable", "fruit", "fat"];

type Foodish = Pick<KnownFood, "name" | "baseName" | "kcal100" | "protein100" | "carbs100" | "fat100" | "portion">;
const catOf = (f: Foodish): FoodCategory => foodCategory(f.baseName ?? f.name, f.kcal100);
const nameOf = (f: Foodish) => f.baseName ?? f.name;

/** Rezerva (g) nad minimom bielkovín jedla na zaokrúhlenie. */
const PROTEIN_MARGIN_G = 2;
/** Zelenina na hlavné jedlo (g) — „päsť“ ≈ 150 g, hlavné jedlo dostane o niečo viac (tvrdé minimum 150 g). */
export const VEG_MEAL_G = 200;
/** Ovocie + zelenina sa plánujú o toto viac než tvrdé minimum (rezerva na zaokrúhlenie). */
const FRUITVEG_PLAN_MARGIN_G = 30;
/** Tuky sa plánujú aspoň na tento podiel energie (tvrdé minimum pravidiel je nižšie). */
const FAT_TARGET_SHARE = FAT_SOFT_SHARE;

/**
 * Patrí potravina do skupiny? Kategória podľa názvu + minimálny obsah primárneho makra + diéta (strukoviny sú
 * bielkovina len pri vegetariánskej/vegánskej diéte, inak príloha). Syry patria len medzi tuky, mliečne len do „dairy“.
 */
export function fitsGroup(f: Foodish, g: PortionGroup, diet: DietType = "none"): boolean {
  const c = catOf(f);
  switch (g) {
    case "protein":
      return (c === "meat" || c === "egg" || c === "coldcut" || c === "tofu" || (c === "legume" && isVegDiet(diet))) && f.protein100 >= 6;
    case "dairy":
      return c === "dairy" && f.protein100 >= 3;
    case "starch":
      return (c === "grain" || c === "grainDry" || c === "bread" || c === "potato" || (c === "legume" && !isVegDiet(diet))) && f.carbs100 >= 10;
    case "vegetable":
      return c === "vegetable";
    case "fruit":
      return c === "fruit" && f.fat100 < 10;
    case "fat":
      return f.fat100 >= 15 && roleOfFood(nameOf(f), c, f.fat100, diet) === "fat";
  }
}

/** Skupiny, do ktorých potravina patrí (na označenie v zozname pre model). */
export const groupsOfFood = (f: KnownFood, diet: DietType = "none", libGroups?: ReadonlySet<PortionGroup>): PortionGroup[] =>
  PORTION_GROUPS.filter((g) => fitsGroup(f, g, diet) && !(f.source === "off" && libGroups?.has(g) && !OFF_OK_CATEGORIES.has(catOf(f))));

/** Skupiny, ktoré pool vie pokryť. */
export function availableGroups(pool: readonly Foodish[], diet: DietType = "none"): Set<PortionGroup> {
  return new Set(PORTION_GROUPS.filter((g) => pool.some((f) => fitsGroup(f, g, diet))));
}

// ---------------------------------------------------------------- porcie a jednotky

type Cls = "p" | "c" | "f" | "v";
const CLASS_OF: Record<PortionGroup, Cls> = { protein: "p", dairy: "p", starch: "c", fruit: "c", fat: "f", vegetable: "v" };
const per100 = (f: Foodish, cls: Cls) => (cls === "p" ? f.protein100 : cls === "c" ? f.carbs100 : cls === "f" ? f.fat100 : 0);

/** V kusoch sa ponúkajú len vajcia, pečivo a ovocie (ostatné v gramoch). */
const usesPieces = (cat: FoodCategory, portion: PortionFood) => (cat === "egg" || cat === "bread" || cat === "fruit") && (portion.pieceGrams ?? 0) > 0;
const pieceStep = (cat: FoodCategory) => (cat === "egg" ? 1 : 0.5);

/** Najviac gramov jednej položky (strop kategórie, pri kusoch aj max. počet kusov). */
export function maxGramsOf(cat: FoodCategory, portion: PortionFood): number {
  const maxPieces = ITEM_MAX_PIECES[cat];
  const pg = portion.pieceGrams ?? 0;
  return maxPieces && pg > 0 && usesPieces(cat, portion) ? Math.min(ITEM_CAP_G[cat], maxPieces * pg) : ITEM_CAP_G[cat];
}

interface Portion {
  unit: PortionUnit;
  qty: number;
  grams: number;
}

/**
 * Gramy → prirodzená porcia: kusy (vajce celé, pečivo/ovocie po 0,5), inak g/ml po 5. `mode: "round"` =
 * najbližší krok, `"floor"` = nadol; vždy v rozsahu minimum ≤ porcia ≤ strop (minimum má prednosť pred 1 krokom).
 */
function portionAt(cat: FoodCategory, portion: PortionFood, grams: number, mode: "round" | "floor" = "round"): Portion {
  const pieces = usesPieces(cat, portion);
  const unit: PortionUnit = pieces ? "piece" : baseUnitOf(portion);
  const step = pieces ? pieceStep(cat) : 5;
  const stepG = pieces ? (portion.pieceGrams as number) * step : step;
  const cap = maxGramsOf(cat, portion);
  const raw = grams / stepG;
  let n = mode === "floor" ? Math.floor(raw + 1e-9) : Math.round(raw);
  n = Math.max(n, Math.ceil(ITEM_MIN_G[cat] / stepG - 1e-9), 1);
  while (n > 1 && n * stepG > cap + 1e-9) n--;
  const qty = Math.round(n * step * 100) / 100;
  return { unit, qty, grams: portionGrams(unit, qty, portion) ?? qty };
}

const stepOf = (it: RuleItem): number => (it.unit === baseUnitOf(it.portion) ? 5 : pieceStep(itemCategory(it)));

function refit(it: RuleItem, grams: number, mode: "round" | "floor"): RuleItem {
  const p = portionAt(itemCategory(it), it.portion, grams, mode);
  return { ...it, unit: p.unit, qty: p.qty, grams: p.grams };
}

// ---------------------------------------------------------------- 1. plán jedál (šablóny)

export interface PlannedGroup {
  group: PortionGroup;
  /** odporúčaný počet potravín v skupine */
  picks: number;
  /** podiel skupiny na makre svojej triedy v jedle (bielkoviny: protein + dairy; sacharidy: starch + fruit) */
  share: number;
}

export interface PlannedMeal {
  slot: MealSlot;
  /** podiel jedla na dennej energii */
  share: number;
  kcal: number;
  proteinG: number;
  carbsG: number;
  groups: PlannedGroup[];
}

/** Tuky dňa, ktoré kód plánuje: cieľ trénera, najmenej však FAT_TARGET_SHARE energie. */
export const targetFat = (t: MacroTargets): number => Math.max(t.fatG, (t.kcal * FAT_TARGET_SHARE) / 9);

/** Koľko potravín smie byť v skupine daného jedla (nutričné pravidlá skladby). */
export function maxPicks(slot: MealSlot, group: PortionGroup): number {
  if (MAIN_MEAL_SLOTS.includes(slot)) return group === "vegetable" ? 2 : 1;
  if (slot === "ranajky") return 1;
  return group === "fruit" ? 2 : 1;
}

/** Denné bielkoviny podľa podielu energie jedla, každé jedlo aspoň svoje minimum + rezerva (zvyšok sa prerozdelí). */
function splitProtein(total: number, slots: MealSlot[], shares: Map<MealSlot, number>): Map<MealSlot, number> {
  const mins = mealProteinMins(slots, total);
  const floor = (s: MealSlot) => (mins.get(s) ?? 0) + PROTEIN_MARGIN_G;
  const out = new Map<MealSlot, number>();
  const floors = slots.reduce((s, x) => s + floor(x), 0);
  if (total <= floors) {
    for (const s of slots) out.set(s, (total * floor(s)) / floors);
    return out;
  }
  const fixed = new Set<MealSlot>();
  for (let round = 0; round <= slots.length; round++) {
    const free = slots.filter((s) => !fixed.has(s));
    const left = total - [...fixed].reduce((s, x) => s + floor(x), 0);
    const freeShare = free.reduce((s, x) => s + (shares.get(x) ?? 0), 0);
    let changed = false;
    for (const s of free) {
      const p = (left * (shares.get(s) ?? 0)) / freeShare;
      if (p < floor(s)) {
        fixed.add(s);
        changed = true;
      } else out.set(s, p);
    }
    if (!changed) break;
  }
  for (const s of fixed) out.set(s, floor(s));
  return out;
}

type Weighted = [PortionGroup, number];

/** Dostupné skupiny triedy, váhy prepočítané na súčet 1; ak žiadna nie je, použije sa náhrada. */
function pickClass(list: Weighted[], avail: ReadonlySet<PortionGroup>, alt: PortionGroup[]): PlannedGroup[] {
  let live = list.filter(([g]) => avail.has(g));
  if (live.length === 0) {
    const g = alt.find((x) => avail.has(x));
    live = g ? [[g, 1]] : [];
  }
  const total = live.reduce((s, [, w]) => s + w, 0);
  return live.map(([group, w]) => ({ group, share: w / total, picks: 1 }));
}

/**
 * Šablóna dňa: pre každé jedlo skupiny potravín a cieľ bielkovín/sacharidov. Hlavné jedlo = bielkovina +
 * príloha + zelenina + tuk; raňajky = bielkovina + mliečne + príloha + ovocie (+ tuk); desiata/olovrant =
 * mliečne (alebo bielkovina) + ovocie (+ orechy pri vyššom cieli tukov, pečivo pri vyššom cieli sacharidov).
 * Mliečne najviac 3× za deň (raňajky + 2 desiaty), ďalšie desiaty majú bielkovinu. Skupina, ktorú pool
 * nemá (diéta), sa vynechá.
 */
export function planMeals(targets: MacroTargets, slots: MealSlot[], avail: ReadonlySet<PortionGroup> = new Set(PORTION_GROUPS)): PlannedMeal[] {
  const shares = idealSlotShares(slots);
  const fat = targetFat(targets);
  // sacharidy z energie (nie z poľa trénera) — kcal je jediný cieľ, ktorý musí sedieť
  const carbs = Math.max(0, (targets.kcal - 4 * targets.proteinG - 9 * fat) / 4);
  const protein = splitProtein(targets.proteinG, slots, shares);
  const fatShare = targets.kcal > 0 ? (fat * 9) / targets.kcal : 0;
  let dairyLeft = MAX_DAIRY_PER_DAY;
  return slots.map((slot) => {
    const share = shares.get(slot) ?? 0;
    const p = protein.get(slot) ?? 0;
    const c = carbs * share;
    const main = MAIN_MEAL_SLOTS.includes(slot);
    const breakfast = slot === "ranajky";
    const snack = !main && !breakfast;
    const useDairy = (breakfast || snack) && dairyLeft > 0 && avail.has("dairy");
    if (useDairy) dairyLeft--;
    const pClass: Weighted[] = main ? [["protein", 1]] : breakfast ? [["dairy", 0.4], ["protein", 0.6]] : useDairy ? [["dairy", 1]] : [["protein", 1]];
    const cClass: Weighted[] = main ? [["starch", 1]] : breakfast ? [["fruit", 0.25], ["starch", 0.75]] : c > 45 ? [["fruit", 0.5], ["starch", 0.5]] : [["fruit", 1]];
    // bez dostupných mliečnych (vegán bez náhrady) ostane na raňajky/desiatu bielkovina, nikdy viac než 3 mliečne za deň
    const groups: PlannedGroup[] = [
      ...pickClass(pClass, avail, main ? [] : ["protein"]).filter((g) => g.group !== "dairy" || useDairy),
      ...pickClass(cClass, avail, ["starch", "fruit"]),
      ...(main && avail.has("vegetable") ? [{ group: "vegetable" as const, share: 1, picks: 1 }] : []),
      ...((main || breakfast || (snack && fatShare >= 0.25)) && avail.has("fat") ? [{ group: "fat" as const, share: 1, picks: 1 }] : []),
    ].sort((a, b) => PORTION_GROUPS.indexOf(a.group) - PORTION_GROUPS.indexOf(b.group));
    return { slot, share, kcal: 4 * p + 4 * c + 9 * fat * share, proteinG: p, carbsG: c, groups };
  });
}

// ---------------------------------------------------------------- 2. výber potravín (kontrola a doplnenie kódom)

/** Vybrané potraviny po jedlách a skupinách (počet podľa maxPicks). */
export type DayPicks = Map<MealSlot, Partial<Record<PortionGroup, KnownFood[]>>>;

export interface PickCtx {
  diet: DietType;
  /** skupiny, v ktorých má pool aj základné (knižničné) potraviny — značkový produkt tam nie je vhodný pre základné potraviny */
  libGroups?: ReadonlySet<PortionGroup>;
}

/** Značkové (OFF) produkty sa hodia najmä na mliečne, pečivo, údeniny, syry a ostatné balené; základné potraviny majú byť z knižnice. */
const OFF_OK_CATEGORIES: ReadonlySet<FoodCategory> = new Set(["dairy", "cheese", "bread", "coldcut", "tofu", "other", "nuts"]);

const allPicked = (picks: DayPicks): KnownFood[] => [...picks.values()].flatMap((g) => Object.values(g).flatMap((foods) => foods ?? []));
const sameForm = (f: KnownFood) => isDryForm(nameOf(f), catOf(f));

/**
 * Prečo potravina NESMIE do skupiny daného jedla (alebo null = smie). Nutričné pravidlá skladby: skupina
 * a počet potravín v jedle, mäso/strukoviny/príloha na raňajkách a desiatu, strukoviny a mäso, jedna potravina
 * najviac 2× za deň, rovnaký zdroj bielkovín najviac 1×, mliečne ≤ 3 za deň, suchá a uvarená forma v jednom dni.
 * `picks` obsahuje už vybrané potraviny celého dňa (aj rozpracované jedlo).
 */
export function pickProblem(food: KnownFood, slot: MealSlot, group: PortionGroup, picks: DayPicks, ctx: PickCtx): string | null {
  const cat = catOf(food);
  const veg = isVegDiet(ctx.diet);
  const main = MAIN_MEAL_SLOTS.includes(slot);
  const bf = slot === "ranajky";
  const snack = !main && !bf;
  if (!fitsGroup(food, group, ctx.diet)) return `${food.name} (${food.ref}) nepatrí do skupiny ${group}${cat === "legume" && !veg && group === "protein" ? " (strukoviny sú bielkovina len pri vegetariánskej/vegánskej diéte)" : ""}`;
  if (food.source === "off" && ctx.libGroups?.has(group) && !OFF_OK_CATEGORIES.has(cat)) return `${food.name} je značkový produkt — na základnú potravinu použi knižničnú`;
  const meal = picks.get(slot) ?? {};
  const inGroup = meal[group] ?? [];
  if (inGroup.some((f) => f.ref === food.ref)) return `${food.name} je v skupine ${group} jedla ${slot} už vybraná`;
  if (inGroup.length >= maxPicks(slot, group)) return `v skupine ${group} jedla ${slot} smie byť najviac ${maxPicks(slot, group)} potravina`;
  if (main && cat === "coldcut") return `${food.name}: údeniny nie sú hlavný zdroj bielkovín obeda/večere`;
  if (bf && (cat === "meat" || cat === "legume")) return `${food.name}: mäso, ryby a strukoviny nepatria na raňajky (vajcia, údeniny, tofu, mliečne)`;
  if (snack && (cat === "grain" || cat === "potato" || cat === "legume" || cat === "meat")) return `${food.name}: uvarená príloha, mäso a strukoviny nepatria do desiaty`;
  const mealFoods = Object.values(meal).flatMap((f) => f ?? []);
  const meat = (c: FoodCategory) => c === "meat" || c === "coldcut";
  if (!veg && ((cat === "legume" && mealFoods.some((f) => meat(catOf(f)))) || (meat(cat) && mealFoods.some((f) => catOf(f) === "legume")))) {
    return `${food.name}: strukoviny sa nekombinujú s mäsom/rybou v jednom jedle`;
  }
  const all = allPicked(picks);
  const key = foodKeyOf(nameOf(food));
  if (all.filter((f) => foodKeyOf(nameOf(f)) === key).length >= MAX_FOOD_REPEAT_PER_DAY) return `${food.name} už je v dni ${MAX_FOOD_REPEAT_PER_DAY}× (max ${MAX_FOOD_REPEAT_PER_DAY}×)`;
  if (roleOfFood(nameOf(food), cat, food.fat100, ctx.diet) === "protein" && all.some((f) => foodKeyOf(nameOf(f)) === key)) return `${food.name}: ten istý zdroj bielkovín sa v dni používa najviac raz`;
  if (cat === "dairy" && all.filter((f) => catOf(f) === "dairy").length >= MAX_DAIRY_PER_DAY) return `mliečne najviac ${MAX_DAIRY_PER_DAY}× za deň`;
  if (!veg && cat === "legume" && all.some((f) => catOf(f) === "legume")) return `strukoviny najviac 1× za deň`;
  if (cat === "grain" || cat === "grainDry" || cat === "legume" || cat === "potato") {
    const fam = foodFamilyOf(nameOf(food));
    if (all.some((f) => foodFamilyOf(nameOf(f)) === fam && ["grain", "grainDry", "legume", "potato"].includes(catOf(f)) && sameForm(f) !== sameForm(food))) {
      return `${food.name}: suchá a uvarená forma tej istej potraviny nejdú spolu v jednom dni`;
    }
  }
  return null;
}

/** Koľko primárneho makra skupiny vie potravina dať pri strope porcie (zelenina: gramy). */
function capacityOf(f: KnownFood, group: PortionGroup): number {
  const max = maxGramsOf(catOf(f), f.portion);
  return group === "vegetable" ? max : (max * per100(f, CLASS_OF[group])) / 100;
}

/** Vybraná potravina musí pri strope porcie pokryť aspoň tento podiel cieľa skupiny (inak je príliš slabá); sacharidy prísnejšie (jedlo je jedna príloha). */
const coverOf = (group: PortionGroup) => (CLASS_OF[group] === "c" ? 0.85 : 0.6);

/** Raňajkové prílohy (vločky, müsli, kaša, pečivo); suchá ryža alebo cestoviny na raňajky nie. */
const BREAKFAST_STARCH = /(ovsen|vlock|musli|granola|kasa|jahl|chlieb|chleb|pecivo|rozok|toast)/;

/**
 * Nevhodnosť potraviny pre jedlo (0 = najvhodnejšia) — chuťové a kulinárske preferencie pri doplnení kódom:
 * olej na teplé jedlá a orechy na raňajky/desiatu, vajcia na raňajky, vločky na raňajky, uvarené obilniny
 * v hlavnom jedle (nie suché), základné potraviny z knižnice pred značkovými.
 */
function unfitness(f: KnownFood, slot: MealSlot, group: PortionGroup): number {
  const c = catOf(f);
  const main = MAIN_MEAL_SLOTS.includes(slot);
  const brand = f.source === "off" ? 1 : 0;
  let u = 0;
  if (group === "protein") {
    if (main) u = c === "egg" ? 1 : 0;
    else if (slot === "ranajky") u = c === "tofu" ? 1 : 0;
    else u = c === "egg" || c === "tofu" ? 1 : 0;
  } else if (group === "starch") {
    if (main) u = (c === "grainDry" ? 1 : 0) + (c === "legume" && sameForm(f) ? 1 : 0);
    else if (slot === "ranajky") u = BREAKFAST_STARCH.test(normalize(nameOf(f))) || c === "bread" ? 0 : 2;
    else u = c === "bread" ? 0 : 1;
  } else if (group === "fat") {
    // teplé hlavné jedlá: olivový olej (aj avokádo), orechy/semienka radšej na raňajky a desiatu; syr je v oboch len náhrada
    if (main) u = c === "oil" || c === "avocado" ? 0 : c === "cheese" ? 1 : 2;
    else u = c === "nuts" || c === "avocado" ? 0 : c === "cheese" ? 1 : 2;
  }
  return u * 2 + brand;
}

/** Odhad cieľa skupiny v jedle (primárne makro), z ktorého sa posudzuje, či vybraná potravina stačí. */
function estimateGroupTarget(meal: PlannedMeal, pg: PlannedGroup): number {
  const cls = CLASS_OF[pg.group];
  if (cls === "p") return meal.proteinG * pg.share;
  if (cls === "c") return meal.carbsG * pg.share;
  return 0;
}

export interface CompleteOpts extends PickCtx {
  /** kľúče (foodKeyOf) hlavných bielkovín predchádzajúceho dňa — nepoužiť znova, ak sa dá */
  avoid?: ReadonlySet<string>;
  /** hlavná bielkovina prvého hlavného jedla má byť ryba (týždenné minimum rýb) */
  forceFish?: boolean;
}

/** Kľúče hlavných (obed/večera) zdrojov bielkovín dňa. */
export function mainProteinKeys(picks: DayPicks): Set<string> {
  const out = new Set<string>();
  for (const slot of MAIN_MEAL_SLOTS) for (const f of picks.get(slot)?.protein ?? []) out.add(foodKeyOf(nameOf(f)));
  return out;
}

/** Je v hlavných jedlách dňa ryba? */
export const dayHasFish = (picks: DayPicks): boolean => MAIN_MEAL_SLOTS.some((slot) => (picks.get(slot)?.protein ?? []).some((f) => isFish(nameOf(f))));

/**
 * Zloží deň z výberu modelu a poolu tak, aby bol VŽDY v súlade s pravidlami skladby: výber modelu sa použije len
 * tam, kde prechádza `pickProblem` a dokáže pokryť porciu; zvyšok doplní kód deterministicky (preferencie
 * `unfitness`, základné potraviny pred značkovými, nepoužité potraviny pred opakovanými, striedanie podľa
 * `dayIndex`, bez hlavných bielkovín predchádzajúceho dňa). Vráti nový výber a počet potravín doplnených kódom.
 */
export function completePicks(plan: PlannedMeal[], picks: DayPicks, pool: readonly KnownFood[], dayIndex: number, opts: CompleteOpts): { picks: DayPicks; plan: PlannedMeal[]; added: number } {
  const out: DayPicks = new Map(plan.map((m) => [m.slot, {}]));
  const outPlan: PlannedMeal[] = plan.map((m) => ({ ...m, groups: [...m.groups] }));
  const firstMain = plan.find((m) => MAIN_MEAL_SLOTS.includes(m.slot))?.slot;
  let added = 0;
  outPlan.forEach((meal, mi) => {
    const mealPicks = out.get(meal.slot)!;
    const fillGroup = (pg: PlannedGroup): KnownFood[] => {
      const have: KnownFood[] = [];
      mealPicks[pg.group] = have;
      const est = estimateGroupTarget(meal, pg);
      const mainProtein = MAIN_MEAL_SLOTS.includes(meal.slot) && pg.group === "protein";
      const wantFish = !!opts.forceFish && meal.slot === firstMain && pg.group === "protein";
      const avoided = (f: KnownFood) => mainProtein && !!opts.avoid?.has(foodKeyOf(nameOf(f)));
      const modelFoods = picks.get(meal.slot)?.[pg.group] ?? [];

      // 1. výber modelu, ak vyhovuje pravidlám, pokryje porciu a nie je to včerajšia hlavná bielkovina
      for (const f of modelFoods) {
        if (have.length >= maxPicks(meal.slot, pg.group)) break;
        if (wantFish && !isFish(nameOf(f))) continue;
        if (avoided(f) || pickProblem(f, meal.slot, pg.group, out, opts)) continue;
        if (have.length === 0 && est > 0 && capacityOf(f, pg.group) < est * coverOf(pg.group)) continue;
        have.push(f);
      }
      // 2. doplnenie kódom (aspoň jedna potravina v skupine šablóny)
      if (have.length === 0) {
        const choose = (fish: boolean, honourAvoid: boolean, needCapacity: boolean): KnownFood | null => {
          const cands = pool.filter((f) => !pickProblem(f, meal.slot, pg.group, out, opts) && (!fish || isFish(nameOf(f))) && (!honourAvoid || !avoided(f)));
          if (cands.length === 0) return null;
          const tier = (f: KnownFood) => unfitness(f, meal.slot, pg.group);
          const bestTier = Math.min(...cands.map(tier));
          const inTier = cands.filter((f) => tier(f) === bestTier).sort((a, b) => a.ref.localeCompare(b.ref, "en", { numeric: true }));
          const dayKeys = new Set(allPicked(out).map((f) => foodKeyOf(nameOf(f))));
          const fresh = inTier.filter((f) => !dayKeys.has(foodKeyOf(nameOf(f))));
          const list0 = fresh.length > 0 ? fresh : inTier;
          const enough = list0.filter((f) => est <= 0 || capacityOf(f, pg.group) >= est * coverOf(pg.group));
          if (needCapacity && enough.length === 0) return null;
          const list = enough.length > 0 ? enough : [list0.slice().sort((a, b) => capacityOf(b, pg.group) - capacityOf(a, pg.group))[0]];
          return list[(dayIndex + mi) % list.length];
        };
        // poradie: dostatočne silná potravina bez včerajšej bielkoviny → dostatočne silná aj včerajšia → slabšia, ale nová → čokoľvek
        const attempts: [boolean, boolean][] = [[true, true], [false, true], [true, false], [false, false]];
        let f: KnownFood | null = null;
        if (wantFish) for (const [avoid, cap] of attempts) f ??= choose(true, avoid, cap);
        for (const [avoid, cap] of attempts) f ??= choose(false, avoid, cap);
        if (f) {
          have.push(f);
          added++;
        }
      }
      if (have.length === 0) delete mealPicks[pg.group];
      return have;
    };
    meal.groups.forEach((pg, gi) => {
      // desiata, na ktorú sa nedostalo mliečne (málo druhov v poole), dostane namiesto neho bielkovinu (vajce, údeninu, tofu)
      if (fillGroup(pg).length === 0 && pg.group === "dairy" && !MAIN_MEAL_SLOTS.includes(meal.slot) && meal.slot !== "ranajky") {
        const swapped: PlannedGroup = { ...pg, group: "protein" };
        if (fillGroup(swapped).length > 0) meal.groups[gi] = swapped;
      }
    });
    meal.groups = meal.groups.filter((pg) => (mealPicks[pg.group]?.length ?? 0) > 0 || MAIN_MEAL_SLOTS.includes(meal.slot));
  });
  return { picks: out, plan: outPlan, added };
}

// ---------------------------------------------------------------- 3. gramáž z výberu

interface Entry {
  mealIdx: number;
  slot: MealSlot;
  group: PortionGroup;
  food: KnownFood;
  cat: FoodCategory;
  cls: Cls;
  /** váha medzi potravinami svojej triedy v jedle (podiel skupiny ÷ počet potravín skupiny) */
  w: number;
  grams: number;
  cap: number;
}

/** Rozdelí `total` medzi položky podľa váh, žiadna nad svojou kapacitou (prebytok ide ostatným). */
function waterFill(weights: number[], caps: number[], total: number): number[] {
  const out = weights.map(() => 0);
  let free = weights.map((_, i) => i);
  let left = Math.max(0, total);
  while (free.length > 0 && left > 1e-9) {
    const sum = free.reduce((s, i) => s + weights[i], 0);
    if (sum <= 0) break;
    const full = free.filter((i) => (left * weights[i]) / sum >= caps[i]);
    if (full.length === 0) {
      for (const i of free) out[i] = (left * weights[i]) / sum;
      break;
    }
    for (const i of full) {
      out[i] = caps[i];
      left -= caps[i];
    }
    free = free.filter((i) => !full.includes(i));
  }
  return out;
}

const macroG = (e: Entry, cls: Cls) => (e.grams * per100(e.food, cls)) / 100;

/**
 * Výber → položky dňa. Gramy sa počítajú z cieľa makra skupiny ÷ makro na gram potraviny; bielkoviny,
 * sacharidy aj tuky sa odpočítavajú navzájom (kuracie má tuk, ryža bielkoviny…), preto 4 priechody.
 * Potom doplnenie ovocia + zeleniny na 400 g, zaokrúhlenie na prirodzené jednotky, stropy (jedlo/deň)
 * a vypustenie nepatrného tuku.
 */
export function composeDay(plan: PlannedMeal[], picks: DayPicks, targets: MacroTargets, diet: DietType = "none"): RuleItem[] {
  const entries: Entry[] = [];
  plan.forEach((meal, mealIdx) => {
    for (const pg of meal.groups) {
      const chosen = (picks.get(meal.slot)?.[pg.group] ?? []).slice(0, maxPicks(meal.slot, pg.group));
      for (const [fi, food] of chosen.entries()) {
        const cat = catOf(food);
        const cls = CLASS_OF[pg.group];
        const cap = maxGramsOf(cat, food.portion);
        const w = pg.share * (chosen.length === 1 || cls === "v" ? 1 / chosen.length : fi === 0 ? 0.65 : 0.35); // prvá potravina je hlavná
        entries.push({ mealIdx, slot: meal.slot, group: pg.group, food, cat, cls, w, cap, grams: cls === "v" ? Math.min(cap, VEG_MEAL_G * w) : 0 });
      }
    }
  });
  // denný strop kategórie (olej, orechy, vajcia) sa delí medzi jej položky, aby prebytok išiel iným potravinám
  const capOf = (e: Entry) => Math.min(e.cap, (DAY_CAP_G[e.cat] ?? Infinity) / entries.filter((x) => x.cat === e.cat).length);
  const fill = (list: Entry[], cls: Cls, target: number, weight: (e: Entry) => number) => {
    const live = list.filter((e) => per100(e.food, cls) > 0);
    const amounts = waterFill(live.map(weight), live.map((e) => (capOf(e) * per100(e.food, cls)) / 100), target);
    live.forEach((e, i) => (e.grams = (amounts[i] * 100) / per100(e.food, cls)));
  };
  const dayFat = targetFat(targets);
  const mins = mealProteinMins(plan.map((m) => m.slot), targets.proteinG);
  // tuky sa plánujú na úrovni dňa (nie každé jedlo má tukovú položku); váha = podiel jedla na energii.
  // Nepatrná tuková porcia („3 g oleja“) sa vypustí a tuky sa rozdelia medzi zvyšné.
  const fillFat = (dropTiny: boolean) => {
    for (;;) {
      const fats = entries.filter((e) => e.cls === "f");
      const otherFat = entries.filter((e) => e.cls !== "f").reduce((s, e) => s + macroG(e, "f"), 0);
      fill(fats, "f", dayFat - otherFat, (e) => e.w * plan[e.mealIdx].share);
      const tiny = fats.filter((e) => e.grams < ITEM_MIN_G[e.cat] * 0.6).sort((a, b) => a.grams - b.grams)[0];
      if (!tiny || !dropTiny) return;
      entries.splice(entries.indexOf(tiny), 1);
    }
  };
  for (let pass = 0; pass < 4; pass++) {
    plan.forEach((meal, mealIdx) => {
      const mine = entries.filter((e) => e.mealIdx === mealIdx);
      const other = (cls: Cls) => mine.filter((e) => e.cls !== cls).reduce((s, e) => s + macroG(e, cls), 0);
      // bielkoviny jedla aspoň na tvrdé minimum (+ rezerva) a zdroj bielkovín hlavného jedla aspoň na jeho minimum
      const need = (mins.get(meal.slot) ?? 0) + PROTEIN_MARGIN_G - other("p");
      const floor = Math.max(meal.proteinG * 0.5, need, MAIN_MEAL_SLOTS.includes(meal.slot) ? mainSourceMinG(targets.proteinG) + PROTEIN_MARGIN_G : 0);
      fill(mine.filter((e) => e.cls === "p"), "p", Math.max(meal.proteinG - other("p"), floor), (e) => e.w);
      fill(mine.filter((e) => e.cls === "c"), "c", Math.max(meal.carbsG - other("c"), 0), (e) => e.w);
    });
    fillFat(false);
  }
  // ovocie + zelenina aspoň FRUITVEG_HARD_MIN_G (+ rezerva): najprv zelenina do stropu položky, potom ovocie
  const fvTotal = () => entries.filter((e) => e.group === "vegetable" || e.group === "fruit").reduce((s, e) => s + e.grams, 0);
  for (const group of ["vegetable", "fruit"] as const) {
    const list = entries.filter((e) => e.group === group);
    const need = FRUITVEG_HARD_MIN_G + FRUITVEG_PLAN_MARGIN_G - fvTotal();
    if (need <= 0 || list.length === 0) continue;
    const add = waterFill(list.map(() => 1), list.map((e) => Math.max(0, e.cap - e.grams)), need);
    list.forEach((e, i) => (e.grams += add[i]));
  }
  // po zaokrúhlení ostatných položiek (vajce celé, kroky po 5 g) sa tuky dopočítajú z toho, čo skutočne ostalo
  for (const e of entries) if (e.cls !== "f") e.grams = e.grams > 0 ? portionAt(e.cat, e.food.portion, e.grams).grams : ITEM_MIN_G[e.cat];
  fillFat(true);

  const items: RuleItem[] = [];
  for (const e of entries) {
    if (e.grams <= 0 && e.cls !== "v") e.grams = ITEM_MIN_G[e.cat];
    const p = portionAt(e.cat, e.food.portion, e.grams);
    items.push({
      key: `${e.slot}-${items.length}`,
      ref: e.food.ref,
      baseName: e.food.baseName ?? e.food.name,
      name: e.food.name,
      slot: e.slot,
      unit: p.unit,
      qty: p.qty,
      grams: p.grams,
      kcal100: e.food.kcal100,
      protein100: e.food.protein100,
      carbs100: e.food.carbs100,
      fat100: e.food.fat100,
      fiber100: e.food.fiber100 ?? null,
      portion: e.food.portion,
      branded: e.food.source === "off",
    });
  }
  return ensureFruitVeg(enforceCaps(items), diet);
}

/** Strop kategórie v jedle a za deň: položky sa úmerne zmenšia (nadol na krok). */
export function enforceCaps(input: RuleItem[]): RuleItem[] {
  let items = input;
  const shrink = (match: (it: RuleItem) => boolean, cap: number) => {
    const sum = items.filter(match).reduce((s, it) => s + it.grams, 0);
    if (sum <= cap + 1e-9) return;
    const f = cap / sum;
    items = items.map((it) => (match(it) ? refit(it, it.grams * f, "floor") : it));
  };
  for (const [cat, cap] of Object.entries(MEAL_CAP_G) as [FoodCategory, number | null][]) {
    if (cap === null) continue;
    for (const slot of new Set(items.map((it) => it.slot))) shrink((it) => it.slot === slot && itemCategory(it) === cat, cap);
  }
  for (const [cat, cap] of Object.entries(DAY_CAP_G) as [FoodCategory, number][]) shrink((it) => itemCategory(it) === cat, cap);
  return items;
}

/** Ovocie + zelenina aspoň FRUITVEG_HARD_MIN_G: po zaokrúhlení a stropoch sa chýbajúce gramy doplnia po 25 g (zelenina, potom ovocie). */
export function ensureFruitVeg(input: RuleItem[], diet: DietType = "none"): RuleItem[] {
  let items = input;
  const fvG = () => items.filter((it) => ["vegetable", "fruit"].includes(roleOfItem(it, diet))).reduce((s, it) => s + it.grams, 0);
  for (let guard = 0; guard < 60 && fvG() < FRUITVEG_HARD_MIN_G + 1; guard++) {
    const room = (role: "vegetable" | "fruit") =>
      items
        .map((it, i) => ({ it, i }))
        .filter(({ it }) => roleOfItem(it, diet) === role)
        .filter(({ it }) => {
          const next = refit(it, it.grams + 25, "round");
          const mealCap = MEAL_CAP_G[itemCategory(it)];
          const mealSum = items.filter((x) => x.slot === it.slot && itemCategory(x) === itemCategory(it)).reduce((s, x) => s + x.grams, 0) - it.grams + next.grams;
          return next.grams > it.grams && next.grams <= maxGramsOf(itemCategory(it), it.portion) + 1e-9 && (mealCap === null || mealSum <= mealCap + 1e-9);
        })
        .sort((a, b) => a.it.grams - b.it.grams);
    const target = room("vegetable")[0] ?? room("fruit")[0];
    if (!target) break;
    items = items.map((it, k) => (k === target.i ? refit(it, it.grams + 25, "round") : it));
  }
  return items;
}

// ---------------------------------------------------------------- 4. doladenie po jednom kroku

export const FINE_TUNE_MAX_STEPS = 100;

export interface FineTuneResult {
  items: RuleItem[];
  check: DayCheck;
  ok: boolean;
  /** počet vykonaných krokov */
  steps: number;
}

const MACRO_CODES = new Set(["kcal", "protein", "fat_share"]);

interface Evaluation {
  check: DayCheck;
  /** porušenia mimo makier (stropy, skladba, podiely jedál) */
  structural: number;
  /** počet porušení podľa pravidla (mimo makier) — krok ich nesmie pridať */
  counts: Map<string, number>;
  cost: number;
  /** kcal aj bielkoviny aj podiel tukov sú v užšom pásme, než povoľujú pravidlá */
  settled: boolean;
}

/**
 * Plynulá pomôcka pre porušenia, ktoré by inak mali len „skok“ (podiel položky nad 60 %, podiel jedla na dni,
 * málo bielkovín v jedle): krok správnym smerom zníži cenu, takže greedy ich vie odstrániť.
 */
function guide(items: RuleItem[], minSource: number, mins: Map<MealSlot, number>): number {
  let g = 0;
  const bySlot = new Map<MealSlot, RuleItem[]>();
  for (const it of items) bySlot.set(it.slot, [...(bySlot.get(it.slot) ?? []), it]);
  const dayKcal = items.reduce((s, it) => s + itemKcal(it), 0);
  for (const [slot, list] of bySlot) {
    const kcal = list.reduce((s, it) => s + itemKcal(it), 0);
    const { min, max } = slotShareRange(slot);
    if (dayKcal > 0) g += 400 * (Math.max(0, kcal / dayKcal - Math.min(max, 0.4)) + Math.max(0, min - kcal / dayKcal));
    const protein = list.reduce((s, it) => s + itemProtein(it), 0);
    g += 20 * Math.max(0, (mins.get(slot) ?? 0) - protein);
    if (SNACK_SLOTS.includes(slot)) continue;
    if (list.length >= 2 && kcal > 0) for (const it of list) g += 300 * Math.max(0, itemKcal(it) / kcal - MAX_ITEM_MEAL_SHARE);
    if (MAIN_MEAL_SLOTS.includes(slot)) {
      const src = list.reduce((s, it) => s + (isProteinCategory(itemCategory(it)) ? itemProtein(it) : 0), 0);
      g += 20 * Math.max(0, minSource - src);
    }
  }
  return g;
}

function evaluate(items: RuleItem[], opts: CheckOptions, aim: number): Evaluation {
  const check = checkDay(items, opts);
  const t = opts.targets;
  const { totals } = check;
  const hard = check.violations.filter((v) => !MACRO_CODES.has(v.code));
  const structural = hard.length;
  const counts = new Map<string, number>();
  for (const v of hard) counts.set(v.code, (counts.get(v.code) ?? 0) + 1);
  const kd = aim > 0 ? Math.abs(totals.kcal - aim) / aim / KCAL_DAY_TOL : 0;
  const pd = t.proteinG > 0 ? (totals.proteinG - t.proteinG) / t.proteinG : 0;
  const ep = pd < 0 ? -pd / PROTEIN_DAY_TOL_LOW : pd / PROTEIN_DAY_TOL_HIGH;
  const share = totals.kcal > 0 ? (totals.fatG * 9) / totals.kcal : 0;
  // tuky: pod tvrdým minimom veľká pokuta, pod mäkkým (20 %) jemná; podiel má byť do ±3 p. b. od cieľa trénera
  const efHard = Math.max(0, FAT_MIN_SHARE + 0.005 - share) / 0.02;
  const efSoft = Math.max(0, FAT_SOFT_SHARE + 0.005 - share) / 0.02;
  const wanted = t.kcal > 0 ? (t.fatG * 9) / t.kcal : 0;
  const es = wanted > 0 ? Math.max(0, Math.abs(share - wanted) - 0.02) / 0.03 : 0;
  const mins = mealProteinMins([...new Set([...(opts.requiredSlots ?? []), ...items.map((i) => i.slot)])], t.proteinG);
  const cost = structural * 1000 + guide(items, mainSourceMinG(t.proteinG), mins) + 2 * kd * kd + ep * ep + 4 * efHard * efHard + 0.3 * efSoft * efSoft + es * es;
  return { check, structural, counts, cost, settled: structural === 0 && kd <= 0.5 && Math.abs(ep) <= 0.5 && efSoft === 0 && es <= 0.34 };
}

/** Položka o jeden krok (g/ml po 5, ks po 0,5; vajce po 1) — null, ak by klesla pod minimum alebo prekročila strop. */
function stepped(it: RuleItem, dir: 1 | -1): RuleItem | null {
  const qty = Math.round((it.qty + dir * stepOf(it)) * 100) / 100;
  if (qty < stepOf(it) - 1e-9) return null;
  const grams = gramsFor(it, qty);
  const cat = itemCategory(it);
  // krok nesmie porušiť minimum (nadol) ani strop (nahor)
  if (dir < 0 ? grams < ITEM_MIN_G[cat] - 1e-9 : grams > maxGramsOf(cat, it.portion) + 1e-9) return null;
  return { ...it, qty, grams };
}

/**
 * Greedy doladenie: kým je deň mimo užšieho pásma, skúsi každú položku (okrem zeleniny) ±1 krok a vezme ten,
 * ktorý najviac zníži vážnu chybu (kcal, bielkoviny, podiel tukov a jeho odchýlka od cieľa) bez nových porušení
 * stropov a skladby. Končí v pásme, bez zlepšenia alebo po FINE_TUNE_MAX_STEPS krokoch.
 */
export function fineTuneDay(input: RuleItem[], opts: CheckOptions): FineTuneResult {
  const aim = opts.kcalAim ?? opts.targets.kcal;
  let items = input;
  let cur = evaluate(items, opts, aim);
  let steps = 0;
  while (steps < FINE_TUNE_MAX_STEPS && !cur.settled) {
    let best: { items: RuleItem[]; ev: Evaluation } | null = null;
    for (let i = 0; i < items.length; i++) {
      if (itemCategory(items[i]) === "vegetable") continue;
      for (const dir of [-1, 1] as const) {
        const moved = stepped(items[i], dir);
        if (!moved) continue;
        const cand = items.map((it, k) => (k === i ? moved : it));
        const ev = evaluate(cand, opts, aim);
        // krok nesmie pridať porušenie žiadneho pravidla (ani výmenou za odstránenie iného)
        if ([...ev.counts].some(([code, n]) => n > (cur.counts.get(code) ?? 0))) continue;
        if (ev.cost < (best?.ev.cost ?? cur.cost - 1e-9)) best = { items: cand, ev };
      }
    }
    if (!best) break;
    items = best.items;
    cur = best.ev;
    steps++;
  }
  return { items, check: cur.check, ok: cur.check.ok, steps };
}
