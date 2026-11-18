"use server";

import { randomUUID } from "crypto";
import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { tryCreateAdminClient } from "@/lib/supabase/admin";
import { getUserLocale } from "@/lib/i18n/server";
import { tErr } from "@/lib/i18n/serverErrors";
import { AI_MODEL, isAiConfigured } from "@/lib/ai/client";
import { logAiUsage } from "@/lib/ai/logUsage";
import { reserveAiSlot, AI_MEAL_GEN_DAILY_LIMIT_PER_TRAINER } from "@/lib/ai/rateLimit";
import { generateMealPlan, type FoodResolution } from "@/lib/ai/mealGenerator";
import { DIET_TYPES, EXCLUDED_TEXT_MAX, slotsForMealCount, type DietType, type KnownFood, type RepeatMode } from "@/lib/ai/mealPlanValidation";
import { checkDay, checkWeek, savedEntryToItem, targetBelowSafeMin, type SavedEntryLike } from "@/lib/ai/mealRules";
import { fineTuneDay } from "@/lib/ai/mealPortions";
import type { MealSlot } from "@/lib/meals";
import { ensureOffFood, type OffFoodRowData } from "@/lib/offFoodStore";
import type { CompleteFood } from "@/lib/offProduct";
import { saveMealPlanDaysAction, type MealDayDraft } from "./jedalnicek/actions";

/**
 * AI generátor jedálnička (trénerov nástroj) — draft-then-approve ako AI generátor plánu cvikov
 * (lib/ai/planGenerator.ts): vznikne bežný KONCEPT (`published: false`), ktorý tréner upraví
 * v builderi a sám zverejní. Nič sa klientovi neposiela automaticky.
 */
export interface MealAiState {
  error: string | null;
  planId?: string | null;
  warnings?: string[];
}

const REPEAT_MODES: RepeatMode[] = ["varied", "meal_prep"];
const num = (v: unknown): number => (v === null || v === undefined ? NaN : Number(v));

/** OFF produkt z offline balíka → hodnoty na založenie riadku vo  (rovnaký tvar ako pri skene kódu). */
function offToCompleteFood(food: KnownFood): CompleteFood | null {
  const f = food.offFood;
  if (!f) return null;
  return {
    name: f.name,
    brand: f.brand,
    kcal: f.kcal,
    protein: f.protein,
    carbs: f.carbs,
    fat: f.fat,
    fiber: f.fiber,
    sugars: f.sugars,
    salt: f.salt,
    servingGrams: f.servingGrams,
    packageGrams: f.packageGrams,
    unitBase: f.unit,
  };
}

const optNum = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : Number(v));

/** Riadok z DB → hodnoty, z ktorých builder počíta gramáž a snapshot (generátor s nimi overuje pravidlá). */
function rowToResolution(row: OffFoodRowData): FoodResolution {
  return {
    foodId: row.id,
    kcal100: Number(row.kcal_100g),
    protein100: Number(row.protein_100g),
    carbs100: Number(row.carbs_100g),
    fat100: Number(row.fat_100g),
    fiber100: optNum(row.fiber_100g),
    portion: {
      unitBase: row.unit_base === "ml" ? "ml" : "g",
      servingGrams: optNum(row.serving_g),
      packageGrams: optNum(row.package_g),
    },
  };
}

