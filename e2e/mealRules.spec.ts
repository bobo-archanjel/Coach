// i18n-ignore-file: testovacie vety (SK) pre pravidlá a plánovanie porcií AI jedálničkov
import { test, expect } from "@playwright/test";
import {
  checkDay,
  checkWeek,
  dayTotals,
  foodCategory,
  idealSlotShares,
  savedEntryToItem,
  softWarnings,
  targetBelowSafeMin,
  type RuleItem,
} from "../lib/ai/mealRules";
import type { MealSlot } from "../lib/meals";
import type { PortionFood, PortionUnit } from "../lib/portions";
import { portionGrams } from "../lib/portions";

/** Pravidlá a jemné doladenie jedného dňa: čisté testy bez siete. */

type Per100 = { kcal: number; p: number; c: number; f: number; fiber?: number };
const FOODS = {
  kuracie: { name: "Kuracie prsia", kcal: 110, p: 23, c: 0, f: 1.5, fiber: 0 },
  losos: { name: "Losos", kcal: 208, p: 20, c: 0, f: 13, fiber: 0 },
  ryza: { name: "Ryža varená", kcal: 130, p: 2.7, c: 28, f: 0.3, fiber: 0.4 },
  ryzaSuchá: { name: "Ryža", kcal: 350, p: 7, c: 77, f: 1 },
  vlocky: { name: "Ovsené vločky", kcal: 370, p: 13, c: 60, f: 7, fiber: 10 },
  vajce: { name: "Vajce", kcal: 143, p: 12.6, c: 0.7, f: 9.5, fiber: 0 },
  olej: { name: "Olivový olej", kcal: 884, p: 0, c: 0, f: 100, fiber: 0 },
  mandle: { name: "Mandle", kcal: 580, p: 21, c: 22, f: 50, fiber: 12 },
  brokolica: { name: "Brokolica", kcal: 34, p: 2.8, c: 7, f: 0.4, fiber: 2.6 },
  jablko: { name: "Jablko", kcal: 52, p: 0.3, c: 14, f: 0.2, fiber: 2.4 },
  skyr: { name: "Skyr biely", kcal: 63, p: 11, c: 4, f: 0.2, fiber: 0 },
  chlieb: { name: "Chlieb ražný", kcal: 250, p: 8, c: 48, f: 1.5, fiber: 6 },
} satisfies Record<string, Per100 & { name: string }>;
type FoodKey = keyof typeof FOODS;

let n = 0;
function mk(food: FoodKey, slot: MealSlot, qty: number, unit: PortionUnit = "g", portion: PortionFood = { unitBase: "g" }): RuleItem {
  const f = FOODS[food] as Per100 & { name: string };
  return {
    key: `k${n++}`,
    name: f.name,
    slot,
    unit,
    qty,
    grams: portionGrams(unit, qty, portion) ?? qty,
    kcal100: f.kcal,
    protein100: f.p,
    carbs100: f.c,
    fat100: f.f,
    fiber100: f.fiber ?? null,
    portion,
  };
}
const APPLE: PortionFood = { unitBase: "g", pieceGrams: 150 };

const T2000 = { kcal: 2000, proteinG: 150, carbsG: 220, fatG: 65 };
const OPTS = { targets: T2000, requiredSlots: ["ranajky", "obed", "vecera"] as MealSlot[] };

/** Typický dobrý deň s 3 jedlami (tesne pod cieľom). */
const goodDay = () => [
  mk("vlocky", "ranajky", 80),
  mk("skyr", "ranajky", 250),
  mk("jablko", "ranajky", 1, "piece", APPLE),
  mk("kuracie", "obed", 200),
  mk("ryza", "obed", 300),
  mk("brokolica", "obed", 200),
  mk("olej", "obed", 10),
  mk("losos", "vecera", 150),
  mk("ryza", "vecera", 250),
  mk("brokolica", "vecera", 200),
  mk("mandle", "vecera", 25),
];

