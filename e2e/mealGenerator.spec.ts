// i18n-ignore-file: testovacie vety (SK) pre AI generátor jedálničkov
import { test, expect } from "@playwright/test";
import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CreateMessage } from "../lib/ai/chatLoop";
import type { FoodCandidate } from "../lib/ai/foodContext";
import { buildIndex } from "../lib/foodIndexCore";
import {
  createMealSearch,
  generateMealPlan,
  MEAL_GEN_MAX_PARALLEL,
  MEAL_GEN_SOFT_DEADLINE_MS,
  distinctDayCount,
  parseOutline,
  parsePicks,
  type MealGeneratorInput,
} from "../lib/ai/mealGenerator";
import { analyzeDays, dietViolation, exclusionWords, findExcludedWord, slotsForMealCount, type KnownFood, type MacroTargets } from "../lib/ai/mealPlanValidation";
import { checkDay, itemCategory, type RuleItem } from "../lib/ai/mealRules";
import { planMeals } from "../lib/ai/mealPortions";

/**
 * AI generátor jedálničkov: čisté testy bez siete a bez volania Anthropic API — kontrola výberu modelu
 * (ref, skupina, diéta, vylúčené) a slučka s falošným klientom (model len vyberá, gramy počíta kód).
 */

const food = (over: Partial<KnownFood> & Pick<KnownFood, "ref" | "name">): KnownFood => ({
  source: "kniznica",
  foodId: `id-${over.ref}`,
  barcode: null,
  kcal100: 100,
  protein100: 10,
  carbs100: 10,
  fat100: 2,
  portion: { unitBase: "g" },
  ...over,
});

const KNOWN = new Map<string, KnownFood>(
  [
    food({ ref: "F1", name: "Kuracie prsia", kcal100: 110, protein100: 23, carbs100: 0, fat100: 1.5 }),
    food({ ref: "F2", name: "Vajce", kcal100: 143, protein100: 12.6, carbs100: 0.7, fat100: 9.5, portion: { unitBase: "g", pieceGrams: 55 } }),
    food({ ref: "F3", name: "Ryža varená", kcal100: 130, protein100: 2.7, carbs100: 28, fat100: 0.3 }),
    food({ ref: "F4", name: "Skyr jahoda", source: "off", foodId: null, barcode: "123", kcal100: 63, protein100: 11, carbs100: 4, fat100: 0.2, portion: { unitBase: "g", servingGrams: 140, packageGrams: 140 } }),
    food({ ref: "F5", name: "Mlieko polotučné", kcal100: 46, protein100: 3.4, carbs100: 4.8, fat100: 1.5, portion: { unitBase: "ml", packageGrams: 1000 } }),
    food({ ref: "F6", name: "Brokolica", kcal100: 34, protein100: 2.8, carbs100: 7, fat100: 0.4 }),
  ].map((f) => [f.ref, f]),
);

const T1: MacroTargets = { kcal: 2000, proteinG: 150, carbsG: 220, fatG: 65 };
const PLAN3 = planMeals(T1, slotsForMealCount(3));
const PICK_CTX = { known: KNOWN, plan: PLAN3, diet: "none" as const, excluded: [] as string[], dayNo: 1 };
const grp = (group: string, ...food_refs: string[]) => ({ group, food_refs });

