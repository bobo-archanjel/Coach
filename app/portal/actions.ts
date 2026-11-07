"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { MEAL_SLOT_ORDER } from "@/lib/meals";
import { fetchExerciseDetail, type ExerciseDetail } from "@/lib/exercises";
import { getFoodLibrary, getPortalWeek } from "@/lib/portal/data";
import { searchOpenFoodFacts } from "@/lib/openFoodFacts";
import { allowWithinWindow } from "@/lib/rateLimitMemory";
import type { PortalFoodOption, PortalWeekResult } from "@/lib/portal/types";
import { dbErr } from "@/lib/dbError";
import { isValidReps, isValidWeight } from "@/lib/workouts/setInput";
import { DIARY_MAX_DAYS_BACK, validDiaryDate } from "@/lib/portal/diaryDate";

export interface ActionState {
  error: string | null;
}
const ok: ActionState = { error: null };

/** Živé vyhľadávanie značkových potravín (Open Food Facts, Fáza C) pre denník. */
export async function searchOnlineFoodAction(query: string): Promise<{ error: string | null; results: PortalFoodOption[] }> {
  // feature/security: akcia bola volateľná BEZ prihlásenia a bez limitu — server sa tak
  // dal zneužiť ako otvorený proxy na Open Food Facts (vyčerpanie fair-use kvóty,
  // zákaz IP adresy servera). Teraz len prihlásený, s obmedzenou dĺžkou a throttlom.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Nie si prihlásený.", results: [] };
  if (typeof query !== "string" || query.length > 80) return { error: "Hľadaný text je príliš dlhý.", results: [] };
  if (!allowWithinWindow(`off:${user.id}`, 20, 60_000)) {
    return { error: "Príliš veľa vyhľadávaní naraz, skús to o chvíľu.", results: [] };
  }

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

/**
 * Knižnica potravín pre vyhľadávanie v denníku — na požiadanie, len keď klient
 * otvorí panel "Pridať jedlo" (`AddFoodDiaryEntry`, defaultne zbalený), nie ako
 * súčasť každého načítania /portal/dennik (viď lib/portal/data.ts).
 */
export async function getFoodLibraryAction(): Promise<PortalFoodOption[]> {
  return getFoodLibrary();
}

/** GDPR — klient požiada o zmazanie vlastných dát (30-dňová grace period, 0013_client_deletion.sql). */
export async function requestOwnDeletionAction(): Promise<ActionState> {
  const supabase = await createClient();
  const clientId = await currentClientId(supabase);
  if (!clientId) return { error: "Nenašli sme tvoj klientský profil." };
  const { error } = await supabase.rpc("request_client_deletion", { p_client_id: clientId });
  if (error) return { error: dbErr(error, "actions") };
  revalidatePath("/portal/profil");
  return ok;
}

/** GDPR — zrušenie žiadosti o zmazanie počas grace period. */
export async function cancelOwnDeletionAction(): Promise<ActionState> {
  const supabase = await createClient();
  const clientId = await currentClientId(supabase);
  if (!clientId) return { error: "Nenašli sme tvoj klientský profil." };
  const { error } = await supabase.rpc("cancel_client_deletion", { p_client_id: clientId });
  if (error) return { error: dbErr(error, "actions") };
  revalidatePath("/portal/profil");
  return ok;
}

/**
 * Klient sa odpojí od trénera (feature/registracia-update). Vlastné dáta ostávajú
 * — RPC leave_trainer (0032) len nastaví `clients.trainer_id = null`. Trénerove
 * plány/merania/history sa nemažú.
 */
export async function leaveTrainerAction(): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("leave_trainer");
  if (error) {
    if (error.message.includes("no_client")) return { error: "Nenašli sme tvoj klientský profil." };
    return { error: "Odpojenie zlyhalo. Skús to o chvíľu znova." };
  }
  revalidatePath("/portal/profil");
  revalidatePath("/portal");
  revalidatePath("/portal/chat", "layout");
  return ok;
}

