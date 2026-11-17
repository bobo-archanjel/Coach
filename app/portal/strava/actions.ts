"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { tErr } from "@/lib/i18n/serverErrors";
import { isLocale } from "@/lib/i18n/locales";
import { createClient, getUser } from "@/lib/supabase/server";
import { dbErr } from "@/lib/dbError";
import { loadStaples } from "@/lib/foodStaples";
import { MEAL_SLOT_ORDER, type MealSlot } from "@/lib/meals";
import { isPortionUnit, MAX_PORTION_GRAMS, portionGrams, type PortionUnit } from "@/lib/portions";
import { deleteMealTemplate, saveOwnMealPlanAsTemplate } from "@/lib/templates";
import type { MealPlanEntryData, PortalFoodOption } from "@/lib/portal/types";
import {
  MEAL_DAY_MAX_ENTRIES as MAX_ENTRIES_PER_DAY,
  MEAL_DAY_NAME_MAX as DAY_NAME_MAX,
  MEAL_PLAN_MAX_DAYS as MAX_DAYS,
  MEAL_PLAN_NAME_MAX,
} from "@/lib/portal/ownMealPlan";

/* Vlastný jedálniček klienta (0067) — vytvorenie / úprava / zmazanie / prepnutie
   aktívneho / šablóny. Vlastný = meal_plans.trainer_id IS NULL; RLS pustí klientovi
   CUD len na ne, vlastníctvo tu navyše overujeme kvôli čistej chybovej hláške.
   Vzor: vlastný tréning (app/portal/trening/actions.ts). */

export interface MealActionState {
  error: string | null;
  planId?: string;
}
const ok: MealActionState = { error: null };

const FOOD_NAME_MAX = 120;
const ENTRY_ID_RE = /^[A-Za-z0-9-]{1,64}$/;

export interface ClientMealDraft {
  name: string;
  days: { id: string | null; name: string; meals: MealPlanEntryData[] }[];
}

type Supa = Awaited<ReturnType<typeof createClient>>;

/**
 * Generické potraviny (CIQUAL, ~2000) pre panel „Pridať potravinu“ — na požiadanie, až keď
 * klient otvorí builder (nie pri každom načítaní Stravy). Rovnaký zdroj ako Denník.
 */
export async function getMealStaplesAction(): Promise<PortalFoodOption[]> {
  const {
    data: { user },
  } = await getUser();
  if (!user) return [];
  const locale = await getLocale();
  return loadStaples(await createClient(), isLocale(locale) ? locale : "sk");
}

/** Klient prepojený s prihláseným používateľom — vytvorí "self" riadok, ak treba (0010). */
async function ensureSelfClientId(supabase: Supa): Promise<{ clientId: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc("ensure_self_client");
  if (error) {
    if (error.message.includes("not_a_client")) return { clientId: null, error: await tErr("meals.ownOnly") };
    return { clientId: null, error: await dbErr(error, "actions") };
  }
  return { clientId: (data as string) ?? null, error: null };
}

/** Pred spustením 0067 RLS zápis odmietne (42501) a RPC neexistuje — zrozumiteľná hláška. */
async function writeErr(error: { code?: string; message?: string }): Promise<string> {
  if (error.code === "42501" || error.code === "PGRST202" || /row-level security|Could not find the function/i.test(error.message ?? "")) {
    return tErr("meals.notReady");
  }
  return dbErr(error, "actions");
}

type FoodRow = {
  id: string;
  name: string;
  kcal_100g: number;
  protein_100g: number;
  carbs_100g: number;
  fat_100g: number;
  serving_g?: number | null;
  unit_base?: string | null;
  piece_g?: number | null;
  package_g?: number | null;
};