test.describe("mealPlanValidation", () => {
  test("sloty podľa počtu jedál", () => {
    expect(slotsForMealCount(3)).toEqual(["ranajky", "obed", "vecera"]);
    expect(slotsForMealCount(4)).toEqual(["ranajky", "obed", "olovrant", "vecera"]);
    expect(slotsForMealCount(5)).toContain("desiata");
    expect(slotsForMealCount(6)[5]).toBe("ine");
    expect(slotsForMealCount(1)).toHaveLength(3);
    expect(slotsForMealCount(99)).toHaveLength(6);
  });

  test("vylúčené potraviny (voľný text, skloňovanie, bez diakritiky)", () => {
    const words = exclusionWords("Nejem vajcia, ryžu a huby!");
    expect(words).toEqual(expect.arrayContaining(["vajcia", "ryzu", "huby"]));
    expect(words).not.toContain("nejem");
    expect(findExcludedWord("Vajce", ["vajcia"])).toBe("vajcia");
    expect(findExcludedWord("Ryža jasmínová", ["ryzu"])).toBe("ryzu");
    expect(findExcludedWord("Kuracie prsia", ["vajcia", "ryzu"])).toBeNull();
    expect(findExcludedWord("Kuracie prsia", [])).toBeNull();
  });

  test("diéta: očividné porušenia podľa názvu", () => {
    expect(dietViolation("Kuracie prsia", "vegetarian")).not.toBeNull();
    expect(dietViolation("Losos údený", "vegetarian")).not.toBeNull();
    expect(dietViolation("Ryža", "vegetarian")).toBeNull();
    expect(dietViolation("Vajce", "vegetarian")).toBeNull();
    expect(dietViolation("Vajce", "vegan")).not.toBeNull();
    expect(dietViolation("Mlieko polotučné", "vegan")).not.toBeNull();
    expect(dietViolation("Ovsený nápoj", "vegan")).toBeNull();
    expect(dietViolation("Arašidové maslo", "vegan")).toBeNull();
    expect(dietViolation("Mlieko polotučné", "lactose_free")).not.toBeNull();
    expect(dietViolation("Mlieko bezlaktózové", "lactose_free")).toBeNull();
    expect(dietViolation("Kuracie prsia", "lactose_free")).toBeNull();
    expect(dietViolation("Pšeničný chlieb", "gluten_free")).not.toBeNull();
    expect(dietViolation("Chlieb bezlepkový", "gluten_free")).toBeNull();
    expect(dietViolation("Kuracie prsia", "none")).toBeNull();
  });

  test("analyzeDays: kcal ±5 %, bielkoviny −10 % / +15 %", () => {
    const day = (kcal: number, proteinG: number) => ({ name: "d", items: [{ macros: { kcal, proteinG, carbsG: 0, fatG: 0 } }] }) as never;
    const a = analyzeDays([day(2000, 150), day(2000, 168), day(2000, 133), day(2200, 150), day(2000, 175)], T1);
    expect(a.map((x) => x.ok)).toEqual([true, true, false, false, false]);
  });
});

// ---------------------------------------------------------------- kontrola výberu modelu
test.describe("parsePicks: výber modelu sa overuje, gramy nie sú jeho vec", () => {
  test("platný výber prejde; neznámy ref, potravina mimo skupiny, skupina mimo šablóny a zlý slot sa zahodia", () => {
    const p = parsePicks(
      [
        { slot: "obed", groups: [grp("protein", "F1", "F99"), grp("starch", "F3", "F1"), grp("vegetable", "F6"), grp("dairy", "F5")] },
        { slot: "brunch", groups: [grp("protein", "F1")] },
      ],
      PICK_CTX,
    );
    expect(p.picks.get("obed")!.protein!.map((f) => f.ref)).toEqual(["F1"]);
    expect(p.picks.get("obed")!.starch!.map((f) => f.ref)).toEqual(["F3"]); // kuracie nie je príloha
    expect(p.picks.get("obed")!.vegetable!.map((f) => f.ref)).toEqual(["F6"]);
    expect(p.dropped.map((d) => d.reason).sort()).toEqual(["bad_group", "bad_group", "bad_slot", "unknown_ref"]);
    // chýbajúce povinné skupiny šablóny sú vypísané; mliečne a tuk sú voliteľné (doplní kód)
    expect(p.missing).toContain("vecera/protein");
    expect(p.missing).toContain("ranajky/starch");
    expect(p.missing).not.toContain("obed/fat");
    expect(p.missing).not.toContain("obed/protein");
  });

  test("v hlavnom jedle presne 1 bielkovina: druhá a duplicita sa zahodia; zelenina smie byť 2 druhy", () => {
    const p = parsePicks([{ slot: "obed", groups: [grp("protein", "F1", "F1", "F2", "F4"), grp("vegetable", "F6")] }], PICK_CTX);
    expect(p.picks.get("obed")!.protein!.map((f) => f.ref)).toEqual(["F1"]);
    expect(p.dropped.length).toBeGreaterThanOrEqual(2);
  });

  test("vylúčené potraviny a diéta", () => {
    const veg = parsePicks([{ slot: "obed", groups: [grp("protein", "F1", "F2")] }], { ...PICK_CTX, diet: "vegetarian" });
    expect(veg.picks.get("obed")!.protein!.map((f) => f.ref)).toEqual(["F2"]);
    expect(veg.dropped[0].reason).toBe("diet");
    const ex = parsePicks([{ slot: "obed", groups: [grp("starch", "F3")] }], { ...PICK_CTX, excluded: exclusionWords("nejem ryžu") });
    expect(ex.picks.get("obed")).toBeUndefined();
    expect(ex.dropped[0].reason).toBe("excluded");
    // nevhodný tvar vstupu nespadne
    expect(parsePicks("zle", PICK_CTX).missing.length).toBeGreaterThan(0);
    expect(parsePicks([null, { slot: "obed", groups: "x" }], PICK_CTX).picks.size).toBe(0);
  });
});