export async function generateMealPlanWithAiAction(_prev: MealAiState, formData: FormData): Promise<MealAiState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: await tErr("notSignedIn") };

  const t = await getTranslations("ai.meal");

  // ---- vstupy z formulára (server ich vždy preverí, formulár je len pomôcka)
  const clientId = (formData.get("client_id") as string | null) ?? "";
  if (!clientId) return { error: await tErr("chooseClient") };
  const days = Number(formData.get("days"));
  const mealsPerDay = Number(formData.get("meals_per_day"));
  const diet = (formData.get("diet") as string | null) ?? "none";
  const repeat = (formData.get("repeat") as string | null) ?? "varied";
  const excludedText = ((formData.get("excluded") as string | null) ?? "").trim().slice(0, EXCLUDED_TEXT_MAX);
  if (
    !Number.isInteger(days) || days < 1 || days > 7 ||
    !Number.isInteger(mealsPerDay) || mealsPerDay < 3 || mealsPerDay > 6 ||
    !DIET_TYPES.includes(diet as DietType) ||
    !REPEAT_MODES.includes(repeat as RepeatMode)
  ) {
    return { error: t("invalid") };
  }

  // ---- klient patrí trénerovi + makro cieľ (bez neho nie je z čoho počítať)
  const [{ data: client }, { data: profile }, { data: note }] = await Promise.all([
    supabase.from("clients").select("id").eq("id", clientId).eq("trainer_id", user.id).maybeSingle(),
    supabase
      .from("nutrition_profiles")
      .select("calories_target, protein_g, carbs_g, fat_g, sex, bmr")
      .eq("client_id", clientId)
      .maybeSingle(),
    // poznámka trénera k strave (alergie, preferencie) — klient ju nevidí
    supabase.from("trainer_private_notes").select("notes").eq("client_id", clientId).eq("scope", "nutrition").maybeSingle(),
  ]);
  if (!client) return { error: await tErr("plans.clientNotFound") };
  const targets = {
    kcal: num(profile?.calories_target),
    proteinG: num(profile?.protein_g),
    carbsG: num(profile?.carbs_g),
    fatG: num(profile?.fat_g),
  };
  if (!profile || !(targets.kcal > 0) || !(targets.proteinG > 0) || !Number.isFinite(targets.carbsG) || !Number.isFinite(targets.fatG)) {
    return { error: t("noProfile") };
  }

  if (!isAiConfigured()) return { error: t("notConfigured") };

  // ---- atomická rezervácia PRED volaním modelu (nulové náklady pri zamietnutí; per tréner,
  // nie per klient — inak by sa limit dal obísť striedaním klientov), lib/ai/rateLimit.ts
  const slot = await reserveAiSlot({
    supabase,
    kind: "meal_gen",
    trainerId: user.id,
    clientId,
    model: AI_MODEL.MEAL_GENERATOR,
    subject: "trainer",
    subjectLimit: AI_MEAL_GEN_DAILY_LIMIT_PER_TRAINER(),
  });
  if (!slot.allowed) {
    return { error: slot.globallyLimited ? t("busy") : t("dailyLimit", { limit: AI_MEAL_GEN_DAILY_LIMIT_PER_TRAINER() }) };
  }

  const locale = await getUserLocale();
  // OFF produkty z offline balíka potrebujú riadok vo `foods` (položka jedálnička má food_id) — generátor
  // ich zakladá PRED kontrolou pravidiel, aby položka, ktorej riadok zlyhá, nezmenila súčty dňa po overení.
  const admin = tryCreateAdminClient();
  const resolveFoods = async (foods: KnownFood[]) => {
    const out = new Map<string, FoodResolution | null>();
    await Promise.all(
      foods.map(async (f) => {
        const mapped = offToCompleteFood(f);
        const row = admin && mapped && f.barcode ? await ensureOffFood(admin, mapped, f.barcode) : null;
        out.set(f.ref, row ? rowToResolution(row) : null);
      }),
    );
    return out;
  };

  const result = await generateMealPlan(
    {
    supabase,
    trainerId: user.id,
    locale,
    targets,
    days,
    mealsPerDay,
    diet: diet as DietType,
    excludedText,
    repeat: repeat as RepeatMode,
    trainerNote: note?.notes ?? null,
    dayName: (n) => t("dayName", { n }),
    },
    { resolveFoods },
  );

  // spotreba sa zapíše vždy (aj pri zlyhaní po niekoľkých volaniach) a dokončí rezerváciu
  await logAiUsage({
    trainerId: user.id,
    clientId,
    kind: "meal_gen",
    model: AI_MODEL.MEAL_GENERATOR,
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
    reservationId: slot.reservationId,
  });

  if (!result.ok) {
    if (result.reason === "no_submission") return { error: t("noProposal") };
    if (result.reason === "no_usable") return { error: t("noUsable") };
    if (result.reason === "rules_failed") return { error: t("rulesFailed") };
    const suffix = process.env.NODE_ENV === "development" && result.detail ? ` (detail: ${result.detail})` : "";
    return { error: t("failed", { suffix }) };
  }

  // ---- koncept jedálnička (published: false — klient ho uvidí až po zverejnení, 0044).
  // Generátor už zaručil hard pravidlá (kcal ±5 %, bielkoviny, tuky, podiely jedál, stropy);
  // dni, ktoré ich nespĺňajú, v `result.days` nie sú. OFF produkty majú riadok vo `foods` už teraz.
  const drafts: MealDayDraft[] = result.days.map((d) => ({
    id: null,
    name: d.name,
    meals: d.items
      .filter((it) => it.food.foodId)
      .map((it) => ({
        entry_id: randomUUID(),
        food_id: it.food.foodId as string,
        meal_slot: it.slot,
        grams: it.grams,
        portion_unit: it.unit,
        portion_qty: it.qty,
      })),
  }));
  const usableDrafts = drafts.filter((d) => d.meals.length > 0);
  if (usableDrafts.length === 0) return { error: t("noUsable") };

  const date = new Date();
  const planName = t("planName", { date: `${date.getDate()}. ${date.getMonth() + 1}. ${date.getFullYear()}` });
  const { data: plan, error: planErr } = await supabase
    .from("meal_plans")
    .insert({ client_id: clientId, trainer_id: user.id, name: planName, published: false })
    .select("id")
    .single();
  if (planErr || !plan) return { error: planErr?.message ?? (await tErr("meals.createFailed")) };

  const discard = async () => {
    // prázdny / nesprávny koncept v zozname len mätie
    await supabase.from("meal_plans").delete().eq("id", plan.id).eq("trainer_id", user.id);
  };

  // dni + položky ukladá rovnaká funkcia ako builder (snapshot makier z DB, gramáž z porcie)
  const saved = await saveMealPlanDaysAction(plan.id, usableDrafts);
  if (saved.error) {
    await discard();
    console.error("generateMealPlanWithAiAction (uloženie):", saved.error);
    return { error: t("saveFailed") };
  }

  // ---- overenie PO uložení: builder číta hodnoty z DB, ktoré sa mohli líšiť od tých, čo generátor
  // overil — prepočítaj uložené dni a pri porušení hard pravidiel raz prebalansuj a ulož znova.
  const verified = await verifySavedPlan(supabase, plan.id, { targets, slots: slotsForMealCount(mealsPerDay), diet: diet as DietType });
  if (!verified.ok) {
    await discard();
    console.error("generateMealPlanWithAiAction (overenie po uložení):", verified.detail);
    return { error: t("rulesFailed") };
  }

  // ---- upozornenia pre trénera (koncept existuje, ale niečo nedotiahol)
  const warnings: string[] = [];
  if (result.missingDays.length > 0) warnings.push(t("warnDaysMissing", { days: result.missingDays.join(", ") }));
  for (const c of result.copies) warnings.push(t("warnDayCopied", { day: c.day, from: c.from }));
  if (result.dropped.length > 0) warnings.push(t("warnDropped", { count: result.dropped.length }));
  if (result.offFailed > 0) warnings.push(t("warnOff", { count: result.offFailed }));
  const softKey = { fiber: "warnFiber", fruitveg: "warnFruitVeg", protein_meal: "warnProteinMeal", macro_split: "warnMacroSplit", fat_share: "warnFatShare" } as const;
  for (const w of result.soft) warnings.push(t(softKey[w.code], { days: w.days.join(", ") }));
  const lowMin = targetBelowSafeMin(targets.kcal, profile.sex, profile.bmr);
  if (lowMin !== null) warnings.push(t("warnTargetLow", { kcal: Math.round(targets.kcal), min: lowMin }));

  revalidatePath("/dashboard/jedalnicky");
  revalidatePath(`/dashboard/klienti/${clientId}`);

  // S upozorneniami neprepínaj rovno do builderu — tréner si ich najprv prečíta a koncept otvorí sám.
  if (warnings.length > 0) return { error: null, planId: plan.id, warnings };
  redirect(`/dashboard/jedalnicky/jedalnicek/${plan.id}`);
}

