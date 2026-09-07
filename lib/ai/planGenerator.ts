// FitPilot — AI blok: generátor tréningového plánu pre trénera (Track "Tréner"
// bod 4/5 v ROADMAP.md). Rovnaký princíp ako lib/ai/exerciseAlternatives.ts —
// appka najprv nájde skutočné cviky z knižnice, model si SMIE vybrať LEN z nich
// (po odpovedi appka vyfiltruje neplatné exercise_id).
//
// feature/ai-plan-zameranie (2026-09): dve zlepšenia kvality návrhu —
//  1. Zameranie plánu (vyvážene / viac horná / viac dolná časť tela) — explicitný
//     vstup z formulára (predvyplnený podľa nutrition_profiles.sex, ale tréner ho
//     mení), konkrétny číselný cieľ v prompte + deterministická kontrola/doplnenie
//     po vygenerovaní (lib/ai/planTaxonomy.ts — čistá, testovateľná logika).
//  2. Vybavenie ako štrukturálny filter — kandidáti sa filtrujú podľa equipment
//     úrovne klienta PRED promptom (exercises.equipment, migrácia 0031), nie
//     spoliehaním sa na to, že model uhádne vybavenie z názvu cviku.
//
// Draft-then-approve (Product Principle #1 — tréner vždy v kontrole): tento
// modul NEZAPISUJE nič do DB sám. Vráti len navrhnutú štruktúru; server action
// (app/dashboard/treningy/actions.ts) z nej vytvorí bežný `workout_plans`
// (published: false — koncept, presne ako ručne vytvorený plán, 0021) +
// `workout_days`, ktoré sa otvoria v existujúcom PlanBuilderi na plnú editáciu.

import { getAnthropicClient, AI_MODEL } from "./client";
import { logAiUsage } from "./logUsage";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type PlanFocus,
  PLAN_FOCUS_LABEL_SK,
  regionForMuscleGroup,
  GLUTES_MUSCLE_GROUP,
  exerciseFitsEquipment,
  analyzeFocus,
  focusTargetMet,
  FOCUS_MIN_GLUTES,
} from "./planTaxonomy";

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
  focus: PlanFocus;
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
  /** Deterministická kontrola po vygenerovaní niečo nedotiahla — tréner nech si to overí v koncepte. */
  warnings?: string[];
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

/** Číselný cieľ zamerania do promptu — v duchu "sets: 1-8", nie vágne formulácie. */
const FOCUS_PROMPT: Record<PlanFocus, string | null> = {
  vyvazene: null,
  horna:
    "ZAMERANIE: viac horná časť tela. Približne 55-60 % všetkých cvikov v pláne (naprieč dňami spolu) má cieliť hornú časť tela (hrudník, chrbát, ramená, biceps, triceps). Dolná časť a core nech tvoria zvyšok.",
  dolna:
    "ZAMERANIE: viac dolná časť tela. Približne 55-60 % všetkých cvikov v pláne (naprieč dňami spolu) má cieliť dolnú časť tela (kvadricepsy, zadné stehná, zadok, lýtka), z toho ASPOŇ 2 cviky za týždeň priamo na zadok (glutes). Horná časť a core nech tvoria zvyšok.",
};

const MUSCLE_GROUP_CANDIDATES_LIMIT = 15; // per svalová partia — drží prompt v rozumnej veľkosti
const MAX_EXERCISES_PER_DAY = 8;

interface CandidateExercise {
  id: string;
  name: string;
  nameSk: string | null;
  muscleGroup: string;
  equipment: string | null;
}

/**
 * Kandidáti naprieč VŠETKÝMI svalovými partiami (nie len jednou ako pri náhrade
 * cviku) — plán musí pokryť celé telo. Ak je v knižnici vyplnený `equipment`
 * (migrácia 0031 + re-import), kandidáti sa filtrujú podľa úrovne vybavenia
 * klienta PRED promptom. Kým `equipment` nie je doplnený (samé NULL), filter sa
 * vypne a padáme späť na doterajšie správanie (prompt spomenie vybavenie textom).
 */