// ---------------------------------------------------------------- hľadanie s ref-mi
const LIB: FoodCandidate[] = [
  { id: "lib-1", name: "Kuracie prsia", nameCs: "Kuřecí prsa", kcal100g: 110, protein100g: 23, carbs100g: 0, fat100g: 1.5, portion: { unitBase: "g" } },
  { id: "lib-2", name: "Vajce", kcal100g: 143, protein100g: 12.6, carbs100g: 0.7, fat100g: 9.5, portion: { unitBase: "g", pieceGrams: 55 } },
  { id: "lib-3", name: "Ryža", kcal100g: 350, protein100g: 7, carbs100g: 77, fat100g: 1, portion: { unitBase: "g" } },
];
const fakeSupabase = {} as SupabaseClient;

test.describe("createMealSearch", () => {
  test("výsledky dostanú stabilné ref-y a zapamätajú sa; neznáme ref-y neexistujú", async () => {
    const s = createMealSearch({ supabase: fakeSupabase, trainerId: "t", locale: "sk", loadLibrary: async () => LIB, offIndex: async () => null });
    const a = await s.run({ query: "vajce" });
    expect(a.content).toContain("F1 | Vajce [knižnica]");
    expect(a.content).toContain("piece=55g");
    const b = await s.run({ query: "vajce" });
    expect(b.content).toBe(a.content); // rovnaká potravina = rovnaký ref
    await s.run({ query: "ryža" });
    expect([...s.known.keys()]).toEqual(["F1", "F2"]);
    expect(s.known.get("F1")!.foodId).toBe("lib-2");
    expect((await s.run({ query: "" })).isError).toBe(true);
    expect((await s.run({ query: "zzzzzz" })).content).toContain("Nenájdené");
  });
});