/** Zavretie banneru o ukončenej spolupráci na karte Dnes (0015_client_cooperation_pause.sql). */
export async function dismissCooperationNoticeAction(): Promise<ActionState> {
  const supabase = await createClient();
  const clientId = await currentClientId(supabase);
  if (!clientId) return { error: "Nenašli sme tvoj klientský profil." };
  const { error } = await supabase.rpc("dismiss_cooperation_notice", { p_client_id: clientId });
  if (error) return { error: dbErr(error, "actions") };
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

function optionalNum(v: FormDataEntryValue | null, min: number, max: number): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, n));
}

/**
 * Progres — klient sám zapíše svoje meranie (váha + obvody) na karte Dnes
 * (`BodyMetricForm`, 0023_body_metrics.sql + 0024 pre klientske INSERT/UPDATE
 * RLS). Predtým to za klienta zapisoval tréner v dashboarde — presunuté po
 * revízii 2026-09, tréner meranie už len číta (graf v Analytike). Jeden záznam
 * na deň (unique client_id+measured_on) — druhé meranie ten istý deň prepíše
 * prvé (upsert), nie duplicitný riadok. `trainer_id` sa berie z `clients` riadku
 * klienta, nie od klienta samého — RLS (0024) navyše overí, že sedí.
 */
export async function addOwnBodyMetricAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Nie si prihlásený." };

  const { data: client } = await supabase
    .from("clients")
    .select("id, trainer_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!client) return { error: "Tvoj účet nie je prepojený s trénerom." };

  const measuredOn = (formData.get("measured_on") as string | null) || new Date().toISOString().slice(0, 10);
  const weightKg = optionalNum(formData.get("weight_kg"), 20, 400);
  const waistCm = optionalNum(formData.get("waist_cm"), 20, 250);
  const chestCm = optionalNum(formData.get("chest_cm"), 20, 250);
  const hipsCm = optionalNum(formData.get("hips_cm"), 20, 250);
  const armCm = optionalNum(formData.get("arm_cm"), 5, 100);
  const thighCm = optionalNum(formData.get("thigh_cm"), 5, 150);

  if (weightKg == null && waistCm == null && chestCm == null && hipsCm == null && armCm == null && thighCm == null) {
    return { error: "Zadaj aspoň jednu hodnotu." };
  }

  const { error } = await supabase.from("body_metrics").upsert(
    {
      client_id: client.id,
      trainer_id: client.trainer_id,
      measured_on: measuredOn,
      weight_kg: weightKg,
      waist_cm: waistCm,
      chest_cm: chestCm,
      hips_cm: hipsCm,
      arm_cm: armCm,
      thigh_cm: thighCm,
    },
    { onConflict: "client_id,measured_on" },
  );
  if (error) return { error: dbErr(error, "actions") };

  revalidatePath("/portal", "layout");
  revalidatePath(`/dashboard/klienti/${client.id}`);
  revalidatePath("/dashboard/analytika");
  return ok;
}

/** Tvar jedného riadku, ako ho posiela LogWorkoutButton (JSON v skrytom poli "entries").
 *  Čas/vzdialenosť/RPE série sú voliteľné — formulár ich zatiaľ neposiela, ale ak prídu,
 *  uložia sa a tréner ich uvidí v detaile dokončeného tréningu (lib/workouts/completed.ts). */
type IncomingSet = {
  reps: number | null;
  weight: number | null;
  durationS?: number;
  distanceM?: number;
  rpe?: number;
};
type IncomingExercise = { entryId: string | null; name: string; note?: string; sets: IncomingSet[] };

/** Voliteľné číslo: chýba/null → null, platné → číslo, čokoľvek iné → INVALID. */
const INVALID = Symbol("invalid");
function optionalSetNum(v: unknown, valid: (n: number) => boolean): number | null | typeof INVALID {
  if (v === undefined || v === null) return null;
  return typeof v === "number" && Number.isFinite(v) && valid(v) ? v : INVALID;
}

