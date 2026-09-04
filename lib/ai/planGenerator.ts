// FitPilot — AI blok: generátor tréningového plánu pre trénera (Track "Tréner"
// bod 4/5 v ROADMAP.md). Rovnaký princíp ako lib/ai/exerciseAlternatives.ts —
// appka najprv nájde skutočné cviky z knižnice, model si SMIE vybrať LEN z nich
// (JSON schema `enum` na `exercise_id`, vynútené priamo API-čkom cez `strict:
// true`, nie len promptom — model fyzicky nemôže vrátiť neexistujúce ID).
//
// Draft-then-approve (Product Principle #1 — tréner vždy v kontrole): tento
// modul NEZAPISUJE nič do DB sám. Vráti len navrhnutú štruktúru; server action
// (app/dashboard/treningy/actions.ts) z nej vytvorí bežný `workout_plans`
// (published: false — koncept, presne ako ručne vytvorený plán, 0021) +
// `workout_days`, ktoré sa otvoria v existujúcom PlanBuilderi na plnú editáciu.
// Žiadna nová tabuľka (`ai_drafts`) — koncept/publikovanie z 0021 túto potrebu
// už rieši.

import { getAnthropicClient, AI_MODEL } from "./client";
import { logAiUsage } from "./logUsage";
import type { SupabaseClient } from "@supabase/supabase-js";

export type PlanGoal = "chudnutie" | "hypertrofia" | "sila" | "kondicia";
export type PlanExperience = "zaciatocnik" | "stredne_pokrocily" | "pokrocily";
export type PlanEquipment = "plna_posilnovna" | "domace_vybavenie" | "len_telo";

export interface PlanGeneratorInput {
  trainerId: string;
  clientId: string;
  goal: PlanGoal;
  daysPerWeek: number; // 1-7
  experience: PlanExperience;
  equipment: PlanEquipment;
}

export interface GeneratedExercise {
  exerciseId: string;
  exerciseName: string;
  sets: number;
  reps: string;
  restSeconds: number;
}

export interface GeneratedDay {
  name: string;
  exercises: GeneratedExercise[];
}

export interface GeneratedPlan {
  days: GeneratedDay[];
}

const GOAL_LABEL: Record<PlanGoal, string> = {
  chudnutie: "chudnutie (vyšší objem, kratšie pauzy)",
  hypertrofia: "hypertrofia (nárast svalovej hmoty, stredné opakovania 8-12)",
  sila: "sila (nízke opakovania 3-6, dlhšie pauzy, ťažké základné cviky)",
  kondicia: "všeobecná kondícia (vyvážený plán, mierna intenzita)",
};
const EXPERIENCE_LABEL: Record<PlanExperience, string> = {
  zaciatocnik: "začiatočník (jednoduché cviky, nižší objem, technika na prvom mieste)",
  stredne_pokrocily: "stredne pokročilý",
  pokrocily: "pokročilý (vyšší objem/intenzita, môžu byť náročnejšie varianty)",
};
const EQUIPMENT_LABEL: Record<PlanEquipment, string> = {
  plna_posilnovna: "plná posilňovňa (činky, stroje, kladky)",
  domace_vybavenie: "domáce vybavenie (činky/guma, bez strojov)",
  len_telo: "len vlastná váha, bez vybavenia",
};

const MUSCLE_GROUP_CANDIDATES_LIMIT = 15; // per svalová partia — drží prompt v rozumnej veľkosti

interface CandidateExercise {
  id: string;
  name: string;
  nameSk: string | null;
  muscleGroup: string;
}

/** Kandidáti naprieč VŠETKÝMI svalovými partiami (nie len jednou ako pri náhrade cviku) — plán musí pokryť celé telo. */
async function fetchCandidateExercises(supabase: SupabaseClient): Promise<CandidateExercise[]> {
  const { data: groups } = await supabase
    .from("exercises")
    .select("muscle_group")
    .not("muscle_group", "is", null);
  const distinctGroups = Array.from(new Set((groups ?? []).map((g) => g.muscle_group as string)));

  const results = await Promise.all(
    distinctGroups.map((mg) =>
      supabase
        .from("exercises")
        .select("id, name, name_sk, muscle_group")
        .eq("muscle_group", mg)
        .limit(MUSCLE_GROUP_CANDIDATES_LIMIT),
    ),
  );

  const all: CandidateExercise[] = [];
  for (const r of results) {
    for (const row of r.data ?? []) {
      all.push({ id: row.id, name: row.name, nameSk: row.name_sk, muscleGroup: row.muscle_group });
    }
  }
  return all;
}

function formatCandidates(candidates: CandidateExercise[]): string {
  const byGroup = new Map<string, CandidateExercise[]>();
  for (const c of candidates) {
    if (!byGroup.has(c.muscleGroup)) byGroup.set(c.muscleGroup, []);
    byGroup.get(c.muscleGroup)!.push(c);
  }
  const lines: string[] = [];
  for (const [group, list] of byGroup) {
    lines.push(`${group}:`);
    for (const c of list) lines.push(`  - ${c.id} :: ${c.nameSk?.trim() || c.name}`);
  }
  return lines.join("\n");
}

export type GeneratePlanResult = { plan: GeneratedPlan } | { error: string };