test.describe("mealRules — klasifikácia a hard pravidlá", () => {
  test("kategórie podľa názvu a makier", () => {
    expect(foodCategory("Olivový olej", 884)).toBe("oil");
    expect(foodCategory("Maslo", 717)).toBe("oil");
    expect(foodCategory("Arašidové maslo", 600)).toBe("nuts");
    expect(foodCategory("Mandle", 580)).toBe("nuts");
    expect(foodCategory("Ryža varená", 130)).toBe("grain");
    expect(foodCategory("Ryža", 350)).toBe("grainDry");
    expect(foodCategory("Kuracie prsia", 110)).toBe("meat");
    expect(foodCategory("Losos", 208)).toBe("meat");
    expect(foodCategory("Brokolica", 34)).toBe("vegetable");
    expect(foodCategory("Jablko", 52)).toBe("fruit");
    expect(foodCategory("Vajce", 143)).toBe("egg");
    expect(foodCategory("Morčacia šunka", 105)).toBe("coldcut");
    expect(foodCategory("Tofu", 76)).toBe("tofu");
    expect(foodCategory("Skyr biely", 63)).toBe("dairy");
    expect(foodCategory("Syr eidam", 350)).toBe("cheese");
    expect(foodCategory("Zemiaky varené", 80)).toBe("potato");
    expect(foodCategory("Chlieb ražný", 250)).toBe("bread");
    expect(foodCategory("Cícer varený", 140)).toBe("legume");
    // „syrový“ (CZ: surový) nie je syr
    expect(foodCategory("Kuřecí prsa syrová", 110)).toBe("meat");
    expect(foodCategory("Brokolice syrová", 34)).toBe("vegetable");
    expect(foodCategory("Neznáma vec", 100)).toBe("other");
  });

  test("dobrý deň prejde; nízky/vysoký deň nie (kcal ±5 %)", () => {
    const base = goodDay();
    const t = dayTotals(base);
    expect(t.kcal).toBeGreaterThan(1900);
    const low = base.filter((it) => it.name !== "Ryža varená"); // chýbajú sacharidy → ~970 kcal
    const c = checkDay(low, OPTS);
    expect(c.ok).toBe(false);
    expect(c.violations.some((v) => v.code === "kcal")).toBe(true);
  });

  test("stropy: ryža na jedlo, mäso na jedlo, olej na jedlo a na deň, orechy za deň", () => {
    const v = (items: RuleItem[]) => checkDay(items, OPTS).violations.map((x) => x.code);
    expect(v([mk("ryza", "obed", 450)])).toContain("cap_meal");
    expect(v([mk("ryzaSuchá", "obed", 200)])).toContain("cap_meal");
    expect(v([mk("kuracie", "obed", 350)])).toContain("cap_meal");
    expect(v([mk("olej", "obed", 25)])).toContain("cap_meal");
    expect(v([mk("olej", "obed", 20), mk("olej", "vecera", 20)])).toContain("cap_day");
    expect(v([mk("mandle", "obed", 40), mk("mandle", "vecera", 40)])).toContain("cap_day");
  });

  test("podiely jedál a chýbajúci slot", () => {
    const only = goodDay().filter((it) => it.slot !== "vecera");
    const c = checkDay(only, OPTS);
    expect(c.violations.map((x) => x.code)).toContain("missing_slot");
    expect(idealSlotShares(["ranajky", "obed", "vecera"]).get("obed")!).toBeLessThan(0.4);
  });

  test("týždenný priemer ±3 %", () => {
    expect(checkWeek([2000, 2100, 1900], 2000).ok).toBe(true);
    expect(checkWeek([2200, 2200], 2000).ok).toBe(false);
    expect(checkWeek([], 2000).ok).toBe(true);
  });

  test("uložené položky → RuleItem (ks sa zrekonštruuje z gramáže a množstva)", () => {
    const it = savedEntryToItem({ entry_id: "e1", food_name: "Vajce", meal_slot: "ranajky", grams: 110, portion_unit: "piece", portion_qty: 2, kcal_100g: 143, protein_100g: 12.6, carbs_100g: 0.7, fat_100g: 9.5 })!;
    expect(it.unit).toBe("piece");
    expect(it.portion.pieceGrams).toBe(55);
    expect(savedEntryToItem({ entry_id: "e2", food_name: "x", meal_slot: "zle", grams: 5, kcal_100g: 1, protein_100g: 1, carbs_100g: 1, fat_100g: 1 })).toBeNull();
    const ml = savedEntryToItem({ entry_id: "e3", food_name: "Mlieko", meal_slot: "obed", grams: 250, portion_unit: "ml", portion_base: "ml", portion_qty: 250, kcal_100g: 46, protein_100g: 3, carbs_100g: 5, fat_100g: 1.5 })!;
    expect(ml.unit).toBe("ml");
  });
});

