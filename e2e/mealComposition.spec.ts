// i18n-ignore-file: testovacie vety (SK) pre nutričné pravidlá skladby jedál AI jedálničkov
import { test, expect } from "@playwright/test";
import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CreateMessage } from "../lib/ai/chatLoop";
import type { FoodCandidate } from "../lib/ai/foodContext";
import { generateMealPlan, parsePicks, type MealGeneratorInput } from "../lib/ai/mealGenerator";
import { dietViolation, slotsForMealCount, type DietType, type KnownFood, type MacroTargets } from "../lib/ai/mealPlanValidation";
import { availableGroups, completePicks, composeDay, fineTuneDay, mainProteinKeys, pickProblem, planMeals, type DayPicks } from "../lib/ai/mealPortions";
import { checkDay, foodCategory, isFish, roleOfItem, sanityScore, softWarnings, type RuleItem } from "../lib/ai/mealRules";
import type { MealSlot } from "../lib/meals";
import type { PortionFood } from "../lib/portions";

/** Nutričné pravidlá skladby jedál: checkDay, kontrola výberu modelu (parsePicks), doplnenie kódom a celý generátor. */

// ---------------------------------------------------------------- pool
type Def = [name: string, kcal: number, p: number, c: number, f: number, portion?: PortionFood, fiber?: number];
const DEFS: Def[] = [
  ["Kuracie prsia", 110, 23, 0, 1.5],
  ["Morčacie prsia", 105, 24, 0, 1],
  ["Hovädzie mäso", 150, 21, 0, 7],
  ["Losos", 208, 20, 0, 13],
  ["Treska", 82, 18, 0, 0.7],
  ["Vajce", 143, 12.6, 0.7, 9.5, { unitBase: "g", pieceGrams: 55 }],
  ["Morčacia šunka", 105, 19, 1.5, 2.5],
  ["Tofu", 120, 12, 2, 7],
  ["Tempeh", 190, 19, 9, 11],
  ["Seitan", 120, 25, 4, 2],
  ["Šošovica varená", 116, 9, 20, 0.4, { unitBase: "g" }, 8],
  ["Cícer varený", 140, 8.9, 22, 2.6, { unitBase: "g" }, 7],
  ["Skyr biely", 63, 11, 4, 0.2],
  ["Sójový jogurt", 55, 4, 3, 2.5],
  ["Jogurt bez laktózy", 58, 4.5, 5, 2],
  ["Ryža varená", 130, 2.7, 28, 0.3, { unitBase: "g" }, 0.4],
  ["Cestoviny varené", 150, 5.5, 30, 1, { unitBase: "g" }, 2],
  ["Zemiaky varené", 80, 2, 17, 0.1, { unitBase: "g" }, 1.8],
  ["Quinoa varená", 120, 4.4, 21, 1.9, { unitBase: "g" }, 2.8],
  ["Pohánka varená", 92, 3.4, 20, 0.6, { unitBase: "g" }, 2.7],
  ["Ovsené vločky", 370, 13, 60, 7, { unitBase: "g" }, 10],
  ["Chlieb pšeničný", 250, 8, 48, 1.5, { unitBase: "g", pieceGrams: 40 }, 3],
  ["Chlieb bezlepkový", 240, 5, 46, 3, { unitBase: "g", pieceGrams: 40 }, 3],
  ["Brokolica", 34, 2.8, 7, 0.4, { unitBase: "g" }, 2.6],
  ["Mrkva", 41, 0.9, 10, 0.2, { unitBase: "g" }, 2.8],
  ["Paprika červená", 31, 1, 6, 0.3, { unitBase: "g" }, 2.1],
  ["Cuketa", 17, 1.2, 3, 0.3, { unitBase: "g" }, 1],
  ["Špenát", 23, 2.9, 3.6, 0.4, { unitBase: "g" }, 2.2],
  ["Banán", 89, 1.1, 23, 0.3, { unitBase: "g", pieceGrams: 120 }, 2.6],
  ["Jablko", 52, 0.3, 14, 0.2, { unitBase: "g", pieceGrams: 150 }, 2.4],
  ["Pomaranč", 47, 0.9, 12, 0.1, { unitBase: "g", pieceGrams: 150 }, 2.4],
  ["Jahody", 32, 0.7, 7.7, 0.3, { unitBase: "g" }, 2],
  ["Olivový olej", 884, 0, 0, 100],
  ["Mandle", 580, 21, 22, 50, { unitBase: "g" }, 12],
  ["Tahini (sezamová pasta)", 600, 17, 21, 54, { unitBase: "g" }, 9],
  ["Avokádo", 160, 2, 9, 15, { unitBase: "g" }, 7],
  ["Syr eidam", 350, 25, 1, 27, { unitBase: "g" }],
];
const LIB: FoodCandidate[] = DEFS.map(([name, k, p, c, f, portion, fiber], i) => ({
  id: `lib-${i}`,
  name,
  kcal100g: k,
  protein100g: p,
  carbs100g: c,
  fat100g: f,
  fiber100g: fiber ?? 1,
  portion: portion ?? { unitBase: "g" },
}));
let refNo = 0;
const kf = (name: string, over: Partial<KnownFood> = {}): KnownFood => {
  const d = DEFS.find((x) => x[0] === name)!;
  return { ref: `F${++refNo}`, source: "kniznica", foodId: `id-${refNo}`, barcode: null, name, baseName: name, kcal100: d[1], protein100: d[2], carbs100: d[3], fat100: d[4], fiber100: d[6] ?? 1, portion: d[5] ?? { unitBase: "g" }, ...over };
};
const custom = (name: string, kcal: number, p: number, c: number, f: number, over: Partial<KnownFood> = {}): KnownFood => ({
  ref: `F${++refNo}`, source: "kniznica", foodId: `id-${refNo}`, barcode: null, name, baseName: name, kcal100: kcal, protein100: p, carbs100: c, fat100: f, fiber100: 1, portion: { unitBase: "g" }, ...over,
});
const POOL: KnownFood[] = DEFS.map(([n]) => kf(n));
const usable = (diet: DietType) => POOL.filter((f) => !dietViolation(f.baseName ?? f.name, diet));
const byName = (n: string) => POOL.find((f) => f.name === n)!;