// ---------------------------------------------------------------- generátor s falošným klientom (model vyberá, kód počíta)
const usage = { input_tokens: 1000, output_tokens: 100, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
const msg = (content: unknown[], stop_reason: string) => ({ content, stop_reason, usage }) as unknown as Anthropic.Message;
const toolUse = (id: string, name: string, input: unknown) => ({ type: "tool_use", id, name, input });

const mkFood = (id: string, name: string, k: number, p: number, c: number, f: number, portion: FoodCandidate["portion"] = { unitBase: "g" }, fiber = 0): FoodCandidate => ({
  id,
  name,
  kcal100g: k,
  protein100g: p,
  carbs100g: c,
  fat100g: f,
  fiber100g: fiber,
  portion,
});
// refy po poradí hľadania: F1 kuracie, F2 losos, F3 ryža, F4 vločky, F5 skyr, F6 brokolica, F7 olej, F8 mandle, F9 jablko
const LIB2: FoodCandidate[] = [
  mkFood("l-kuracie", "Kuracie prsia", 110, 23, 0, 1.5),
  mkFood("l-losos", "Losos", 208, 20, 0, 13),
  mkFood("l-ryza", "Ryža varená", 130, 2.7, 28, 0.3, { unitBase: "g" }, 0.4),
  mkFood("l-vlocky", "Ovsené vločky", 370, 13, 60, 7, { unitBase: "g" }, 10),
  mkFood("l-skyr", "Skyr biely", 63, 11, 4, 0.2),
  mkFood("l-brokolica", "Brokolica", 34, 2.8, 7, 0.4, { unitBase: "g" }, 2.6),
  mkFood("l-olej", "Olivový olej", 884, 0, 0, 100),
  mkFood("l-mandle", "Mandle", 580, 21, 22, 50, { unitBase: "g" }, 12),
  mkFood("l-jablko", "Jablko", 52, 0.3, 14, 0.2, { unitBase: "g", pieceGrams: 150 }, 2.4),
];
const QUERIES = ["kuracie", "losos", "ryža", "vločky", "skyr", "brokolica", "olej", "mandle", "jablko"];

const INPUT: MealGeneratorInput = {
  supabase: fakeSupabase,
  trainerId: "t",
  locale: "sk",
  targets: T1,
  days: 1,
  mealsPerDay: 3,
  diet: "none",
  excludedText: "",
  repeat: "varied",
  dayName: (n) => `Deň ${n}`,
};
const DEPS = { loadLibrary: async () => LIB2, offIndex: async () => null };
const searches = (qs = QUERIES) => qs.map((q, i) => toolUse(`s${i}`, "search_foods", { query: q, limit: 1 }));
const outlineTu = (days: number) =>
  toolUse("o1", "submit_outline", {
    days: Array.from({ length: days }, () => ({ meals: [{ slot: "obed", protein_ref: "F1", carb_ref: "F3" }, { slot: "vecera", protein_ref: "F99" }] })),
  });
const dayTu = (id: string, meals: unknown) => toolUse(id, "submit_day", { meals });

type Meal = { slot: string; groups: { group: string; food_refs: string[] }[] };
/** Platný výber: raňajky skyr + vločky + jablko + mandle; obed kuracie + ryža + brokolica + olej; večera losos + ryža + brokolica + olej. */
const GOOD: Meal[] = [
  { slot: "ranajky", groups: [grp("dairy", "F5"), grp("starch", "F4"), grp("fruit", "F9"), grp("fat", "F8")] },
  { slot: "obed", groups: [grp("protein", "F1"), grp("starch", "F3"), grp("vegetable", "F6"), grp("fat", "F7")] },
  { slot: "vecera", groups: [grp("protein", "F2"), grp("starch", "F3"), grp("vegetable", "F6"), grp("fat", "F7")] },
];
/** Samé neplatné výbery (neznámy ref, kuracie ako príloha). */
const BAD: Meal[] = [{ slot: "obed", groups: [grp("protein", "F42"), grp("starch", "F1")] }];
const dayKcal = (d: { items: { macros: { kcal: number } }[] }) => d.items.reduce((s, i) => s + i.macros.kcal, 0);

/** Router: fáza 1 (má search_foods) a fáza 2 (submit_day) po dňoch; sleduje súbežnosť. */
function router(phase1: Anthropic.Message[], perDay: Record<number, Anthropic.Message[]>, delayMs = 0) {
  const seen: Anthropic.MessageCreateParamsNonStreaming[] = [];
  let active = 0;
  let maxActive = 0;
  const create: CreateMessage = async (p) => {
    seen.push(structuredClone(p));
    const isDay = (p.tools as Anthropic.Tool[]).every((t) => t.name === "submit_day");
    if (!isDay) {
      const r = phase1.shift();
      if (!r) throw new Error("nečakaná fáza 1");
      return r;
    }
    const first = p.messages[0].content as string;
    const n = Number(/Deň (\d+) z/.exec(first)![1]);
    active++;
    maxActive = Math.max(maxActive, active);
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    active--;
    const r = perDay[n]?.shift();
    if (!r) throw new Error(`nečakané volanie dňa ${n}`);
    return r;
  };
  return { create, seen, maxActive: () => maxActive };
}
const phase1 = (days = 1) => [msg(searches(), "tool_use"), msg([outlineTu(days)], "tool_use")];
const day = (id: string, meals: Meal[]) => msg([dayTu(id, meals)], "tool_use");
const dayCalls = (r: ReturnType<typeof router>, n: number) => r.seen.filter((p) => String(p.messages[0].content).includes(`Deň ${n} z`));
const toRule = (i: { ref: string; food: KnownFood; slot: RuleItem["slot"]; unit: RuleItem["unit"]; qty: number; grams: number }, k: number): RuleItem => ({
  key: `r${k}`, baseName: i.food.baseName, name: i.food.name, slot: i.slot, unit: i.unit, qty: i.qty, grams: i.grams,
  kcal100: i.food.kcal100, protein100: i.food.protein100, carbs100: i.food.carbs100, fat100: i.food.fat100, portion: i.food.portion,
});

test.describe("generateMealPlan (model vyberá potraviny, kód počíta gramy)", () => {
  test("fáza 1 aj dni bez premýšľania, dni paralelne; prompt dňa má šablónu, skupiny a pool bez jednotiek; platný výber = bez opravy", async () => {
    const r = router(phase1(3), { 1: [day("d1", GOOD)], 2: [day("d2", GOOD)], 3: [day("d3", GOOD)] }, 15);
    const res = await generateMealPlan({ ...INPUT, days: 3 }, { ...DEPS, create: r.create });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.days.map((d) => d.name)).toEqual(["Deň 1", "Deň 2", "Deň 3"]);
    expect(res.copies).toEqual([]);
    expect(res.missingDays).toEqual([]);
    // pool má len 2 mäsá, takže rôzne hlavné bielkoviny v po sebe idúcich dňoch sa nedajú — kód ostane pri výbere modelu
    const mainProtein = (d: (typeof res.days)[number]) => d.items.filter((i) => (i.slot === "obed" || i.slot === "vecera") && itemCategory(toRule(i, 0)) === "meat").map((i) => `${i.slot}:${i.food.name}`);
    expect(mainProtein(res.days[0])).toEqual(["obed:Kuracie prsia", "vecera:Losos"]);
    expect(mainProtein(res.days[1])).toHaveLength(2);
    for (const d of res.days) {
      expect(Math.abs(dayKcal(d) - 2000) / 2000).toBeLessThanOrEqual(0.05);
      expect(checkDay(d.items.map(toRule), { targets: T1, requiredSlots: ["ranajky", "obed", "vecera"] }).violations.map((v) => v.detail)).toEqual([]);
    }
    expect(res.usage.calls).toBe(5);
    expect(r.maxActive()).toBe(3);
    expect(r.seen[0].thinking).toEqual({ type: "disabled" });
    expect(String(r.seen[0].system)).toContain("NEURČUJE");
    const day2 = dayCalls(r, 2)[0];
    expect(day2.thinking).toEqual({ type: "disabled" });
    const tool = (day2.tools as Anthropic.Tool[])[0];
    expect(tool.name).toBe("submit_day");
    expect(JSON.stringify(tool.input_schema)).not.toContain("portion_qty"); // model nezadáva množstvá
    const prompt = String(day2.messages[0].content);
    expect(prompt).toContain("Šablóna dňa");
    expect(prompt).toContain("- obed (Obed");
    expect(prompt).toContain("protein ×");
    expect(prompt).toContain("F1 | Kuracie prsia");
    expect(prompt).toMatch(/F3 \| Ryža varená .*skupiny: starch/);
    expect(prompt).not.toContain("jednotky:");
    expect(prompt).toContain("obed: bielkovina F1, sacharid F3");
    expect(prompt).not.toContain("F99");
  });

  test("výber modelu sa použije: kuracie na obed, losos na večeru; gramy sú z kódu (násobky 5 g / 0,5 ks)", async () => {
    const r = router(phase1(), { 1: [day("a", GOOD)] });
    const res = await generateMealPlan(INPUT, { ...DEPS, create: r.create });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const items = res.days[0].items;
    expect(items.filter((i) => i.slot === "obed" && itemCategory(toRule(i, 0)) === "meat").map((i) => i.food.name)).toEqual(["Kuracie prsia"]);
    expect(items.filter((i) => i.slot === "vecera" && itemCategory(toRule(i, 0)) === "meat").map((i) => i.food.name)).toEqual(["Losos"]);
    for (const i of items) {
      if (i.unit === "piece") expect((i.qty * 2) % 1).toBe(0);
      else expect(i.grams % 5).toBe(0);
    }
    expect(res.usage.calls).toBe(3);
  });

  test("neplatný výber → JEDNO opravné kolo s konkrétnymi chybami; po oprave prejde", async () => {
    const r = router(phase1(), { 1: [day("a", BAD), day("b", GOOD)] });
    const res = await generateMealPlan(INPUT, { ...DEPS, create: r.create });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.repaired).toBe(true);
    expect(res.usage.calls).toBe(4);
    const fb = (dayCalls(r, 1).at(-1)!.messages[2].content as Anthropic.ToolResultBlockParam[])[0];
    expect(fb.tool_use_id).toBe("a");
    expect(String(fb.content)).toContain("Appka zahodila");
    expect(String(fb.content)).toContain("F42");
    expect(String(fb.content)).toContain("submit_day");
    expect(res.dropped).toHaveLength(0); // dropped sú z posledného pokusu (platného)
  });

  test("ani po oprave neplatné → zvyšok doplní kód (žiadne ďalšie volanie), deň je platný", async () => {
    const r = router(phase1(), { 1: [day("a", BAD), day("b", BAD)] });
    const res = await generateMealPlan(INPUT, { ...DEPS, create: r.create });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(dayCalls(r, 1)).toHaveLength(2); // nikdy 3. volanie
    expect(res.repaired).toBe(true);
    expect(res.dropped.length).toBeGreaterThan(0);
    expect(res.missingDays).toEqual([]);
    expect(checkDay(res.days[0].items.map(toRule), { targets: T1, requiredSlots: ["ranajky", "obed", "vecera"] }).ok).toBe(true);
  });

  test("model nezavolá submit_day → jedno pripomenutie, potom výber urobí kód", async () => {
    const r = router(phase1(), { 1: [msg([{ type: "text", text: "hotovo" }], "end_turn"), msg([{ type: "text", text: "nie" }], "end_turn")] });
    const res = await generateMealPlan(INPUT, { ...DEPS, create: r.create });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(dayCalls(r, 1)).toHaveLength(2);
    expect(res.repaired).toBe(true);
    expect(Math.abs(dayKcal(res.days[0]) - 2000) / 2000).toBeLessThanOrEqual(0.05);
  });

  test("mäkký limit času: opravné kolo sa preskočí, deň dokončí kód (deadlineHit)", async () => {
    let t = 0;
    const r = router(phase1(), { 1: [day("a", BAD)] });
    const create: CreateMessage = async (p) => {
      const res = await r.create(p);
      if ((p.tools as Anthropic.Tool[]).every((x) => x.name === "submit_day")) t += MEAL_GEN_SOFT_DEADLINE_MS; // čas „beží“ len pri volaniach dňa
      return res;
    };
    const res = await generateMealPlan(INPUT, { ...DEPS, create, now: () => t });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.deadlineHit).toBe(true);
    expect(dayCalls(r, 1)).toHaveLength(1);
  });

  test("variabilný režim: deň, ktorý vyhodí výnimku, nezhodí ostatné (chýba, žiadna kópia)", async () => {
    expect(MEAL_GEN_MAX_PARALLEL).toBe(7);
    const r = router(phase1(3), { 1: [day("a", GOOD)], 3: [day("c", GOOD)] });
    const res = await generateMealPlan({ ...INPUT, days: 3 }, { ...DEPS, create: r.create });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.missingDays).toEqual([2]);
    expect(res.copies).toEqual([]);
    expect(res.days.map((d) => d.name)).toEqual(["Deň 1", "Deň 3"]);
  });

  test("meal prep: bežné kópie sú dizajn; neprešiel deň nahradí kópia najbližšieho (copies)", async () => {
    expect(distinctDayCount(7, "meal_prep")).toBe(3);
    expect(distinctDayCount(3, "meal_prep")).toBe(2);
    expect(distinctDayCount(1, "meal_prep")).toBe(1);
    expect(distinctDayCount(7, "varied")).toBe(7);
    const prep = router(phase1(2), { 1: [day("a", GOOD)], 2: [day("b", GOOD)] });
    const res = await generateMealPlan({ ...INPUT, days: 3, repeat: "meal_prep" }, { ...DEPS, create: prep.create });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.copies).toEqual([]);
    expect(res.usage.calls).toBe(4);
    expect(res.days[2].items.map((i) => i.grams)).toEqual(res.days[0].items.map((i) => i.grams));
    const failed = router(phase1(2), { 1: [day("a", GOOD)] }); // deň 2 vyhodí výnimku
    const res2 = await generateMealPlan({ ...INPUT, days: 3, repeat: "meal_prep" }, { ...DEPS, create: failed.create });
    expect(res2.ok).toBe(true);
    if (!res2.ok) return;
    expect(res2.copies).toEqual([{ day: 2, from: 1 }]);
    expect(res2.missingDays).toEqual([]);
    expect(res2.days).toHaveLength(3);
  });

  test("všetky dni zlyhajú výnimkou → failed; bez nájdených potravín → no_submission; chyba fázy 1 → failed", async () => {
    const r = router(phase1(), {});
    expect(await generateMealPlan(INPUT, { ...DEPS, create: r.create })).toMatchObject({ ok: false, reason: "failed" });
    const empty = router([msg([{ type: "text", text: "nič" }], "end_turn"), msg([{ type: "text", text: "nič" }], "end_turn")], {});
    expect(await generateMealPlan(INPUT, { ...DEPS, create: empty.create })).toMatchObject({ ok: false, reason: "no_submission" });
    const boom: CreateMessage = async () => {
      throw new Error("sieť");
    };
    expect(await generateMealPlan(INPUT, { ...DEPS, create: boom })).toMatchObject({ ok: false, reason: "failed", detail: "sieť" });
  });

  test("pool bez zdroja bielkovín → no_usable", async () => {
    const r = router([msg([toolUse("s", "search_foods", { query: "ryža" })], "tool_use"), msg([outlineTu(1)], "tool_use")], {});
    expect(await generateMealPlan(INPUT, { ...DEPS, create: r.create })).toMatchObject({ ok: false, reason: "no_usable" });
  });

  test("parseOutline: neznáme ref-y a zlé tvary sa preskočia", () => {
    const o = parseOutline({ days: [{ meals: [{ slot: "obed", protein_ref: "F1", carb_ref: "F3" }, { slot: 5 }, null] }, null] }, KNOWN);
    expect(o).toHaveLength(2);
    expect(o[0].get("obed")!.protein!.name).toBe("Kuracie prsia");
    expect(o[1].size).toBe(0);
    expect(parseOutline("zle", KNOWN)).toEqual([]);
  });
});

