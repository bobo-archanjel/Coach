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
import { generateMealPlan } from "@/lib/ai/mealGenerator";
import { DIET_TYPES, EXCLUDED_TEXT_MAX, type DietType, type PlanItem, type RepeatMode } from "@/lib/ai/mealPlanValidation";
import { ensureOffFoodId } from "@/lib/offFoodStore";
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

/** OFF produkt z offline balíka → hodnoty na založenie riadku vo `foods` (rovnaký tvar ako pri skene kódu). */
function offToCompleteFood(item: PlanItem): CompleteFood | null {
  const f = item.food.offFood;
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
      .select("calories_target, protein_g, carbs_g, fat_g")
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
  const result = await generateMealPlan({
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
  });

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
    const suffix = process.env.NODE_ENV === "development" && result.detail ? ` (detail: ${result.detail})` : "";
    return { error: t("failed", { suffix }) };
  }

  // ---- OFF produkty z offline balíka potrebujú riadok vo `foods` (položka jedálnička má food_id)
  const warnings: string[] = [];
  const foodIdByRef = new Map<string, string>();
  for (const d of result.days) {
    for (const it of d.items) if (it.food.foodId) foodIdByRef.set(it.ref, it.food.foodId);
  }
  const offItems = new Map<string, PlanItem>(); // čiarový kód → ukážková položka
  for (const d of result.days) {
    for (const it of d.items) if (!it.food.foodId && it.food.barcode && !offItems.has(it.food.barcode)) offItems.set(it.food.barcode, it);
  }
  let offFailed = 0;
  if (offItems.size > 0) {
    const admin = tryCreateAdminClient();
    const entries = [...offItems.entries()];
    const ids = await Promise.all(
      entries.map(async ([code, item]) => {
        const mapped = offToCompleteFood(item);
        return admin && mapped ? ensureOffFoodId(admin, mapped, code) : null;
      }),
    );
    entries.forEach(([, item], i) => {
      const id = ids[i];
      if (id) foodIdByRef.set(item.ref, id);
      else offFailed++;
    });
    // iné ref-y s rovnakým kódom (nemajú byť, ale istota)
    for (const d of result.days) {
      for (const it of d.items) {
        if (!foodIdByRef.has(it.ref) && it.food.barcode) {
          const sameCode = entries.findIndex(([code]) => code === it.food.barcode);
          if (sameCode >= 0 && ids[sameCode]) foodIdByRef.set(it.ref, ids[sameCode]!);
        }
      }
    }
  }

  const drafts: MealDayDraft[] = result.days.map((d) => ({
    id: null,
    name: d.name,
    meals: d.items
      .filter((it) => foodIdByRef.has(it.ref))
      .map((it) => ({
        entry_id: randomUUID(),
        food_id: foodIdByRef.get(it.ref)!,
        meal_slot: it.slot,
        grams: it.grams,
        portion_unit: it.unit,
        portion_qty: it.qty,
      })),
  }));
  const usableDrafts = drafts.filter((d) => d.meals.length > 0);
  if (usableDrafts.length === 0) return { error: t("noUsable") };

  // ---- koncept jedálnička (published: false — klient ho uvidí až po zverejnení, 0044)
  const date = new Date();
  const planName = t("planName", { date: `${date.getDate()}. ${date.getMonth() + 1}. ${date.getFullYear()}` });
  const { data: plan, error: planErr } = await supabase
    .from("meal_plans")
    .insert({ client_id: clientId, trainer_id: user.id, name: planName, published: false })
    .select("id")
    .single();
  if (planErr || !plan) return { error: planErr?.message ?? (await tErr("meals.createFailed")) };

  // dni + položky ukladá rovnaká funkcia ako builder (snapshot makier z DB, gramáž z porcie)
  const saved = await saveMealPlanDaysAction(plan.id, usableDrafts);
  if (saved.error) {
    // prázdny koncept bez dní by v zozname len mätol
    await supabase.from("meal_plans").delete().eq("id", plan.id).eq("trainer_id", user.id);
    console.error("generateMealPlanWithAiAction (uloženie):", saved.error);
    return { error: t("saveFailed") };
  }

  // ---- upozornenia pre trénera (koncept existuje, ale niečo nedotiahol)
  if (result.dropped.length > 0) warnings.push(t("warnDropped", { count: result.dropped.length }));
  if (offFailed > 0) warnings.push(t("warnOff", { count: offFailed }));
  if (usableDrafts.length < days) warnings.push(t("warnDays", { count: usableDrafts.length, requested: days }));
  for (const a of result.analysis) {
    if (a.ok || a.empty) continue;
    warnings.push(
      t("warnDeviation", {
        day: a.day,
        kcal: a.totals.kcal,
        targetKcal: Math.round(targets.kcal),
        protein: Math.round(a.totals.proteinG),
        targetProtein: Math.round(targets.proteinG),
      }),
    );
  }

  revalidatePath("/dashboard/jedalnicky");
  revalidatePath(`/dashboard/klienti/${clientId}`);

  // S upozorneniami neprepínaj rovno do builderu — tréner si ich najprv prečíta a koncept otvorí sám.
  if (warnings.length > 0) return { error: null, planId: plan.id, warnings };
  redirect(`/dashboard/jedalnicky/jedalnicek/${plan.id}`);
}