// ---------------------------------------------------------------- RuleItem pomocníci
let k = 0;
const ri = (name: string, slot: MealSlot, grams: number): RuleItem => {
  const d = DEFS.find((x) => x[0] === name)!;
  const portion = d[5] ?? { unitBase: "g" };
  const pieces = (portion.pieceGrams ?? 0) > 0;
  return {
    key: `r${k++}`, name, baseName: name, slot, unit: pieces ? "piece" : "g", qty: pieces ? grams / (portion.pieceGrams as number) : grams, grams,
    kcal100: d[1], protein100: d[2], carbs100: d[3], fat100: d[4], fiber100: d[6] ?? 1, portion,
  };
};
const T: MacroTargets = { kcal: 2400, proteinG: 150, carbsG: 280, fatG: 80 };
const SLOTS: MealSlot[] = ["ranajky", "obed", "olovrant", "vecera"];
/** Deň, ktorý spĺňa všetky pravidlá skladby (makrá nie sú predmetom týchto testov). */
const okDay = (): RuleItem[] => [
  ri("Vajce", "ranajky", 110), ri("Ovsené vločky", "ranajky", 80), ri("Banán", "ranajky", 120),
  ri("Kuracie prsia", "obed", 200), ri("Ryža varená", "obed", 300), ri("Brokolica", "obed", 200), ri("Olivový olej", "obed", 10),
  ri("Skyr biely", "olovrant", 200), ri("Jablko", "olovrant", 150),
  ri("Losos", "vecera", 180), ri("Zemiaky varené", "vecera", 350), ri("Cuketa", "vecera", 200), ri("Olivový olej", "vecera", 10),
];
const COMPOSITION_CODES = new Set([
  "main_protein_count", "main_starch_count", "main_veg", "main_fat_count", "main_sweet", "legume_rule", "bf_protein", "bf_meat", "bf_starch",
  "snack_forbidden", "dairy_meal", "dairy_day", "food_repeat", "protein_repeat", "fruitveg", "form_mix", "comp_veg", "comp_protein", "slot_protein", "snack_items",
]);
const codes = (items: RuleItem[], diet?: DietType) =>
  checkDay(items, { targets: T, requiredSlots: SLOTS, diet }).violations.filter((v) => COMPOSITION_CODES.has(v.code)).map((v) => v.code);
const without = (items: RuleItem[], pred: (i: RuleItem) => boolean) => items.filter((i) => !pred(i));

