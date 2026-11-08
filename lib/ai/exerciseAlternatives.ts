// FitPilot — AI blok, Krok 5: reálne kandidátne cviky pre AI Kouča, keď klient
// žiada náhradu ("aký cvik namiesto X"). Rovnaký vzor ako lib/ai/macroContext.ts —
// appka najprv sama nájde skutočné dáta v knižnici cvikov, model si smie vybrať
// LEN z tohto zoznamu (nikdy si nevymýšľa cvik, ktorý v appke neexistuje —
// inak by chýbal obrázok/inštrukcie a klient by na neho neklikol nič).

import type { SupabaseClient } from "@supabase/supabase-js";

export interface ExerciseCandidate {
  id: string;
  name: string;
  nameSk: string | null;
  muscleGroup: string | null;
}

const STOPWORDS = new Set([
  "cvik",
  "cviky",
  "cviku",
  "cvikom",
  "iny",
  "iný",
  "ina",
  "iná",
  "aky",
  "aký",
  "aka",
  "aká",
  "namiesto",
  "nahrad",
  "nahradit",
  "nahradiť",
  "zamenit",
  "zameniť",
  "vymenit",
  "vymeniť",
  "alternativa",
  "alternatíva",
  "alternativu",
  "alternatívu",
  "navrhni",
  "navrhnite",
  "navrhnes",
  "navrhneš",
  "problem",
  "problém",
  "chcem",
  "nechcem",
  "moznost",
  "možnosť",
  "tento",
  "tuto",
  "túto",
  "toto",
  "robit",
  "robiť",
  "spravit",
  "spraviť",
  "urobit",
  "urobiť",
]);

/** Vytiahne "obsahové" slová z textu klienta (na fuzzy ilike hľadanie v exercises). */
function extractCandidateWords(text: string): string[] {
  const words = text
    .split(/[^\p{L}0-9]+/u)
    .map((w) => w.trim())
    .filter((w) => w.length >= 4)
    .filter((w) => !STOPWORDS.has(w.toLowerCase()));
  return Array.from(new Set(words)).slice(0, 6);
}

/**
 * Skúsi nájsť cvik, ktorý klient v texte spomenul (fuzzy ilike na name/name_sk),
 * a k nemu ďalšie cviky rovnakej svalovej partie ako kandidátov na náhradu.
 * `matched` môže byť nesprávny odhad pri nejednoznačnom texte — systémový
 * prompt v lib/ai/chat.ts modelu hovorí, nech si v takom prípade vypýta
 * upresnenie namiesto hádania.
 */
export async function findExerciseAlternatives(
  supabase: SupabaseClient,
  userText: string,
): Promise<{ matched: ExerciseCandidate | null; alternatives: ExerciseCandidate[] }> {
  const words = extractCandidateWords(userText);
  if (words.length === 0) return { matched: null, alternatives: [] };

  const orFilter = words.flatMap((w) => [`name.ilike.%${w}%`, `name_sk.ilike.%${w}%`]).join(",");
  const { data: matches, error: matchErr } = await supabase
    .from("exercises")
    .select("id, name, name_sk, muscle_group")
    .or(orFilter)
    .limit(10);
  if (matchErr || !matches || matches.length === 0) return { matched: null, alternatives: [] };

  // Bez ORDER BY je poradie z DB nedeterministické — ak klient napísal/vložil
  // presný názov cviku (napr. skopírovaný z detailu cviku v appke), taká zhoda
  // je oveľa istejšia než "zdieľa jedno slovo", tak ju uprednostníme.
  const lowerText = userText.toLowerCase();
  const exact = matches.find(
    (r) => r.name.length >= 4 && lowerText.includes(r.name.toLowerCase()),
  ) ?? matches.find((r) => r.name_sk && r.name_sk.length >= 4 && lowerText.includes(r.name_sk.toLowerCase()));

  const m = exact ?? matches[0];
  const matched: ExerciseCandidate = { id: m.id, name: m.name, nameSk: m.name_sk, muscleGroup: m.muscle_group };
  if (!matched.muscleGroup) return { matched, alternatives: [] };

  const { data: altRows, error: altErr } = await supabase
    .from("exercises")
    .select("id, name, name_sk, muscle_group")
    .eq("muscle_group", matched.muscleGroup)
    .neq("id", matched.id)
    .limit(8);
  if (altErr) return { matched, alternatives: [] };

  const alternatives: ExerciseCandidate[] = (altRows ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    nameSk: r.name_sk,
    muscleGroup: r.muscle_group,
  }));

  return { matched, alternatives };
}
