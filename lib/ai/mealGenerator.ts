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
//  2. FÁZA 2 (paralelne, Promise.all po dňoch, najviac MEAL_GEN_MAX_PARALLEL naraz): PORCIE PLÁNUJE KÓD
//     (lib/ai/mealPortions.ts — výmenný systém: každé jedlo má šablónu skupín potravín s cieľom
//     bielkovín/sacharidov), MODEL LEN VYBERIE potraviny do skupín (submit_day, žiadne gramy). Kód výber
//     overí (ref, skupina, diéta, vylúčené), pri chybe dá modelu JEDNO opravné kolo, zvyšok doplní sám
//     deterministicky; potom gramy spočíta, zaokrúhli na prirodzené jednotky a doladí po jednom kroku
//     (5 g / 0,5 ks). Deň, ktorý aj tak nespĺňa pravidlá (lib/ai/mealRules.ts), sa NEUKLADÁ (variabilný
//     režim) alebo ho nahradí kópia (len meal prep). Čas ≈ fáza 1 (~20 s) + najpomalší deň (~5–10 s).
//
// Manuálna slučka (nie SDK tool runner): pevné stropy, sčítanie spotreby a vstrekovateľný klient
// pre testy bez volania API. Forced tool_choice sa nepoužíva (od Sonnet 5.5 / Opus 5.5 vracia
// 400) — model dostane `auto` a pokyn zavolať odovzdávací nástroj.

import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Locale } from "@/lib/i18n/locales";
import type { FoodSearchIndex } from "@/lib/foodIndexCore";
import { MEAL_SLOT_LABELS, scaleFoodMacros, type MealSlot } from "@/lib/meals";
import { baseUnitOf, type PortionFood } from "@/lib/portions";
import { getAnthropicClient, AI_MODEL } from "./client";
import type { CreateMessage } from "./chatLoop";
import { getFoodCandidates, type FoodCandidate } from "./foodContext";
import { getOffIndex, searchFoodsIn, SEARCH_FOODS_MAX, type FoodSearchHit } from "./foodSearch";
import { outputLanguageRule } from "./language";
import { DATA_IS_NOT_INSTRUCTIONS, promptSafe, wrapAsData } from "./promptSafety";
import {
  EXCLUDED_TEXT_MAX,
  analyzeDays,
  dietViolation,
  exclusionWords,
  findExcludedWord,
  slotsForMealCount,
  type DayAnalysis,
  type DietType,
  type DroppedItem,
  type KnownFood,
  type MacroTargets,
  type PlanItem,
  type PlanDay,
  type RepeatMode,
} from "./mealPlanValidation";
import { checkWeek, dayTotals, foodKeyOf, isFish, sanityScore, softWarnings, type RuleItem, type SoftWarning } from "./mealRules";
import {
  availableGroups,
  completePicks,
  composeDay,
  dayHasFish,
  fineTuneDay,
  fitsGroup,
  groupsOfFood,
  mainProteinKeys,
  maxPicks,
  pickProblem,
  planMeals,
  PORTION_GROUPS,
  type DayPicks,
  type PlannedMeal,
  type PortionGroup,
} from "./mealPortions";

/** Kôl hľadania vo fáze 1 (jedno kolo = viac paralelných search_foods); potom model dostane pokyn náčrt odovzdať. */
export const MEAL_GEN_MAX_SEARCH_ROUNDS = 4;
/** Najviac súbežných dní vo fáze 2 (plán má najviac 7 dní). */
export const MEAL_GEN_MAX_PARALLEL = 7;
/** Mäkký limit celej generácie — po ňom sa opravné kolo výberu preskočí (kód výber doplní sám). */
export const MEAL_GEN_SOFT_DEADLINE_MS = 100_000;
/** Opravné kolo výberu sa začne, len ak do mäkkého limitu zostáva aspoň toľko (volanie dňa bez premýšľania trvá ~5–10 s). */
export const MEAL_GEN_RETRY_RESERVE_MS = 20_000;
/** Opravných kôl výberu modelom na deň (potom ostatné doplní kód). */
export const MEAL_GEN_MAX_RETRIES = 1;
/** Ďalšie pokusy zložiť deň čisto kódom (iné striedanie potravín), ak výber modelu po doladení nespĺňa pravidlá. */
export const MEAL_GEN_DAY_RETRIES = 3;
/** Fáza 1 (hľadanie + náčrt) má mať najviac ~25 s: potom už model dostane pokyn odovzdať náčrt. */
export const MEAL_GEN_PHASE1_BUDGET_MS = 25_000;
const PHASE1_MAX_TOKENS = 4000;
const DAY_MAX_TOKENS = 3000;
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
  /** založí riadky OFF produktov vo `foods` a vráti DB-konzistentné hodnoty (null = nepodarilo sa) — pozri aiActions.ts */
  resolveFoods?: (foods: KnownFood[]) => Promise<Map<string, FoodResolution | null>>;
}