export async function generateWorkoutPlan(
  supabase: SupabaseClient,
  input: PlanGeneratorInput,
): Promise<GeneratePlanResult> {
  const candidates = await fetchCandidateExercises(supabase);
  if (candidates.length === 0) {
    return { error: "Knižnica cvikov je prázdna — AI nemá z čoho vyberať." };
  }
  const candidateIds = candidates.map((c) => c.id);
  const nameById = new Map(candidates.map((c) => [c.id, c.nameSk?.trim() || c.name]));

  const system = [
    "Si asistent trénera vo fitness aplikácii FitPilot. Zostavíš tréningový plán VÝHRADNE z cvikov v priloženom zozname — nikdy nenavrhuj cvik mimo neho (aj tak by si nemohol, exercise_id musí byť z priloženého zoznamu).",
    "Rozdeľ cviky rozumne medzi dni podľa cieľa a skúsenosti klienta (napr. split podľa svalových partií pri viacerých dňoch, full-body pri 1-3 dňoch). Rešpektuj zadané vybavenie — ak klient nemá posilňovňu, vyber cviky s vlastnou váhou/domácim vybavením podľa názvu cviku.",
    "Vytvor PRESNE toľko dní, koľko klient požaduje (pozri nižšie). Každý deň má 4-8 cvikov.",
    "sets: celé číslo 1-8. rest_seconds: celé číslo 15-300 (sekundy). reps: text (napr. \"8-10\"). Nastav ich podľa cieľa a skúsenosti (napr. sila = nižšie reps, dlhšie pauzy; hypertrofia = stredné reps 8-12; začiatočník = nižší objem).",
    "Názvy dní stručné a výstižné (napr. 'Deň 1 — Horná časť tela').",
  ].join("\n");

  const userMessage = [
    `Cieľ klienta: ${GOAL_LABEL[input.goal]}.`,
    `Počet tréningových dní v týždni: ${input.daysPerWeek}.`,
    `Skúsenosť: ${EXPERIENCE_LABEL[input.experience]}.`,
    `Dostupné vybavenie: ${EQUIPMENT_LABEL[input.equipment]}.`,
    "",
    "Zoznam dostupných cvikov (exercise_id :: názov), zoskupené podľa svalovej partie:",
    formatCandidates(candidates),
  ].join("\n");

  const anthropic = getAnthropicClient();

  try {
    const response = await anthropic.messages.create({
      model: AI_MODEL.PLAN_GENERATOR,
      max_tokens: 4096,
      system,
      messages: [{ role: "user", content: userMessage }],
      // POZN.: `strict: true` + `enum` s ~200+ exercise_id zlyhávalo na API strane
      // ("Schema is too complex for compilation") — kandidátov je príliš veľa na
      // vynútenú gramatiku. Namiesto toho: prompt hovorí "len z tohto zoznamu" a
      // po odpovedi filtrujeme cudzie exercise_id (rovnaký vzor ako
      // exerciseAlternatives.ts — appka dáva reálne dáta, ale finálnu kontrolu
      // platnosti robí kód, nie enum v schéme).
      tools: [
        {
          name: "propose_workout_plan",
          description: "Navrhne tréningový plán rozdelený na dni, zložený výhradne z poskytnutých cvikov.",
          input_schema: {
            type: "object",
            properties: {
              days: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    exercises: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          exercise_id: { type: "string", description: "MUSÍ byť presne jedno z ID zo zoznamu vyššie." },
                          sets: { type: "integer" },
                          reps: { type: "string" },
                          rest_seconds: { type: "integer" },
                        },
                        required: ["exercise_id", "sets", "reps", "rest_seconds"],
                      },
                    },
                  },
                  required: ["name", "exercises"],
                },
              },
            },
            required: ["days"],
          },
        },
      ],
      tool_choice: { type: "tool", name: "propose_workout_plan" },
    });

    const toolUse = response.content.find((b) => b.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      return { error: "AI nevrátila návrh plánu. Skús to prosím znova." };
    }

    const raw = toolUse.input as { days: { name: string; exercises: { exercise_id: string; sets: number; reps: string; rest_seconds: number }[] }[] };

    const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(n)));
    const validIds = new Set(candidateIds);

    const days: GeneratedDay[] = raw.days
      .map((d) => ({
        name: d.name,
        // Filter, nie len fallback — cvik s vymysleným ID by v builderi nemal
        // obrázok/inštrukcie a klient by ho nevedel dohľadať (viď foodContext.ts/
        // exerciseAlternatives.ts, rovnaký princíp: appka nikdy nedovolí prejsť
        // ID mimo reálnej knižnice ďalej do DB).
        exercises: d.exercises
          .filter((e) => validIds.has(e.exercise_id))
          .map((e) => ({
            exerciseId: e.exercise_id,
            exerciseName: nameById.get(e.exercise_id) ?? "Cvik",
            sets: clamp(e.sets, 1, 10),
            reps: e.reps,
            restSeconds: clamp(e.rest_seconds, 15, 300),
          })),
      }))
      .filter((d) => d.exercises.length > 0);

    if (days.length === 0) {
      return { error: "AI nevrátila použiteľný plán (žiadny navrhnutý cvik nebol z knižnice). Skús to prosím znova." };
    }

    await logAiUsage({
      trainerId: input.trainerId,
      clientId: input.clientId,
      kind: "plan_gen",
      model: AI_MODEL.PLAN_GENERATOR,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    });

    return { plan: { days } };
  } catch (err) {
    console.error("generateWorkoutPlan (Claude call):", err instanceof Error ? err.message : err);
    return { error: "Nastala chyba pri generovaní plánu. Skús to prosím znova." };
  }
}
