// i18n-ignore-file: prompty, schéma nástrojov a výsledky nástrojov sú interná komunikácia s modelom
// FitPilot — AI blok: generátor jedálničkov pre trénera. Rovnaký princíp „draft-then-approve“
// ako lib/ai/planGenerator.ts: modul NEZAPISUJE nič do DB — vráti overený návrh a server action
// (app/dashboard/jedalnicky/aiActions.ts) z neho založí koncept jedálnička (published: false),
// ktorý tréner upraví v builderi.
//
// Dve fázy (jeden 7-dňový plán v jednom volaní s premýšľaním trval >2 min — viac než maxDuration):
//  1. FÁZA 1 (sekvenčná, bez premýšľania, krátky výstup): model hľadá potraviny nástrojom
//     search_foods nad databázami appky (základné + trénerove + offline Open Food Facts,
//     lib/ai/foodSearch.ts) — každý výsledok má krátky `ref` (F1, F2…) a spolu tvoria spoločný
//     „pool“ — a nakoniec odovzdá náčrt submit_outline: pre každý deň a slot hlavnú bielkovinu
//     a hlavný sacharid (variácie medzi dňami). V režime meal prep sa náčrt robí len pre pár
//     rôznych dní, ostatné dni server zopakuje.
//  2. FÁZA 2 (paralelne, Promise.all po dňoch, najviac MEAL_GEN_MAX_PARALLEL naraz): každý deň
//     = samostatné volanie, ktoré dostane LEN kompaktný pool, náčrt dňa a denné makrá a odovzdá
//     submit_day. Premýšľanie (adaptive, effort medium) je tu v poriadku — dni bežia súbežne,
//     takže čas je ≈ najpomalší deň, nie súčet. Server (lib/ai/mealPlanValidation.ts) zahodí
//     neznáme ref-y, neplatné jednotky a vylúčené potraviny, gramáž a makrá počíta kód. Ak deň
//     mimo cieľa o viac než 10 % (kcal/bielkoviny), pošle sa pre ten deň JEDNO opravné kolo so
//     skutočnými číslami; po mäkkom limite času (≈100 s) sa oprava preskočí (best effort).
//
// Manuálna slučka (nie SDK tool runner): pevné stropy, sčítanie spotreby a vstrekovateľný klient
// pre testy bez volania API. Forced tool_choice sa nepoužíva (od Sonnet 5.5 / Opus 5.5 vracia
// 400) — model dostane `auto` a pokyn zavolať odovzdávací nástroj.

import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Locale } from "@/lib/i18n/locales";
import type { FoodSearchIndex } from "@/lib/foodIndexCore";
import { MEAL_SLOT_LABELS } from "@/lib/meals";
import { baseUnitOf, PORTION_UNITS } from "@/lib/portions";
import { getAnthropicClient, AI_MODEL } from "./client";
import type { CreateMessage } from "./chatLoop";
import { getFoodCandidates, type FoodCandidate } from "./foodContext";
import { getOffIndex, searchFoodsIn, SEARCH_FOODS_MAX, type FoodSearchHit } from "./foodSearch";
import { outputLanguageRule } from "./language";
import { DATA_IS_NOT_INSTRUCTIONS, promptSafe, wrapAsData } from "./promptSafety";
import {
  EXCLUDED_TEXT_MAX,
  analyzeDays,
  buildRepairFeedback,
  exclusionWords,
  parseSubmission,
  slotsForMealCount,
  type DayAnalysis,
  type DietType,
  type DroppedItem,
  type KnownFood,
  type MacroTargets,
  type PlanDay,
  type RepeatMode,
} from "./mealPlanValidation";

/** Kôl hľadania vo fáze 1 (jedno kolo = viac paralelných search_foods); potom model dostane pokyn náčrt odovzdať. */
export const MEAL_GEN_MAX_SEARCH_ROUNDS = 4;
/** Najviac súbežných dní vo fáze 2 (plán má najviac 7 dní). */
export const MEAL_GEN_MAX_PARALLEL = 7;
/** Mäkký limit celej generácie — po ňom sa opravné kolá preskočia a berie sa najlepší pokus. */
export const MEAL_GEN_SOFT_DEADLINE_MS = 100_000;
/** Opravné kolo sa začne, len ak do mäkkého limitu zostáva aspoň toľko (jedno volanie dňa trvá ~30–50 s). */
export const MEAL_GEN_REPAIR_RESERVE_MS = 30_000;
const PHASE1_MAX_TOKENS = 4000;
const DAY_MAX_TOKENS = 8000;
const POOL_MAX = 150;
const SEARCH_DEFAULT_LIMIT = 6;