/** Hodnoty potraviny tak, ako sú uložené v DB (z nich sa počíta gramáž aj snapshot makier v builderi). */
export interface FoodResolution {
  foodId: string;
  kcal100: number;
  protein100: number;
  carbs100: number;
  fat100: number;
  fiber100?: number | null;
  portion: PortionFood;
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
      /** zahodené výbery modelu (po dňoch) */
      dropped: DroppedItem[];
      /** súčty po dňoch (po doladení) — tréner dostane upozornenie, ak niektorý deň ostal mimo cieľa */
      analysis: DayAnalysis[];
      /** aspoň jeden deň potreboval opravné kolo výberu alebo doplnenie potravín kódom */
      repaired: boolean;
      /** opravné kolo výberu sa kvôli mäkkému limitu času preskočilo */
      deadlineHit: boolean;
      requestedDays: number;
      /** len meal prep: dni, ktoré sa nepodarilo zostaviť — nahradené kópiou najbližšieho dňa, ktorý prešiel */
      copies: { day: number; from: number }[];
      /** variabilný režim: dni, ktoré sa nepodarilo zostaviť v rámci pravidiel — NEUKLADAJÚ sa (žiadna kópia) */
      missingDays: number[];
      /** mäkké upozornenia (vláknina, ovocie+zelenina, bielkoviny na jedlo, rozloženie makier, tuky) */
      soft: SoftWarning[];
      /** sanity skóre po dňoch (0–100, mäkké hodnotenie chuťovej a nutričnej zmysluplnosti) */
      sanity: { day: number; score: number; notes: string[] }[];
      /** počet OFF produktov, ktorým sa nepodarilo založiť riadok (vynechané) */
      offFailed: number;
      usage: MealGenUsage;
    }
  | { ok: false; reason: "no_submission" | "no_usable" | "failed" | "rules_failed"; usage: MealGenUsage; detail?: string };

// ---------------------------------------------------------------- nástroje

const DIET_LABEL: Record<DietType, string> = {
  none: "bez obmedzení",
  vegetarian: "vegetariánska (bez mäsa a rýb)",
  vegan: "vegánska (bez mäsa, rýb, mliečnych výrobkov, vajec a medu)",
  lactose_free: "bez laktózy (bez mliečnych výrobkov s laktózou)",
  gluten_free: "bez lepku (bez pšenice, raži, jačmeňa a výrobkov z nich)",
};

/** Čo appka rieši kódom a nutričné pravidlá skladby, ktoré vynucuje — rovnaké vo fáze 1 aj 2. */
const RULES_TEXT = [
  "Gramáže a množstvá model NEURČUJE: appka ich počíta sama z denných cieľov (porcie podľa skupín potravín, prísne stropy). Tvoja úloha je vybrať vhodné, chuťovo a nutrične zmysluplné potraviny.",
  "Skupiny: protein = mäso, ryby, vajcia, tofu/tempeh, údeniny (na raňajky a desiatu), pri vegetariánskej/vegánskej diéte aj strukoviny; dairy = jogurt, skyr, tvaroh, kefír, mlieko, rastlinné alternatívy; starch = ryža, cestoviny, vločky, pečivo, zemiaky (mimo vegetariánskej/vegánskej diéty aj strukoviny); vegetable; fruit; fat = olej, orechy/semienka/tahini, avokádo, syr.",
  "NUTRIČNÉ PRAVIDLÁ (appka ich vynucuje a výber, ktorý ich porušuje, zahodí):",
  "- Obed/večera: PRESNE 1 zdroj bielkovín (mäso/ryba/vajce/tofu), PRESNE 1 príloha, zelenina (1–2 druhy), najviac 1 tuk (olivový olej, avokádo). Žiadne mliečne ani ovocie v teplom jedle. Nikdy mäso/ryba spolu so strukovinami.",
  "- Strukoviny (šošovica, cícer, fazuľa): bielkovina LEN pri vegetariánskej/vegánskej diéte; inak len ako príloha, najviac 1× za deň a nie v jedle s mäsom.",
  "- Raňajky: 1 bielkovina (vajcia, šunka, tofu) a/alebo 1 mliečne + 1 príloha (vločky, pečivo) + ovocie (+ orechy/semienka); bez mäsa, rýb a strukovín.",
  "- Desiata/olovrant: mliečne alebo bielkovina + ovocie (max 3 položky); bez ryže, cestovín, zemiakov.",
  "- Mliečne najviac 1 v jedle a 3 za deň. Jedna potravina najviac 2× za deň; ten istý zdroj bielkovín najviac 1× za deň; tú istú tukovú potravinu najviac 2× (olej do teplých jedál, orechy/semienka/tahini na raňajky a desiatu).",
  "- Dni sa líšia hlavnou bielkovinou (nie rovnaká dva dni po sebe); pri ≥ 4 dňoch aspoň 2 jedlá z rýb, ak diéta dovoľuje.",
  "- Jedna potravina len v jednej forme (nie surová ryža vedľa uvarenej). Základné potraviny z knižnice uprednostni; značkové [OFF] len na jogurty, mliečne alternatívy, pečivo a údeniny.",
  "- Ovocie + zelenina ≥ 400 g denne, bielkoviny ≥ 25 g v hlavnom jedle, ≥ 20 g na raňajky, ≥ 10 g na desiatu (porcie dopočíta appka). Vláknina ≥ 25 g.",
].join("\n");