async function fetchCandidateExercises(
  supabase: SupabaseClient,
  equipment: PlanEquipment,
): Promise<{ candidates: CandidateExercise[]; equipmentFiltered: boolean }> {
  const { data: groups } = await supabase
    .from("exercises")
    .select("muscle_group")
    .not("muscle_group", "is", null);
  const distinctGroups = Array.from(new Set((groups ?? []).map((g) => g.muscle_group as string)));

  const results = await Promise.all(
    distinctGroups.map((mg) =>
      supabase
        .from("exercises")
        .select("id, name, name_sk, muscle_group, equipment")
        // Načítaj o niečo viac, nech po equipment filtri zostane rozumný počet.
        .eq("muscle_group", mg)
        .limit(MUSCLE_GROUP_CANDIDATES_LIMIT * 3),
    ),
  );

  const raw: CandidateExercise[] = [];
  for (const r of results) {
    for (const row of r.data ?? []) {
      raw.push({
        id: row.id,
        name: row.name,
        nameSk: row.name_sk,
        muscleGroup: row.muscle_group,
        equipment: row.equipment ?? null,
      });
    }
  }

  const equipmentDataAvailable = raw.some((c) => c.equipment != null);
  const filtered = equipmentDataAvailable ? raw.filter((c) => exerciseFitsEquipment(c.equipment, equipment)) : raw;

  // Zosekni späť na limit per partia (po filtri, nech partie neprevažuje jedna).
  const byGroup = new Map<string, CandidateExercise[]>();
  for (const c of filtered) {
    const list = byGroup.get(c.muscleGroup) ?? [];
    if (list.length < MUSCLE_GROUP_CANDIDATES_LIMIT) {
      list.push(c);
      byGroup.set(c.muscleGroup, list);
    }
  }
  return { candidates: [...byGroup.values()].flat(), equipmentFiltered: equipmentDataAvailable };
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

/** Rozumné default série/opakovania/pauza pre cvik doplnený appkou (tréner ich v builderi upraví). */
function defaultsForGoal(goal: PlanGoal): { sets: number; reps: string; restSeconds: number } {
  switch (goal) {
    case "sila":
      return { sets: 4, reps: "4-6", restSeconds: 180 };
    case "hypertrofia":
      return { sets: 3, reps: "8-12", restSeconds: 90 };
    case "chudnutie":
      return { sets: 3, reps: "12-15", restSeconds: 60 };
    case "kondicia":
      return { sets: 3, reps: "10-12", restSeconds: 75 };
  }
}

function flatExerciseIds(days: GeneratedDay[]): string[] {
  return days.flatMap((d) => d.exercises.map((e) => e.exerciseId));
}

/**
 * Deterministická kontrola PO vygenerovaní — nespoliehame sa len na to, že model
 * inštrukciu o zameraní dodržal. Ak pomer horná/dolná alebo počet cvikov na
 * zadok nesedí na zvolený cieľ, appka doplní vhodné cviky z reálnych kandidátov
 * (do dní s najmenším počtom cvikov, max MAX_EXERCISES_PER_DAY na deň). Ak to
 * nejde bez prekročenia rozumného počtu, vráti varovanie pre trénera.
 */
function enforceFocus(
  days: GeneratedDay[],
  focus: PlanFocus,
  candidates: CandidateExercise[],
  goal: PlanGoal,
): { days: GeneratedDay[]; warnings: string[] } {
  if (focus === "vyvazene") return { days, warnings: [] };

  const nameById = new Map(candidates.map((c) => [c.id, c.nameSk?.trim() || c.name]));
  const muscleGroupById = new Map(candidates.map((c) => [c.id, c.muscleGroup as string | null]));
  const used = new Set(flatExerciseIds(days));

  const region = focus === "dolna" ? "dolna" : "horna";
  const regionPool = candidates.filter((c) => regionForMuscleGroup(c.muscleGroup) === region && !used.has(c.id));
  const glutePool = candidates.filter((c) => c.muscleGroup.trim() === GLUTES_MUSCLE_GROUP && !used.has(c.id));
  const def = defaultsForGoal(goal);

  const addFrom = (pool: CandidateExercise[]): boolean => {
    const target = days
      .filter((d) => d.exercises.length < MAX_EXERCISES_PER_DAY)
      .sort((a, b) => a.exercises.length - b.exercises.length)[0];
    if (!target) return false;
    while (pool.length > 0) {
      const c = pool.shift()!;
      if (used.has(c.id)) continue;
      target.exercises.push({
        exerciseId: c.id,
        exerciseName: nameById.get(c.id) ?? c.name,
        sets: def.sets,
        reps: def.reps,
        restSeconds: def.restSeconds,
      });
      used.add(c.id);
      // odstráň ho aj z druhého poolu, ak tam je
      const gi = glutePool.findIndex((g) => g.id === c.id);
      if (gi >= 0) glutePool.splice(gi, 1);
      const ri = regionPool.findIndex((r) => r.id === c.id);
      if (ri >= 0) regionPool.splice(ri, 1);
      return true;
    }
    return false;
  };

  // 1. „viac dolná časť" — najprv dorovnaj počet cvikov na zadok
  if (focus === "dolna") {
    let guard = 0;
    while (
      analyzeFocus(flatExerciseIds(days), muscleGroupById).zadok < FOCUS_MIN_GLUTES &&
      glutePool.length > 0 &&
      guard++ < 10
    ) {
      if (!addFrom(glutePool)) break;
    }
  }

  // 2. dorovnaj podiel dominantnej časti tela
  let guard = 0;
  while (!focusTargetMet(analyzeFocus(flatExerciseIds(days), muscleGroupById), focus) && regionPool.length > 0 && guard++ < 20) {
    if (!addFrom(regionPool)) break;
  }

  const finalAnalysis = analyzeFocus(flatExerciseIds(days), muscleGroupById);
  const warnings: string[] = [];
  if (!focusTargetMet(finalAnalysis, focus)) {
    const share = focus === "dolna" ? finalAnalysis.dolnaShare : finalAnalysis.hornaShare;
    const parts = [
      `Cieľové zameranie „${PLAN_FOCUS_LABEL_SK[focus]}" sa nepodarilo úplne naplniť`,
      `(${Math.round(share * 100)} % cvikov z cielenej časti tela`,
      focus === "dolna" ? `, ${finalAnalysis.zadok} cvikov na zadok)` : ")",
    ].join("");
    warnings.push(`${parts} — over si rozloženie cvikov v koncepte a prípadne dopĺň ručne.`);
  }
  return { days, warnings };
}

export type GeneratePlanResult = { plan: GeneratedPlan } | { error: string };

export async function generateWorkoutPlan(
  supabase: SupabaseClient,
  input: PlanGeneratorInput,
): Promise<GeneratePlanResult> {
  const { candidates, equipmentFiltered } = await fetchCandidateExercises(supabase, input.equipment);
  if (candidates.length === 0) {
    return { error: "Knižnica cvikov je prázdna alebo pre zvolené vybavenie nezostal žiadny cvik — skús inú úroveň vybavenia." };
  }
  const candidateIds = new Set(candidates.map((c) => c.id));
  const nameById = new Map(candidates.map((c) => [c.id, c.nameSk?.trim() || c.name]));

  const equipmentLine = equipmentFiltered
    ? "Vybavenie: zoznam cvikov nižšie je UŽ vyfiltrovaný podľa dostupného vybavenia klienta — všetky cviky v ňom sú vykonateľné, neriešiš to."
    : `Vybavenie klienta: ${EQUIPMENT_LABEL[input.equipment]}. Vyber cviky, ktoré sa dajú s ním spraviť (odhadni podľa názvu cviku).`;

  const system = [
    "Si asistent trénera vo fitness aplikácii FitPilot. Zostavíš tréningový plán VÝHRADNE z cvikov v priloženom zozname — nikdy nenavrhuj cvik mimo neho (exercise_id musí byť z priloženého zoznamu).",
    "Rozdeľ cviky rozumne medzi dni podľa cieľa a skúsenosti klienta (napr. split podľa svalových partií pri viacerých dňoch, full-body pri 1-3 dňoch).",
    equipmentLine,
    "Vytvor PRESNE toľko dní, koľko klient požaduje (pozri nižšie). Každý deň má 4-8 cvikov.",
    'sets: celé číslo 1-8. rest_seconds: celé číslo 15-300 (sekundy). reps: text (napr. "8-10"). Nastav ich podľa cieľa a skúsenosti (napr. sila = nižšie reps, dlhšie pauzy; hypertrofia = stredné reps 8-12; začiatočník = nižší objem).',
    "Ak je nižšie uvedené ZAMERANIE, dodrž zadaný pomer cvikov medzi časťami tela naprieč celým týždňom.",
    "Názvy dní stručné a výstižné (napr. 'Deň 1 — Horná časť tela').",
  ].join("\n");

  const userMessageParts = [
    `Cieľ klienta: ${GOAL_LABEL[input.goal]}.`,
    `Počet tréningových dní v týždni: ${input.daysPerWeek}.`,
    `Skúsenosť: ${EXPERIENCE_LABEL[input.experience]}.`,
  ];
  if (!equipmentFiltered) userMessageParts.push(`Dostupné vybavenie: ${EQUIPMENT_LABEL[input.equipment]}.`);
  const focusLine = FOCUS_PROMPT[input.focus];
  if (focusLine) userMessageParts.push("", focusLine);
  userMessageParts.push(
    "",
    "Zoznam dostupných cvikov (exercise_id :: názov), zoskupené podľa svalovej partie:",
    formatCandidates(candidates),
  );
  const userMessage = userMessageParts.join("\n");

  const anthropic = getAnthropicClient();

  try {
    const response = await anthropic.messages.create({
      model: AI_MODEL.PLAN_GENERATOR,
      max_tokens: 4096,
      system,
      messages: [{ role: "user", content: userMessage }],
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

    let days: GeneratedDay[] = raw.days
      .map((d) => ({
        name: d.name,
        // Filter, nie len fallback — cvik s vymysleným ID by v builderi nemal
        // obrázok/inštrukcie a klient by ho nevedel dohľadať.
        exercises: d.exercises
          .filter((e) => candidateIds.has(e.exercise_id))
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

    // Deterministická kontrola/doplnenie zamerania.
    const { days: enforced, warnings } = enforceFocus(days, input.focus, candidates, input.goal);
    days = enforced;

    await logAiUsage({
      trainerId: input.trainerId,
      clientId: input.clientId,
      kind: "plan_gen",
      model: AI_MODEL.PLAN_GENERATOR,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    });

    return { plan: { days, warnings: warnings.length > 0 ? warnings : undefined } };
  } catch (err) {
    console.error("generateWorkoutPlan (Claude call):", err instanceof Error ? err.message : err);
    return { error: "Nastala chyba pri generovaní plánu. Skús to prosím znova." };
  }
}