/** Potraviny podľa id (RLS: globálne + vlastné); pred migráciou 0066 bez stĺpcov porcií. */
async function loadFoods(supabase: Supa, ids: string[]): Promise<Map<string, FoodRow>> {
  if (ids.length === 0) return new Map();
  const base = "id, name, kcal_100g, protein_100g, carbs_100g, fat_100g, serving_g";
  const full = await supabase.from("foods").select(`${base}, unit_base, piece_g, package_g`).in("id", ids);
  const res = full.error ? await supabase.from("foods").select(base).in("id", ids) : full;
  return new Map(((res.data ?? []) as unknown as FoodRow[]).map((f) => [f.id, f]));
}

const num = (v: unknown) => (typeof v === "number" ? v : Number(v));

/**
 * Položka konceptu → uložená položka. S potravinou v DB: názov, makrá aj gramy z množstva ×
 * jednotky berie server (ako trénerov builder aj Denník). Bez nej (offline / online produkt):
 * overený snapshot z prehliadača — rovnaké hranice ako vlastná potravina v Denníku.
 * Vráti null = neplatná položka.
 */
function cleanEntry(raw: MealPlanEntryData, food: FoodRow | undefined): MealPlanEntryData | null {
  if (!raw || !MEAL_SLOT_ORDER.includes(raw.meal_slot as MealSlot)) return null;
  let grams = Math.round(num(raw.grams) * 10) / 10;
  if (!Number.isFinite(grams) || grams <= 0 || grams > MAX_PORTION_GRAMS) return null;

  const qty = Math.round(num(raw.portion_qty) * 100) / 100;
  const unit: PortionUnit | null = isPortionUnit(raw.portion_unit) && Number.isFinite(qty) && qty > 0 ? raw.portion_unit : null;
  let portion: Pick<MealPlanEntryData, "portion_unit" | "portion_qty" | "portion_base"> = {};

  if (food) {
    if (unit) {
      const g = portionGrams(unit, qty, {
        unitBase: food.unit_base === "ml" ? "ml" : "g",
        pieceGrams: food.piece_g == null ? null : Number(food.piece_g),
        servingGrams: food.serving_g == null ? null : Number(food.serving_g),
        packageGrams: food.package_g == null ? null : Number(food.package_g),
      });
      if (g !== null && g <= MAX_PORTION_GRAMS) {
        grams = g;
        portion = { portion_unit: unit, portion_qty: qty, portion_base: food.unit_base === "ml" ? "ml" : "g" };
      }
    }
    return {
      entry_id: ENTRY_ID_RE.test(raw.entry_id) ? raw.entry_id : randomUUID(),
      food_id: food.id,
      food_name: food.name,
      meal_slot: raw.meal_slot,
      grams,
      ...portion,
      kcal_100g: Number(food.kcal_100g),
      protein_100g: Number(food.protein_100g),
      carbs_100g: Number(food.carbs_100g),
      fat_100g: Number(food.fat_100g),
    };
  }

  const name = typeof raw.food_name === "string" ? raw.food_name.trim().slice(0, FOOD_NAME_MAX) : "";
  const [kcal, protein, carbs, fat] = [raw.kcal_100g, raw.protein_100g, raw.carbs_100g, raw.fat_100g].map(num);
  if (!name || [kcal, protein, carbs, fat].some((v) => !Number.isFinite(v) || v < 0)) return null;
  if (kcal > 900 || protein + carbs + fat > 100) return null;
  if (unit) portion = { portion_unit: unit, portion_qty: qty, portion_base: raw.portion_base === "ml" ? "ml" : "g" };
  return {
    entry_id: ENTRY_ID_RE.test(raw.entry_id) ? raw.entry_id : randomUUID(),
    food_id: null,
    food_name: name,
    meal_slot: raw.meal_slot,
    grams,
    ...portion,
    kcal_100g: kcal,
    protein_100g: protein,
    carbs_100g: carbs,
    fat_100g: fat,
  };
}

/**
 * Uloží vlastný jedálniček klienta naraz (builder drží úpravy lokálne). Bez `planId` =
 * nový (a hneď aktívny), s `planId` = úprava vlastného — dni sa zosúladia diffom
 * (zachované id → update, nové → insert, chýbajúce → delete), poradie = index.
 */
