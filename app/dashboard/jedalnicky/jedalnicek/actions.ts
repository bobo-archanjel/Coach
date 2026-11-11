"use server";

import { randomUUID } from "crypto";
import { addPlanRecipients, areTrainerClients, deliverPlanToRecipients, MAX_PLAN_CLIENTS, uniqueClientIds } from "@/lib/planRecipients";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MEAL_SLOT_ORDER, type MealSlot } from "@/lib/meals";
import { dbErr } from "@/lib/dbError";

export interface ActionState {
  error: string | null;
}

const ok: ActionState = { error: null };

export interface MealEntry {
  entry_id: string;
  food_id: string;
  food_name: string;
  meal_slot: MealSlot;
  grams: number;
  kcal_100g: number;
  protein_100g: number;
  carbs_100g: number;
  fat_100g: number;
}

export async function createMealPlanAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Nie si prihlásený." };

  const clientIds = uniqueClientIds(formData.getAll("client_id"));
  const name = (formData.get("name") as string | null)?.trim() ?? "";

  if (clientIds.length === 0) return { error: "Vyber klienta." };
  if (clientIds.length > MAX_PLAN_CLIENTS) return { error: `Naraz najviac ${MAX_PLAN_CLIENTS} klientov.` };
  if (!name) return { error: "Zadaj názov jedálničku." };

  // Viacerí klienti → JEDEN koncept pre prvého, ostatní sú jeho príjemcovia (0052) —
  // po odoslaní dostane každý vlastnú kópiu (lib/planRecipients), rovnako ako tréning.
  const [clientId, ...others] = clientIds;
  if (!(await areTrainerClients(supabase, user.id, others))) return { error: "Niektorý z vybraných klientov nepatrí tebe." };

  const { data, error } = await supabase
    .from("meal_plans")
    // Koncept — klient ho uvidí až po "Potvrdiť a zverejniť" (0044).
    .insert({ client_id: clientId, trainer_id: user.id, name, published: false })
    .select("id")
    .single();

  if (error || !data) return { error: error?.message ?? "Jedálniček sa nepodarilo vytvoriť." };

  const recipientsError = await addPlanRecipients(supabase, user.id, "meal", data.id, others);
  if (recipientsError) {
    // bez príjemcov by koncept dostal len prvý klient — radšej nič a jasná chyba
    await supabase.from("meal_plans").delete().eq("id", data.id);
    return { error: `Ďalších klientov sa nepodarilo pridať: ${recipientsError}` };
  }

  revalidatePath("/dashboard/jedalnicky");
  revalidatePath(`/dashboard/klienti/${clientId}`);
  redirect(`/dashboard/jedalnicky/jedalnicek/${data.id}`);
}

/** Zverejnenie jedálnička — kým je koncept, klient ho v portáli nevidí (0044). */
export async function publishMealPlanAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Nie si prihlásený." };

  const planId = formData.get("plan_id") as string | null;
  if (!planId) return { error: "Chýba ID jedálnička." };

  const { data, error } = await supabase
    .from("meal_plans")
    .update({ published: true })
    .eq("id", planId)
    .eq("trainer_id", user.id)
    .select("client_id")
    .maybeSingle();
  if (error) return { error: await dbErr(error, "actions") };
  if (!data) return { error: "Jedálniček sa nenašiel." };

  // šablóna pre viacerých klientov (0052): každý ďalší príjemca dostane vlastnú kópiu
  const delivery = await deliverPlanToRecipients(supabase, user.id, "meal", planId);

  revalidatePath(`/dashboard/jedalnicky/jedalnicek/${planId}`);
  revalidatePath("/dashboard/jedalnicky");
  revalidatePath(`/dashboard/klienti/${data.client_id}`);
  for (const clientId of delivery.delivered) revalidatePath(`/dashboard/klienti/${clientId}`);
  if (delivery.error) return { error: delivery.error };
  return ok;
}

/**
 * Zmazanie jedálnička (aj zverejneného — na rozdiel od tréningového plánu tu
 * nevisí história odcvičených tréningov; denník jedla je v food_logs, ten ostáva).
 * UI pýta dvojkrokové potvrdenie. meal_days zmaže kaskáda.
 */
