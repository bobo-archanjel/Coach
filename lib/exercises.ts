// Detail cviku (obrázky + inštrukcie) — globálna knižnica cvikov, Free Exercise
// DB import (migrácia 0011_exercise_images.sql, scripts/import-exercises.mjs).
// Zdieľané medzi trénerovým builderom (/dashboard/treningy) a klientským
// portálom (/portal/trening, /portal), aby obe strany volali rovnaký tvar dát.

import type { createClient } from "@/lib/supabase/server";

/** Riadok knižnice cvikov tak, ako ho tréner buildery čítajú priamo z Supabase (snake_case). */
export interface ExerciseLibraryRow {
  id: string;
  name: string;
  name_sk: string | null;
  muscle_group: string | null;
  image_url: string[];
}

export interface ExerciseDetail {
  id: string;
  name: string;
  nameSk: string | null;
  muscleGroup: string | null;
  images: string[];
  instructions: string[];
}

/** Zobraziteľný názov — slovenský preklad, ak existuje, inak pôvodný anglický. */
export function displayExerciseName(name: string, nameSk: string | null | undefined): string {
  return nameSk?.trim() || name;
}

export async function fetchExerciseDetail(
  supabase: Awaited<ReturnType<typeof createClient>>,
  exerciseId: string,
): Promise<ExerciseDetail | null> {
  const { data, error } = await supabase
    .from("exercises")
    .select("id, name, name_sk, muscle_group, image_url, instructions")
    .eq("id", exerciseId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    id: data.id,
    name: data.name,
    nameSk: data.name_sk ?? null,
    muscleGroup: data.muscle_group ?? null,
    images: Array.isArray(data.image_url) ? data.image_url : [],
    instructions: Array.isArray(data.instructions) ? data.instructions : [],
  };
}