// ---------------------------------------------------------------- OFF riadky
const OFF_BUNDLE = buildIndex({
  v: "t",
  cols: ["code", "name", "brand", "kcal", "protein", "carbs", "fat", "fiber", "sugars", "salt", "serving_g", "package_g", "unit"],
  rows: [
    ["333", "Skyr jahodový", "Danone", 63, 11, 4, 0.2, 0, 3, 0, null, 140, "g"],
    ["444", "Penne cestoviny", "Barilla", 350, 12, 72, 1.5, 3, 3, 0, null, 500, "g"],
  ],
});
const offSearches = () => [...searches(), toolUse("so1", "search_foods", { query: "jahodový" }), toolUse("so2", "search_foods", { query: "penne" })]; // F10 skyr OFF, F11 penne OFF
const resolveAll = (ok: boolean) => async (foods: { ref: string; kcal100: number; protein100: number; carbs100: number; fat100: number; portion: FoodCandidate["portion"] }[]) =>
  new Map(foods.map((f) => [f.ref, ok ? { foodId: `db-${f.ref}`, kcal100: f.kcal100, protein100: f.protein100, carbs100: f.carbs100, fat100: f.fat100, portion: f.portion } : null]));
const withOff = (ref: string, group: string): Meal[] => GOOD.map((m) => (m.slot === "ranajky" ? { ...m, groups: m.groups.map((g) => (g.group === group ? { ...g, food_refs: [ref] } : g)) } : m));