/**
 * Overí a vyčistí klientom poslané entries pred zápisom. Neplatná hodnota (záporná
 * váha, 9999 opakovaní, desatinné opakovania…) celý zápis ODMIETNE — dokončený
 * tréning je zamknutý (0048), ticho orezaná hodnota by sa už nedala opraviť.
 * Pravidlá pre opakovania/váhu zdieľa formulár (lib/workouts/setInput.ts).
 * Cviky bez jedinej série aj bez poznámky sa neukladajú. `null` = neplatný vstup.
 */
function sanitizeEntries(raw: unknown): IncomingExercise[] | null {
  if (!Array.isArray(raw)) return null;
  const out: IncomingExercise[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") return null;
    const e = entry as Record<string, unknown>;
    const name = typeof e.name === "string" ? e.name.trim() : "";
    const note = typeof e.note === "string" ? e.note.trim().slice(0, 500) : "";
    const sets: IncomingSet[] = [];
    for (const s of Array.isArray(e.sets) ? e.sets : []) {
      if (!s || typeof s !== "object") return null;
      const row = s as Record<string, unknown>;
      const reps = row.reps ?? null;
      const weight = row.weight ?? null;
      if (!isValidReps(reps) || !isValidWeight(weight)) return null;
      const durationS = optionalSetNum(row.durationS, (n) => n >= 0 && n <= 24 * 3600);
      const distanceM = optionalSetNum(row.distanceM, (n) => n >= 0 && n <= 1_000_000);
      const rpe = optionalSetNum(row.rpe, (n) => n >= 1 && n <= 10);
      if (durationS === INVALID || distanceM === INVALID || rpe === INVALID) return null;
      if ([reps, weight, durationS, distanceM, rpe].every((v) => v === null)) continue;
      sets.push({
        reps: reps as number | null,
        weight: weight as number | null,
        ...(durationS !== null && { durationS }),
        ...(distanceM !== null && { distanceM }),
        ...(rpe !== null && { rpe }),
      });
    }
    if (sets.length === 0 && !note) continue;
    out.push({
      entryId: typeof e.entryId === "string" ? e.entryId : null,
      name: name || "Cvik",
      ...(note && { note }),
      sets,
    });
  }
  return out;
}

/**
 * "Ukončiť tréning" — Fáza B: klient okrem existencie záznamu (Fáza A, deň
 * splnený) uloží aj skutočné série/opakovania/váhu ku každému cviku do
 * workout_logs.entries (jsonb, viď supabase/migrations/0003_portal_client.sql —
 * stĺpec existoval už predtým, len sa doteraz zapisoval prázdny). RLS už
 * dovoľuje klientovi vkladať vlastné logy (workout_logs_insert_own_client);
 * tréner ich vidí cez workout_logs_select_own_trainer bez ďalšej zmeny.
 *
 * Od 0048 je vložený riadok hneď `status = 'completed'`: DB trigger doplní
 * `completed_at` a `plan_snapshot` (kópiu plánu dňa pre porovnanie plán/realita)
 * a odvtedy záznam nejde zmeniť ani zmazať — klientom, trénerom ani priamo cez API.
 */