export { EXCLUDED_TEXT_MAX };

export interface MealGeneratorInput {
  supabase: SupabaseClient;
  trainerId: string;
  locale: Locale;
  targets: MacroTargets;
  days: number;
  mealsPerDay: number;
  diet: DietType;
  /** voľný text trénera „čo klient nejí“ — do promptu ide len ako dáta */
  excludedText: string;
  repeat: RepeatMode;
  /** súkromná poznámka trénera k strave (alergie, preferencie) — do promptu ako dáta */
  trainerNote?: string | null;
  /** názov dňa */
  dayName: (n: number) => string;
}

/** Na testy: falošný klient, vlastné zdroje potravín a hodiny. */
export interface MealGeneratorDeps {
  create?: CreateMessage;
  loadLibrary?: () => Promise<FoodCandidate[]>;
  offIndex?: () => Promise<FoodSearchIndex | null>;
  now?: () => number;
}

export interface MealGenUsage {
  inputTokens: number;
  outputTokens: number;
  calls: number;
}

export type MealGenResult =
  | {
      ok: true;
      days: PlanDay[];
      /** zahodené položky (po dňoch) */
      dropped: DroppedItem[];
      /** súčty po dňoch (po oprave) — tréner dostane upozornenie, ak niektorý deň ostal mimo cieľa */
      analysis: DayAnalysis[];
      /** aspoň jeden deň prešiel opravným kolom */
      repaired: boolean;
      /** oprava aspoň jedného dňa sa kvôli mäkkému limitu času preskočila */
      deadlineHit: boolean;
      requestedDays: number;
      usage: MealGenUsage;
    }
  | { ok: false; reason: "no_submission" | "no_usable" | "failed"; usage: MealGenUsage; detail?: string };

// ---------------------------------------------------------------- nástroje

const DIET_LABEL: Record<DietType, string> = {
  none: "bez obmedzení",
  vegetarian: "vegetariánska (bez mäsa a rýb)",
  vegan: "vegánska (bez mäsa, rýb, mliečnych výrobkov, vajec a medu)",
  lactose_free: "bez laktózy (bez mliečnych výrobkov s laktózou)",
  gluten_free: "bez lepku (bez pšenice, raži, jačmeňa a výrobkov z nich)",
};

const SEARCH_TOOL: Anthropic.Tool = {
  name: "search_foods",
  description:
    "Hľadá potraviny v databázach appky (základné potraviny, potraviny trénera, Open Food Facts). Každý výsledok má `ref` (F1, F2…), makrá na 100 g/ml a povolené jednotky. Iné potraviny než z výsledkov neexistujú. Pošli VIAC hľadaní naraz (paralelne), jednoduché názvy ('kuracie prsia', 'ryža', 'skyr').",
  input_schema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Názov potraviny alebo jeho časť (SK/CZ)." },
      limit: { type: "integer", description: `Max. počet výsledkov (predvolene ${SEARCH_DEFAULT_LIMIT}, najviac ${SEARCH_FOODS_MAX}).` },
    },
    required: ["query"],
  },
};

export function buildOutlineTool(slots: readonly string[]): Anthropic.Tool {
  return {
    name: "submit_outline",
    description:
      "Odovzdá náčrt jedálnička: pre každý deň a slot hlavnú bielkovinu a hlavný sacharid (ref z search_foods). Žiadne gramáže — tie rieši ďalší krok.",
    input_schema: {
      type: "object",
      properties: {
        days: {
          type: "array",
          items: {
            type: "object",
            properties: {
              meals: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    slot: { type: "string", enum: [...slots] },
                    protein_ref: { type: "string", description: "`ref` hlavného zdroja bielkovín." },
                    carb_ref: { type: "string", description: "`ref` hlavného zdroja sacharidov (môže chýbať pri slote bez prílohy)." },
                    veg_ref: { type: "string", description: "`ref` zeleniny (pri obede a večeri; ovocie pri desiate/olovrante) — striedaj medzi dňami." },
                  },
                  required: ["slot", "protein_ref"],
                },
              },
            },
            required: ["meals"],
          },
        },
      },
      required: ["days"],
    },
  };
}