test.describe("checkDay: nutričné pravidlá skladby (HARD)", () => {
  test("vzorový deň nemá žiadne porušenie skladby", () => {
    expect(codes(okDay())).toEqual([]);
    expect(sanityScore(okDay(), { targets: T }).score).toBeGreaterThan(70);
  });

  test("hlavné jedlo: presne 1 zdroj bielkovín", () => {
    expect(codes([...okDay(), ri("Vajce", "obed", 110)])).toContain("main_protein_count");
    expect(codes([...okDay(), ri("Morčacia šunka", "obed", 60)])).toContain("main_protein_count"); // údeniny nie sú hlavný zdroj
    expect(codes(without(okDay(), (i) => i.name === "Kuracie prsia" && i.slot === "obed"))).toContain("main_protein_count");
  });

  test("hlavné jedlo: presne 1 príloha (nie ryža + quinoa, nie zemiaky + cícer)", () => {
    expect(codes([...okDay(), ri("Quinoa varená", "obed", 150)])).toContain("main_starch_count");
    expect(codes([...okDay(), ri("Cícer varený", "vecera", 150)])).toContain("main_starch_count"); // mimo veg. diéty je cícer príloha
    expect(codes(without(okDay(), (i) => i.name === "Ryža varená"))).toContain("main_starch_count");
  });

  test("hlavné jedlo: zelenina ≥ 150 g a najviac 2 druhy; najviac 1 tuk; bez mliečnych a ovocia", () => {
    expect(codes(okDay().map((i) => (i.name === "Brokolica" ? { ...i, grams: 100, qty: 100 } : i)))).toContain("main_veg");
    expect(codes([...okDay(), ri("Mrkva", "obed", 80), ri("Paprika červená", "obed", 80)])).toContain("main_veg"); // 3 druhy
    expect(codes([...okDay(), ri("Mandle", "obed", 15)])).toContain("main_fat_count");
    expect(codes([...okDay(), ri("Sójový jogurt", "obed", 100)])).toContain("main_sweet");
    expect(codes([...okDay(), ri("Jablko", "vecera", 150)])).toContain("main_sweet");
  });

  test("strukoviny: bielkovina len pri vegetariánskej/vegánskej diéte; inak príloha max 1×/deň a nie s mäsom", () => {
    const lentilLunch = okDay().map((i) => (i.slot === "obed" && i.name === "Kuracie prsia" ? ri("Šošovica varená", "obed", 250) : i.slot === "obed" && i.name === "Ryža varená" ? ri("Tofu", "obed", 150) : i));
    expect(codes(lentilLunch, "none")).not.toContain("main_starch_count"); // šošovica je príloha, tofu bielkovina: 1 + 1 = v poriadku
    expect(codes(lentilLunch, "none")).not.toContain("main_protein_count");
    // vegetarián: šošovica je bielkovina, ryža príloha → bez porušenia
    const vegLunch = okDay().map((i) => (i.slot === "obed" && i.name === "Kuracie prsia" ? ri("Šošovica varená", "obed", 250) : i)).map((i) => (i.name === "Losos" ? ri("Vajce", "vecera", 110) : i));
    expect(codes(vegLunch, "vegetarian")).not.toContain("main_protein_count");
    expect(codes(vegLunch, "vegetarian")).not.toContain("legume_rule");
    // mäso + strukovina v jednom jedle (nevegetarián)
    expect(codes([...okDay(), ri("Šošovica varená", "obed", 150)], "none")).toContain("legume_rule");
    // 2× strukovina za deň (nevegetarián): cícer na obed (príloha namiesto ryže) a šošovica na večeru (namiesto zemiakov)
    const twoLegumes = okDay().map((i) => (i.name === "Ryža varená" ? ri("Cícer varený", "obed", 250) : i.name === "Zemiaky varené" ? ri("Šošovica varená", "vecera", 250) : i));
    expect(codes(twoLegumes, "none")).toContain("legume_rule");
  });

  test("mliečne: najviac 1 v jedle a 3 za deň", () => {
    expect(codes([...okDay(), ri("Sójový jogurt", "olovrant", 150)])).toContain("dairy_meal");
    const many = [...okDay(), ri("Sójový jogurt", "ranajky", 150), ri("Jogurt bez laktózy", "desiata", 100), ri("Sójový jogurt", "ine", 100)];
    expect(codes(many)).toContain("dairy_day");
  });

  test("raňajky: 1 bielkovina (+ mliečne), 1 príloha, bez mäsa a strukovín", () => {
    expect(codes([...okDay(), ri("Morčacia šunka", "ranajky", 60)])).toContain("bf_protein");
    expect(codes([...okDay(), ri("Sójový jogurt", "ranajky", 150)])).not.toContain("bf_protein"); // 2. je mliečne
    expect(codes(okDay().map((i) => (i.slot === "ranajky" && i.name === "Vajce" ? ri("Kuracie prsia", "ranajky", 100) : i)))).toContain("bf_meat");
    expect(codes([...okDay(), ri("Chlieb pšeničný", "ranajky", 80)])).toContain("bf_starch");
    expect(codes(without(okDay(), (i) => i.slot === "ranajky" && i.name === "Ovsené vločky"))).toContain("bf_starch");
  });

  test("desiata: bez uvarených príloh a mäsa; najviac 3 položky", () => {
    expect(codes([...okDay(), ri("Ryža varená", "olovrant", 150)])).toContain("snack_forbidden");
    expect(codes([...okDay(), ri("Zemiaky varené", "olovrant", 150)])).toContain("snack_forbidden");
    expect(codes([...okDay(), ri("Kuracie prsia", "olovrant", 100)])).toContain("snack_forbidden");
    expect(codes([...okDay(), ri("Mandle", "olovrant", 15), ri("Banán", "olovrant", 120)])).toContain("snack_items");
  });

  test("denná pestrosť: potravina najviac 2×, ten istý zdroj bielkovín 1×, forma potraviny jedna", () => {
    expect(codes([...okDay(), ri("Olivový olej", "ranajky", 10)])).toContain("food_repeat"); // olej 3×
    expect(codes(okDay().map((i) => (i.name === "Losos" ? ri("Kuracie prsia", "vecera", 180) : i)))).toContain("protein_repeat");
    expect(codes([...okDay(), ri("Ryža varená", "vecera", 100)])).toContain("main_starch_count");
    const mix = okDay().map((i) => (i.name === "Zemiaky varené" ? { ...ri("Ryža varená", "vecera", 300), name: "Ryža (syrová)", baseName: "Ryža (syrová)", kcal100: 350 } : i));
    expect(codes(mix)).toContain("form_mix");
  });

  test("ovocie + zelenina ≥ 400 g (HARD)", () => {
    expect(codes(okDay().filter((i) => i.name !== "Banán" && i.name !== "Jablko").map((i) => (i.name === "Brokolica" || i.name === "Cuketa" ? { ...i, grams: 150, qty: 150 } : i)))).toContain("fruitveg");
    expect(codes(okDay())).not.toContain("fruitveg");
  });

  test("bielkoviny v jedle: hlavné ≥ 25 g, raňajky ≥ 20 g, desiata ≥ 10 g", () => {
    const low = (slot: MealSlot, grams: number, name: string) => okDay().map((i) => (i.slot === slot && i.name === name ? { ...i, grams, qty: grams } : i));
    expect(codes(low("obed", 20, "Kuracie prsia"))).toContain("slot_protein");
    expect(codes(without(okDay(), (i) => i.slot === "ranajky" && i.name === "Vajce"))).toContain("slot_protein");
    expect(codes(without(okDay(), (i) => i.name === "Skyr biely"))).toContain("slot_protein");
    expect(codes(okDay())).not.toContain("slot_protein");
  });

  test("mäkké upozornenia: tuky pod cieľom trénera −3 p. b.; protein_meal len nad 60 g", () => {
    const w = softWarnings([{ dayNo: 1, items: okDay() }], { kcal: 2000, proteinG: 150, carbsG: 150, fatG: 120 });
    expect(w.map((x) => x.code)).toContain("fat_share");
    expect(softWarnings([{ dayNo: 1, items: okDay() }], T).map((x) => x.code)).not.toContain("protein_meal");
  });

  test("sanity skóre: značkové základné potraviny, opakovanie a tuky mimo cieľ znižujú skóre", () => {
    const base = sanityScore(okDay(), { targets: T });
    const branded = okDay().map((i) => (i.name === "Kuracie prsia" ? { ...i, branded: true } : i));
    expect(sanityScore(branded, { targets: T }).score).toBeLessThan(base.score);
    expect(sanityScore(okDay(), { targets: { ...T, fatG: 130 } }).notes.join(" ")).toContain("tuky");
    expect(sanityScore([], { targets: T }).score).toBe(0);
  });
});