export async function finishWorkoutAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Nie si prihlásený." };

  const dayId = formData.get("day_id") as string | null;
  if (!dayId) return { error: "Chýba deň tréningu." };

  let entries: IncomingExercise[] | null = [];
  const rawEntries = formData.get("entries") as string | null;
  if (rawEntries) {
    try {
      entries = sanitizeEntries(JSON.parse(rawEntries));
    } catch {
      entries = null;
    }
  }
  // Predtým sa neplatný vstup ticho zahodil/orezal a uložil — dnes by ostal zamknutý.
  if (entries === null) return { error: "Niektorá zapísaná hodnota nie je platná — skontroluj série a skús to znova." };

  const rpeRaw = Number(formData.get("rpe"));
  const rpe = Number.isInteger(rpeRaw) && rpeRaw >= 1 && rpeRaw <= 10 ? rpeRaw : null;
  const note = ((formData.get("note") as string | null) ?? "").trim().slice(0, 1000) || null;

  const { data: client } = await supabase
    .from("clients")
    .select("id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!client) return { error: "Nepodarilo sa nájsť tvoj profil." };

  // Insert a RPC sa navzájom nepotrebujú (RPC len čistí `active_day_id` podľa
  // dayId, nie podľa výsledku insertu) — paralelne namiesto čakania jedného na
  // druhé, ušetrí jeden round-trip priamo v ceste "klik na Ukončiť tréning".
  const [{ error }] = await Promise.all([
    supabase.from("workout_logs").insert({
      client_id: client.id,
      workout_day_id: dayId,
      entries,
      rpe,
      note,
      status: "completed",
    }),
    // Deň je zalogovaný (nanovo alebo už bol dnes skôr) — explicitný výber dňa
    // zo sekcie Tréning (clients.active_day_id, 0022) sa tým spotreboval, ďalší
    // štart nech opäť rieši prirodzená rotácia dní (lib/portal/data.ts). RPC, lebo
    // klient nemá priamu UPDATE RLS na `clients` (len tréner, 0001).
    supabase.rpc("clear_active_day_if_matches", { p_day_id: dayId }),
  ]);

  if (error) {
    // unique index (client_id, workout_day_id, performed_on) — tento deň je dnes už
    // zapísaný (napr. ukončený v inom tabe). Predtým sa to ticho ignorovalo a hodnoty
    // z tohto pokusu sa stratili pri hlásení úspechu; zapísaný záznam je zamknutý,
    // takže ich treba klientovi výslovne nechať (koncept v prehliadači ostáva).
    if (error.code === "23505") {
      revalidatePath("/portal", "layout");
      return { error: "Tento tréning už máš dnes zapísaný — tieto hodnoty sa neuložili. Obnov stránku a pozri si uložený záznam." };
    }
    return { error: dbErr(error, "actions") };
  }

  // "layout", nie len stránka: /portal/trening číta ten istý workout_logs riadok
  // pre badge "Hotovo" (lib/portal/data.ts) — bez "layout" ostal cache tej stránky
  // po dokončení tréningu na karte Dnes stále starý.
  revalidatePath("/portal", "layout");
  return ok;
}

/**
 * "Upraviť hodnoty" — klient opraví zapísané série/RPE/poznámky dokončeného
 * tréningu, najviac 24 h po ukončení (0049). Okno aj to, že sa mení LEN
 * entries/rpe/note, vynucuje DB (trigger + RLS); tu len validácia vstupu
 * rovnaká ako pri ukončení a zrozumiteľná hláška, keď okno uplynulo.
 */
export async function updateWorkoutLogAction(input: {
  logId: string;
  entries: string;
  rpe: string;
  note: string;
}): Promise<ActionState> {
  if (!input.logId) return { error: "Chýba záznam tréningu." };

  let entries: IncomingExercise[] | null;
  try {
    entries = sanitizeEntries(JSON.parse(input.entries));
  } catch {
    entries = null;
  }
  if (entries === null) return { error: "Niektorá zapísaná hodnota nie je platná — skontroluj série a skús to znova." };

  const rpeRaw = Number(input.rpe);
  const rpe = input.rpe && Number.isInteger(rpeRaw) && rpeRaw >= 1 && rpeRaw <= 10 ? rpeRaw : null;
  const note = input.note.trim().slice(0, 1000) || null;

  const supabase = await createClient();
  // RLS workout_logs_update_own_client: len vlastný záznam a len v 24 h okne —
  // mimo neho vráti 0 riadkov (nie chybu), preto .select() a kontrola počtu.
  const { data, error } = await supabase
    .from("workout_logs")
    .update({ entries, rpe, note })
    .eq("id", input.logId)
    .select("id");
  if (error) return { error: dbErr(error, "actions") };
  if (!data || data.length === 0) {
    return { error: "Hodnoty sa dajú upraviť len 24 hodín po ukončení tréningu." };
  }

  revalidatePath("/portal", "layout");
  // tréner vidí opravené hodnoty (a štítok "Upravené") v detaile tréningu
  revalidatePath("/dashboard", "layout");
  return ok;
}