export function buildDayTool(slots: readonly string[]): Anthropic.Tool {
  return {
    name: "submit_day",
    description:
      "Odovzdá hotový jeden deň. Položky odkazujú LEN na `ref` z poskytnutého zoznamu. Appka sama dopočíta gramáž a makrá. Volaj raz, keď máš deň hotový.",
    input_schema: {
      type: "object",
      properties: {
        meals: {
          type: "array",
          items: {
            type: "object",
            properties: {
              slot: { type: "string", enum: [...slots] },
              items: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    food_ref: { type: "string", description: "`ref` zo zoznamu potravín (napr. 'F12')." },
                    portion_unit: { type: "string", enum: [...PORTION_UNITS], description: "Jednotka z riadku potraviny (g/ml/piece/serving/package)." },
                    portion_qty: { type: "number", description: "Množstvo v tejto jednotke (napr. 2 pre 2 ks, 150 pre 150 g)." },
                  },
                  required: ["food_ref", "portion_unit", "portion_qty"],
                },
              },
            },
            required: ["slot", "items"],
          },
        },
      },
      required: ["meals"],
    },
  };
}

function unitsText(f: KnownFood): string {
  const base = baseUnitOf(f.portion);
  const parts: string[] = [base];
  if (f.portion.pieceGrams && f.portion.pieceGrams > 0) parts.push(`piece=${f.portion.pieceGrams}${base}`);
  if (f.portion.servingGrams && f.portion.servingGrams > 0) parts.push(`serving=${f.portion.servingGrams}${base}`);
  if (f.portion.packageGrams && f.portion.packageGrams > 0) parts.push(`package=${f.portion.packageGrams}${base}`);
  return parts.join(", ");
}

/** Jeden riadok potraviny pre model (výsledok hľadania aj kompaktný zoznam pre dni). */
export function foodLine(f: KnownFood): string {
  return `${f.ref} | ${f.name} [${f.source === "off" ? "OFF" : "knižnica"}] | ${f.kcal100} kcal, ${f.protein100} B, ${f.carbs100} S, ${f.fat100} T /100${baseUnitOf(f.portion)} | jednotky: ${unitsText(f)}`;
}

/** Hľadanie pre model: výsledky dostanú stabilné `ref`-y a zapamätajú sa — len tie smie plán použiť. */
export function createMealSearch(ctx: { supabase: SupabaseClient; trainerId: string; locale: Locale } & MealGeneratorDeps) {
  const known = new Map<string, KnownFood>();
  const byKey = new Map<string, string>();
  let library: Promise<FoodCandidate[]> | null = null;
  const loadLibrary = ctx.loadLibrary ?? (() => getFoodCandidates(ctx.supabase, ctx.trainerId));
  const loadOff = ctx.offIndex ?? getOffIndex;

  const register = (h: FoodSearchHit): KnownFood => {
    const key = `${h.source}:${h.id}`;
    const existing = byKey.get(key);
    if (existing) return known.get(existing)!;
    const food: KnownFood = {
      ref: `F${known.size + 1}`,
      source: h.source,
      foodId: h.source === "kniznica" ? h.id : null,
      barcode: h.source === "off" ? h.id : null,
      name: h.name,
      kcal100: h.kcal100,
      protein100: h.protein100,
      carbs100: h.carbs100,
      fat100: h.fat100,
      portion: h.portion,
      offFood: h.offFood,
    };
    known.set(food.ref, food);
    byKey.set(key, food.ref);
    return food;
  };

  const run = async (input: unknown): Promise<{ content: string; isError?: boolean }> => {
    const o = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
    const query = typeof o.query === "string" ? o.query.trim() : "";
    if (!query) return { content: "Chýba query.", isError: true };
    const limit = typeof o.limit === "number" && Number.isFinite(o.limit) ? Math.floor(o.limit) : SEARCH_DEFAULT_LIMIT;
    try {
      library ??= loadLibrary().catch((err: unknown) => {
        console.error("meal search library:", err instanceof Error ? err.message : err);
        return [];
      });
      const [lib, off] = await Promise.all([library, loadOff()]);
      const hits = searchFoodsIn(lib, off, query, limit, ctx.locale);
      if (hits.length === 0) return { content: "Nenájdené (skús iné slovo alebo jednoduchší názov)." };
      return {
        content: hits
          .map((h) => foodLine(register(h)))
          .join("\n"),
      };
    } catch (err) {
      console.error("meal search:", err instanceof Error ? err.message : err);
      return { content: "Vyhľadávanie sa teraz nepodarilo.", isError: true };
    }
  };

  return { known: known as ReadonlyMap<string, KnownFood>, run };
}


