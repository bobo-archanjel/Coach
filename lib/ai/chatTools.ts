// i18n-ignore-file: definície nástrojov a ich výsledky sú interná komunikácia s modelom, nie text pre používateľa
// FitPilot — AI Kouč: nástroje (Anthropic tool use) na prehľadávanie databáz appky.
// AI smie pomenovať len cviky a potraviny, ktoré jej vrátil niektorý z týchto nástrojov —
// preto je "DB-only" vynútené štruktúrou (model nemá iný zdroj mien), nielen promptom.
// Všetko beží pod session klienta (RLS), nič nezapisuje.

import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Locale } from "@/lib/i18n/locales";
import { muscleGroupLabel } from "@/lib/i18n/muscles";
import { displayExerciseName } from "@/lib/exercises";
import { EXERCISE_EQUIPMENT, EXERCISE_MUSCLE_GROUPS, SEARCH_EXERCISES_MAX, searchExercises } from "./exerciseAlternatives";
import { getFoodCandidates, type FoodCandidate } from "./foodContext";
import { formatFoodHits, getOffIndex, searchFoodsIn, SEARCH_FOODS_MAX } from "./foodSearch";
import { promptSafe } from "./promptSafety";

export const CHAT_TOOLS: Anthropic.Tool[] = [
  {
    name: "search_exercises",
    description:
      "Hľadá cviky v databáze cvikov appky (~900 cvikov, názvy slovensky aj anglicky). Použi na KAŽDÝ cvik, ktorý chceš klientovi navrhnúť — iné cviky než tie, čo vráti tento nástroj, neexistujú. Zadaj `query` (názov alebo časť názvu, napr. 'drep', 'squat', 'bench press') a/alebo filter `muscle_group` či `equipment`. Pri náhrade cviku hľadaj podľa partie (a rôzneho vybavenia), nie podľa názvu pôvodného cviku. Každý výsledok má ID na marker [CVIKY: ...].",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Názov alebo časť názvu cviku (SK/CZ/EN, bez diakritiky tiež ide). Nepovinné, ak zadáš muscle_group." },
        muscle_group: { type: "string", enum: [...EXERCISE_MUSCLE_GROUPS], description: "Svalová partia (presná hodnota z DB)." },
        equipment: { type: "string", enum: [...EXERCISE_EQUIPMENT], description: "Vybavenie ('body only' = vlastná váha)." },
        limit: { type: "integer", minimum: 1, maximum: SEARCH_EXERCISES_MAX, description: "Max. počet výsledkov (predvolene 10)." },
      },
    },
  },
  {
    name: "search_foods",
    description:
      "Hľadá potraviny v databázach appky: základné potraviny, potraviny trénera a offline Open Food Facts (obchodné produkty). Použi na KAŽDÚ konkrétnu potravinu, ktorú chceš klientovi odporučiť — iné potraviny než tie, čo vráti tento nástroj, neexistujú. Vráti makrá na 100 g/ml a dostupné jednotky (ks, porcia, balenie). Hľadaj jednoduché názvy ('kuracie prsia', 'ryža', 'jogurt', 'ovsené vločky'); viac hľadaní môžeš poslať naraz.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Názov potraviny alebo jeho časť (SK/CZ)." },
        limit: { type: "integer", minimum: 1, maximum: SEARCH_FOODS_MAX, description: "Max. počet výsledkov (predvolene 8)." },
      },
      required: ["query"],
    },
  },
];

export interface ChatToolContext {
  supabase: SupabaseClient;
  trainerId: string;
  locale: Locale;
  /** cviky, ktoré nástroj vrátil (id → zobrazený názov) — appka podľa nich overuje marker [CVIKY: ...] */
  foundExercises: Map<string, string>;
  /** na testy: vlastné načítanie knižnice potravín / OFF indexu */
  loadLibrary?: () => Promise<FoodCandidate[]>;
}

export interface ChatToolOutput {
  content: string;
  isError?: boolean;
}

const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const int = (v: unknown, fallback: number): number => (typeof v === "number" && Number.isFinite(v) ? Math.floor(v) : fallback);

/** Vytvorí vykonávač nástrojov pre jednu správu (knižnica potravín sa načíta najviac raz). */
export function createChatToolRunner(ctx: ChatToolContext): (name: string, input: unknown) => Promise<ChatToolOutput> {
  let library: Promise<FoodCandidate[]> | null = null;
  const loadLibrary = ctx.loadLibrary ?? (() => getFoodCandidates(ctx.supabase, ctx.trainerId));

  return async (name, rawInput) => {
    const input = (rawInput && typeof rawInput === "object" ? rawInput : {}) as Record<string, unknown>;
    try {
      if (name === "search_exercises") {
        const hits = await searchExercises(ctx.supabase, {
          query: str(input.query),
          muscleGroup: str(input.muscle_group),
          equipment: str(input.equipment),
          limit: int(input.limit, 10),
        });
        if (hits.length === 0) return { content: "Nenájdené (skús iné slovo, anglický názov alebo len filter partie)." };
        const lines = hits.map((h) => {
          const display = promptSafe(displayExerciseName(h.name, h.nameSk), 80);
          ctx.foundExercises.set(h.id, display);
          const muscle = h.muscleGroup ? muscleGroupLabel(h.muscleGroup, ctx.locale) : "?";
          return `${h.id} :: ${display} (partia: ${muscle}; vybavenie: ${h.equipment ?? "?"})`;
        });
        return { content: lines.join("\n") };
      }
      if (name === "search_foods") {
        const query = str(input.query);
        if (!query) return { content: "Chýba query.", isError: true };
        library ??= loadLibrary().catch((err: unknown) => {
          console.error("search_foods library:", err instanceof Error ? err.message : err);
          return [];
        });
        const [lib, off] = await Promise.all([library, getOffIndex()]);
        return { content: formatFoodHits(searchFoodsIn(lib, off, query, int(input.limit, 8), ctx.locale)) };
      }
      return { content: `Neznámy nástroj: ${name}`, isError: true };
    } catch (err) {
      console.error(`chat tool ${name}:`, err instanceof Error ? err.message : err);
      return { content: "Vyhľadávanie sa teraz nepodarilo — odpovedz bez neho a nič nevymýšľaj.", isError: true };
    }
  };
}