export async function saveClientMealPlanAction(draftJson: string, planId?: string): Promise<MealActionState> {
  let draft: ClientMealDraft;
  try {
    draft = JSON.parse(draftJson) as ClientMealDraft;
  } catch {
    return { error: await tErr("meals.needDay") };
  }

  const name = typeof draft?.name === "string" ? draft.name.trim() : "";
  if (!name) return { error: await tErr("meals.nameRequired") };
  if (name.length > MEAL_PLAN_NAME_MAX) return { error: await tErr("meals.nameMax", { max: MEAL_PLAN_NAME_MAX }) };
  const rawDays = Array.isArray(draft.days) ? draft.days : [];
  if (rawDays.length === 0) return { error: await tErr("meals.needDay") };
  if (rawDays.length > MAX_DAYS) return { error: await tErr("meals.maxDays", { max: MAX_DAYS }) };

  for (const d of rawDays) {
    const dayName = typeof d?.name === "string" ? d.name.trim() : "";
    if (!dayName) return { error: await tErr("meals.dayNameRequired") };
    if (dayName.length > DAY_NAME_MAX) return { error: await tErr("meals.nameMax", { max: DAY_NAME_MAX }) };
    if (!Array.isArray(d.meals) || d.meals.length > MAX_ENTRIES_PER_DAY) return { error: await tErr("meals.tooManyItems", { name: dayName }) };
  }

  const supabase = await createClient();
  const { clientId, error: cErr } = await ensureSelfClientId(supabase);
  if (cErr || !clientId) return { error: cErr ?? (await tErr("client.profileMissing")) };

  const foodIds = [...new Set(rawDays.flatMap((d) => d.meals.map((m) => m.food_id).filter((id): id is string => typeof id === "string" && id.length > 0)))];
  const foods = await loadFoods(supabase, foodIds);

  const rows: { id: string | null; day_number: number; name: string; meals: MealPlanEntryData[] }[] = [];
  for (const [i, d] of rawDays.entries()) {
    const meals: MealPlanEntryData[] = [];
    for (const m of d.meals) {
      const cleaned = cleanEntry(m, m.food_id ? foods.get(m.food_id) : undefined);
      if (!cleaned) return { error: await tErr("meals.invalidFood", { name: String(m?.food_name ?? "").slice(0, 60) }) };
      meals.push(cleaned);
    }
    rows.push({ id: typeof d.id === "string" ? d.id : null, day_number: i + 1, name: d.name.trim(), meals });
  }

  // ---------- nový ----------
  if (!planId) {
    const { data: plan, error: pErr } = await supabase
      .from("meal_plans")
      .insert({ client_id: clientId, trainer_id: null, name, published: true })
      .select("id")
      .single();
    if (pErr || !plan) return { error: pErr ? await writeErr(pErr) : await tErr("meals.createFailed") };

    const { error: dErr } = await supabase
      .from("meal_days")
      .insert(rows.map(({ day_number, name: dayName, meals }) => ({ plan_id: plan.id, day_number, name: dayName, meals })));
    if (dErr) {
      // jedálniček bez dní by v zozname len strašil
      await supabase.from("meal_plans").delete().eq("id", plan.id);
      return { error: await writeErr(dErr) };
    }

    // nový vlastný jedálniček hneď platí v Strave (klient ho práve zostavil)
    const { error: aErr } = await supabase.rpc("set_active_meal_plan", { p_plan_id: plan.id });
    if (aErr) console.error("set_active_meal_plan:", aErr.message);

    revalidatePath("/portal/strava");
    return { error: null, planId: plan.id };
  }

  // ---------- úprava ----------
  const [{ data: plan, error: pErr }, { data: existing, error: eErr }] = await Promise.all([
    supabase.from("meal_plans").select("id, trainer_id, client_id").eq("id", planId).maybeSingle(),
    supabase.from("meal_days").select("id").eq("plan_id", planId),
  ]);
  if (pErr) return { error: await dbErr(pErr, "actions") };
  if (!plan || plan.trainer_id !== null || plan.client_id !== clientId) return { error: await tErr("meals.cannotEdit") };
  if (eErr) return { error: await dbErr(eErr, "actions") };

  const existingIds = new Set((existing ?? []).map((d) => d.id as string));
  if (rows.some((r) => r.id && !existingIds.has(r.id))) return { error: await tErr("meals.changed") };
  const keptIds = new Set(rows.flatMap((r) => (r.id ? [r.id] : [])));
  const toDelete = [...existingIds].filter((id) => !keptIds.has(id));
  const inserts = rows.filter((r) => !r.id).map(({ day_number, name: dayName, meals }) => ({ plan_id: planId, day_number, name: dayName, meals }));

  const results = await Promise.all([
    supabase.from("meal_plans").update({ name }).eq("id", planId),
    ...rows
      .filter((r) => r.id)
      .map((r) =>
        supabase
          .from("meal_days")
          .update({ day_number: r.day_number, name: r.name, meals: r.meals })
          .eq("id", r.id as string)
          .eq("plan_id", planId),
      ),
    ...(toDelete.length > 0 ? [supabase.from("meal_days").delete().in("id", toDelete).eq("plan_id", planId)] : []),
    ...(inserts.length > 0 ? [supabase.from("meal_days").insert(inserts)] : []),
  ]);
  const failed = results.find((r) => r.error)?.error;
  if (failed) return { error: await writeErr(failed) };

  revalidatePath("/portal/strava");
  return { error: null, planId };
}