// ---------------------------------------------------------------- prompty

function constraintsBlock(input: MealGeneratorInput): string[] {
  const data: string[] = [];
  const excluded = promptSafe(input.excludedText, EXCLUDED_TEXT_MAX);
  if (excluded) data.push(`Vylúčené potraviny (klient ich nejí/nesmie): ${excluded}`);
  const note = promptSafe(input.trainerNote, 400);
  if (note) data.push(`Poznámka trénera k strave (alergie, preferencie): ${note}`);
  return data.length > 0 ? ["", "Obmedzenia (rešpektuj ich VŽDY, také potraviny nepoužívaj):", wrapAsData(data)] : [];
}

const targetsLine = (t: MacroTargets) =>
  `Denný cieľ klienta: ${t.kcal} kcal, bielkoviny ${t.proteinG} g, sacharidy ${t.carbsG} g, tuky ${t.fatG} g.`;

/** Počet RÔZNYCH dní (meal prep: pár rôznych, ostatné sa opakujú; inak všetky). */
export function distinctDayCount(days: number, repeat: RepeatMode): number {
  if (repeat !== "meal_prep" || days <= 2) return days;
  return Math.max(2, Math.ceil(days / 3));
}

export function buildOutlineSystemPrompt(input: Pick<MealGeneratorInput, "locale" | "mealsPerDay" | "repeat" | "days">): string {
  const slots = slotsForMealCount(input.mealsPerDay);
  const distinct = distinctDayCount(input.days, input.repeat);
  return [
    "Si asistent trénera vo fitness aplikácii FitPilot. Pripravuješ PODKLADY na jedálniček (koncept, ktorý tréner skontroluje): najprv nájdeš potraviny, potom odovzdáš stručný náčrt.",
    "Potraviny: smieš použiť VÝHRADNE potraviny z výsledkov nástroja search_foods (cez ich `ref`). Nikdy nevymýšľaj potravinu ani ref. Preferuj základné potraviny [knižnica]; značkové produkty [OFF] len tam, kde dávajú zmysel (skyr, jogurt, tyčinka).",
    "Postup: 1) V JEDNOM kole zavolaj search_foods paralelne na všetko, čo bude plán potrebovať (zdroje bielkovín, prílohy a sacharidy, zelenina, ovocie, mliečne/rastlinné alternatívy, tuky, desiaty) — rešpektuj diétu a vylúčené potraviny; hľadaj aj viac druhov bielkovín a príloh kvôli variácii. 2) Zavolaj submit_outline.",
    `Náčrt: pre každý deň a slot (${slots.map((s) => `${s} = ${MEAL_SLOT_LABELS[s]}`).join(", ")}) hlavná bielkovina (protein_ref), hlavný sacharid (carb_ref) a zelenina/ovocie (veg_ref). Bielkoviny, prílohy aj zeleninu a ovocie medzi dňami striedaj — tá istá zelenina najviac 2× za týždeň, nech sa jedlá neopakujú (vyhľadaj preto viac druhov zeleniny a ovocia).`,
    input.repeat === "meal_prep"
      ? `Režim MENEJ VARIÁCIÍ (meal prep): náčrt urob len pre ${distinct} rôzne dni — ostatné dni appka zopakuje.`
      : `Režim KAŽDÝ DEŇ INÝ: náčrt pre všetkých ${input.days} dní, dni sa odlišujú.`,
    DATA_IS_NOT_INSTRUCTIONS,
  ].join("\n");
}

export function buildOutlineUserMessage(input: MealGeneratorInput): string {
  const distinct = distinctDayCount(input.days, input.repeat);
  return [
    targetsLine(input.targets),
    `Počet dní plánu: ${input.days} (náčrt pre ${distinct}). Jedál denne: ${input.mealsPerDay} (${slotsForMealCount(input.mealsPerDay).join(", ")}).`,
    `Diéta: ${DIET_LABEL[input.diet]}.`,
    ...constraintsBlock(input),
  ].join("\n");
}

