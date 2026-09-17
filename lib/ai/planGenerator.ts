// FitPilot — AI blok: generátor tréningového plánu pre trénera (Track "Tréner"
// bod 4/5 v ROADMAP.md). Rovnaký princíp ako lib/ai/exerciseAlternatives.ts —
// appka najprv nájde skutočné cviky z knižnice, model si SMIE vybrať LEN z nich
// (po odpovedi appka vyfiltruje neplatné exercise_id).
//
// feature/ai-plan-kategorie (2026-09): appka predtým nechala model rozhodnúť
// VŠETKO naraz (rozdelenie na dni, balans partií, výber cvikov) len s voľnou
// inštrukciou "rozdeľ cviky rozumne" + prípadne číselným cieľom pre zameranie
// — jedna veľká neurčitá úloha. Teraz appka SAMA (deterministicky, PRED
// volaním modelu) rozhodne o štruktúre týždňa cez kategórie dní (buildSplit,
// lib/ai/planCategories.ts) a model dostane menšiu, overiteľnú úlohu na
// KAŽDÝ deň zvlášť — vybrať cviky pre danú kategóriu z jej vlastných
// kandidátov, nie vymyslieť celý plán. Nahrádza pôvodný voľný pomer
// horná/dolná časť tela (feature/ai-plan-zameranie, enforceFocus nad celým
// plánom) kategóriovým systémom nad jednotlivými dňami (ensureCategoryCoverage).
//
// Vybavenie ostáva štrukturálny filter kandidátov (exercises.equipment,
// migrácia 0031, lib/ai/planTaxonomy.ts) — aplikuje sa PRED rozdelením na
// kategórie, oba filtre idú za sebou, nie namiesto seba.
//
// Draft-then-approve (Product Principle #1 — tréner vždy v kontrole): tento
// modul NEZAPISUJE nič do DB sám. Vráti len navrhnutú štruktúru; server action
// (app/dashboard/treningy/actions.ts) z nej vytvorí bežný `workout_plans`
// (published: false — koncept, presne ako ručne vytvorený plán, 0021) +
// `workout_days`, ktoré sa otvoria v existujúcom PlanBuilderi na plnú editáciu.

import { getAnthropicClient, AI_MODEL } from "./client";
import { logAiUsage } from "./logUsage";
import type { SupabaseClient } from "@supabase/supabase-js";
import { exerciseFitsEquipment } from "./planTaxonomy";
import {
  type PlanFocus,
  type DayCategory,
  DAY_CATEGORY_LABEL_SK,
  GLUTES_MUSCLE_GROUP,
  FOCUS_MIN_GLUTES,
  MIN_EXERCISES_PER_CATEGORY_DAY,
  buildSplit,
  candidatesForCategory,
} from "./planCategories";

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
 * Rozdelenie tohto spoločného poolu na kategórie dní (per-deň kandidáti do
 * promptu) rieši `candidatesForCategory` až v `generateWorkoutPlan` — equipment
 * filter a kategória filter idú za sebou, nie namiesto seba.
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

/** Deň má kategóriu legs/lower a appka pri "viac dolná časť tela" cieli explicitný počet cvikov na zadok priamo v prompte pre ten deň. */
function needsGluteHint(category: DayCategory, focus: PlanFocus): boolean {
  return focus === "dolna" && (category === "legs" || category === "lower");
}

/**
 * Post-generation kontrola pokrytia PER DEŇ — appka sa nespolieha len na to, že
 * model dodržal počet cvikov a (pri "dolna" legs/lower dňoch) glute cieľ z
 * promptu. Ak niektorému dňu po filtri neplatných exercise_id zostane menej
 * než `MIN_EXERCISES_PER_CATEGORY_DAY` cvikov, doplní appka z už načítaných
 * kandidátov PRE TÚ KATEGÓRIU (nie naslepo odkiaľkoľvek) — rovnaký princíp,
 * aký appka používa pri validácii exercise_id. Ak to nejde (kandidátov pre tú
 * kategóriu/equipment kombináciu nezostalo dosť), vráti sa varovanie namiesto
 * ticha.
 */