/** Zmaže vlastný jedálniček (RLS: meal_plans_delete_own_client); aktívny sa vynuluje sám (on delete set null). */
export async function deleteClientMealPlanAction(planId: string): Promise<MealActionState> {
  const supabase = await createClient();
  const { clientId, error: cErr } = await ensureSelfClientId(supabase);
  if (cErr || !clientId) return { error: cErr ?? (await tErr("client.profileMissing")) };

  const { data: plan, error: pErr } = await supabase.from("meal_plans").select("id, trainer_id, client_id").eq("id", planId).maybeSingle();
  if (pErr) return { error: await dbErr(pErr, "actions") };
  if (!plan || plan.trainer_id !== null || plan.client_id !== clientId) return { error: await tErr("meals.cannotDelete") };

  const { error } = await supabase.from("meal_plans").delete().eq("id", planId);
  if (error) return { error: await writeErr(error) };

  revalidatePath("/portal/strava");
  return ok;
}

/** Prepínač „Zmeniť“ v Strave — ktorý zverejnený jedálniček je aktívny (RPC 0067 overí vlastníctvo). */
export async function chooseActiveMealPlanAction(planId: string): Promise<MealActionState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_active_meal_plan", { p_plan_id: planId });
  if (error) {
    if (error.message.includes("not_authenticated")) return { error: await tErr("notSignedIn") };
    if (error.message.includes("plan_not_found")) return { error: await tErr("meals.notFound") };
    return { error: await writeErr(error) };
  }
  revalidatePath("/portal/strava");
  return ok;
}

/** „Uložiť ako šablónu“ pri vlastnom aj zverejnenom trénerovom jedálničku (lib/templates.ts). */
export async function saveOwnMealTemplateAction(planId: string): Promise<MealActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: await tErr("notSignedIn") };
  const { clientId, error: cErr } = await ensureSelfClientId(supabase);
  if (cErr || !clientId) return { error: cErr ?? (await tErr("client.profileMissing")) };

  const res = await saveOwnMealPlanAsTemplate(supabase, user.id, clientId, planId);
  if (res.error) return { error: res.error };
  revalidatePath("/portal/strava");
  return ok;
}

/** Zmazanie vlastnej šablóny jedálnička (filter na vlastníka v deleteMealTemplate aj RLS). */
export async function deleteOwnMealTemplateAction(templateId: string): Promise<MealActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: await tErr("notSignedIn") };

  const res = await deleteMealTemplate(supabase, user.id, templateId);
  if (res.error) return { error: res.error };
  revalidatePath("/portal/strava");
  return ok;
}