test.describe("mäkké upozornenia a bezpečné minimum", () => {
  test("vláknina, ovocie+zelenina, bielkoviny na jedlo, rozloženie makier", () => {
    const poor = [mk("kuracie", "obed", 300), mk("olej", "obed", 20), mk("losos", "vecera", 200), mk("skyr", "ranajky", 100)];
    const w = softWarnings([{ dayNo: 2, items: poor }], T2000);
    const codes = w.map((x) => x.code);
    expect(codes).toContain("fruitveg");
    expect(codes).toContain("fiber");
    expect(codes).toContain("protein_meal");
    expect(codes).toContain("macro_split");
    expect(w.find((x) => x.code === "fruitveg")!.days).toEqual([2]);
    // makrá blízko cieľa → bez upozornenia na rozloženie; bielkoviny v jedle 15–60 g sú v poriadku
    const near = softWarnings([{ dayNo: 1, items: goodDay() }], { kcal: 2000, proteinG: 150, carbsG: dayTotals(goodDay()).carbsG, fatG: dayTotals(goodDay()).fatG });
    expect(near.map((x) => x.code)).not.toContain("macro_split");
    expect(near.map((x) => x.code)).not.toContain("protein_meal");
    // dobrý deň s dosť zeleniny nemá upozornenie na ovocie+zeleninu
    const good = softWarnings([{ dayNo: 1, items: [...goodDay(), mk("brokolica", "obed", 200)] }]);
    expect(good.map((x) => x.code)).not.toContain("fruitveg");
  });

  test("bezpečné minimum kcal podľa pohlavia a BMR", () => {
    expect(targetBelowSafeMin(1100, "zena", 1300)).toBe(1300);
    expect(targetBelowSafeMin(1250, "zena", 1100)).toBeNull();
    expect(targetBelowSafeMin(1400, "muz", 1600)).toBe(1600);
    expect(targetBelowSafeMin(1400, "muz", 1200)).toBe(1500);
    expect(targetBelowSafeMin(500, null, null)).toBeNull();
  });
});

import { dietViolation } from "../lib/ai/mealPlanValidation";

test.describe("dietViolation: legitímne položky sa nezahadzujú", () => {
  test("rastlinné/bezlaktózové/bezlepkové varianty prejdú", () => {
    expect(dietViolation("Arašidové maslo", "vegan")).toBeNull();
    expect(dietViolation("Arašidové maslo", "lactose_free")).toBeNull();
    expect(dietViolation("Kokosové mlieko", "vegan")).toBeNull();
    expect(dietViolation("Kokosové mlieko", "lactose_free")).toBeNull();
    expect(dietViolation("Mandľový nápoj", "lactose_free")).toBeNull();
    expect(dietViolation("Skyr bezlaktózový", "lactose_free")).toBeNull();
    expect(dietViolation("Jogurt bez laktózy", "lactose_free")).toBeNull();
    expect(dietViolation("Tvaroh bezlaktózový", "lactose_free")).toBeNull();
    expect(dietViolation("Sójový jogurt", "vegan")).toBeNull();
    expect(dietViolation("Bezlepkové cestoviny", "gluten_free")).toBeNull();
    expect(dietViolation("Cestoviny bez lepku", "gluten_free")).toBeNull();
    expect(dietViolation("Ovsené vločky bezlepkové", "gluten_free")).toBeNull();
    expect(dietViolation("Skyr", "lactose_free")).not.toBeNull();
  });
});