function ensureCategoryCoverage(
  days: GeneratedDay[],
  categories: DayCategory[],
  candidates: CandidateExercise[],
  focus: PlanFocus,
  goal: PlanGoal,
): { days: GeneratedDay[]; warnings: string[] } {
  const nameById = new Map(candidates.map((c) => [c.id, c.nameSk?.trim() || c.name]));
  const muscleGroupById = new Map(candidates.map((c) => [c.id, c.muscleGroup]));
  const used = new Set(days.flatMap((d) => d.exercises.map((e) => e.exerciseId)));
  const def = defaultsForGoal(goal);
  const warnings: string[] = [];

  const push = (day: GeneratedDay, c: CandidateExercise) => {
    day.exercises.push({
      exerciseId: c.id,
      exerciseName: nameById.get(c.id) ?? c.name,
      sets: def.sets,
      reps: def.reps,
      restSeconds: def.restSeconds,
    });
    used.add(c.id);
  };

  const nextCandidate = (category: DayCategory, onlyGlutes: boolean): CandidateExercise | undefined =>
    candidatesForCategory(candidates, category).find(
      (c) => !used.has(c.id) && (!onlyGlutes || c.muscleGroup.trim() === GLUTES_MUSCLE_GROUP),
    );

  days.forEach((day, i) => {
    const category = categories[i];

    while (day.exercises.length < MIN_EXERCISES_PER_CATEGORY_DAY) {
      const next = nextCandidate(category, false);
      if (!next) break;
      push(day, next);
    }
    if (day.exercises.length < MIN_EXERCISES_PER_CATEGORY_DAY) {
      warnings.push(
        `Deň ${i + 1} (${DAY_CATEGORY_LABEL_SK[category]}) má po filtri len ${day.exercises.length} cvik(y/ov) z ${MIN_EXERCISES_PER_CATEGORY_DAY} — kandidátov pre túto kategóriu/vybavenie nezostalo dosť, over si ho v koncepte.`,
      );
    }

    if (needsGluteHint(category, focus)) {
      let gluteCount = day.exercises.filter((e) => muscleGroupById.get(e.exerciseId)?.trim() === GLUTES_MUSCLE_GROUP).length;
      while (gluteCount < FOCUS_MIN_GLUTES && day.exercises.length < MAX_EXERCISES_PER_DAY) {
        const next = nextCandidate(category, true);
        if (!next) break;
        push(day, next);
        gluteCount++;
      }
      if (gluteCount < FOCUS_MIN_GLUTES) {
        warnings.push(
          `Deň ${i + 1} (${DAY_CATEGORY_LABEL_SK[category]}) má len ${gluteCount}/${FOCUS_MIN_GLUTES} cvikov na "zadok" — kandidátov nezostalo dosť, doplň ručne v koncepte.`,
        );
      }
    }
  });

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

  // Appka SAMA rozhodne o štruktúre týždňa PRED volaním modelu — model dostane
  // už rozdelené dni + per-deň kandidátov, nevymýšľa celú štruktúru.
  const categories = buildSplit(input.daysPerWeek, input.goal, input.focus);

  const equipmentLine = equipmentFiltered
    ? "Vybavenie: zoznam cvikov nižšie je UŽ vyfiltrovaný podľa dostupného vybavenia klienta — všetky cviky v ňom sú vykonateľné, neriešiš to."
    : `Vybavenie klienta: ${EQUIPMENT_LABEL[input.equipment]}. Vyber cviky, ktoré sa dajú s ním spraviť (odhadni podľa názvu cviku).`;

  const system = [
    "Si asistent trénera vo fitness aplikácii FitPilot. Appka už rozhodla o rozdelení plánu na dni a kategóriách (pozri nižšie) — tvoja úloha je pre KAŽDÝ deň vybrať konkrétne cviky VÝHRADNE z kandidátov uvedených PRI TOM istom dni (exercise_id musí byť z jeho zoznamu, nikdy z iného dňa ani mimo neho).",
    equipmentLine,
    "Vytvor PRESNE toľko dní, v rovnakom poradí a s rovnakou kategóriou, ako je uvedené nižšie. Každý deň má 4-8 cvikov.",
    'sets: celé číslo 1-8. rest_seconds: celé číslo 15-300 (sekundy). reps: text (napr. "8-10"). Nastav ich podľa cieľa a skúsenosti (napr. sila = nižšie reps, dlhšie pauzy; hypertrofia = stredné reps 8-12; začiatočník = nižší objem).',
    "Ak je pri dni uvedená požiadavka na konkrétny počet cvikov z jednej partie (napr. zadok), dodrž ju.",
    "Pole name vyplň krátkym popisom kategórie daného dňa — appka ho aj tak nahradí vlastným slovenským názvom.",
  ].join("\n");

  const userMessageParts: string[] = [
    `Cieľ klienta: ${GOAL_LABEL[input.goal]}.`,
    `Skúsenosť: ${EXPERIENCE_LABEL[input.experience]}.`,
  ];
  if (!equipmentFiltered) userMessageParts.push(`Dostupné vybavenie: ${EQUIPMENT_LABEL[input.equipment]}.`);
  userMessageParts.push("", `Rozdelenie týždňa (appka ho už určila — ${categories.length} dní, nemeň počet ani poradie):`);
  categories.forEach((category, i) => {
    const dayCandidates = candidatesForCategory(candidates, category);
    const gluteHint = needsGluteHint(category, input.focus)
      ? ` (z tohto dňa musia byť aspoň ${FOCUS_MIN_GLUTES} cviky z partie "zadok")`
      : "";
    userMessageParts.push(
      "",
      `Deň ${i + 1}: ${DAY_CATEGORY_LABEL_SK[category]}${gluteHint} — kandidáti:`,
      formatCandidates(dayCandidates),
    );
  });
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
                          exercise_id: { type: "string", description: "MUSÍ byť presne jedno z ID zo zoznamu kandidátov PRE TEN ISTÝ deň vyššie." },
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

    type RawPlan = { days?: unknown };
    let raw = toolUse.input as RawPlan;
    // Pozorované pri dlhších promptoch (viac dní/kandidátov): model občas
    // "days" omylom zabalí ešte raz ako stringifikovaný JSON namiesto
    // priameho poľa. Appka sa nespolieha na to, že tvar sedí napoprvé —
    // skúsi ho rozbaliť, než návrh zahodí ako neočakávaný.
    if (typeof raw.days === "string") {
      try {
        const parsed: unknown = JSON.parse(raw.days);
        raw = Array.isArray(parsed) ? { days: parsed } : (parsed as RawPlan);
      } catch {
        // necháme raw ako je — kontrola nižšie to odchytí ako chybný tvar.
      }
    }
    if (!Array.isArray(raw.days) || raw.days.length === 0) {
      return { error: "AI vrátila návrh v neočakávanom tvare. Skús to prosím znova." };
    }
    const parsedDays = raw.days as { name?: string; exercises?: { exercise_id: string; sets: number; reps: string; rest_seconds: number }[] }[];

    const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(n)));

    // Appka drží počet/poradie/kategóriu dní pevne podľa `categories` (nie
    // podľa toho, koľko dní model reálne vrátil) — chýbajúce dni dostanú
    // prázdny skeleton, ktorý dorovná ensureCategoryCoverage nižšie namiesto
    // toho, aby appka celý plán zahodila.
    let days: GeneratedDay[] = categories.map((category, i) => {
      const rawDay = parsedDays[i];
      const exercises = Array.isArray(rawDay?.exercises) ? rawDay.exercises : [];
      return {
        name: DAY_CATEGORY_LABEL_SK[category],
        // Filter, nie len fallback — cvik s vymysleným ID by v builderi nemal
        // obrázok/inštrukcie a klient by ho nevedel dohľadať.
        exercises: exercises
          .filter((e) => candidateIds.has(e.exercise_id))
          .map((e) => ({
            exerciseId: e.exercise_id,
            exerciseName: nameById.get(e.exercise_id) ?? "Cvik",
            sets: clamp(e.sets, 1, 10),
            reps: e.reps,
            restSeconds: clamp(e.rest_seconds, 15, 300),
          })),
      };
    });

    // Deterministická kontrola/doplnenie pokrytia per kategória dňa.
    const { days: enforced, warnings } = ensureCategoryCoverage(days, categories, candidates, input.focus, input.goal);
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
    const detail = err instanceof Error ? err.message : String(err);
    console.error("generateWorkoutPlan (Claude call):", detail, err);
    // V deve ukáž skutočnú príčinu priamo v UI — generické „skús znova" pri
    // internom nástroji trénera nič nerieši.
    const suffix = process.env.NODE_ENV !== "production" ? ` (detail: ${detail})` : "";
    return { error: `Nastala chyba pri generovaní plánu. Skús to prosím znova.${suffix}` };
  }
}