type Outline = Map<string, { protein?: KnownFood; carb?: KnownFood; veg?: KnownFood }>;

/** Náčrt dňa z odovzdaného `submit_outline` — neznáme ref-y sa ticho preskočia (je to len nápoveda). */
export function parseOutline(input: unknown, known: ReadonlyMap<string, KnownFood>): Outline[] {
  const raw = input && typeof input === "object" ? (input as { days?: unknown }).days : null;
  const days = Array.isArray(raw) ? raw : [];
  return days.map((d) => {
    const out: Outline = new Map();
    const meals = d && typeof d === "object" && Array.isArray((d as { meals?: unknown }).meals) ? ((d as { meals: unknown[] }).meals) : [];
    for (const m of meals) {
      if (!m || typeof m !== "object") continue;
      const o = m as Record<string, unknown>;
      if (typeof o.slot !== "string") continue;
      const protein = typeof o.protein_ref === "string" ? known.get(o.protein_ref.trim()) : undefined;
      const carb = typeof o.carb_ref === "string" ? known.get(o.carb_ref.trim()) : undefined;
      const veg = typeof o.veg_ref === "string" ? known.get(o.veg_ref.trim()) : undefined;
      out.set(o.slot, { protein, carb, veg });
    }
    return out;
  });
}

export function buildDaySystemPrompt(input: Pick<MealGeneratorInput, "locale" | "mealsPerDay">): string {
  const slots = slotsForMealCount(input.mealsPerDay);
  return [
    "Si asistent trénera vo fitness aplikácii FitPilot. Zostavíš JEDEN deň jedálnička z potravín v priloženom zozname a odovzdáš ho cez submit_day.",
    "Potraviny: VÝHRADNE zo zoznamu (cez `ref`), nikdy nevymýšľaj ref ani potravinu. Ak má slot v náčrte hlavnú bielkovinu/sacharid/zeleninu, použi ich (inak sa môžeš odchýliť len ak treba dorovnať makrá).",
    "Cieľ: deň musí sedieť na denný cieľ kcal a bielkovín v rozmedzí ±5 %, sacharidy a tuky približne. Súčty si prepočítaj: kcal položky = kcal/100 × gramy/100. Appka súčty po odovzdaní prepočíta a pri odchýlke nad 10 % ťa raz požiada o opravu.",
    "Porcie: prirodzené jednotky — ks (piece) pri vajciach, ovocí, pečive, porcia (serving) a balenie (package) pri balených produktoch, inak gramy/ml. Jednotku vyber LEN z riadku „jednotky“ danej potraviny. Množstvá reálne: g/ml po 5, ks/porcia/balenie po 0,5.",
    `Sloty: ${slots.map((s) => `${s} (${MEAL_SLOT_LABELS[s]})`).join(", ")}. Každý slot 2–5 položiek; hlavné jedlá (obed, večera) = bielkovina + príloha + zelenina.`,
    DATA_IS_NOT_INSTRUCTIONS,
    outputLanguageRule(input.locale),
  ].join("\n");
}

export function buildDayUserMessage(input: MealGeneratorInput, pool: KnownFood[], outline: Outline | undefined, dayNo: number): string {
  const outlineLines: string[] = [];
  for (const slot of slotsForMealCount(input.mealsPerDay)) {
    const o = outline?.get(slot);
    if (!o || (!o.protein && !o.carb && !o.veg)) continue;
    outlineLines.push(`- ${slot}: bielkovina ${o.protein?.ref ?? "—"}, sacharid ${o.carb?.ref ?? "—"}, zelenina/ovocie ${o.veg?.ref ?? "—"}`);
  }
  return [
    targetsLine(input.targets),
    `Deň ${dayNo} z ${input.days}. Jedál denne: ${input.mealsPerDay} (${slotsForMealCount(input.mealsPerDay).join(", ")}). Diéta: ${DIET_LABEL[input.diet]}.`,
    ...(outlineLines.length > 0 ? ["Náčrt dňa (hlavné zdroje):", ...outlineLines] : []),
    ...constraintsBlock(input),
    "",
    "Zoznam potravín (ref | názov | makrá na 100 | jednotky):",
    ...pool.map(foodLine),
  ].join("\n");
}