export async function deleteMealPlanAction(planId: string): Promise<ActionState> {
  if (!planId) return { error: "Chýba ID jedálnička." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Nie si prihlásený." };

  const { data: plan } = await supabase
    .from("meal_plans")
    .select("client_id")
    .eq("id", planId)
    .eq("trainer_id", user.id)
    .maybeSingle();
  if (!plan) return { error: "Jedálniček sa nenašiel." };

  const { error } = await supabase.from("meal_plans").delete().eq("id", planId).eq("trainer_id", user.id);
  if (error) return { error: await dbErr(error, "actions") };

  revalidatePath("/dashboard/jedalnicky");
  revalidatePath(`/dashboard/klienti/${plan.client_id}`);
  redirect("/dashboard/jedalnicky");
}

/** Rovnaký podpis ako tréningový renamePlanAction — volá ho zdieľaná ceruzka PlanTitle. */
export async function renameMealPlanAction(planId: string, rawName: string): Promise<ActionState> {
  if (!planId) return { error: "Chýba ID jedálnička." };
  const name = rawName.trim();
  if (!name) return { error: "Zadaj názov jedálnička." };
  if (name.length > 120) return { error: "Názov môže mať najviac 120 znakov." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Nie si prihlásený." };

  const { data, error } = await supabase
    .from("meal_plans")
    .update({ name })
    .eq("id", planId)
    .eq("trainer_id", user.id)
    .select("client_id")
    .maybeSingle();
  if (error) return { error: await dbErr(error, "actions") };
  if (!data) return { error: "Jedálniček sa nenašiel." };

  revalidatePath(`/dashboard/jedalnicky/jedalnicek/${planId}`);
  revalidatePath("/dashboard/jedalnicky");
  revalidatePath(`/dashboard/klienti/${data.client_id}`);
  return ok;
}

/** Deň jedálnička tak, ako ho posiela builder pri „Uložiť zmeny". */
export interface MealDayDraft {
  /** null = nový deň (ešte nie je v DB) */
  id: string | null;
  name: string;
  meals: { entry_id: string; food_id: string; meal_slot: MealSlot; grams: number }[];
}

const MAX_DAYS = 31;
const MAX_ENTRIES_PER_DAY = 100;
const ENTRY_ID_RE = /^[A-Za-z0-9-]{1,64}$/;

/**
 * Uloží celý jedálniček naraz — builder drží úpravy lokálne a posiela ich až po
 * kliknutí na „Uložiť zmeny" (predtým sa každý klik hneď zapísal a zverejnený
 * jedálniček sa klientovi menil priebežne). Dni chýbajúce v `days` sa zmažú, nové
 * (id null) vložia, poradie = index. Názov a makrá potraviny sa berú z DB podľa
 * food_id (snapshot ako pri pôvodnom pridaní), nie z prehliadača.
 */
export async function saveMealPlanDaysAction(planId: string, days: MealDayDraft[]): Promise<ActionState> {
  if (!planId) return { error: "Chýba ID jedálnička." };
  if (!Array.isArray(days) || days.length > MAX_DAYS) return { error: `Jedálniček môže mať najviac ${MAX_DAYS} dní.` };

  for (const day of days) {
    const name = typeof day.name === "string" ? day.name.trim() : "";
    if (!name) return { error: "Každý deň musí mať názov." };
    if (name.length > 120) return { error: "Názov dňa môže mať najviac 120 znakov." };
    if (!Array.isArray(day.meals) || day.meals.length > MAX_ENTRIES_PER_DAY) {
      return { error: `Deň „${name}" má priveľa položiek.` };
    }
    for (const m of day.meals) {
      if (!MEAL_SLOT_ORDER.includes(m.meal_slot)) return { error: "Neplatné jedlo dňa." };
      if (!Number.isFinite(m.grams) || m.grams <= 0 || m.grams > 5000) {
        return { error: `Zadaj platnú gramáž (1–5000 g) v dni „${name}".` };
      }
    }
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Nie si prihlásený." };

  const foodIds = [...new Set(days.flatMap((d) => d.meals.map((m) => m.food_id)))];
  const [{ data: plan }, { data: existing }, { data: foods, error: foodsError }] = await Promise.all([
    supabase.from("meal_plans").select("client_id").eq("id", planId).eq("trainer_id", user.id).maybeSingle(),
    supabase.from("meal_days").select("id, meals").eq("plan_id", planId),
    foodIds.length > 0
      ? supabase.from("foods").select("id, name, kcal_100g, protein_100g, carbs_100g, fat_100g").in("id", foodIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (!plan) return { error: "Jedálniček sa nenašiel." };
  if (foodsError) return { error: await dbErr(foodsError, "actions") };

  const foodById = new Map((foods ?? []).map((f) => [f.id, f]));
  // Potravina medzitým zmazaná z knižnice → nechaj snapshot, ktorý už v dni bol.
  const savedEntries = new Map(
    (existing ?? []).flatMap((d) => ((Array.isArray(d.meals) ? d.meals : []) as MealEntry[]).map((e) => [e.entry_id, e])),
  );

  const rows: { id: string | null; day_number: number; name: string; meals: MealEntry[] }[] = [];
  for (const [i, day] of days.entries()) {
    const meals: MealEntry[] = [];
    for (const m of day.meals) {
      const food = foodById.get(m.food_id);
      const prev = savedEntries.get(m.entry_id);
      const snapshot = food
        ? { food_name: food.name, kcal_100g: food.kcal_100g, protein_100g: food.protein_100g, carbs_100g: food.carbs_100g, fat_100g: food.fat_100g }
        : prev && prev.food_id === m.food_id
          ? { food_name: prev.food_name, kcal_100g: prev.kcal_100g, protein_100g: prev.protein_100g, carbs_100g: prev.carbs_100g, fat_100g: prev.fat_100g }
          : null;
      if (!snapshot) return { error: "Niektorá potravina sa nenašla — obnov stránku a skús znova." };
      meals.push({
        entry_id: ENTRY_ID_RE.test(m.entry_id) ? m.entry_id : randomUUID(),
        food_id: m.food_id,
        meal_slot: m.meal_slot,
        grams: Math.round(m.grams * 10) / 10,
        ...snapshot,
      });
    }
    rows.push({ id: day.id, day_number: i + 1, name: day.name.trim(), meals });
  }

  const existingIds = new Set((existing ?? []).map((d) => d.id));
  if (rows.some((r) => r.id && !existingIds.has(r.id))) {
    return { error: "Jedálniček sa medzitým zmenil — obnov stránku a skús znova." };
  }
  const keptIds = new Set(rows.flatMap((r) => (r.id ? [r.id] : [])));
  const toDelete = [...existingIds].filter((id) => !keptIds.has(id));

  if (toDelete.length > 0) {
    const { error } = await supabase.from("meal_days").delete().in("id", toDelete).eq("plan_id", planId);
    if (error) return { error: await dbErr(error, "actions") };
  }
  const updates = await Promise.all(
    rows
      .filter((r) => r.id)
      .map((r) =>
        supabase
          .from("meal_days")
          .update({ day_number: r.day_number, name: r.name, meals: r.meals })
          .eq("id", r.id as string)
          .eq("plan_id", planId),
      ),
  );
  const updateError = updates.find((u) => u.error)?.error;
  if (updateError) return { error: await dbErr(updateError, "actions") };

  const inserts = rows.filter((r) => !r.id).map(({ day_number, name, meals }) => ({ plan_id: planId, day_number, name, meals }));
  if (inserts.length > 0) {
    const { error } = await supabase.from("meal_days").insert(inserts);
    if (error) return { error: await dbErr(error, "actions") };
  }

  revalidatePath(`/dashboard/jedalnicky/jedalnicek/${planId}`);
  revalidatePath("/dashboard/jedalnicky");
  revalidatePath(`/dashboard/klienti/${plan.client_id}`);
  return ok;
}
