"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { MEAL_SLOT_ORDER } from "@/lib/meals";
import { fetchExerciseDetail, type ExerciseDetail } from "@/lib/exercises";
import { getPortalWeek } from "@/lib/portal/data";
import { searchOpenFoodFacts } from "@/lib/openFoodFacts";
import type { PortalFoodOption, PortalWeekResult } from "@/lib/portal/types";

export interface ActionState {
  error: string | null;
}
const ok: ActionState = { error: null };

/** Živé vyhľadávanie značkových potravín (Open Food Facts, Fáza C) pre denník. */
export async function searchOnlineFoodAction(query: string): Promise<{ error: string | null; results: PortalFoodOption[] }> {
  try {
    const results = await searchOpenFoodFacts(query);
    return { error: null, results };
  } catch (err) {
    console.error("searchOnlineFoodAction:", err);
    return { error: "Vyhľadávanie momentálne nefunguje, skús to o chvíľu.", results: [] };
  }
}

/** Detail cviku (obrázky + inštrukcie z Free Exercise DB) pre náhľadový modal klienta. */
export async function getExerciseDetailAction(exerciseId: string): Promise<ExerciseDetail | null> {
  const supabase = await createClient();
  return fetchExerciseDetail(supabase, exerciseId);
}

/** Pás „Tento týždeň" — načíta iný (spravidla minulý) týždeň pri listovaní. */
export async function getPortalWeekAction(mondayIso: string): Promise<PortalWeekResult> {
  return getPortalWeek(mondayIso);
}

/** GDPR — klient požiada o zmazanie vlastných dát (30-dňová grace period, 0013_client_deletion.sql). */
export async function requestOwnDeletionAction(): Promise<ActionState> {
  const supabase = await createClient();
  const clientId = await currentClientId(supabase);
  if (!clientId) return { error: "Nenašli sme tvoj klientský profil." };
  const { error } = await supabase.rpc("request_client_deletion", { p_client_id: clientId });
  if (error) return { error: error.message };
  revalidatePath("/portal/profil");
  return ok;
}

/** GDPR — zrušenie žiadosti o zmazanie počas grace period. */
export async function cancelOwnDeletionAction(): Promise<ActionState> {
  const supabase = await createClient();
  const clientId = await currentClientId(supabase);
  if (!clientId) return { error: "Nenašli sme tvoj klientský profil." };
  const { error } = await supabase.rpc("cancel_client_deletion", { p_client_id: clientId });
  if (error) return { error: error.message };
  revalidatePath("/portal/profil");
  return ok;
}

/** Zavretie banneru o ukončenej spolupráci na karte Dnes (0015_client_cooperation_pause.sql). */
export async function dismissCooperationNoticeAction(): Promise<ActionState> {
  const supabase = await createClient();
  const clientId = await currentClientId(supabase);
  if (!clientId) return { error: "Nenašli sme tvoj klientský profil." };
  const { error } = await supabase.rpc("dismiss_cooperation_notice", { p_client_id: clientId });
  if (error) return { error: error.message };
  revalidatePath("/portal");
  return ok;
}

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
  if (!client) return { error: "Nepodarilo sa nájsť tvoj profil." };

  const { error } = await supabase.from("workout_logs").insert({
    client_id: client.id,
    workout_day_id: dayId,
    entries,
  });

  if (error) {
    // unique index (client_id, workout_day_id, performed_on) — dnes už zapísané,
    // netreba to hlásiť ako chybu (napr. druhý klik po pomalej sieti).
    if (error.code !== "23505") return { error: error.message };
  }

  // Deň je zalogovaný (nanovo alebo už bol dnes skôr) — explicitný výber dňa
  // zo sekcie Tréning (clients.active_day_id, 0022) sa tým spotreboval, ďalší
  // štart nech opäť rieši prirodzená rotácia dní (lib/portal/data.ts). RPC, lebo
  // klient nemá priamu UPDATE RLS na `clients` (len tréner, 0001).
  await supabase.rpc("clear_active_day_if_matches", { p_day_id: dayId });

  // "layout", nie len stránka: /portal/trening číta ten istý workout_logs riadok
  // pre badge "Hotovo" (lib/portal/data.ts) — bez "layout" ostal cache tej stránky
  // po dokončení tréningu na karte Dnes stále starý.
  revalidatePath("/portal", "layout");
  return ok;
}

/**
 * "Upraviť hodnoty" — klient po dokončení dňa zistí, že sa preklikol alebo si
 * zle zapamätal váhu, a opraví si zapísané série (bez znovuotvorenia celého
 * "Začať/Ukončiť" flow — deň už je splnený, mení sa len obsah `entries`).
 * RLS `workout_logs_update_own_client` (0003) toto klientovi už dovoľuje.
 * Cieľový riadok = najnovší log pre (klient, deň) — táto akcia sa volá len
 * z pohľadu na DNEŠNÝ dokončený deň, takže je to vždy dnešný záznam bez
 * nutnosti duplikovať výpočet "dnešného dátumu" v TZ Europe/Bratislava.
 */
export async function updateWorkoutLogAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const clientId = await currentClientId(supabase);
  if (!clientId) return { error: "Tvoj účet nie je prepojený s trénerom." };

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

  const { data: existing, error: findErr } = await supabase
    .from("workout_logs")
    .select("id")
    .eq("client_id", clientId)
    .eq("workout_day_id", dayId)
    .order("performed_on", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (findErr) return { error: findErr.message };
  if (!existing) return { error: "Nenašiel sa žiadny záznam na úpravu — skús obnoviť stránku." };

  const { error } = await supabase.from("workout_logs").update({ entries }).eq("id", existing.id);
  if (error) return { error: error.message };

  revalidatePath("/portal", "layout");
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