test("hard pravidlo: každé jedlo má zdroj bielkovín (raňajky/hlavné ≥ 15 g, desiata ≥ 8 g)", () => {
  const items = [mk("jablko", "ranajky", 1, "piece", APPLE), mk("kuracie", "obed", 200), mk("ryza", "obed", 200), mk("losos", "vecera", 150), mk("jablko", "olovrant", 1, "piece", APPLE)];
  const codes = checkDay(items, { targets: T2000, requiredSlots: ["ranajky", "obed", "vecera"] }).violations.filter((v) => v.code === "slot_protein").map((v) => v.slot);
  expect(codes.sort()).toEqual(["olovrant", "ranajky"]);
});

// ---------------------------------------------------------------- realistické porcie a skladba jedla
test.describe("hard pravidlá: porcie na položku a skladba jedla", () => {
  const FOODS2 = {
    vajce: { name: "Vajce", kcal: 143, p: 12.6, c: 0.7, f: 9.5 },
    sunka: { name: "Morčacia šunka", kcal: 105, p: 19, c: 1.5, f: 2.5 },
    tofu: { name: "Tofu", kcal: 76, p: 8, c: 2, f: 4.5 },
    zemiaky: { name: "Zemiaky varené", kcal: 80, p: 2, c: 17, f: 0.1 },
    uhorka: { name: "Uhorka", kcal: 15, p: 0.7, c: 3, f: 0.1 },
    bageta: { name: "Bageta", kcal: 270, p: 9, c: 54, f: 2 },
    jogurt: { name: "Sójový jogurt", kcal: 55, p: 4, c: 3, f: 2.5 },
    cicer: { name: "Cícer varený", kcal: 140, p: 8, c: 22, f: 2.5 },
  };
  const make = (k: keyof typeof FOODS2, slot: MealSlot, grams: number): RuleItem => {
    const f = FOODS2[k];
    return { key: `x${n++}`, name: f.name, slot, unit: "g", qty: grams, grams, kcal100: f.kcal, protein100: f.p, carbs100: f.c, fat100: f.f, portion: { unitBase: "g" } };
  };
  const codes = (items: RuleItem[]) => checkDay(items, { targets: T2000, requiredSlots: [] }).violations.map((v) => v.code);

  test("absurdné porcie sú porušenie (cap_item)", () => {
    expect(codes([make("vajce", "ranajky", 650)])).toContain("cap_item"); // 13 vajec
    expect(codes([make("uhorka", "obed", 800)])).toContain("cap_item");
    expect(codes([make("sunka", "obed", 240)])).toContain("cap_item"); // 12 plátkov
    expect(codes([make("zemiaky", "obed", 800)])).toContain("cap_item");
    expect(codes([make("bageta", "ranajky", 280)])).toContain("cap_item"); // 7 kusov
    expect(codes([make("tofu", "ranajky", 395)])).toContain("cap_item");
    expect(codes([make("jogurt", "ranajky", 495)])).toContain("cap_item");
    expect(codes([make("cicer", "obed", 400)])).toContain("cap_item");
    expect(codes([make("vajce", "ranajky", 220), make("sunka", "ranajky", 100)])).not.toContain("cap_item"); // 4 vajcia, 100 g šunky je v poriadku
  });

  test("žiadna položka nad 60 % energie jedla; nepatrná porcia je porušenie", () => {
    expect(codes([make("zemiaky", "obed", 400), make("sunka", "obed", 30)])).toContain("item_share");
    expect(codes([make("sunka", "obed", 5), make("zemiaky", "obed", 200)])).toContain("tiny_item");
  });

  test("skladba: obed/večera = bielkovina (≥ 20 g) + príloha + zelenina; raňajky = bielkovina + sacharid; desiata ≤ 3", () => {
    // obed bez zeleniny a bez prílohy
    const lunchBad = codes([make("sunka", "obed", 100)]);
    expect(lunchBad).toContain("comp_veg");
    expect(lunchBad).toContain("comp_carb");
    expect(codes([make("zemiaky", "obed", 300), make("uhorka", "obed", 200)])).toContain("comp_protein");
    expect(codes([make("vajce", "obed", 220), make("zemiaky", "obed", 300), make("uhorka", "obed", 150)])).not.toContain("comp_protein");
    expect(codes([make("jogurt", "ranajky", 200)])).toContain("comp_carb");
    expect(codes([make("zemiaky", "ranajky", 200)])).toContain("comp_protein");
    const snack = [make("sunka", "olovrant", 40), make("jogurt", "olovrant", 100), make("zemiaky", "olovrant", 100), make("uhorka", "olovrant", 50)];
    expect(codes(snack)).toContain("snack_items");
  });

  test("diéta sa posudzuje podľa slovenského názvu: české „syrová“ (surová) nie je syr", () => {
    for (const nm of ["Kuřecí prsa (syrová)", "Losos (syrový)", "Brokolice (syrová)", "Cuketa (syrová)", "Mrkev (syrová)", "Pohanka (syrová)", "Kuracie prsia surové"]) {
      expect(dietViolation(nm, "lactose_free")).toBeNull();
      expect(dietViolation(nm, "gluten_free")).toBeNull();
    }
    expect(dietViolation("Syr eidam", "lactose_free")).not.toBeNull();
    expect(dietViolation("Sýr eidam", "lactose_free")).not.toBeNull();
    expect(dietViolation("Smetana na varenie", "lactose_free")).not.toBeNull();
    expect(dietViolation("Máslo", "lactose_free")).not.toBeNull();
    expect(dietViolation("Maslo", "lactose_free")).not.toBeNull();
    expect(dietViolation("Arašidové maslo", "lactose_free")).toBeNull();
    expect(dietViolation("Kokosové mlieko", "lactose_free")).toBeNull();
    // ďalšie zoznamy: žiadne falošné zhody
    expect(dietViolation("Rybíz červený", "vegetarian")).toBeNull();
    expect(dietViolation("Medvedí cesnak", "vegan")).toBeNull();
    expect(dietViolation("Ryžové cestoviny", "gluten_free")).toBeNull();
    expect(dietViolation("Kukuričné pečivo", "gluten_free")).toBeNull();
    expect(dietViolation("Hustá omáčka", "vegetarian")).toBeNull();
  });
});

