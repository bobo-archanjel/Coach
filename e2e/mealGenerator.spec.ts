// i18n-ignore-file: testovacie vety (SK) pre AI generátor jedálničkov
import { test, expect } from "@playwright/test";
import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CreateMessage } from "../lib/ai/chatLoop";
import type { FoodCandidate } from "../lib/ai/foodContext";
import { createMealSearch, generateMealPlan, MEAL_GEN_MAX_PARALLEL, MEAL_GEN_SOFT_DEADLINE_MS, distinctDayCount, parseOutline, type MealGeneratorInput } from "../lib/ai/mealGenerator";
import {
  analyzeDays,
  buildRepairFeedback,
  dietViolation,
  exclusionWords,
  findExcludedWord,
  normalizePortion,
  parseSubmission,
  slotsForMealCount,
  type KnownFood,
  type MacroTargets,
  type ParseOptions,
} from "../lib/ai/mealPlanValidation";

/**
 * AI generátor jedálničkov: čisté testy bez siete a bez volania Anthropic API —
 * kontrola návrhu (ref, jednotky, gramáž, odchýlky, vylúčené potraviny) a slučka s falošným klientom.
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
    food({ ref: "F3", name: "Ryža", kcal100: 350, protein100: 7, carbs100: 77, fat100: 1 }),
    food({ ref: "F4", name: "Skyr jahoda", source: "off", foodId: null, barcode: "123", kcal100: 63, protein100: 11, carbs100: 4, fat100: 0.2, portion: { unitBase: "g", servingGrams: 140, packageGrams: 140 } }),
    food({ ref: "F5", name: "Mlieko polotučné", kcal100: 46, protein100: 3.4, carbs100: 4.8, fat100: 1.5, portion: { unitBase: "ml", packageGrams: 1000 } }),
  ].map((f) => [f.ref, f]),
);

const OPTS: ParseOptions = { days: 2, diet: "none", excluded: [], dayName: (n) => `Deň ${n}` };
const TARGETS: MacroTargets = { kcal: 1000, proteinG: 100, carbsG: 100, fatG: 20 };
const item = (food_ref: string, portion_unit: string, portion_qty: number) => ({ food_ref, portion_unit, portion_qty });

test.describe("mealPlanValidation", () => {
  test("sloty podľa počtu jedál", () => {
    expect(slotsForMealCount(3)).toEqual(["ranajky", "obed", "vecera"]);
    expect(slotsForMealCount(4)).toEqual(["ranajky", "obed", "olovrant", "vecera"]);
    expect(slotsForMealCount(5)).toContain("desiata");
    expect(slotsForMealCount(6)[5]).toBe("ine");
    expect(slotsForMealCount(1)).toHaveLength(3);
    expect(slotsForMealCount(99)).toHaveLength(6);
  });

  test("gramáž z jednotky a obmedzenie množstva", () => {
    expect(normalizePortion("piece", 2, { pieceGrams: 55 })).toEqual({ unit: "piece", qty: 2, grams: 110 });
    expect(normalizePortion("g", 152, { unitBase: "g" })).toEqual({ unit: "g", qty: 150, grams: 150 });
    expect(normalizePortion("piece", 1, { unitBase: "g" })).toBeNull(); // jednotku potravina nemá
    expect(normalizePortion("ml", 100, { unitBase: "g" })).toBeNull(); // zlá základná jednotka
    expect(normalizePortion("g", 0, { unitBase: "g" })).toBeNull();
    expect(normalizePortion("g", Number.NaN, { unitBase: "g" })).toBeNull();
    expect(normalizePortion("g", 99_999, { unitBase: "g" })!.grams).toBe(800);
    const big = normalizePortion("package", 10, { packageGrams: 330, unitBase: "ml" })!; // 3300 ml by presiahlo strop
    expect(big.grams).toBeLessThanOrEqual(800);
    expect(big.qty).toBe(2);
    expect(normalizePortion("serving", 0.2, { servingGrams: 30 })!.qty).toBe(0.5);
  });

  test("neznámy food_ref, zlá jednotka a zlé množstvo sa zahodia, zvyšok prejde", () => {
    const parsed = parseSubmission(
      {
        days: [
          {
            name: "Deň 1",
            meals: [
              {
                slot: "ranajky",
                items: [item("F2", "piece", 3), item("F99", "g", 100), item("F3", "piece", 1), item("F1", "g", -5), item("F1", "g", 200)],
              },
              { slot: "brunch", items: [item("F1", "g", 100)] },
            ],
          },
        ],
      },
      KNOWN,
      OPTS,
    );
    expect(parsed.shapeOk).toBe(true);
    const day = parsed.days[0];
    expect(day.items.map((i) => [i.ref, i.grams])).toEqual([
      ["F2", 165],
      ["F1", 200],
    ]);
    expect(day.items[0].macros.kcal).toBe(Math.round(143 * 1.65));
    expect(parsed.dropped.map((d) => d.reason).sort()).toEqual(["bad_qty", "bad_slot", "bad_unit", "unknown_ref"].sort());
  });

  test("tvar: stringifikované days sa rozbalí, nezmysel = shapeOk false", () => {
    const inner = [{ name: "A", meals: [{ slot: "obed", items: [item("F1", "g", 100)] }] }];
    expect(parseSubmission({ days: JSON.stringify(inner) }, KNOWN, OPTS).days[0].items).toHaveLength(1);
    expect(parseSubmission({ days: "nie json" }, KNOWN, OPTS).shapeOk).toBe(false);
    expect(parseSubmission(null, KNOWN, OPTS).shapeOk).toBe(false);
    expect(parseSubmission({ days: [] }, KNOWN, OPTS).shapeOk).toBe(false);
  });

  test("viac dní než žiadané sa orežú, názov dňa má náhradu, copy_of_day zopakuje deň", () => {
    const meals = [{ slot: "obed", items: [item("F1", "g", 150)] }];
    const parsed = parseSubmission(
      { days: [{ meals }, { name: "Opakovanie", copy_of_day: 1 }, { name: "navyše", meals }] },
      KNOWN,
      OPTS,
    );
    expect(parsed.days).toHaveLength(2);
    expect(parsed.days[0].name).toBe("Deň 1");
    expect(parsed.days[1].name).toBe("Opakovanie");
    expect(parsed.days[1].items[0].grams).toBe(150);
    // neplatný copy_of_day (na seba / dopredu) sa nepovažuje za kópiu
    const bad = parseSubmission({ days: [{ name: "x", copy_of_day: 1 }] }, KNOWN, { ...OPTS, days: 1 });
    expect(bad.days[0].items).toHaveLength(0);
  });

  test("vylúčené potraviny (voľný text, skloňovanie, bez diakritiky)", () => {
    const words = exclusionWords("Nejem vajcia, ryžu a huby!");
    expect(words).toEqual(expect.arrayContaining(["vajcia", "ryzu", "huby"]));
    expect(words).not.toContain("nejem");
    expect(findExcludedWord("Vajce", ["vajcia"])).toBe("vajcia");
    expect(findExcludedWord("Ryža jasmínová", ["ryzu"])).toBe("ryzu");
    expect(findExcludedWord("Kuracie prsia", ["vajcia", "ryzu"])).toBeNull();
    expect(findExcludedWord("Kuracie prsia", [])).toBeNull();

    const parsed = parseSubmission(
      { days: [{ name: "d", meals: [{ slot: "obed", items: [item("F2", "piece", 2), item("F3", "g", 100), item("F1", "g", 100)] }] }] },
      KNOWN,
      { ...OPTS, excluded: words },
    );
    expect(parsed.days[0].items.map((i) => i.ref)).toEqual(["F1"]);
    expect(parsed.dropped.filter((d) => d.reason === "excluded")).toHaveLength(2);
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
    expect(dietViolation("Ryža", "gluten_free")).toBeNull();
    expect(dietViolation("Kuracie prsia", "none")).toBeNull();
    const parsed = parseSubmission(
      { days: [{ name: "d", meals: [{ slot: "obed", items: [item("F5", "ml", 200), item("F3", "g", 100)] }] }] },
      KNOWN,
      { ...OPTS, diet: "vegan" },
    );
    expect(parsed.days[0].items.map((i) => i.ref)).toEqual(["F3"]);
    expect(parsed.dropped[0].reason).toBe("diet");
  });

  test("odchýlka kcal/bielkovín nad 10 % sa deteguje a opravný text obsahuje reálne čísla", () => {
    const parsed = parseSubmission(
      {
        days: [
          // 300 g kuracie (330 kcal, 69 B) + 200 g ryža (700 kcal, 14 B) = 1030 kcal, 83 B → bielkoviny −17 %
          { name: "d1", meals: [{ slot: "obed", items: [item("F1", "g", 300), item("F3", "g", 200)] }] },
          // 400 g kuracie + 150 g ryža = 440 + 525 = 965 kcal, 102.5 B → v cieli
          { name: "d2", meals: [{ slot: "obed", items: [item("F1", "g", 400), item("F3", "g", 150)] }] },
        ],
      },
      KNOWN,
      OPTS,
    );
    const analysis = analyzeDays(parsed.days, TARGETS);
    expect(analysis.map((a) => a.ok)).toEqual([false, true]);
    expect(analysis[0].totals.kcal).toBe(1030);
    expect(analysis[0].proteinDev).toBeLessThan(-0.1);
    const feedback = buildRepairFeedback(analysis, TARGETS, parsed.dropped, 2);
    expect(feedback).toContain("Deň 1");
    expect(feedback).toContain("1030 kcal");
    expect(feedback).not.toContain("Deň 2:");
    // všetko v poriadku → nič na opravu
    expect(buildRepairFeedback([analysis[1]], TARGETS, [], 1)).toBe("");
    // chýbajúce dni a prázdny deň
    expect(buildRepairFeedback(analyzeDays([{ name: "x", items: [] }], TARGETS), TARGETS, [], 3)).toContain("Chýbajú dni");
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


// ---------------------------------------------------------------- generátor s falošným klientom (2 fázy)
const usage = { input_tokens: 1000, output_tokens: 100, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
const msg = (content: unknown[], stop_reason: string) => ({ content, stop_reason, usage }) as unknown as Anthropic.Message;
const toolUse = (id: string, name: string, input: unknown) => ({ type: "tool_use", id, name, input });

const INPUT: MealGeneratorInput = {
  supabase: fakeSupabase,
  trainerId: "t",
  locale: "sk",
  targets: { kcal: 1000, proteinG: 100, carbsG: 100, fatG: 20 },
  days: 1,
  mealsPerDay: 3,
  diet: "none",
  excludedText: "",
  repeat: "varied",
  dayName: (n) => `Deň ${n}`,
};
const DEPS = { loadLibrary: async () => LIB, offIndex: async () => null };
// po hľadaní "kuracie" a "ryža": F1 = kuracie, F2 = ryža
const searches = [toolUse("s1", "search_foods", { query: "kuracie" }), toolUse("s2", "search_foods", { query: "ryža" })];
const outlineTu = (days: number) =>
  toolUse("o1", "submit_outline", {
    days: Array.from({ length: days }, () => ({ meals: [{ slot: "obed", protein_ref: "F1", carb_ref: "F2" }, { slot: "vecera", protein_ref: "F99" }] })),
  });
const dayTu = (id: string, g1: number, g2: number) =>
  toolUse(id, "submit_day", { meals: [{ slot: "obed", items: [item("F1", "g", g1), item("F2", "g", g2)] }] });
const OK = [400, 150] as const; // 965 kcal, 102.5 B → v cieli
const BAD = [300, 250] as const; // 1205 kcal → mimo

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

test.describe("generateMealPlan (mock klient, 2 fázy)", () => {
  test("fáza 1: hľadanie → náčrt; fáza 2: dni paralelne, pool a náčrt v prompte, súčet spotreby", async () => {
    const r = router(
      [msg(searches, "tool_use"), msg([outlineTu(3)], "tool_use")],
      { 1: [msg([dayTu("d1", ...OK)], "tool_use")], 2: [msg([dayTu("d2", 350, 200)], "tool_use")], 3: [msg([dayTu("d3", ...OK)], "tool_use")] },
      15,
    );
    const res = await generateMealPlan({ ...INPUT, days: 3 }, { ...DEPS, create: r.create });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.days.map((d) => d.name)).toEqual(["Deň 1", "Deň 2", "Deň 3"]);
    expect(res.days[0].items.map((i) => i.food.name)).toEqual(["Kuracie prsia", "Ryža"]);
    expect(res.repaired).toBe(false);
    expect(res.analysis.every((a) => a.ok)).toBe(true);
    expect(res.usage).toEqual({ inputTokens: 5000, outputTokens: 500, calls: 5 });
    expect(r.maxActive()).toBe(3); // všetky tri dni naraz
    // fáza 1 bez premýšľania, fáza 2 s premýšľaním; fáza 2 nemá hľadanie
    const p1 = r.seen[0];
    expect(p1.thinking).toEqual({ type: "disabled" });
    expect((p1.tools as Anthropic.Tool[]).map((t) => t.name)).toEqual(["search_foods", "submit_outline"]);
    const day2 = r.seen.find((p) => String(p.messages[0].content).includes("Deň 2 z"))!;
    expect(day2.thinking).toEqual({ type: "adaptive" });
    const prompt = String(day2.messages[0].content);
    expect(prompt).toContain("F1 | Kuracie prsia");
    expect(prompt).toContain("obed: bielkovina F1, sacharid F2");
    expect(prompt).not.toContain("F99"); // neznámy ref z náčrtu sa vynechá
    expect(day2.tool_choice).toEqual({ type: "auto" });
  });

  test("oprava len pre deň mimo cieľa (jedno volanie navyše), ostatné dni bez opravy", async () => {
    const r = router(
      [msg(searches, "tool_use"), msg([outlineTu(2)], "tool_use")],
      {
        1: [msg([dayTu("d1", ...OK)], "tool_use")],
        2: [msg([dayTu("d2a", ...BAD)], "tool_use"), msg([dayTu("d2b", ...OK)], "tool_use")],
      },
    );
    const res = await generateMealPlan({ ...INPUT, days: 2 }, { ...DEPS, create: r.create });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.repaired).toBe(true);
    expect(res.usage.calls).toBe(5);
    expect(res.days[1].items.map((i) => i.grams)).toEqual([400, 150]);
    expect(res.analysis.map((a) => a.ok)).toEqual([true, true]);
    const repairCall = r.seen.filter((p) => String(p.messages[0].content).includes("Deň 2 z")).at(-1)!;
    const fb = (repairCall.messages[2].content as Anthropic.ToolResultBlockParam[])[0];
    expect(fb.tool_use_id).toBe("d2a");
    expect(String(fb.content)).toContain("1205 kcal");
    expect(String(fb.content)).toContain("submit_day");
    expect(String(fb.content)).toContain("Deň 2");
  });

  test("po oprave stále mimo → best effort, nie druhá oprava", async () => {
    const r = router([msg(searches, "tool_use"), msg([outlineTu(1)], "tool_use")], {
      1: [msg([dayTu("a", ...BAD)], "tool_use"), msg([dayTu("b", 250, 250)], "tool_use")],
    });
    const res = await generateMealPlan(INPUT, { ...DEPS, create: r.create });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.usage.calls).toBe(4);
    expect(res.analysis[0].ok).toBe(false);
  });

  test("mäkký limit času: oprava sa preskočí, deadlineHit = true", async () => {
    let t = 0;
    const r = router([msg(searches, "tool_use"), msg([outlineTu(1)], "tool_use")], { 1: [msg([dayTu("a", ...BAD)], "tool_use")] });
    const create: CreateMessage = async (p) => {
      const res = await r.create(p);
      t += MEAL_GEN_SOFT_DEADLINE_MS; // každé volanie „trvá“ celý limit
      return res;
    };
    const res = await generateMealPlan(INPUT, { ...DEPS, create, now: () => t });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.deadlineHit).toBe(true);
    expect(res.repaired).toBe(false);
    expect(res.usage.calls).toBe(3);
    expect(res.analysis[0].ok).toBe(false);
  });

  test("meal prep: len pár rôznych dní, ostatné sú kópie (1 volanie na rôzny deň)", async () => {
    expect(distinctDayCount(7, "meal_prep")).toBe(3);
    expect(distinctDayCount(3, "meal_prep")).toBe(2);
    expect(distinctDayCount(1, "meal_prep")).toBe(1);
    expect(distinctDayCount(7, "varied")).toBe(7);
    const r = router([msg(searches, "tool_use"), msg([outlineTu(2)], "tool_use")], {
      1: [msg([dayTu("a", ...OK)], "tool_use")],
      2: [msg([dayTu("b", 350, 200)], "tool_use")],
    });
    const res = await generateMealPlan({ ...INPUT, days: 3, repeat: "meal_prep" }, { ...DEPS, create: r.create });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.usage.calls).toBe(4);
    expect(res.days.map((d) => d.name)).toEqual(["Deň 1", "Deň 2", "Deň 3"]);
    expect(res.days[2].items.map((i) => i.grams)).toEqual(res.days[0].items.map((i) => i.grams)); // deň 3 = kópia dňa 1
    expect(res.days[2].items[0]).not.toBe(res.days[0].items[0]);
  });

  test("deň, ktorý zlyhá, nezhodí ostatné; súbežnosť je ohraničená", async () => {
    expect(MEAL_GEN_MAX_PARALLEL).toBe(7);
    const r = router([msg(searches, "tool_use"), msg([outlineTu(3)], "tool_use")], {
      1: [msg([dayTu("a", ...OK)], "tool_use")],
      3: [msg([dayTu("c", ...OK)], "tool_use")],
    });
    const res = await generateMealPlan({ ...INPUT, days: 3 }, { ...DEPS, create: r.create });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.days.map((d) => d.name)).toEqual(["Deň 1", "Deň 3"]); // deň 2 vyhodil výnimku
    expect(res.analysis[1].empty).toBe(true);
  });

  test("neznáme ref-y vo všetkých dňoch → no_usable; chýbajúci náčrt nevadí", async () => {
    const bad = toolUse("x", "submit_day", { meals: [{ slot: "obed", items: [item("F42", "g", 100)] }] });
    const r = router([msg(searches, "tool_use"), msg([{ type: "text", text: "nemám" }], "end_turn"), msg([{ type: "text", text: "nie" }], "end_turn")], {
      1: [msg([bad], "tool_use"), msg([bad], "tool_use")],
    });
    const res = await generateMealPlan(INPUT, { ...DEPS, create: r.create });
    expect(res).toMatchObject({ ok: false, reason: "no_usable" });
    // náčrt chýba, ale pool existuje → fáza 2 prebehla
    expect(r.seen.some((p) => String(p.messages[0].content).includes("Deň 1 z"))).toBe(true);
  });

  test("bez nájdených potravín → no_submission; chyba fázy 1 → failed", async () => {
    const empty = router([msg([{ type: "text", text: "nič" }], "end_turn"), msg([{ type: "text", text: "nič" }], "end_turn")], {});
    expect(await generateMealPlan(INPUT, { ...DEPS, create: empty.create })).toMatchObject({ ok: false, reason: "no_submission" });
    const boom: CreateMessage = async () => {
      throw new Error("sieť");
    };
    const res = await generateMealPlan(INPUT, { ...DEPS, create: boom });
    expect(res).toMatchObject({ ok: false, reason: "failed", detail: "sieť" });
  });

  test("parseOutline: neznáme ref-y a zlé tvary sa preskočia", () => {
    const o = parseOutline({ days: [{ meals: [{ slot: "obed", protein_ref: "F1", carb_ref: "F3" }, { slot: 5 }, null] }, null] }, KNOWN);
    expect(o).toHaveLength(2);
    expect(o[0].get("obed")!.protein!.name).toBe("Kuracie prsia");
    expect(o[0].get("obed")!.carb!.ref).toBe("F3");
    expect(o[1].size).toBe(0);
    expect(parseOutline("zle", KNOWN)).toEqual([]);
  });
});