/** Diétne náhrady, ktoré má fáza 1 VÝSLOVNE vyhľadať (inak model nenájde bielkoviny na raňajky/desiatu). */
const DIET_SEARCH_HINT: Record<DietType, string> = {
  none: "",
  vegetarian: "Diéta vegetariánska: hľadaj vajcia, tvaroh, skyr, jogurt, syry, tofu, strukoviny a proteínové produkty bez mäsa.",
  vegan: "Diéta vegánska: hľadaj tofu, tempeh, sójový/rastlinný jogurt a nápoj, strukoviny, seitan, rastlinný proteín.",
  lactose_free: "Diéta bez laktózy: výslovne hľadaj bezlaktózové náhrady („bez laktózy“, „bezlaktózový“) — skyr, jogurt, tvaroh, mlieko — a rastlinné jogurty/nápoje (sójové, ovsené), vajcia, šunku/morčaciu šunku, tofu; nájdi aspoň 3 zdroje bielkovín vhodné na raňajky a desiatu.",
  gluten_free: "Diéta bez lepku: hľadaj bezlepkový chlieb, cestoviny a vločky („bez lepku“, „bezlepkový“), ryžu, zemiaky, pohánku, quinou, kukuricu.",
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
      "Odovzdá výber potravín na jeden deň: pre každé jedlo a každú skupinu zo šablóny 1–2 potraviny (`ref` z poskytnutého zoznamu). Žiadne množstvá — gramáž dopočíta appka. Volaj raz, keď máš výber hotový.",
    input_schema: {
      type: "object",
      properties: {
        meals: {
          type: "array",
          items: {
            type: "object",
            properties: {
              slot: { type: "string", enum: [...slots] },
              groups: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    group: { type: "string", enum: [...PORTION_GROUPS] },
                    food_refs: { type: "array", items: { type: "string" }, description: "1–2 `ref` zo zoznamu potravín (napr. 'F12'), ktoré patria do skupiny." },
                  },
                  required: ["group", "food_refs"],
                },
              },
            },
            required: ["slot", "groups"],
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

/** Jeden riadok potraviny pre model (výsledok hľadania vo fáze 1). */
export function foodLine(f: KnownFood): string {
  return `${f.ref} | ${f.name} [${f.source === "off" ? "OFF" : "knižnica"}] | ${f.kcal100} kcal, ${f.protein100} B, ${f.carbs100} S, ${f.fat100} T /100${baseUnitOf(f.portion)} | jednotky: ${unitsText(f)}`;
}

/** Riadok poolu pre deň: bez jednotiek, so skupinami, do ktorých potravina patrí. */
export function poolLine(f: KnownFood, diet: DietType = "none", libGroups?: ReadonlySet<PortionGroup>): string {
  return `${f.ref} | ${f.name} [${f.source === "off" ? "OFF" : "knižnica"}] | ${f.kcal100} kcal, ${f.protein100} B, ${f.carbs100} S, ${f.fat100} T /100${baseUnitOf(f.portion)} | skupiny: ${groupsOfFood(f, diet, libGroups).join(", ")}`;
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
      baseName: h.nameBase ?? h.name,
      kcal100: h.kcal100,
      protein100: h.protein100,
      carbs100: h.carbs100,
      fat100: h.fat100,
      fiber100: h.fiber100 ?? null,
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

const targetsLine = (t: MacroTargets, meals = 0) =>
  `Denný cieľ klienta: ${t.kcal} kcal, bielkoviny ${t.proteinG} g, sacharidy ${t.carbsG} g, tuky ${t.fatG} g.` +
  (meals > 0 ? ` Bielkoviny na jedlo ≈ ${Math.round(t.proteinG / meals)} g (každé jedlo má zdroj bielkovín).` : "");

/** Počet RÔZNYCH dní (meal prep: pár rôznych, ostatné sa opakujú; inak všetky). */
export function distinctDayCount(days: number, repeat: RepeatMode): number {
  if (repeat !== "meal_prep" || days <= 2) return days;
  return Math.max(2, Math.ceil(days / 3));
}

export function buildOutlineSystemPrompt(input: Pick<MealGeneratorInput, "locale" | "mealsPerDay" | "repeat" | "days" | "diet">): string {
  const slots = slotsForMealCount(input.mealsPerDay);
  const distinct = distinctDayCount(input.days, input.repeat);
  return [
    "Si asistent trénera vo fitness aplikácii FitPilot. Pripravuješ PODKLADY na jedálniček (koncept, ktorý tréner skontroluje): najprv nájdeš potraviny, potom odovzdáš stručný náčrt.",
    "Potraviny: smieš použiť VÝHRADNE potraviny z výsledkov nástroja search_foods (cez ich `ref`). Nikdy nevymýšľaj potravinu ani ref. Preferuj základné potraviny [knižnica]; značkové produkty [OFF] len tam, kde dávajú zmysel (skyr, jogurt, tyčinka).",
    "Postup: 1) V JEDNOM kole zavolaj search_foods paralelne na všetko, čo bude plán potrebovať (zdroje bielkovín, prílohy a sacharidy, zelenina, ovocie, mliečne/rastlinné alternatívy, tuky — olej, orechy, avokádo —, desiaty) — rešpektuj diétu a vylúčené potraviny; hľadaj aj viac druhov bielkovín a príloh kvôli variácii. 2) Zavolaj submit_outline.",
    DIET_SEARCH_HINT[input.diet],
    `Náčrt: pre KAŽDÝ slot KAŽDÉHO dňa vyber hlavnú bielkovinu (protein_ref povinne aj pri raňajkách a desiate); pre každý deň a slot (${slots.map((s) => `${s} = ${MEAL_SLOT_LABELS[s]}`).join(", ")}) hlavná bielkovina (protein_ref), hlavný sacharid (carb_ref) a zelenina/ovocie (veg_ref). Bielkoviny, prílohy aj zeleninu a ovocie medzi dňami striedaj — tá istá zelenina najviac 2× za týždeň, nech sa jedlá neopakujú (vyhľadaj preto viac druhov zeleniny a ovocia).`,
    input.repeat === "meal_prep"
      ? `Režim MENEJ VARIÁCIÍ (meal prep): náčrt urob len pre ${distinct} rôzne dni — ostatné dni appka zopakuje.`
      : `Režim KAŽDÝ DEŇ INÝ: náčrt pre všetkých ${input.days} dní, dni sa odlišujú.`,
    RULES_TEXT,
    DATA_IS_NOT_INSTRUCTIONS,
  ].join("\n");
}

export function buildOutlineUserMessage(input: MealGeneratorInput): string {
  const distinct = distinctDayCount(input.days, input.repeat);
  return [
    targetsLine(input.targets, input.mealsPerDay),
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

export function buildDaySystemPrompt(input: Pick<MealGeneratorInput, "locale" | "mealsPerDay" | "diet">): string {
  return [
    "Si asistent trénera vo fitness aplikácii FitPilot a pracuješ ako nutričný terapeut. Pre JEDEN deň jedálnička vyberieš potraviny do skupín podľa šablóny a odovzdáš ich cez submit_day.",
    "Potraviny: VÝHRADNE zo zoznamu (cez `ref`), nikdy nevymýšľaj ref ani potravinu; potravina musí patriť do skupiny (zoznam ju uvádza pri každom riadku). Ak má jedlo v náčrte hlavnú bielkovinu/sacharid/zeleninu, použi ich, pokiaľ neporušujú pravidlá.",
    "Nezadávaj množstvá — appka ich spočíta z denných cieľov a zaokrúhli. Do každej skupiny šablóny daj presne toľko potravín, koľko šablóna povoľuje (×1 = jedna, ×1–2 = jedna alebo dve; vždy jedna je hlavná). Dairy a fat sú voliteľné (appka ich doplní).",
    RULES_TEXT,
    DIET_SEARCH_HINT[input.diet] ? "Diéta: vyber len položky vhodné pre diétu (bezlaktózové/rastlinné/bezlepkové varianty); zoznam už obsahuje len také." : "",
    DATA_IS_NOT_INSTRUCTIONS,
    outputLanguageRule(input.locale),
  ].join("\n");
}

/** Šablóna jedla pre model: skupiny, odporúčaný počet potravín a orientačný cieľ makier jedla. */
export function templateLines(plan: PlannedMeal[]): string[] {
  return plan.map((m) => {
    const groups = m.groups.map((g) => `${g.group} ×${maxPicks(m.slot, g.group) === 1 ? "1" : "1–2"}`).join(", ");
    return `- ${m.slot} (${MEAL_SLOT_LABELS[m.slot]}, ≈ ${Math.round(m.kcal)} kcal, ≈ ${Math.round(m.proteinG)} g bielkovín): ${groups}`;
  });
}

export function buildDayUserMessage(input: MealGeneratorInput, pool: KnownFood[], outline: Outline | undefined, dayNo: number, plan: PlannedMeal[], libGroups?: ReadonlySet<PortionGroup>): string {
  const outlineLines: string[] = [];
  for (const slot of slotsForMealCount(input.mealsPerDay)) {
    const o = outline?.get(slot);
    if (!o || (!o.protein && !o.carb && !o.veg)) continue;
    outlineLines.push(`- ${slot}: bielkovina ${o.protein?.ref ?? "—"}, sacharid ${o.carb?.ref ?? "—"}, zelenina/ovocie ${o.veg?.ref ?? "—"}`);
  }
  return [
    targetsLine(input.targets, input.mealsPerDay),
    `Deň ${dayNo} z ${input.days}. Diéta: ${DIET_LABEL[input.diet]}.`,
    "Šablóna dňa (vyber potraviny do každej skupiny):",
    ...templateLines(plan),
    ...(outlineLines.length > 0 ? ["Náčrt dňa (hlavné zdroje):", ...outlineLines] : []),
    ...constraintsBlock(input),
    "",
    "Zoznam potravín (ref | názov | makrá na 100 | skupiny):",
    ...pool.filter((f) => groupsOfFood(f, input.diet, libGroups).length > 0).map((f) => poolLine(f, input.diet, libGroups)),
  ].join("\n");
}

// ---------------------------------------------------------------- výber modelu (kontrola)

/** Skupiny, ktoré model musí vybrať: hlavné jedlo (bielkovina, príloha, zelenina) a príloha raňajok; zvyšok doplní kód. */
const isRequiredGroup = (slot: MealSlot, group: PortionGroup) =>
  slot === "obed" || slot === "vecera" ? group === "protein" || group === "starch" || group === "vegetable" : slot === "ranajky" && group === "starch";

export interface ParsedPicks {
  picks: DayPicks;
  dropped: DroppedItem[];
  /** povinné skupiny šablóny (hlavné jedlo: bielkovina/príloha/zelenina; raňajky: príloha), do ktorých model nevybral platnú potravinu */
  missing: string[];
}

/**
 * Výber modelu → overené potraviny po jedlách a skupinách. Neznámy ref, vylúčená potravina, očividné porušenie diéty
 * a každé porušenie nutričných pravidiel skladby (`pickProblem`: skupina, počet potravín v jedle, strukoviny, mliečne,
 * opakovanie, formy potravín…) sa zahodia a zapíšu do `dropped` s dôvodom pre opravné kolo.
 */
export function parsePicks(
  rawMeals: unknown,
  ctx: { known: ReadonlyMap<string, KnownFood>; plan: PlannedMeal[]; diet: DietType; excluded: string[]; dayNo: number; libGroups?: ReadonlySet<PortionGroup> },
): ParsedPicks {
  const picks: DayPicks = new Map();
  const dropped: DroppedItem[] = [];
  const drop = (reason: DroppedItem["reason"], detail: string) => dropped.push({ day: ctx.dayNo, reason, detail });
  const planned = new Map(ctx.plan.map((m) => [m.slot, m]));
  for (const rm of Array.isArray(rawMeals) ? rawMeals : []) {
    const meal = rm && typeof rm === "object" ? (rm as { slot?: unknown; groups?: unknown }) : {};
    const pm = planned.get(meal.slot as MealSlot);
    if (!pm) {
      drop("bad_slot", String(meal.slot));
      continue;
    }
    for (const rg of Array.isArray(meal.groups) ? meal.groups : []) {
      const g = rg && typeof rg === "object" ? (rg as { group?: unknown; food_refs?: unknown }) : {};
      const group = g.group as PortionGroup;
      if (!pm.groups.some((x) => x.group === group)) {
        drop("bad_group", `${pm.slot}: skupina ${String(g.group)} nie je v šablóne tohto jedla`);
        continue;
      }
      const mealPicks = picks.get(pm.slot) ?? {};
      picks.set(pm.slot, mealPicks);
      const chosen = (mealPicks[group] ??= []);
      for (const r of Array.isArray(g.food_refs) ? g.food_refs : []) {
        const ref = typeof r === "string" ? r.trim() : "";
        const food = ctx.known.get(ref);
        if (!food) {
          drop("unknown_ref", ref || "?");
          continue;
        }
        const ex = findExcludedWord(food.name, ctx.excluded) ?? (food.baseName ? findExcludedWord(food.baseName, ctx.excluded) : null);
        if (ex) {
          drop("excluded", `${food.name} (${ex})`);
          continue;
        }
        // diéta len podľa SLOVENSKÉHO názvu z DB: české „syrový“ (surový) nie je syr
        const dv = dietViolation(food.baseName ?? food.name, ctx.diet);
        if (dv) {
          drop("diet", `${food.name} (${dv})`);
          continue;
        }
        const problem = pickProblem(food, pm.slot, group, picks, { diet: ctx.diet, libGroups: ctx.libGroups });
        if (problem) {
          drop(fitsGroup(food, group, ctx.diet) ? "rule" : "bad_group", `${pm.slot}/${group}: ${problem}`);
          continue;
        }
        chosen.push(food);
      }
      if (chosen.length === 0) delete mealPicks[group];
    }
    if (Object.keys(picks.get(pm.slot) ?? {}).length === 0) picks.delete(pm.slot);
  }
  const missing = ctx.plan.flatMap((m) => m.groups.filter((g) => isRequiredGroup(m.slot, g.group) && !picks.get(m.slot)?.[g.group]?.length).map((g) => `${m.slot}/${g.group}`));
  return { picks, dropped, missing };
}

/** Text opravného kola výberu: čo appka zahodila a čo chýba. */
export function buildPickFeedback(parsed: ParsedPicks): string {
  const lines: string[] = [];
  if (parsed.dropped.length > 0) lines.push(`Appka zahodila: ${parsed.dropped.slice(0, 8).map((d) => d.detail).join("; ")}.`);
  if (parsed.missing.length > 0) lines.push(`Chýba platný výber pre: ${parsed.missing.join(", ")}.`);
  return [
    "Kontrola výberu (počítané appkou):",
    ...lines,
    "Zavolaj submit_day znova s CELÝM dňom: pre každé jedlo a skupinu zo šablóny `ref` zo zoznamu, ktoré do skupiny patria, vyhovujú diéte a NUTRIČNÝM PRAVIDLÁM (presne 1 bielkovina a 1 príloha v obede/večeri, strukoviny len ako príloha mimo vegetariánskej/vegánskej diéty, max 1 mliečne v jedle, jedna potravina max 2× za deň, ten istý zdroj bielkovín max 1×, jedna forma potraviny). Množstvá neuvádzaj.",
  ].join("\n");
}

/** food_ref-y z vstupu submit_day (na založenie OFF riadkov pred kontrolou). */
function collectRefs(meals: unknown): string[] {
  const refs = new Set<string>();
  for (const m of Array.isArray(meals) ? meals : []) {
    const groups = m && typeof m === "object" ? (m as { groups?: unknown }).groups : null;
    for (const g of Array.isArray(groups) ? groups : []) {
      const list = g && typeof g === "object" ? (g as { food_refs?: unknown }).food_refs : null;
      for (const r of Array.isArray(list) ? list : []) if (typeof r === "string") refs.add(r.trim());
    }
  }
  return [...refs];
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

function ruleToPlanItem(ri: RuleItem, food: KnownFood): PlanItem {
  return {
    ref: food.ref,
    food,
    slot: ri.slot,
    unit: ri.unit,
    qty: ri.qty,
    grams: ri.grams,
    macros: scaleFoodMacros(
      { kcal_100g: ri.kcal100, protein_100g: ri.protein100, carbs_100g: ri.carbs100, fat_100g: ri.fat100 },
      ri.grams,
    ),
  };
}

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
        } else if (rounds > MEAL_GEN_MAX_SEARCH_ROUNDS || now() - startedAt > MEAL_GEN_PHASE1_BUDGET_MS) {
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

  // použiteľné potraviny: bez vylúčených a bez porušenia diéty (model ich ani nedostane, kód ich nevyberie)
  const isUsable = (f: KnownFood) =>
    !findExcludedWord(f.name, excluded) &&
    !(f.baseName && findExcludedWord(f.baseName, excluded)) &&
    !dietViolation(f.baseName ?? f.name, input.diet);
  const usablePool = pool.filter(isUsable);
  const plan = planMeals(input.targets, slots, availableGroups(usablePool, input.diet));
  if (plan.some((m) => !m.groups.some((g) => g.group === "protein" || g.group === "dairy"))) return { ok: false, reason: "no_usable", usage };

  // ================= FÁZA 2: dni paralelne; MODEL VYBERÁ potraviny, GRAMY POČÍTA KÓD
  //   model → (OFF riadky vo `foods`) → kontrola výberu → (1 opravné kolo) → doplnenie kódom →
  //   gramy z cieľov skupín → doladenie po kroku → pravidlá. Neprejdený deň sa NEBERIE: vo variabilnom
  //   režime ostane chýbajúci (upozornenie), kópia len v režime meal prep.
  const daySystem = buildDaySystemPrompt(input);
  const dayTool = buildDayTool(slots);
  let anyRepaired = false;
  let deadlineHit = false;
  let sawSubmit = false;
  let lastError: string | undefined;
  const dropped: DroppedItem[] = [];
  const checkOpts = { targets: input.targets, requiredSlots: slots, diet: input.diet };
  /** skupiny, v ktorých má pool aj základné (knižničné) potraviny — značkové produkty sa tam neberú na základné potraviny */
  const libGroups = new Set(PORTION_GROUPS.filter((g) => usablePool.some((f) => f.source === "kniznica" && fitsGroup(f, g, input.diet))));

  // riadky OFF produktov vo `foods` sa zakladajú PRED kontrolou — položka bez riadku by sa po
  // kontrole vyhodila a deň by tak skončil mimo cieľa. Výsledok sa kešuje na ref.
  const offFailed = new Set<string>();
  const resolving = new Map<string, Promise<void>>();
  const resolveRefs = (refs: string[]) => {
    const needed = refs.filter((r) => {
      const f = poolMap.get(r);
      return f && f.source === "off" && !f.foodId && deps.resolveFoods;
    });
    const jobs = needed.map((ref) => {
      let p = resolving.get(ref);
      if (!p) {
        p = (async () => {
          const f = poolMap.get(ref)!;
          let res: FoodResolution | null = null;
          try {
            res = (await deps.resolveFoods!([f])).get(ref) ?? null;
          } catch (err) {
            console.error("resolveFoods:", err instanceof Error ? err.message : err);
          }
          if (res) {
            poolMap.set(ref, { ...f, foodId: res.foodId, kcal100: res.kcal100, protein100: res.protein100, carbs100: res.carbs100, fat100: res.fat100, fiber100: res.fiber100 ?? f.fiber100, portion: res.portion });
          } else {
            poolMap.delete(ref); // riadok sa nepodarilo založiť → potravinu nemožno použiť
            offFailed.add(ref);
          }
        })();
        resolving.set(ref, p);
      }
      return p;
    });
    return Promise.all(jobs).then(() => undefined);
  };
  /** Potraviny, ktoré smie doplniť kód: knižnica a už založené OFF (bez resolveFoods sa berú všetky). */
  const fallbackPool = () => [...poolMap.values()].filter((f) => isUsable(f) && (f.source === "kniznica" || !!f.foodId || !deps.resolveFoods));

  interface DayOutcome {
    name: string;
    ruleItems: RuleItem[];
    foods: Map<string, KnownFood>;
    dropped: DroppedItem[];
  }
  const dayOf = (o: DayOutcome): PlanDay => ({ name: o.name, items: o.ruleItems.map((ri) => ruleToPlanItem(ri, o.foods.get(ri.ref!)!)) });

  const failureNotes: string[] = [];
  interface Staged {
    name: string;
    picks: DayPicks;
    dropped: DroppedItem[];
  }
  /** Krok 1 (paralelne): model vyberá potraviny dňa, kód výber overí (jedno opravné kolo pri porušení pravidiel). */
  const stageDay = async (i: number): Promise<Staged | null> => {
    const dayNo = i + 1;
    const name = input.dayName(dayNo);
    const messages: Anthropic.MessageParam[] = [{ role: "user", content: buildDayUserMessage(input, usablePool, outline[i], dayNo, plan, libGroups) }];
    const base: Omit<Anthropic.MessageCreateParamsNonStreaming, "messages"> = {
      model: AI_MODEL.MEAL_GENERATOR,
      max_tokens: DAY_MAX_TOKENS,
      system: daySystem,
      tools: [dayTool],
      tool_choice: { type: "auto" },
      // Bez premýšľania: model len vyberá potraviny (krátky výstup), rýchlosť je dôležitejšia.
      // Pozor: pri Sonnet 5.5+ je `thinking: disabled` zakázané (400) — pri zmene modelu skontrolovať.
      thinking: { type: "disabled" },
    };
    let parsed: ParsedPicks = { picks: new Map(), dropped: [], missing: [] };
    try {
      let nudged = false;
      let retries = 0;
      for (let call = 0; call < 3 + MEAL_GEN_MAX_RETRIES; call++) {
        if (call > 0 && now() - startedAt + MEAL_GEN_RETRY_RESERVE_MS > MEAL_GEN_SOFT_DEADLINE_MS) {
          deadlineHit = true; // na opravné kolo už nie je čas → výber doplní kód
          break;
        }
        const response = await create({ ...base, messages });
        const tu = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "submit_day");
        if (!tu) {
          if (nudged || response.stop_reason === "max_tokens") break;
          nudged = true;
          messages.push({ role: "assistant", content: response.content });
          messages.push({ role: "user", content: "Zavolaj teraz submit_day s výberom potravín (použi len ref zo zoznamu)." });
          continue;
        }
        sawSubmit = true;
        const rawMeals = (tu.input as { meals?: unknown } | null)?.meals;
        await resolveRefs(collectRefs(rawMeals));
        parsed = parsePicks(rawMeals, { known: poolMap, plan, diet: input.diet, excluded, dayNo, libGroups });
        if ((parsed.dropped.length === 0 && parsed.missing.length === 0) || retries >= MEAL_GEN_MAX_RETRIES) break;
        retries++;
        anyRepaired = true;
        messages.push({ role: "assistant", content: response.content });
        messages.push({ role: "user", content: [{ type: "tool_result", tool_use_id: tu.id, content: buildPickFeedback(parsed) }] });
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      console.error(`generateMealPlan (deň ${dayNo}):`, lastError);
      return null;
    }
    return { name, picks: parsed.picks, dropped: parsed.dropped };
  };

  const staged = await mapLimit(
    Array.from({ length: distinct }, (_, i) => i),
    MEAL_GEN_MAX_PARALLEL,
    (i) => stageDay(i),
  );

  /**
   * Krok 2 (po poradí dní): výber modelu sa doplní kódom v súlade s pravidlami skladby, hlavné bielkoviny sa nezhodujú
   * s predchádzajúcim dňom a pri ≥ 4 dňoch sa zaručia aspoň 2 jedlá z rýb; potom gramy, doladenie a kontrola pravidiel.
   */
  const FISH_MIN_PER_PLAN = 2;
  const fishAvailable = distinct >= 4 && fallbackPool().some((f) => fitsGroup(f, "protein", input.diet) && isFish(f.baseName ?? f.name));
  let prevKeys: Set<string> | undefined;
  let fishDays = 0;
  const built: (DayOutcome | null)[] = [];
  for (let i = 0; i < distinct; i++) {
    const st = staged[i];
    if (!st) {
      built.push(null);
      continue;
    }
    const dayNo = i + 1;
    const forceFish = fishAvailable && fishDays < FISH_MIN_PER_PLAN && (distinct - i <= FISH_MIN_PER_PLAN - fishDays || i % 3 === 1);
    // 1. pokus: výber modelu; ak deň aj po doladení porušuje pravidlá, ďalšie pokusy skladá kód sám (iné striedanie potravín)
    let done = completePicks(plan, st.picks, fallbackPool(), i, { diet: input.diet, libGroups, avoid: prevKeys, forceFish });
    let tuned = fineTuneDay(composeDay(done.plan, done.picks, input.targets, input.diet), checkOpts);
    for (let attempt = 1; attempt <= MEAL_GEN_DAY_RETRIES && !tuned.ok; attempt++) {
      done = completePicks(plan, new Map(), fallbackPool(), i + attempt * 3, { diet: input.diet, libGroups, avoid: prevKeys, forceFish });
      tuned = fineTuneDay(composeDay(done.plan, done.picks, input.targets, input.diet), checkOpts);
    }
    if (done.added > 0) anyRepaired = true;
    prevKeys = mainProteinKeys(done.picks);
    if (dayHasFish(done.picks)) fishDays++;
    if (!tuned.ok) {
      // diagnostika: ktoré pravidlo deň nesplnil (len čísla a kódy pravidiel, žiadne osobné údaje)
      const note = tuned.check.violations.map((v) => v.detail).join("; ");
      console.warn(`generateMealPlan: deň ${dayNo} neprešiel pravidlami — ${note.slice(0, 600)}`);
      console.warn(`generateMealPlan: deň ${dayNo} položky — ${tuned.items.map((x) => `${x.slot}:${x.name} ${Math.round(x.grams)}g`).join(", ")}`);
      failureNotes.push(`deň ${dayNo}: ${note.slice(0, 300)}`);
      built.push(null);
      continue;
    }
    const foods = new Map<string, KnownFood>();
    for (const groups of done.picks.values()) for (const list of Object.values(groups)) for (const f of list ?? []) foods.set(f.ref, f);
    built.push({ name: st.name, ruleItems: tuned.items, foods, dropped: st.dropped });
  }
  built.forEach((b) => {
    if (b) dropped.push(...b.dropped);
  });

  const okBuilt = built.filter((b): b is DayOutcome => b !== null);
  if (okBuilt.length === 0) {
    return { ok: false, reason: sawSubmit || failureNotes.length > 0 ? "rules_failed" : lastError ? "failed" : "no_submission", usage, detail: lastError ?? (failureNotes.join(" | ") || undefined) };
  }

  // ================= týždenný priemer ±3 %: doladenie dní na posunutý cieľ (len ak dni ostanú v pravidlách)
  const week = checkWeek(okBuilt.map((b) => dayTotals(b.ruleItems).kcal), input.targets.kcal);
  if (!week.ok) {
    const aim = input.targets.kcal * (1 - week.avgDev);
    for (let i = 0; i < built.length; i++) {
      const b = built[i];
      if (!b) continue;
      const tuned = fineTuneDay(b.ruleItems, { ...checkOpts, kcalAim: aim });
      if (tuned.ok) built[i] = { ...b, ruleItems: tuned.items };
    }
    const again = checkWeek(built.filter((b): b is DayOutcome => b !== null).map((b) => dayTotals(b.ruleItems).kcal), input.targets.kcal);
    if (!again.ok) return { ok: false, reason: "rules_failed", usage, detail: "weekly average" };
  }

  // zopakované dni (meal prep): deň i ≥ distinct = kópia dňa (i mod distinct)
  const allDays: (PlanDay | null)[] = Array.from({ length: input.days }, (_, i) => {
    const src = built[i % distinct];
    if (!src) return null;
    const d = dayOf(src);
    return i < distinct ? d : { name: input.dayName(i + 1), items: d.items };
  });
  const srcItems = new Map<number, RuleItem[]>();
  allDays.forEach((d, i) => {
    if (d) srcItems.set(i, built[i % distinct]!.ruleItems);
  });
  const copies: { day: number; from: number }[] = [];
  const missingDays: number[] = [];
  const passing = allDays.flatMap((d, i) => (d ? [i] : []));
  if (input.repeat === "meal_prep") {
    // meal prep: deň, ktorý sa nepodaril, nahradí kópia najbližšieho dňa, ktorý prešiel (tréner dostane upozornenie)
    const used = new Map<number, number>();
    for (let i = 0; i < allDays.length; i++) {
      if (allDays[i]) continue;
      const from = [...passing].sort((x, y) => (used.get(x) ?? 0) - (used.get(y) ?? 0) || Math.abs(x - i) - Math.abs(y - i))[0];
      used.set(from, (used.get(from) ?? 0) + 1);
      allDays[i] = { name: input.dayName(i + 1), items: allDays[from]!.items.map((it) => ({ ...it })) };
      srcItems.set(i, srcItems.get(from)!);
      copies.push({ day: i + 1, from: from + 1 });
    }
  } else {
    // variabilný režim: nikdy kópia — chýbajúci deň sa len ohlási
    allDays.forEach((d, i) => {
      if (!d) missingDays.push(i + 1);
    });
  }
  const days = allDays.filter((d): d is PlanDay => d !== null);
  const soft = softWarnings(
    allDays.flatMap((_, i) => (srcItems.has(i) ? [{ dayNo: i + 1, items: srcItems.get(i)! }] : [])),
    input.targets,
  );
  return {
    ok: true,
    days,
    dropped,
    analysis: analyzeDays(days, input.targets),
    repaired: anyRepaired,
    deadlineHit,
    requestedDays: input.days,
    copies,
    missingDays,
    soft,
    sanity: allDays.flatMap((_, i) => (srcItems.has(i) ? [{ day: i + 1, ...sanityScore(srcItems.get(i)!, { targets: input.targets, diet: input.diet }) }] : [])),
    offFailed: offFailed.size,
    usage,
  };
}