// ---------------------------------------------------------------- plánovanie porcií (mealPortions)
import {
  availableGroups,
  completePicks,
  composeDay,
  enforceCaps,
  fineTuneDay,
  fitsGroup,
  planMeals,
  type DayPicks,
} from "../lib/ai/mealPortions";
import { slotsForMealCount, type KnownFood, type MacroTargets } from "../lib/ai/mealPlanValidation";
import { itemCategory } from "../lib/ai/mealRules";

let refNo = 0;
const kf = (name: string, k: number, p: number, c: number, f: number, portion: PortionFood = { unitBase: "g" }, fiber = 1): KnownFood => ({
  ref: `F${++refNo}`,
  source: "kniznica",
  foodId: `id-${refNo}`,
  barcode: null,
  name,
  baseName: name,
  kcal100: k,
  protein100: p,
  carbs100: c,
  fat100: f,
  fiber100: fiber,
  portion,
});
/** Realistický pool bezlaktózového režimu (bez bežných mliečnych výrobkov). */
const POOL: KnownFood[] = [
  kf("Kuracie prsia", 110, 23, 0, 1.5),
  kf("Losos", 208, 20, 0, 13),
  kf("Vajce", 143, 12.6, 0.7, 9.5, { unitBase: "g", pieceGrams: 55 }),
  kf("Tofu", 76, 8, 2, 4.5),
  kf("Morčacia šunka", 105, 19, 1.5, 2.5),
  kf("Jogurt bez laktózy", 55, 4.5, 5, 2),
  kf("Ryža varená", 130, 2.7, 28, 0.3),
  kf("Ovsené vločky", 370, 13, 60, 7, { unitBase: "g" }, 10),
  kf("Chlieb pšeničný", 250, 8, 48, 1.5, { unitBase: "g", pieceGrams: 40 }, 3),
  kf("Zemiaky varené", 80, 2, 17, 0.1),
  kf("Banán", 89, 1.1, 23, 0.3, { unitBase: "g", pieceGrams: 120 }, 2.6),
  kf("Jablko", 52, 0.3, 14, 0.2, { unitBase: "g", pieceGrams: 150 }, 2.4),
  kf("Brokolica", 34, 2.8, 7, 0.4, { unitBase: "g" }, 2.6),
  kf("Mrkva", 41, 0.9, 10, 0.2, { unitBase: "g" }, 2.8),
  kf("Olivový olej", 884, 0, 0, 100),
  kf("Mandle", 580, 21, 22, 50, { unitBase: "g" }, 12),
];

