"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { MEAL_SLOT_ORDER } from "@/lib/meals";

export interface ActionState {
  error: string | null;
}
const ok: ActionState = { error: null };

/** Klient prepojený s prihláseným používateľom, alebo null. */
async function currentClientId(supabase: Awaited<ReturnType<typeof createClient>>): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("clients")
    .select("id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

/** Tvar jedného riadku, ako ho posiela LogWorkoutButton (JSON v skrytom poli "entries"). */
type IncomingSet = { reps: number | null; weight: number | null };
type IncomingExercise = { entryId: string | null; name: string; sets: IncomingSet[] };

/**
 * Vyčistí klientom poslané entries pred zápisom — orežie na rozumné rozsahy a
 * zahodí cviky bez ijednej vyplnenej série (klient ich nezadal, netreba ukladať
 * prázdne polia).
 */
function sanitizeEntries(raw: unknown): IncomingExercise[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry): IncomingExercise | null => {
      if (!entry || typeof entry !== "object") return null;
      const e = entry as Record<string, unknown>;
      const name = typeof e.name === "string" ? e.name.trim() : "";
      const sets = Array.isArray(e.sets)
        ? e.sets
            .map((s): IncomingSet | null => {
              if (!s || typeof s !== "object") return null;
              const row = s as Record<string, unknown>;
              const reps = typeof row.reps === "number" && Number.isFinite(row.reps) ? Math.max(0, Math.min(999, row.reps)) : null;
              const weight =
                typeof row.weight === "number" && Number.isFinite(row.weight) ? Math.max(0, Math.min(1000, row.weight)) : null;
              if (reps === null && weight === null) return null;
              return { reps, weight };
            })
            .filter((s): s is IncomingSet => s !== null)
        : [];
      if (sets.length === 0) return null;
      return {
        entryId: typeof e.entryId === "string" ? e.entryId : null,
        name: name || "Cvik",
        sets,
      };
    })
    .filter((e): e is IncomingExercise => e !== null);
}

/**
 * "Ukončiť tréning" — Fáza B: klient okrem existencie záznamu (Fáza A, deň
 * splnený) uloží aj skutočné série/opakovania/váhu ku každému cviku do
 * workout_logs.entries (jsonb, viď supabase/migrations/0003_portal_client.sql —
 * stĺpec existoval už predtým, len sa doteraz zapisoval prázdny). RLS už
 * dovoľuje klientovi vkladať vlastné logy (workout_logs_insert_own_client);
 * tréner ich vidí cez workout_logs_select_own_trainer bez ďalšej zmeny.
 */
export async function finishWorkoutAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Nie si prihlásený." };

  const dayId = formData.get("day_id") as string | null;
  if (!dayId) return { error: "Chýba deň tréningu." };

  let entries: IncomingExercise[] = [];
  const rawEntries = formData.get("entries") as string | null;
  if (rawEntries) {
    try {
      entries = sanitizeEntries(JSON.parse(rawEntries));
    } catch {
      entries = [];
    }
  }

  const { data: client } = await supabase
    .from("clients")
    .select("id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!client) return { error: "Tvoj účet nie je prepojený s trénerom." };

  const { error } = await supabase.from("workout_logs").insert({
    client_id: client.id,
    workout_day_id: dayId,
    entries,
  });

  if (error) {
    // unique index (client_id, workout_day_id, performed_on) — dnes už zapísané,
    // netreba to hlásiť ako chybu (napr. druhý klik po pomalej sieti).
    if (error.code === "23505") return ok;
    return { error: error.message };
  }

  revalidatePath("/portal");
  return ok;
}

/**
 * Denník — pridať zjedenú potravinu. Klient posiela food_id + gramáž + jedlo dňa;
 * makrá na 100 g si server dotiahne z `foods` (autoritatívne), a ak už potravina
 * neexistuje, použije snapshot poslaný klientom (napr. položka z plánu). RLS
 * (food_logs_insert_own_client) drží, že klient zapisuje len do vlastného denníka.
 */
export async function addFoodLogAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const clientId = await currentClientId(supabase);
  if (!clientId) return { error: "Tvoj účet nie je prepojený s trénerom." };

  const foodId = (formData.get("food_id") as string | null) || null;
  const name = ((formData.get("food_name") as string | null) ?? "").trim();
  const slot = (formData.get("meal_slot") as string | null) ?? "";
  const grams = Number(formData.get("grams"));

  if (!MEAL_SLOT_ORDER.includes(slot as (typeof MEAL_SLOT_ORDER)[number])) return { error: "Vyber jedlo dňa." };
  if (!Number.isFinite(grams) || grams <= 0 || grams > 5000) return { error: "Zadaj gramáž (1–5000 g)." };

  // Autoritatívne makrá z DB; fallback na snapshot z formulára.
  let macros = {
    kcal_100g: Number(formData.get("kcal_100g")) || 0,
    protein_100g: Number(formData.get("protein_100g")) || 0,
    carbs_100g: Number(formData.get("carbs_100g")) || 0,
    fat_100g: Number(formData.get("fat_100g")) || 0,
  };
  let foodName = name;

  if (foodId) {
    const { data: food } = await supabase
      .from("foods")
      .select("name, kcal_100g, protein_100g, carbs_100g, fat_100g")
      .eq("id", foodId)
      .maybeSingle();
    if (food) {
      macros = {
        kcal_100g: food.kcal_100g,
        protein_100g: food.protein_100g,
        carbs_100g: food.carbs_100g,
        fat_100g: food.fat_100g,
      };
      foodName = food.name;
    }
  }

  if (!foodName) return { error: "Chýba názov potraviny." };

  const { error } = await supabase.from("food_logs").insert({
    client_id: clientId,
    meal_slot: slot,
    food_id: foodId,
    food_name: foodName,
    grams,
    ...macros,
  });

  if (error) return { error: error.message };

  revalidatePath("/portal/dennik");
  return ok;
}

/** Denník — odobrať záznam (RLS: food_logs_delete_own_client). */
export async function removeFoodLogAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const clientId = await currentClientId(supabase);
  if (!clientId) return { error: "Tvoj účet nie je prepojený s trénerom." };

  const id = formData.get("entry_id") as string | null;
  if (!id) return { error: "Chýba identifikátor záznamu." };

  const { error } = await supabase.from("food_logs").delete().eq("id", id).eq("client_id", clientId);
  if (error) return { error: error.message };

  revalidatePath("/portal/dennik");
  return ok;
}

/** Chat — klient odošle správu trénerovi (RLS messages_insert, sender='client'). */
export async function sendClientMessageAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Nie si prihlásený." };

  const clientId = await currentClientId(supabase);
  if (!clientId) return { error: "Tvoj účet nie je prepojený s trénerom." };

  const body = ((formData.get("body") as string | null) ?? "").trim();
  if (!body) return { error: "Prázdna správa." };
  if (body.length > 4000) return { error: "Správa je príliš dlhá (max 4000 znakov)." };

  const { error } = await supabase.from("messages").insert({
    client_id: clientId,
    sender: "client",
    sender_id: user.id,
    body,
  });
  if (error) return { error: error.message };

  revalidatePath("/portal/chat");
  return ok;
}

/** Chat — označí správy od trénera ako prečítané (volané pri otvorení / návrate na kartu). */
export async function markClientChatSeenAction(): Promise<void> {
  const supabase = await createClient();
  const clientId = await currentClientId(supabase);
  if (!clientId) return;
  const { error } = await supabase.rpc("mark_messages_read", { p_client_id: clientId });
  if (!error) revalidatePath("/portal", "layout");
}