// ---------------------------------------------------------------- parsePicks: odmietnutie
const PLAN4 = planMeals(T, SLOTS, availableGroups(POOL));
const KNOWN = new Map(POOL.map((f) => [f.ref, f]));
const ctx = (over: Partial<Parameters<typeof parsePicks>[1]> = {}) => ({ known: KNOWN, plan: PLAN4, diet: "none" as DietType, excluded: [] as string[], dayNo: 1, ...over });
const g = (group: string, ...names: string[]) => ({ group, food_refs: names.map((n) => byName(n).ref) });
const reasons = (raw: unknown, over = {}) => parsePicks(raw, ctx(over)).dropped.map((d) => `${d.reason}: ${d.detail}`).join(" | ");

test.describe("parsePicks: výber modelu porušujúci pravidlá sa zamietne s dôvodom", () => {
  test("hlavné jedlo: 2 bielkoviny, 2 prílohy, 2 tuky, údeniny, viac než 2 zeleniny", () => {
    expect(reasons([{ slot: "obed", groups: [g("protein", "Kuracie prsia", "Vajce")] }])).toContain("smie byť najviac 1");
    expect(reasons([{ slot: "obed", groups: [g("starch", "Ryža varená", "Quinoa varená")] }])).toContain("smie byť najviac 1");
    expect(reasons([{ slot: "obed", groups: [g("fat", "Olivový olej", "Mandle")] }])).toContain("smie byť najviac 1");
    expect(reasons([{ slot: "obed", groups: [g("protein", "Morčacia šunka")] }])).toContain("údeniny");
    expect(reasons([{ slot: "obed", groups: [g("vegetable", "Brokolica", "Mrkva", "Cuketa")] }])).toContain("najviac 2");
    const ok = parsePicks([{ slot: "obed", groups: [g("vegetable", "Brokolica", "Mrkva")] }], ctx());
    expect(ok.picks.get("obed")!.vegetable).toHaveLength(2);
  });

  test("strukoviny: ako bielkovina len vo veg. diéte; s mäsom nie; max 1×/deň", () => {
    expect(reasons([{ slot: "obed", groups: [g("protein", "Šošovica varená")] }])).toContain("strukoviny sú bielkovina len");
    expect(parsePicks([{ slot: "obed", groups: [g("protein", "Šošovica varená")] }], ctx({ diet: "vegan" })).picks.get("obed")!.protein).toHaveLength(1);
    expect(reasons([{ slot: "obed", groups: [g("protein", "Kuracie prsia"), g("starch", "Cícer varený")] }])).toContain("nekombinujú s mäsom");
    expect(reasons([{ slot: "obed", groups: [g("protein", "Kuracie prsia"), g("starch", "Ryža varená")] }, { slot: "vecera", groups: [g("starch", "Cícer varený")] }, { slot: "ranajky", groups: [g("starch", "Šošovica varená")] }])).toContain("strukoviny");
  });

  test("raňajky a desiata: mäso/ryby a strukoviny na raňajky nie; uvarená príloha do desiaty nie; 2 bielkoviny nie", () => {
    expect(reasons([{ slot: "ranajky", groups: [g("protein", "Kuracie prsia")] }])).toContain("nepatria na raňajky");
    expect(reasons([{ slot: "ranajky", groups: [g("protein", "Vajce", "Morčacia šunka")] }])).toContain("najviac 1");
    expect(reasons([{ slot: "ranajky", groups: [g("starch", "Ovsené vločky", "Chlieb pšeničný")] }])).toContain("najviac 1");
    const plan6 = planMeals(T, slotsForMealCount(5), availableGroups(POOL));
    expect(reasons([{ slot: "desiata", groups: [g("starch", "Ryža varená")] }], { plan: plan6 })).toMatch(/skupina starch nie je v šablóne|nepatria do desiaty|nepatrí do skupiny/);
    expect(parsePicks([{ slot: "ranajky", groups: [g("protein", "Vajce"), g("dairy", "Sójový jogurt")] }], ctx()).dropped).toEqual([]);
  });

  test("mliečne: max 1 v jedle (maxPicks), max 3 za deň a len v skupine dairy", () => {
    expect(reasons([{ slot: "ranajky", groups: [g("dairy", "Sójový jogurt", "Skyr biely")] }])).toContain("najviac 1");
    expect(reasons([{ slot: "ranajky", groups: [g("protein", "Skyr biely")] }])).toContain("nepatrí do skupiny protein");
    const plan6 = planMeals(T, slotsForMealCount(6), availableGroups(POOL));
    // šablóna 6 jedál má mliečne najviac v 3 jedlách; v 6. (ine) je len bielkovina
    expect(plan6.filter((m) => m.groups.some((x) => x.group === "dairy"))).toHaveLength(3);
    expect(reasons([{ slot: "ine", groups: [g("dairy", "Sójový jogurt")] }], { plan: plan6 })).toContain("nie je v šablóne");
  });

  test("opakovanie: potravina max 2× za deň (tuk), ten istý zdroj bielkovín 1×, suchá + uvarená forma nie", () => {
    const three = [{ slot: "ranajky", groups: [g("fat", "Olivový olej")] }, { slot: "obed", groups: [g("fat", "Olivový olej")] }, { slot: "vecera", groups: [g("fat", "Olivový olej")] }];
    expect(reasons(three)).toContain("už je v dni 2×");
    expect(reasons([{ slot: "obed", groups: [g("protein", "Kuracie prsia")] }, { slot: "vecera", groups: [g("protein", "Kuracie prsia")] }])).toContain("ten istý zdroj bielkovín");
    const raw = custom("Ryža (surová)", 350, 7, 77, 1);
    const known = new Map([...KNOWN, [raw.ref, raw]]);
    const res = parsePicks([{ slot: "obed", groups: [{ group: "starch", food_refs: [byName("Ryža varená").ref] }] }, { slot: "vecera", groups: [{ group: "starch", food_refs: [raw.ref] }] }], ctx({ known }));
    expect(res.dropped.map((d) => d.detail).join(" ")).toContain("suchá a uvarená forma");
  });

  test("značkový produkt na základnú potravinu sa zamietne, ak je knižničná; na jogurt/pečivo nie", () => {
    const off = custom("Kuracie prsia údené", 110, 23, 0, 1.5, { source: "off", foodId: null, barcode: "1" });
    const known = new Map([...KNOWN, [off.ref, off]]);
    const lib = new Set(["protein", "dairy", "starch", "vegetable", "fruit", "fat"] as const);
    expect(parsePicks([{ slot: "obed", groups: [{ group: "protein", food_refs: [off.ref] }] }], ctx({ known, libGroups: lib })).dropped[0].detail).toContain("značkový");
    const offYogurt = custom("Jogurt bez laktózy", 58, 4.5, 5, 2, { source: "off", foodId: null, barcode: "2" });
    const known2 = new Map([...KNOWN, [offYogurt.ref, offYogurt]]);
    expect(parsePicks([{ slot: "ranajky", groups: [{ group: "dairy", food_refs: [offYogurt.ref] }] }], ctx({ known: known2, libGroups: lib })).dropped).toEqual([]);
  });
});