const T4: MacroTargets = { kcal: 2934, proteinG: 176, carbsG: 379, fatG: 79 };

const caps = (items: RuleItem[]) => checkDay(items, { targets: T4, requiredSlots: [] }).violations.filter((v) => /^(cap_|tiny_)/.test(v.code));

/** Celý deň bez modelu: kód doplní výber, spočíta gramy a doladí. */
function dayByCode(targets: MacroTargets, slots: MealSlot[], dayIndex: number, picks: DayPicks = new Map(), pool = POOL) {
  const plan = planMeals(targets, slots, availableGroups(pool));
  const done = completePicks(plan, picks, pool, dayIndex, { diet: "none" });
  const composed = composeDay(done.plan, done.picks, targets);
  const tuned = fineTuneDay(composed, { targets, requiredSlots: slots });
  return { plan, composed, tuned, picks: done.picks };
}

const MIN_PROTEIN_MEAL = (slot: string) => (slot === "olovrant" || slot === "desiata" || slot === "ine" ? 10 : slot === "ranajky" ? 20 : 25) - 1e-9;

test.describe("mealPortions — šablóna dňa a skupiny", () => {
  test("skupiny podľa kategórie a makier", () => {
    const byName = (n: string) => POOL.find((f) => f.name === n)!;
    expect(fitsGroup(byName("Kuracie prsia"), "protein")).toBe(true);
    expect(fitsGroup(byName("Vajce"), "protein")).toBe(true);
    expect(fitsGroup(byName("Jogurt bez laktózy"), "dairy")).toBe(true);
    expect(fitsGroup(byName("Jogurt bez laktózy"), "protein")).toBe(false); // len 4,5 g bielkovín/100 g → skupina dairy
    expect(fitsGroup(byName("Ryža varená"), "starch")).toBe(true);
    expect(fitsGroup(byName("Ovsené vločky"), "starch")).toBe(true);
    expect(fitsGroup(byName("Brokolica"), "vegetable")).toBe(true);
    expect(fitsGroup(byName("Banán"), "fruit")).toBe(true);
    expect(fitsGroup(byName("Olivový olej"), "fat")).toBe(true);
    expect(fitsGroup(byName("Mandle"), "fat")).toBe(true);
    expect(fitsGroup(byName("Banán"), "fat")).toBe(false);
    expect(fitsGroup(byName("Kuracie prsia"), "starch")).toBe(false);
    expect(fitsGroup({ ...byName("Banán"), name: "Avokádo", baseName: "Avokádo", kcal100: 160, fat100: 15, carbs100: 9 }, "fat")).toBe(true);
    // pečivo s ovocnou náplňou nie je ani ovocie, ani tuk
    const cookie = { ...byName("Banán"), name: "Mrkvánky s hruškovou náplňou", baseName: "Mrkvánky s hruškovou náplňou", kcal100: 450, fat100: 20, carbs100: 60 };
    expect(fitsGroup(cookie, "fat")).toBe(false);
    expect(fitsGroup(cookie, "fruit")).toBe(false);
  });

  test("šablóna: hlavné jedlo = bielkovina + príloha + zelenina + tuk; bielkoviny aspoň 20–25 g na jedlo a súčet = cieľ", () => {
    const slots = slotsForMealCount(4);
    const plan = planMeals(T4, slots);
    const groups = (s: string) => plan.find((m) => m.slot === s)!.groups.map((g) => g.group);
    expect(groups("obed")).toEqual(["protein", "starch", "vegetable", "fat"]);
    expect(groups("vecera")).toEqual(["protein", "starch", "vegetable", "fat"]);
    expect(groups("ranajky")).toEqual(["protein", "dairy", "starch", "fruit", "fat"]);
    expect(groups("olovrant")).toEqual(["dairy", "fruit"]);
    for (const m of plan) expect(m.proteinG).toBeGreaterThanOrEqual(MIN_PROTEIN_MEAL(m.slot));
    expect(plan.reduce((s, m) => s + m.proteinG, 0)).toBeCloseTo(T4.proteinG, 5);
    expect(plan.reduce((s, m) => s + m.share, 0)).toBeCloseTo(1, 5);
    // diéta bez mliečnych: raňajky bez „dairy“, bielkovina ostane
    const noDairy = planMeals(T4, slots, new Set(["protein", "starch", "vegetable", "fruit", "fat"] as const));
    expect(noDairy.find((m) => m.slot === "ranajky")!.groups.map((g) => g.group)).toEqual(["protein", "starch", "fruit", "fat"]);
  });
});