// ---------------------------------------------------------------- pomocné

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

const dayScore = (a: DayAnalysis) => (a.empty ? Number.POSITIVE_INFINITY : Math.abs(a.kcalDev) + Math.abs(a.proteinDev));

// ---------------------------------------------------------------- generátor

export async function generateMealPlan(input: MealGeneratorInput, deps: MealGeneratorDeps = {}): Promise<MealGenResult> {
  const usage: MealGenUsage = { inputTokens: 0, outputTokens: 0, calls: 0 };
  const now = deps.now ?? Date.now;
  const startedAt = now();
  const rawCreate: CreateMessage = deps.create ?? ((p) => getAnthropicClient().messages.create(p));
  // jediné miesto, kde sa sčítava spotreba (všetky fázy a dni)
  const create: CreateMessage = async (p) => {
    const r = await rawCreate(p);
    usage.calls++;
    usage.inputTokens += r.usage.input_tokens + (r.usage.cache_creation_input_tokens ?? 0) + (r.usage.cache_read_input_tokens ?? 0);
    usage.outputTokens += r.usage.output_tokens;
    return r;
  };

  const slots = slotsForMealCount(input.mealsPerDay);
  const search = createMealSearch({ supabase: input.supabase, trainerId: input.trainerId, locale: input.locale, ...deps });
  const excluded = exclusionWords(input.excludedText);
  const distinct = distinctDayCount(input.days, input.repeat);

  // ================= FÁZA 1: hľadanie potravín (pool) + náčrt
  let outline: Outline[] = [];
  try {
    const messages: Anthropic.MessageParam[] = [{ role: "user", content: buildOutlineUserMessage(input) }];
    const base: Omit<Anthropic.MessageCreateParamsNonStreaming, "messages"> = {
      model: AI_MODEL.MEAL_GENERATOR,
      max_tokens: PHASE1_MAX_TOKENS,
      system: buildOutlineSystemPrompt(input),
      tools: [SEARCH_TOOL, buildOutlineTool(slots)],
      tool_choice: { type: "auto" },
      // Bez premýšľania: výstup je len zoznam hľadaní + malý náčrt, úvahy by len predlžovali čakanie.
      // Pozor: Sonnet 5.5+ { type: "disabled" } odmieta (400) — pri zmene modelu treba upraviť.
      thinking: { type: "disabled" },
      cache_control: { type: "ephemeral" },
    };
    let rounds = 0;
    let nudged = false;
    for (let call = 0; call < MEAL_GEN_MAX_SEARCH_ROUNDS + 2; call++) {
      const response = await create({ ...base, messages });
      const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      const submit = toolUses.find((t) => t.name === "submit_outline");
      if (submit) {
        outline = parseOutline(submit.input, search.known);
        break;
      }
      if (toolUses.length === 0) {
        if (nudged || response.stop_reason === "max_tokens") break;
        nudged = true;
        messages.push({ role: "assistant", content: response.content });
        messages.push({ role: "user", content: "Zavolaj teraz submit_outline (použi len ref z výsledkov search_foods)." });
        continue;
      }
      messages.push({ role: "assistant", content: response.content });
      rounds++;
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const t of toolUses) {
        if (t.name !== "search_foods") {
          results.push({ type: "tool_result", tool_use_id: t.id, content: `Neznámy nástroj: ${t.name}`, is_error: true });
        } else if (rounds > MEAL_GEN_MAX_SEARCH_ROUNDS) {
          results.push({ type: "tool_result", tool_use_id: t.id, content: "Limit vyhľadávaní je vyčerpaný — odovzdaj náčrt cez submit_outline.", is_error: true });
        } else {
          const out = await search.run(t.input);
          results.push({ type: "tool_result", tool_use_id: t.id, content: out.content, ...(out.isError ? { is_error: true } : {}) });
        }
      }
      messages.push({ role: "user", content: results });
    }
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("generateMealPlan (fáza 1):", detail);
    return { ok: false, reason: "failed", usage, detail };
  }

  const pool = [...search.known.values()].slice(0, POOL_MAX);
  if (pool.length === 0) return { ok: false, reason: "no_submission", usage };
  const poolMap = new Map(pool.map((f) => [f.ref, f]));

  // ================= FÁZA 2: dni paralelne
  const daySystem = buildDaySystemPrompt(input);
  const dayTool = buildDayTool(slots);
  let anyRepaired = false;
  let deadlineHit = false;
  let sawSubmit = false;
  let lastError: string | undefined;
  const dropped: DroppedItem[] = [];

  const buildDay = async (i: number): Promise<PlanDay> => {
    const dayNo = i + 1;
    const name = input.dayName(dayNo);
    const empty: PlanDay = { name, items: [] };
    const messages: Anthropic.MessageParam[] = [{ role: "user", content: buildDayUserMessage(input, pool, outline[i], dayNo) }];
    const base: Omit<Anthropic.MessageCreateParamsNonStreaming, "messages"> = {
      model: AI_MODEL.MEAL_GENERATOR,
      max_tokens: DAY_MAX_TOKENS,
      system: daySystem,
      tools: [dayTool],
      tool_choice: { type: "auto" },
      // Dni bežia súbežne, takže premýšľanie predĺži len najpomalší deň (~30–50 s) a výrazne zlepší
      // zásahy makier (živý test: odchýlky 1–4 % na prvý pokus oproti +20 % bielkovín bez premýšľania).
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" },
    };
    let best: { day: PlanDay; analysis: DayAnalysis; dropped: DroppedItem[] } | null = null;
    let repaired = false;
    let nudged = false;
    try {
      for (let call = 0; call < 3; call++) {
        const response = await create({ ...base, messages });
        const tu = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "submit_day");
        if (!tu) {
          if (nudged || best || response.stop_reason === "max_tokens") break;
          nudged = true;
          messages.push({ role: "assistant", content: response.content });
          messages.push({ role: "user", content: "Zavolaj teraz submit_day s hotovým dňom (použi len ref zo zoznamu)." });
          continue;
        }
        sawSubmit = true;
        const rawMeals = (tu.input as { meals?: unknown } | null)?.meals;
        const parsed = parseSubmission({ days: [{ name, meals: rawMeals }] }, poolMap, { days: 1, diet: input.diet, excluded, dayName: () => name });
        const day = parsed.days[0] ?? empty;
        const analysis = { ...analyzeDays([day], input.targets)[0], day: dayNo };
        const droppedHere = parsed.dropped.map((d) => ({ ...d, day: dayNo }));
        if (!best || dayScore(analysis) <= dayScore(best.analysis)) best = { day, analysis, dropped: droppedHere };

        const feedback = parsed.shapeOk
          ? buildRepairFeedback([analysis], input.targets, droppedHere, 1, "submit_day")
          : "Návrh nemal platný tvar. Zavolaj submit_day znova: meals[{slot, items[{food_ref, portion_unit, portion_qty}]}].";
        if (!feedback) break;
        if (repaired) break;
        if (now() - startedAt + MEAL_GEN_REPAIR_RESERVE_MS > MEAL_GEN_SOFT_DEADLINE_MS) {
          deadlineHit = true; // best effort + upozornenie (deň ostane mimo cieľa)
          break;
        }
        repaired = true;
        anyRepaired = true;
        messages.push({ role: "assistant", content: response.content });
        messages.push({ role: "user", content: [{ type: "tool_result", tool_use_id: tu.id, content: feedback }] });
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      console.error(`generateMealPlan (deň ${dayNo}):`, lastError);
    }
    if (best) dropped.push(...best.dropped);
    return best?.day ?? empty;
  };

  const built = await mapLimit(
    Array.from({ length: distinct }, (_, i) => i),
    MEAL_GEN_MAX_PARALLEL,
    (i) => buildDay(i),
  );

  // zopakované dni (meal prep): deň i ≥ distinct = kópia dňa (i mod distinct)
  const allDays: PlanDay[] = Array.from({ length: input.days }, (_, i) =>
    i < distinct ? built[i] : { name: input.dayName(i + 1), items: built[i % distinct].items.map((it) => ({ ...it })) },
  );
  const days = allDays.filter((d) => d.items.length > 0);
  if (days.length === 0) {
    return { ok: false, reason: sawSubmit ? "no_usable" : lastError ? "failed" : "no_submission", usage, detail: lastError };
  }
  return {
    ok: true,
    days,
    dropped,
    analysis: analyzeDays(allDays, input.targets),
    repaired: anyRepaired,
    deadlineHit,
    requestedDays: input.days,
    usage,
  };
}