type SupabaseSession = Awaited<ReturnType<typeof createClient>>;

/** Prečíta uložené dni jedálnička v tvare, s akým ich vidí builder (snapshot z meal_days.meals). */
async function loadSavedDays(supabase: SupabaseSession, planId: string) {
  const { data } = await supabase.from("meal_days").select("id, day_number, name, meals").eq("plan_id", planId).order("day_number");
  return (data ?? []).map((d) => ({
    id: d.id as string,
    name: d.name as string,
    items: ((Array.isArray(d.meals) ? d.meals : []) as SavedEntryLike[]).flatMap((e) => {
      const it = savedEntryToItem(e);
      return it ? [{ it, foodId: (e as unknown as { food_id: string }).food_id }] : [];
    }),
  }));
}

/**
 * Zaručí, že ULOŽENÝ plán spĺňa hard pravidlá. Pri porušení prebalansuje uložené hodnoty
 * (snapshot z DB) a uloží znova; ak ani potom pravidlá neplatia, ok = false (volajúci koncept zmaže).
 */
async function verifySavedPlan(
  supabase: SupabaseSession,
  planId: string,
  ctx: { targets: { kcal: number; proteinG: number; carbsG: number; fatG: number }; slots: MealSlot[]; diet: DietType },
): Promise<{ ok: true } | { ok: false; detail: string }> {
  const opts = { targets: ctx.targets, requiredSlots: ctx.slots, diet: ctx.diet };
  for (let attempt = 0; attempt < 2; attempt++) {
    const days = await loadSavedDays(supabase, planId);
    if (days.length === 0) return { ok: false, detail: "no saved days" };
    const checks = days.map((d) => checkDay(d.items.map((x) => x.it), opts));
    const week = checkWeek(checks.map((c) => c.totals.kcal), ctx.targets.kcal);
    if (checks.every((c) => c.ok) && week.ok) return { ok: true };
    if (attempt === 1) {
      return { ok: false, detail: checks.flatMap((c, i) => c.violations.map((v) => `day ${i + 1}: ${v.detail}`)).join("; ") || "weekly average" };
    }
    // jedno doladenie spoločným faktorom na uložených hodnotách a nové uloženie (rovnaká funkcia ako builder)
    const aim = week.ok ? ctx.targets.kcal : ctx.targets.kcal * (1 - week.avgDev);
    const drafts: MealDayDraft[] = [];
    for (const [i, d] of days.entries()) {
      const rb = checks[i].ok && week.ok ? { items: d.items.map((x) => x.it), ok: true } : fineTuneDay(d.items.map((x) => x.it), { ...opts, kcalAim: aim });
      if (!rb.ok) return { ok: false, detail: `day ${i + 1} cannot be fine-tuned` };
      const foodByKey = new Map(d.items.map((x) => [x.it.key, x.foodId]));
      drafts.push({
        id: d.id,
        name: d.name,
        meals: rb.items.map((it) => ({
          entry_id: it.key,
          food_id: foodByKey.get(it.key) as string,
          meal_slot: it.slot,
          grams: it.grams,
          portion_unit: it.unit,
          portion_qty: it.qty,
        })),
      });
    }
    const res = await saveMealPlanDaysAction(planId, drafts);
    if (res.error) return { ok: false, detail: res.error };
  }
  return { ok: false, detail: "unreachable" };
}