test.describe("mealPortions — gramáž z výberu (kód), nie z modelu", () => {
  test("testovací prípad 2934 kcal / B176 / S379 / T79, 4 jedlá, bez laktózy: každý deň v pásme, bez absurdných porcií", () => {
    const slots = slotsForMealCount(4);
    const seen = new Set<string>();
    for (let d = 0; d < 3; d++) {
      const { composed, tuned } = dayByCode(T4, slots, d);
      expect(tuned.check.violations.map((v) => v.detail), `deň ${d + 1}`).toEqual([]);
      expect(tuned.ok).toBe(true);
      const t = dayTotals(tuned.items);
      expect(Math.abs(t.kcal - 2934) / 2934).toBeLessThanOrEqual(0.05);
      expect(t.proteinG / 176).toBeGreaterThanOrEqual(0.9);
      expect(t.proteinG / 176).toBeLessThanOrEqual(1.15);
      expect((t.fatG * 9) / t.kcal).toBeGreaterThanOrEqual(0.18);
      expect(caps(tuned.items)).toEqual([]);
      // zmysluplné množstvá
      const eggs = tuned.items.filter((i) => itemCategory(i) === "egg").reduce((s, i) => s + i.qty, 0);
      expect(eggs).toBeLessThanOrEqual(4);
      expect(tuned.items.filter((i) => itemCategory(i) === "oil").reduce((s, i) => s + i.grams, 0)).toBeLessThanOrEqual(30);
      for (const i of tuned.items.filter((x) => itemCategory(x) === "vegetable")) expect(i.grams).toBeLessThanOrEqual(300);
      // kusy po 0,5, gramy po 5
      for (const i of tuned.items) {
        if (i.unit === "piece") expect((i.qty * 2) % 1).toBe(0);
        else expect(i.grams % 5).toBe(0);
      }
      expect(composed.length).toBeGreaterThan(8);
      seen.add(tuned.items.map((i) => i.ref).join(","));
    }
    expect(seen.size).toBeGreaterThan(1); // dni sa líšia (rotácia podľa dňa)
  });

  test("výber modelu sa rešpektuje a dorovná (raňajky len z vajec → kód pridá ďalšiu bielkovinu)", () => {
    const slots = slotsForMealCount(4);
    const egg = POOL.find((f) => f.name === "Vajce")!;
    const chicken = POOL.find((f) => f.name === "Kuracie prsia")!;
    const picks: DayPicks = new Map([["ranajky", { protein: [egg] }], ["obed", { protein: [chicken] }]]);
    const { tuned, picks: done } = dayByCode(T4, slots, 0, picks);
    expect(done.get("obed")!.protein![0].ref).toBe(chicken.ref);
    expect(done.get("ranajky")!.protein![0].ref).toBe(egg.ref);
    expect(tuned.ok).toBe(true);
    expect(tuned.items.filter((i) => i.slot === "obed" && itemCategory(i) === "meat")).toHaveLength(1);
  });

  test("viac rôznych cieľov a počtov jedál: všetky dni prejdú", () => {
    const cases: [MacroTargets, number][] = [
      [{ kcal: 1500, proteinG: 110, carbsG: 150, fatG: 50 }, 3],
      [{ kcal: 1800, proteinG: 130, carbsG: 190, fatG: 60 }, 4],
      [{ kcal: 2000, proteinG: 150, carbsG: 220, fatG: 65 }, 3],
      [{ kcal: 2400, proteinG: 160, carbsG: 290, fatG: 70 }, 5],
      [{ kcal: 2934, proteinG: 176, carbsG: 379, fatG: 79 }, 3],
      [{ kcal: 2934, proteinG: 176, carbsG: 379, fatG: 79 }, 6],
      [{ kcal: 3500, proteinG: 200, carbsG: 450, fatG: 100 }, 5],
      [{ kcal: 2200, proteinG: 180, carbsG: 200, fatG: 70 }, 4],
    ];
    const failures: string[] = [];
    for (const [t, meals] of cases) {
      for (let d = 0; d < 3; d++) {
        const { tuned } = dayByCode(t, slotsForMealCount(meals), d);
        for (const v of tuned.check.violations) failures.push(`${t.kcal} kcal, ${meals} jedál, deň ${d + 1}: ${v.detail}`);
      }
    }
    expect(failures).toEqual([]);
  });

  test("stropy: položky sa úmerne zmenšia (olej za deň, mäso na jedlo)", () => {
    const items = [mk("olej", "obed", 20), mk("olej", "vecera", 20), mk("kuracie", "obed", 200), mk("kuracie", "obed", 200)];
    const out = enforceCaps(items);
    expect(out.filter((i) => i.name === "Olivový olej").reduce((s, i) => s + i.grams, 0)).toBeLessThanOrEqual(30);
    expect(out.filter((i) => i.name === "Kuracie prsia").reduce((s, i) => s + i.grams, 0)).toBeLessThanOrEqual(300);
  });

  test("doladenie po kroku: deň s nadbytkom sacharidov sa zníži o celé kroky, nič nepridá", () => {
    const slots = slotsForMealCount(3);
    const t = { kcal: 2000, proteinG: 150, carbsG: 220, fatG: 65 };
    const { tuned } = dayByCode(t, slots, 0);
    const bumped = tuned.items.map((it) => (/ryža|vločky|chlieb|zemiaky/i.test(it.name) ? { ...it, qty: it.qty * 1.35, grams: it.grams * 1.35 } : it));
    const before = dayTotals(bumped).kcal;
    const r = fineTuneDay(bumped, { targets: t, requiredSlots: slots });
    expect(r.items).toHaveLength(bumped.length);
    expect(Math.abs(dayTotals(r.items).kcal - 2000)).toBeLessThan(Math.abs(before - 2000));
    expect(r.steps).toBeGreaterThan(0);
    expect(r.ok).toBe(true);
  });
});
