// FitPilot — AI blok, Krok 3: deterministický kontext pre AI chat ("koľko mám
// ešte zjesť", "je čas na olovrant?"). ZÁMERNE bez AI — matematika a čas sa
// počítajú tu, v kóde, model dostane až hotové čísla a len ich naformuluje.
// Rovnaké dáta/vzor ako lib/dashboard/adherence.ts a getPortalFoodDiary
// (lib/portal/data.ts) — nová funkcia namiesto duplikácie, lebo výstupný tvar
// (zostávajúce makrá + časový slot) je iný a používa sa len z AI chatu.

import type { SupabaseClient } from "@supabase/supabase-js";
import { MEAL_SLOT_LABELS, scaleFoodMacros, sumMacros, type MealSlot } from "@/lib/meals";

const TZ = "Europe/Bratislava";

type FoodLogRow = {
  meal_slot: MealSlot;
  grams: number;
  kcal_100g: number;
  protein_100g: number;
  carbs_100g: number;
  fat_100g: number;
};

export interface MacroTargets {
  caloriesTarget: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface MacroContext {
  /** false = klient nemá nastavený nutričný profil — AI musí povedať "spýtaj sa trénera", nič si nedopočítavať. */
  hasGoal: boolean;
  goal: MacroTargets | null;
  consumedToday: { kcal: number; proteinG: number; carbsG: number; fatG: number };
  /** null keď hasGoal je false. Môže byť záporné (cieľ prekročený) — AI to má povedať narovinu. */
  remainingToday: { kcal: number; proteinG: number; carbsG: number; fatG: number } | null;
  /** aktuálna hodina v Europe/Bratislava, pre AI aby vedela odpovedať na "aký je teraz čas". */
  currentHour: number;
  /** ktorému jedlu dňa zodpovedá aktuálny čas — null mimo bežných časov jedla (napr. neskoro v noci). */
  currentMealSlot: MealSlot | null;
  currentMealSlotLabel: string | null;
}

/** Hodina → orientačný slot jedla dňa. Mimo rozsahov = null ("nie je typický čas jedla"). */
function mealSlotForHour(hour: number): MealSlot | null {
  if (hour >= 6 && hour < 10) return "ranajky";
  if (hour >= 11 && hour < 14) return "obed";
  if (hour >= 14 && hour < 17) return "olovrant";
  if (hour >= 17 && hour < 21) return "vecera";
  return null;
}

function currentHourInTz(): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  return parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10) || 0;
}

function todayIsoInTz(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/**
 * Zostávajúce makrá dneška + časový kontext pre daného klienta. `clientId` musí
 * byť už overený volajúcim (server action pozná vlastnú session cez RLS) —
 * táto funkcia len číta, RLS na `nutrition_profiles`/`food_logs` platí ako vždy.
 */
export async function getMacroContext(
  supabase: SupabaseClient,
  clientId: string,
): Promise<{ context: MacroContext | null; error: string | null }> {
  const isoDate = todayIsoInTz();
  const currentHour = currentHourInTz();

  const [{ data: profile, error: profileErr }, { data: logRows, error: logErr }] = await Promise.all([
    supabase
      .from("nutrition_profiles")
      .select("calories_target, protein_g, carbs_g, fat_g")
      .eq("client_id", clientId)
      .maybeSingle(),
    supabase
      .from("food_logs")
      .select("meal_slot, grams, kcal_100g, protein_100g, carbs_100g, fat_100g")
      .eq("client_id", clientId)
      .eq("eaten_on", isoDate),
  ]);

  if (profileErr) return { context: null, error: profileErr.message };
  if (logErr) return { context: null, error: logErr.message };

  const scaled = ((logRows ?? []) as FoodLogRow[]).map((r) =>
    scaleFoodMacros(
      { kcal_100g: r.kcal_100g, protein_100g: r.protein_100g, carbs_100g: r.carbs_100g, fat_100g: r.fat_100g },
      r.grams,
    ),
  );
  const consumedToday = sumMacros(scaled);

  const goal: MacroTargets | null = profile
    ? {
        caloriesTarget: profile.calories_target,
        proteinG: profile.protein_g,
        carbsG: profile.carbs_g,
        fatG: profile.fat_g,
      }
    : null;

  const remainingToday = goal
    ? {
        kcal: Math.round(goal.caloriesTarget - consumedToday.kcal),
        proteinG: Math.round((goal.proteinG - consumedToday.proteinG) * 10) / 10,
        carbsG: Math.round((goal.carbsG - consumedToday.carbsG) * 10) / 10,
        fatG: Math.round((goal.fatG - consumedToday.fatG) * 10) / 10,
      }
    : null;

  const currentMealSlot = mealSlotForHour(currentHour);

  return {
    context: {
      hasGoal: goal != null,
      goal,
      consumedToday,
      remainingToday,
      currentHour,
      currentMealSlot,
      currentMealSlotLabel: currentMealSlot ? MEAL_SLOT_LABELS[currentMealSlot] : null,
    },
    error: null,
  };
}