test.describe("OFF produkty: riadok sa zakladá PRED kontrolou", () => {
  test("riadok sa založí → položka má food_id a deň prejde", async () => {
    const r = router([msg(offSearches(), "tool_use"), msg([outlineTu(1)], "tool_use")], { 1: [day("a", withOff("F10", "dairy"))] });
    const res = await generateMealPlan(INPUT, { ...DEPS, offIndex: async () => OFF_BUNDLE, create: r.create, resolveFoods: resolveAll(true) });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.offFailed).toBe(0);
    const off = res.days[0].items.find((i) => i.food.source === "off");
    expect(off?.food.foodId).toBe("db-F10");
    expect(Math.abs(dayKcal(res.days[0]) - 2000) / 2000).toBeLessThanOrEqual(0.05);
  });

  test("riadok zlyhá → výber sa zahodí, kód doplní knižničnú potravinu, OFF v pláne nie je", async () => {
    const r = router([msg(offSearches(), "tool_use"), msg([outlineTu(1)], "tool_use")], { 1: [day("a", withOff("F11", "starch")), day("b", withOff("F11", "starch"))] });
    const res = await generateMealPlan(INPUT, { ...DEPS, offIndex: async () => OFF_BUNDLE, create: r.create, resolveFoods: resolveAll(false) });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.offFailed).toBe(1);
    expect(res.days[0].items.some((i) => i.food.source === "off")).toBe(false);
    expect(Math.abs(dayKcal(res.days[0]) - 2000) / 2000).toBeLessThanOrEqual(0.05);
    const fb = (dayCalls(r, 1).at(-1)!.messages[2].content as Anthropic.ToolResultBlockParam[])[0];
    expect(String(fb.content)).toContain("F11");
  });
});

