// i18n-ignore-file: testovacie vety (SK/CZ) pre AI Kouča
import { test, expect } from "@playwright/test";
import type Anthropic from "@anthropic-ai/sdk";
import { classifyChatRoute } from "../lib/ai/chatRouting";
import { runToolLoop, type CreateMessage } from "../lib/ai/chatLoop";
import { loadOffIndexFromDisk, searchFoodsIn, formatFoodHits } from "../lib/ai/foodSearch";
import { createChatToolRunner } from "../lib/ai/chatTools";
import type { FoodCandidate } from "../lib/ai/foodContext";

/**
 * AI Kouč s nástrojmi (feature/AIKoucAIJedlo): čisté testy bez siete a bez volania Anthropic API —
 * smerovanie modelu, serverové hľadanie v OFF balíku, slučka tool use s falošným klientom.
 */

const COMPLEX: [string, "workout" | "meal_plan"][] = [
  ["Navrhni mi tréning na nohy", "workout"],
  ["zostav mi trening na horne telo", "workout"],
  ["Navrhni mi tréningovú rutinu na 3 dni", "workout"],
  ["Sestav mi trénink na záda a biceps", "workout"],
  ["navrhni mi trenink na doma", "workout"],
  ["Potrebujem tréningový plán pre začiatočníka", "workout"],
  ["chci trenink split na 4 dny, plán prosím", "workout"],
  ["Môžeš mi zostaviť workout na hrudník?", "workout"],
  ["Navrhni mi jedálniček na dnes", "meal_plan"],
  ["Zostav mi jedálniček na celý deň", "meal_plan"],
  ["Co mam zjist do konce dne?", "meal_plan"],
  ["Čo mám zjesť do konca dňa", "meal_plan"],
  ["Sestav mi jídelníček na zítra", "meal_plan"],
  ["navrhni mi jedlá na celý deň podľa makier", "meal_plan"],
  ["Daj mi jedálniček", "meal_plan"],
];
const SIMPLE = [
  "Aký tréning mám dnes?",
  "Ako mi to ide?",
  "Čo si dať na večeru?",
  "Navrhni mi večeru",
  "Navrhni mi iný cvik namiesto drepov",
  "Čím nahradím bench press?",
  "Zostav mi aj tréning, no radšej niečo namiesto zadných predkopov",
  "Chcem schudnúť, ako na to?",
  "Chci cvičit doma, jaký cvik na hrudník?",
  "Je kreatín bezpečný?",
  "Koľko spánku potrebujem?",
  "Môj jedálniček je nudný, čo ty na to?",
  "Kolik bílkovin mám sníst?",
  "ahoj",
  "Navrhni mi proteínovú tyčinku",
];

test.describe("chatRouting", () => {
  for (const [text, reason] of COMPLEX) {
    test(`complex: ${text}`, () => {
      const r = classifyChatRoute(text);
      expect(r.complex).toBe(true);
      expect(r.reason).toBe(reason);
    });
  }
  for (const text of SIMPLE) {
    test(`simple: ${text}`, () => {
      expect(classifyChatRoute(text).complex).toBe(false);
    });
  }
});

test.describe("search_foods — server-side OFF balík", () => {
  test("načíta reálny balík a nájde potraviny", async () => {
    const off = await loadOffIndexFromDisk();
    expect(off).not.toBeNull();
    expect(off!.names.length).toBeGreaterThan(50_000);
    const lib: FoodCandidate[] = [
      { id: "lib-1", name: "Kuracie prsia", nameCs: "Kuřecí prsa", kcal100g: 110, protein100g: 23, carbs100g: 0, fat100g: 1.5, portion: { unitBase: "g" } },
      { id: "lib-2", name: "Vajce", kcal100g: 143, protein100g: 12.6, carbs100g: 0.7, fat100g: 9.5, portion: { unitBase: "g", pieceGrams: 55 } },
    ];
    const hits = searchFoodsIn(lib, off, "vajce", 5, "sk");
    expect(hits[0].source).toBe("kniznica");
    expect(hits[0].portions).toContain("1 ks = 55 g");
    expect(hits.length).toBeGreaterThan(1); // doplnené z OFF
    expect(hits.length).toBeLessThanOrEqual(5);
    expect(hits.some((h) => h.source === "off")).toBe(true);
    const cs = searchFoodsIn(lib, off, "kuřecí", 3, "cs");
    expect(cs[0].name).toBe("Kuřecí prsa");
    expect(formatFoodHits(hits)).toContain("kcal");
    expect(searchFoodsIn(lib, off, "", 5, "sk")).toEqual([]);
    expect(searchFoodsIn(lib, off, "mlieko", 99, "sk").length).toBeLessThanOrEqual(15);
  });
});