// ---------------------------------------------------------------- completePicks: kód nikdy neporuší pravidlá
function dayItems(targets: MacroTargets, slots: MealSlot[], dayIndex: number, diet: DietType, picks: DayPicks = new Map(), opts: { avoid?: Set<string>; forceFish?: boolean } = {}) {
  const pool = usable(diet);
  const plan = planMeals(targets, slots, availableGroups(pool, diet));
  const done = completePicks(plan, picks, pool, dayIndex, { diet, ...opts });
  const items = composeDay(done.plan, done.picks, targets, diet);
  const tuned = fineTuneDay(items, { targets, requiredSlots: slots, diet });
  return { plan, done, tuned };
}

test.describe("completePicks: výsledok vždy spĺňa pravidlá skladby", () => {
  test("nepriateľský výber modelu (všetko porušuje pravidlá) sa nahradí platným", () => {
    const hostile: DayPicks = new Map([
      ["ranajky", { protein: [byName("Kuracie prsia")], starch: [byName("Ryža varená")], dairy: [byName("Sójový jogurt"), byName("Skyr biely")] }],
      ["obed", { protein: [byName("Kuracie prsia"), byName("Vajce")], starch: [byName("Cícer varený"), byName("Ryža varená")], fat: [byName("Olivový olej"), byName("Mandle")] }],
      ["olovrant", { dairy: [byName("Skyr biely")], fruit: [byName("Banán")] }],
      ["vecera", { protein: [byName("Kuracie prsia")], starch: [byName("Zemiaky varené")], vegetable: [byName("Brokolica")] }],
    ]);
    const { tuned } = dayItems(T, SLOTS, 0, "none", hostile);
    expect(tuned.check.violations.map((v) => v.detail)).toEqual([]);
    expect(codes(tuned.items)).toEqual([]);
  });

  test("hlavné bielkoviny sa líšia od predchádzajúceho dňa a ryba sa dá vynútiť", () => {
    const a = dayItems(T, SLOTS, 0, "none");
    const avoid = mainProteinKeys(a.done.picks);
    expect(avoid.size).toBe(2);
    const b = dayItems(T, SLOTS, 1, "none", new Map(), { avoid });
    for (const key of mainProteinKeys(b.done.picks)) expect(avoid.has(key)).toBe(false);
    const fish = dayItems(T, SLOTS, 2, "none", new Map(), { forceFish: true });
    expect([...(fish.done.picks.get("obed")?.protein ?? [])].some((f) => isFish(f.name))).toBe(true);
    expect(fish.tuned.check.violations.map((v) => v.detail)).toEqual([]);
  });

  test("pickProblem: vegetarián môže mať strukovinu ako bielkovinu, mäso nie", () => {
    const picks: DayPicks = new Map();
    expect(pickProblem(byName("Šošovica varená"), "obed", "protein", picks, { diet: "vegetarian" })).toBeNull();
    expect(pickProblem(byName("Šošovica varená"), "obed", "protein", picks, { diet: "none" })).not.toBeNull();
    expect(foodCategory("Šošovica varená", 116)).toBe("legume");
  });
});