/** Dnešný dátum (YYYY-MM-DD) v Europe/Bratislava — rovnako ako todayInTz v lib/portal/data.ts. */
function todayBratislava(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bratislava" }).format(new Date());
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

  // Zápis aj za iný deň (QA 2026-09-23) — rovnaký povolený rozsah ako zobrazenie.
  const today = todayBratislava();
  const eatenOnRaw = (formData.get("eaten_on") as string | null) || today;
  const eatenOn = validDiaryDate(eatenOnRaw, today);
  if (!eatenOn) return { error: `Zapisovať sa dá len za posledných ${DIARY_MAX_DAYS_BACK} dní, nie do budúcnosti.` };

  // Vlastná potravina (custom=1): názov a makrá zadáva klient, žiadny food_id —
  // preto ich tu overíme, nie len `|| 0` ako pri snapshote z plánu/online.
  if (formData.get("custom") === "1") {
    if (!name || name.length > 120) return { error: "Zadaj názov potraviny (max 120 znakov)." };
    if (((formData.get("kcal_100g") as string | null) ?? "").trim() === "") return { error: "Zadaj kalórie na 100 g." };
    const vals = ["kcal_100g", "protein_100g", "carbs_100g", "fat_100g"].map((k) => Number(formData.get(k)));
    if (vals.some((v) => !Number.isFinite(v) || v < 0)) return { error: "Makrá musia byť čísla 0 alebo viac." };
    const [kcal, protein, carbs, fat] = vals;
    if (kcal > 900) return { error: "Kalórie na 100 g môžu byť najviac 900." };
    if (protein + carbs + fat > 100) return { error: "Bielkoviny, sacharidy a tuky spolu nemôžu mať viac ako 100 g na 100 g." };
  }

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
    eaten_on: eatenOn,
    meal_slot: slot,
    food_id: foodId,
    food_name: foodName,
    grams,
    ...macros,
  });

  if (error) return { error: dbErr(error, "actions") };

  revalidatePath("/portal/dennik");
  return ok;
}

/** Denník — zmena gramáže / jedla dňa zapísanej položky (RLS: food_logs_update_own_client, 0045). */
export async function updateFoodLogAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const clientId = await currentClientId(supabase);
  if (!clientId) return { error: "Tvoj účet nie je prepojený s trénerom." };

  const id = formData.get("entry_id") as string | null;
  const grams = Number(formData.get("grams"));
  if (!id) return { error: "Chýba identifikátor záznamu." };
  if (!Number.isFinite(grams) || grams <= 0 || grams > 5000) return { error: "Zadaj gramáž (1–5000 g)." };

  const { data, error } = await supabase
    .from("food_logs")
    .update({ grams })
    .eq("id", id)
    .eq("client_id", clientId)
    .select("id")
    .maybeSingle();
  if (error) return { error: dbErr(error, "actions") };
  if (!data) return { error: "Záznam sa nenašiel." };

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
  if (error) return { error: dbErr(error, "actions") };

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
  if (error) return { error: dbErr(error, "actions") };

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

/**
 * Chat polling (feature/optimalizacia) — ChatThread predtým volal router.refresh()
 * (celý round-trip + rerender stránky) každých pollMs, aj keď väčšinu času nepribudla
 * žiadna nová správa. Táto akcia vráti len ID poslednej správy (jeden riadok,
 * indexovaný dopyt) — ChatThread ho porovná s tým, čo už má vykreslené, a
 * router.refresh() zavolá len keď sa naozaj líši.
 */
export async function getClientChatMarkerAction(): Promise<string | null> {
  const supabase = await createClient();
  const clientId = await currentClientId(supabase);
  if (!clientId) return null;
  const { data } = await supabase
    .from("messages")
    .select("id")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}
