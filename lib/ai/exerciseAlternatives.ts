// i18n-ignore-file: stop-slová (SK aj CZ) na hľadanie cviku v texte klienta, nie text pre používateľa
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
  // čeština (feature/cestina) — appka po česky, klient píše po česky
  "cvikem",
  "cviků",
  "jiný",
  "jiny",
  "jiná",
  "jina",
  "jaký",
  "jaky",
  "jaká",
  "jaka",
  "místo",
  "misto",
  "vyměnit",
  "zaměnit",
  "chci",
  "nechci",
  "možnost",
  "tenhle",
  "tuhle",
  "tohle",
  "dělat",
  "delat",
  "udělat",
  "udelat",
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

// ---------------------------------------------------------------- nástroj search_exercises
// Hodnoty muscle_group (slovenské, z importu knižnice — scripts/import-exercises.mjs MUSCLE_SK)
// a equipment (anglické, Free Exercise DB — migrácia 0031). Slúžia ako enum v definícii nástroja
// pre model, aby filter vždy trafil reálnu hodnotu v DB.
export const EXERCISE_MUSCLE_GROUPS = [
  "brucho",
  "abduktory (vonkajšie stehná)",
  "adduktory (vnútorné stehná)",
  "biceps",
  "lýtka",
  "hrudník",
  "predlaktia",
  "zadok",
  "zadné stehná",
  "chrbát (širák)",
  "spodný chrbát",
  "stredný chrbát",
  "krk",
  "stehná (kvadriceps)",
  "ramená",
  "trapézy",
  "triceps",
] as const;

export const EXERCISE_EQUIPMENT = [
  "body only",
  "dumbbell",
  "barbell",
  "kettlebells",
  "bands",
  "e-z curl bar",
  "medicine ball",
  "exercise ball",
  "foam roll",
  "machine",
  "cable",
  "other",
] as const;

export const SEARCH_EXERCISES_MAX = 20;

export interface ExerciseSearchHit extends ExerciseCandidate {
  equipment: string | null;
}

/** Z voľného textu nechá len písmená/číslice — nič, čo by rozbilo PostgREST `or()` filter (čiarky, zátvorky, %, *). */
function searchTokens(query: string): string[] {
  return Array.from(
    new Set(
      query
        .split(/[^\p{L}0-9]+/u)
        .map((w) => w.trim().toLowerCase())
        .filter((w) => w.length >= 2),
    ),
  ).slice(0, 6);
}

/**
 * Hľadanie v CELEJ knižnici cvikov pod session klienta (RLS: globálne + cviky jeho trénera).
 * Voľný text (SK/EN názov) + voliteľný filter partie/vybavenia. Bez textu a bez filtra sa
 * nevráti nič (model by dostal náhodných 20 z ~900). Pri samotnom filtri sa výber premieša —
 * abecedné prvé stránky by pri "náhrade cviku" ponúkali stále tie isté cviky.
 */
export async function searchExercises(
  supabase: SupabaseClient,
  params: { query?: string; muscleGroup?: string; equipment?: string; limit?: number },
): Promise<ExerciseSearchHit[]> {
  const limit = Math.min(Math.max(Math.floor(params.limit ?? 10), 1), SEARCH_EXERCISES_MAX);
  const tokens = searchTokens(params.query ?? "");
  const muscle = (EXERCISE_MUSCLE_GROUPS as readonly string[]).includes(params.muscleGroup ?? "") ? params.muscleGroup : undefined;
  const equipment = (EXERCISE_EQUIPMENT as readonly string[]).includes(params.equipment ?? "") ? params.equipment : undefined;
  if (tokens.length === 0 && !muscle && !equipment) return [];

  type Row = { id: string; name: string; name_sk: string | null; muscle_group: string | null; equipment: string | null };
  const run = async (mode: "and" | "or"): Promise<Row[]> => {
    let q = supabase.from("exercises").select("id, name, name_sk, muscle_group, equipment");
    if (muscle) q = q.eq("muscle_group", muscle);
    if (equipment) q = q.eq("equipment", equipment);
    if (tokens.length > 0) {
      const perToken = (t: string) => `name.ilike.%${t}%,name_sk.ilike.%${t}%`;
      // AND slov: každé slovo musí sedieť v názve (EN alebo SK) → viac .or() za sebou = AND
      if (mode === "and") for (const t of tokens) q = q.or(perToken(t));
      else q = q.or(tokens.map(perToken).join(","));
    }
    // bez textu berieme širší výber a miešame, s textom stačí abecedne
    const { data, error } = await q.order("name", { ascending: true }).limit(tokens.length === 0 ? limit * 4 : limit);
    if (error) throw new Error(error.message);
    return (data ?? []) as Row[];
  };

  let rows = await run("and");
  if (rows.length === 0 && tokens.length > 1) rows = await run("or");
  if (tokens.length === 0) {
    rows = [...rows].sort(() => Math.random() - 0.5).slice(0, limit);
  }
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    nameSk: r.name_sk,
    muscleGroup: r.muscle_group,
    equipment: r.equipment,
  }));
}