// ---------------------------------------------------------------- reálny prípad: 2934 kcal, bez laktózy, 3 dni, 4 jedlá (české názvy)
test.describe("2934 kcal / B176 / S379 / T79, bez laktózy, 4 jedlá, cs", () => {
  const cs = (id: string, name: string, nameCs: string, k: number, p: number, c: number, f: number, portion: FoodCandidate["portion"] = { unitBase: "g" }, fiber = 1): FoodCandidate => ({
    ...mkFood(id, name, k, p, c, f, portion, fiber),
    nameCs,
  });
  // refy po poradí hľadania (Q)
  const LIB4: FoodCandidate[] = [
    cs("kuracie", "Kuracie prsia (surové)", "Kuřecí prsa (syrová)", 110, 23, 0, 1.5), // F1
    cs("losos", "Losos (surový)", "Losos (syrový)", 208, 20, 0, 13), // F2
    cs("vajce", "Vajce", "Vejce", 143, 12.6, 0.7, 9.5, { unitBase: "g", pieceGrams: 55 }), // F3
    cs("tofu", "Tofu", "Tofu", 76, 8, 2, 4.5), // F4
    cs("jogurt", "Jogurt bez laktózy", "Jogurt bez laktózy", 55, 4.5, 5, 2), // F5
    cs("ryza", "Ryža varená", "Rýže vařená", 130, 2.7, 28, 0.3), // F6
    cs("vlocky", "Ovsené vločky", "Ovesné vločky", 370, 13, 60, 7, { unitBase: "g" }, 10), // F7
    cs("chlieb", "Chlieb pšeničný", "Chléb pšeničný", 250, 8, 48, 1.5, { unitBase: "g", pieceGrams: 40 }, 3), // F8
    cs("zemiaky", "Zemiaky varené", "Brambory vařené", 80, 2, 17, 0.1), // F9
    cs("banan", "Banán", "Banán", 89, 1.1, 23, 0.3, { unitBase: "g", pieceGrams: 120 }, 2.6), // F10
    cs("jablko", "Jablko", "Jablko", 52, 0.3, 14, 0.2, { unitBase: "g", pieceGrams: 150 }, 2.4), // F11
    cs("brokolica", "Brokolica (surová)", "Brokolice (syrová)", 34, 2.8, 7, 0.4, { unitBase: "g" }, 2.6), // F12
    cs("olej", "Olivový olej", "Olivový olej", 884, 0, 0, 100), // F13
    cs("mandle", "Mandle", "Mandle", 580, 21, 22, 50, { unitBase: "g" }, 12), // F14
    cs("skyr", "Skyr biely", "Skyr bílý", 63, 11, 4, 0.2), // F15 (mliečny → pri lactose_free vypadne)
  ];
  const Q = ["kuracie", "losos", "vajce", "tofu", "jogurt", "ryža", "vločky", "chlieb", "zemiaky", "banán", "jablko", "brokolica", "olej", "mandle", "skyr"];
  const targets = { kcal: 2934, proteinG: 176, carbsG: 379, fatG: 79 };
  const four = ["ranajky", "obed", "olovrant", "vecera"] as const;
  const input = { ...INPUT, locale: "cs" as const, days: 3, mealsPerDay: 4, diet: "lactose_free" as const, targets };
  const deps = (create: CreateMessage) => ({ loadLibrary: async () => LIB4, offIndex: async () => null, create, resolveFoods: async () => new Map() });
  const ph1 = () => [msg(searches(Q), "tool_use"), msg([outlineTu(3)], "tool_use")];
  /** Model vyberie rôzne potraviny po dňoch (rotácia), vrátane skyru (mliečny → zahodí sa). */
  const modelDay = (k: number): Meal[] => [
    { slot: "ranajky", groups: [grp("protein", "F3"), grp("dairy", "F5"), grp("starch", k % 2 ? "F8" : "F7"), grp("fruit", "F10"), grp("fat", "F14")] },
    { slot: "obed", groups: [grp("protein", k % 2 ? "F2" : "F1"), grp("starch", k % 2 ? "F9" : "F6"), grp("vegetable", "F12"), grp("fat", "F13")] },
    { slot: "olovrant", groups: [grp("dairy", "F15"), grp("fruit", "F11")] },
    { slot: "vecera", groups: [grp("protein", k % 2 ? "F1" : "F2"), grp("starch", k % 2 ? "F6" : "F9"), grp("vegetable", "F12"), grp("fat", "F13")] },
  ];

  test("každý deň v pásme, bez absurdných porcií, bez mliečnych položiek; kuracie/losos/zelenina sa pri „syrová“ nezahodia", async () => {
    const r = router(ph1(), { 1: [day("a", modelDay(0)), day("a2", modelDay(0))], 2: [day("b", modelDay(1)), day("b2", modelDay(1))], 3: [day("c", modelDay(2)), day("c2", modelDay(2))] });
    const res = await generateMealPlan(input, deps(r.create));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.missingDays).toEqual([]);
    expect(res.days).toHaveLength(3);
    expect(res.dropped.filter((d) => d.reason === "diet").map((d) => d.detail.split(" ")[0])).toContain("Skyr"); // mliečny skyr vypadol
    expect(res.dropped.filter((d) => d.reason === "diet").every((d) => /skyr/i.test(d.detail))).toBe(true);
    for (const d of res.days) {
      const items = d.items.map(toRule);
      expect(checkDay(items, { targets, requiredSlots: [...four] }).violations.map((v) => v.detail)).toEqual([]);
      const eggs = items.filter((i) => itemCategory(i) === "egg").reduce((s, i) => s + i.qty, 0);
      expect(eggs).toBeLessThanOrEqual(4);
      expect(items.filter((i) => itemCategory(i) === "oil").reduce((s, i) => s + i.grams, 0)).toBeLessThanOrEqual(30);
      for (const i of items.filter((x) => itemCategory(x) === "vegetable")) expect(i.grams).toBeLessThanOrEqual(300);
      expect(d.items.some((i) => /skyr/i.test(i.food.name))).toBe(false);
      expect(Math.abs(dayKcal(d) - 2934) / 2934).toBeLessThanOrEqual(0.05);
    }
  });
});
