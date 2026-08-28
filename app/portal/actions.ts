"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface ActionState {
  error: string | null;
}
const ok: ActionState = { error: null };

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