// ---------------------------------------------------------------- slučka s falošným klientom
const usage = { input_tokens: 100, output_tokens: 10, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
const msg = (content: unknown[], stop_reason: string) => ({ content, stop_reason, usage }) as unknown as Anthropic.Message;
const toolUse = (id: string, name: string, input: unknown) => ({ type: "tool_use", id, name, input });
const text = (t: string) => ({ type: "text", text: t });

test.describe("runToolLoop", () => {
  test("tool_use → tool_result → text, paralelné volania v jednej správe", async () => {
    const seen: Anthropic.MessageCreateParamsNonStreaming[] = [];
    const replies = [
      msg([text("hľadám"), toolUse("a", "search_foods", { query: "ryža" }), toolUse("b", "search_foods", { query: "kura" })], "tool_use"),
      msg([text("Obed: 120 g ryže")], "end_turn"),
    ];
    const create: CreateMessage = async (p) => {
      seen.push(structuredClone(p));
      return replies.shift()!;
    };
    const ran: string[] = [];
    const res = await runToolLoop({
      create,
      base: { model: "x", max_tokens: 10 },
      messages: [{ role: "user", content: "ahoj" }],
      runTool: async (n, i) => {
        ran.push(`${n}:${(i as { query: string }).query}`);
        return { content: "výsledok" };
      },
    });
    expect(res.text).toBe("Obed: 120 g ryže");
    expect(res.calls).toBe(2);
    expect(res.inputTokens).toBe(200);
    expect(res.hitRoundCap).toBe(false);
    expect(ran).toEqual(["search_foods:ryža", "search_foods:kura"]);
    const second = seen[1].messages;
    expect(second[1].role).toBe("assistant");
    const results = second[2].content as Anthropic.ToolResultBlockParam[];
    expect(second[2].role).toBe("user");
    expect(results.map((r) => r.tool_use_id)).toEqual(["a", "b"]);
  });

  test("strop kôl → posledné volanie bez nástrojov (tool_choice none), žiadny visiaci tool_use", async () => {
    let n = 0;
    const seen: Anthropic.MessageCreateParamsNonStreaming[] = [];
    const create: CreateMessage = async (p) => {
      seen.push(structuredClone(p));
      n++;
      return n <= 4 ? msg([toolUse(`t${n}`, "search_exercises", { query: "drep" })], "tool_use") : msg([text("Finálna odpoveď")], "end_turn");
    };
    let executed = 0;
    const res = await runToolLoop({
      create,
      base: { model: "x", max_tokens: 10 },
      messages: [{ role: "user", content: "q" }],
      runTool: async () => {
        executed++;
        return { content: "x" };
      },
    });
    expect(res.hitRoundCap).toBe(true);
    expect(res.text).toBe("Finálna odpoveď");
    expect(res.calls).toBe(5);
    expect(executed).toBe(3); // 4. kolo sa už nevykonáva
    expect(seen[4].tool_choice).toEqual({ type: "none" });
    const last = seen[4].messages[seen[4].messages.length - 1].content as { type: string }[];
    expect(last.some((b) => b.type === "tool_result")).toBe(true);
  });

  test("chybný nástroj nezhodí slučku (is_error)", async () => {
    const replies = [msg([toolUse("a", "search_foods", {})], "tool_use"), msg([text("ok")], "end_turn")];
    const seen: Anthropic.MessageCreateParamsNonStreaming[] = [];
    const res = await runToolLoop({
      create: async (p) => {
        seen.push(structuredClone(p));
        return replies.shift()!;
      },
      base: { model: "x", max_tokens: 10 },
      messages: [{ role: "user", content: "q" }],
      runTool: async () => ({ content: "chyba", isError: true }),
    });
    expect(res.text).toBe("ok");
    const r = (seen[1].messages[2].content as Anthropic.ToolResultBlockParam[])[0];
    expect(r.is_error).toBe(true);
  });
});

test.describe("createChatToolRunner", () => {
  test("search_exercises zaznamená ID do foundExercises; neznámy nástroj je chyba", async () => {
    const rows = [{ id: "ex-1", name: "Barbell Squat", name_sk: "Drep s činkou", muscle_group: "stehná (kvadriceps)", equipment: "barbell" }];
    // minimálny falošný supabase builder: každý reťazený krok vráti seba, await vráti dáta
    const builder: Record<string, unknown> = {};
    for (const m of ["select", "eq", "or", "order", "limit"]) builder[m] = () => builder;
    builder.then = (resolve: (v: unknown) => void) => resolve({ data: rows, error: null });
    const supabase = { from: () => builder } as never;
    const foundExercises = new Map<string, string>();
    const run = createChatToolRunner({ supabase, trainerId: "t", locale: "sk", foundExercises });
    const out = await run("search_exercises", { query: "drep", limit: 5 });
    expect(out.content).toContain("ex-1 :: Drep s činkou");
    expect(foundExercises.get("ex-1")).toBe("Drep s činkou");
    expect((await run("nope", {})).isError).toBe(true);
  });
});