// ---------------------------------------------------------------- celý generátor: všetky diéty × 3–6 jedál × 7 dní
const usage = { input_tokens: 10, output_tokens: 10, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
const msg = (content: unknown[], stop_reason: string) => ({ content, stop_reason, usage }) as unknown as Anthropic.Message;
const toolUse = (id: string, name: string, input: unknown) => ({ type: "tool_use", id, name, input });
const fakeSupabase = {} as SupabaseClient;

/** Klient, ktorý nájde celý pool a potom pri každom dni vráti PRÁZDNY výber (všetko doplní kód) alebo výber z `picker`. */
function client(picker?: (dayNo: number, byName: Map<string, string>) => unknown) {
  const refByName = new Map<string, string>();
  let phase = 0;
  const create: CreateMessage = async (p) => {
    const isDay = (p.tools as Anthropic.Tool[]).every((t) => t.name === "submit_day");
    if (!isDay) {
      phase++;
      if (phase === 1) {
        DEFS.forEach(([n], i) => refByName.set(n, `F${i + 1}`));
        return msg(DEFS.map(([n], i) => toolUse(`s${i}`, "search_foods", { query: n, limit: 1 })), "tool_use");
      }
      return msg([toolUse("o", "submit_outline", { days: [] })], "tool_use");
    }
    const dayNo = Number(/Deň (\d+) z/.exec(p.messages[0].content as string)![1]);
    return msg([toolUse(`d${dayNo}`, "submit_day", { meals: picker ? picker(dayNo, refByName) : [] })], "tool_use");
  };
  return create;
}
const input = (over: Partial<MealGeneratorInput>): MealGeneratorInput => ({
  supabase: fakeSupabase, trainerId: "t", locale: "sk", targets: { kcal: 2400, proteinG: 150, carbsG: 280, fatG: 80 }, days: 7, mealsPerDay: 4,
  diet: "none", excludedText: "", repeat: "varied", dayName: (n) => `Deň ${n}`, ...over,
});
const toRule = (i: { ref: string; food: KnownFood; slot: MealSlot; unit: RuleItem["unit"]; qty: number; grams: number }, n: number): RuleItem => ({
  key: `x${n}`, ref: i.ref, baseName: i.food.baseName, name: i.food.name, slot: i.slot, unit: i.unit, qty: i.qty, grams: i.grams,
  kcal100: i.food.kcal100, protein100: i.food.protein100, carbs100: i.food.carbs100, fat100: i.food.fat100, fiber100: i.food.fiber100, portion: i.food.portion,
});

test.describe("generateMealPlan: nulové porušenie pravidiel, makrá v pásme (diéty × jedlá × 7 dní)", () => {
  const DIETS: DietType[] = ["none", "vegetarian", "vegan", "lactose_free", "gluten_free"];
  const fatStats: number[] = [];
  const sanityStats: number[] = [];
  for (const diet of DIETS) {
    test(`diéta ${diet}: 3–6 jedál × 7 dní`, async () => {
      for (const meals of [3, 4, 5, 6]) {
        const inp = input({ diet, mealsPerDay: meals });
        const res = await generateMealPlan(inp, { loadLibrary: async () => LIB, offIndex: async () => null, create: client() });
        expect(res.ok, `${diet}/${meals}: ${res.ok ? "" : res.reason + " " + res.detail}`).toBe(true);
        if (!res.ok) return;
        expect(res.missingDays, `${diet}/${meals}`).toEqual([]);
        const slots = slotsForMealCount(meals);
        const mainProteins: Set<string>[] = [];
        let fishMeals = 0;
        for (const d of res.days) {
          const items = d.items.map(toRule);
          const check = checkDay(items, { targets: inp.targets, requiredSlots: slots, diet });
          expect(check.violations.map((v) => `${diet}/${meals}/${d.name}: ${v.detail}`), `${diet}/${meals}`).toEqual([]);
          const total = check.totals;
          expect(Math.abs(total.kcal - 2400) / 2400).toBeLessThanOrEqual(0.05);
          expect(total.proteinG / 150).toBeGreaterThanOrEqual(0.9);
          expect(total.proteinG / 150).toBeLessThanOrEqual(1.15);
          const fatShare = (total.fatG * 9) / total.kcal;
          fatStats.push(Math.abs(fatShare - (inp.targets.fatG * 9) / inp.targets.kcal));
          sanityStats.push(sanityScore(items, { targets: inp.targets, diet }).score);
          const keys = new Set(d.items.filter((i) => i.slot === "obed" || i.slot === "vecera").flatMap((i) => (roleOfItem(toRule(i, 0), diet) === "protein" ? [i.food.name] : [])));
          mainProteins.push(keys);
          fishMeals += d.items.filter((i) => (i.slot === "obed" || i.slot === "vecera") && isFish(i.food.name)).length;
        }
        // rôzne hlavné bielkoviny v po sebe idúcich dňoch. Pri vegetariánskej/vegánskej diéte je hustých zdrojov
        // (tempeh, seitan) málo a porcia musí pokryť bielkoviny, preto sa tam kontrola variácie neuplatňuje.
        const veg = diet === "vegetarian" || diet === "vegan";
        if (!veg) {
          for (let i = 1; i < mainProteins.length; i++) for (const n of mainProteins[i]) expect(mainProteins[i - 1].has(n), `${diet}/${meals} deň ${i + 1}: ${n}`).toBe(false);
        }
        // aspoň 2 jedlá z rýb za týždeň, ak diéta dovoľuje ryby
        if (diet !== "vegetarian" && diet !== "vegan") expect(fishMeals, `${diet}/${meals}`).toBeGreaterThanOrEqual(2);
        expect(res.sanity.length).toBe(7);
      }
    });
  }

  test("podiel tukov sa drží pri cieli trénera (±3 p. b. u väčšiny dní) a sanity skóre je vysoké", () => {
    const within = fatStats.filter((d) => d <= 0.03).length / fatStats.length;
    const avgSanity = sanityStats.reduce((a, b) => a + b, 0) / sanityStats.length;
    console.log(`fat within ±3pp: ${(within * 100).toFixed(0)} % z ${fatStats.length} dní, priemerné sanity ${avgSanity.toFixed(1)}`);
    expect(within).toBeGreaterThanOrEqual(0.7);
    expect(avgSanity).toBeGreaterThanOrEqual(80);
  });

  test("rôzne denné ciele (1600–3500 kcal, 1,6–2,3 g bielkovín/kg) × diéty bez obmedzení a bez laktózy × 3–6 jedál: bez porušení", async () => {
    const targetsList: MacroTargets[] = [
      { kcal: 1600, proteinG: 110, carbsG: 160, fatG: 55 },
      { kcal: 1900, proteinG: 130, carbsG: 210, fatG: 63 },
      { kcal: 2200, proteinG: 160, carbsG: 230, fatG: 70 },
      { kcal: 2800, proteinG: 190, carbsG: 330, fatG: 85 },
      { kcal: 3500, proteinG: 210, carbsG: 440, fatG: 105 },
    ];
    const failures: string[] = [];
    for (const targets of targetsList) {
      for (const diet of ["none", "lactose_free"] as DietType[]) {
        for (const meals of [3, 4, 5, 6]) {
          // 3500 kcal na 3 jedlá (~1170 kcal/jedlo) sa pri jednej prílohe so stropom 400 g a strope tukov fyzicky nedá
          if (targets.kcal >= 3500 && meals === 3) continue;
          const inp = input({ diet, mealsPerDay: meals, days: 4, targets });
          const res = await generateMealPlan(inp, { loadLibrary: async () => LIB, offIndex: async () => null, create: client() });
          if (!res.ok) {
            failures.push(`${targets.kcal}/${diet}/${meals}: ${res.reason}`);
            continue;
          }
          for (const m of res.missingDays) failures.push(`${targets.kcal}/${diet}/${meals}: deň ${m} chýba`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  test("test 2934/176/379/79, 4 jedlá, bez laktózy, cs: výber modelu s porušeniami sa opraví a plán prejde", async () => {
    const targets = { kcal: 2934, proteinG: 176, carbsG: 379, fatG: 79 };
    const bad = (_d: number, r: Map<string, string>) => [
      { slot: "ranajky", groups: [{ group: "protein", food_refs: [r.get("Kuracie prsia")!] }, { group: "dairy", food_refs: [r.get("Skyr biely")!, r.get("Sójový jogurt")!] }] },
      { slot: "obed", groups: [{ group: "protein", food_refs: [r.get("Losos")!, r.get("Šošovica varená")!] }, { group: "starch", food_refs: [r.get("Ryža varená")!, r.get("Quinoa varená")!] }] },
    ];
    const res = await generateMealPlan(input({ locale: "cs", days: 3, mealsPerDay: 4, diet: "lactose_free", targets }), { loadLibrary: async () => LIB, offIndex: async () => null, create: client(bad) });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.repaired).toBe(true);
    expect(res.dropped.length).toBeGreaterThan(0);
    for (const d of res.days) {
      const check = checkDay(d.items.map(toRule), { targets, requiredSlots: slotsForMealCount(4), diet: "lactose_free" });
      expect(check.violations.map((v) => v.detail)).toEqual([]);
      expect(Math.abs(check.totals.kcal - 2934) / 2934).toBeLessThanOrEqual(0.05);
    }
  });
});
