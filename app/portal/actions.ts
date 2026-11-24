"use server";

import { tErr } from "@/lib/i18n/serverErrors";
import { revalidatePath } from "next/cache";
import { createClient, getUser } from "@/lib/supabase/server";
import { MEAL_SLOT_ORDER } from "@/lib/meals";
import { isPortionUnit, MAX_PORTION_GRAMS, portionGrams, type PortionUnit } from "@/lib/portions";
import { fetchExerciseDetail, type ExerciseDetail } from "@/lib/exercises";
import { getPortalWeek } from "@/lib/portal/data";
import type { PortalWeekResult } from "@/lib/portal/types";
import { dbErr, isMissingColumn } from "@/lib/dbError";
import { isValidReps, isValidWeight } from "@/lib/workouts/setInput";
import { DIARY_MAX_DAYS_BACK, validDiaryDate } from "@/lib/portal/diaryDate";
import { cleanSupersetId, normalizeSupersets } from "@/lib/workouts/superset";
import { bratislavaToUtcIso } from "@/lib/calendar/month";
import { getTranslations } from "next-intl/server";
import { emptyReport, syncGamification } from "@/lib/gamification/server";
import { buildFinishSummary, setFinishSummaryCookie } from "@/lib/gamification/finishServer";
import { todayIso } from "@/lib/reports/period";

export interface ActionState {
  error: string | null;
}
const ok: ActionState = { error: null };

/** Detail cviku (obrázky + inštrukcie z Free Exercise DB) pre náhľadový modal klienta. */
export async function getExerciseDetailAction(exerciseId: string): Promise<ExerciseDetail | null> {
  const supabase = await createClient();
  return fetchExerciseDetail(supabase, exerciseId);
}

/** Pás „Tento týždeň" — načíta iný (spravidla minulý) týždeň pri listovaní. */
export async function getPortalWeekAction(mondayIso: string): Promise<PortalWeekResult> {
  return getPortalWeek(mondayIso);
}

/** Vlastná udalosť klienta v kalendári na karte Dnes (client_events, 0072 — súkromná). */
export interface ClientEventInput {
  id?: string;
  title: string;
  /** YYYY-MM-DD (deň v kalendári) */
  date: string;
  /** HH:MM, Europe/Bratislava */
  time: string;
  endTime: string;
  note: string;
}

async function validateClientEvent(v: ClientEventInput): Promise<{ error: string } | { row: { title: string; starts_at: string; ends_at: string | null; note: string | null } }> {
  const title = (v.title ?? "").trim();
  const note = (v.note ?? "").trim();
  if (title.length > 200) return { error: await tErr("calendar.titleTooLong") };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.date ?? "")) return { error: await tErr("calendar.dateRequired") };
  if (!/^\d{2}:\d{2}$/.test(v.time ?? "")) return { error: await tErr("calendar.timeRequired") };
  if (note.length > 1000) return { error: await tErr("calendar.noteTooLong") };
  const startsAt = bratislavaToUtcIso(v.date, v.time);
  const endsAt = /^\d{2}:\d{2}$/.test(v.endTime ?? "") ? bratislavaToUtcIso(v.date, v.endTime) : null;
  if (endsAt && endsAt <= startsAt) return { error: await tErr("calendar.endAfterStart") };
  // názov je voliteľný (povinný je deň a čas) — stĺpec je NOT NULL, preto predvolený
  const fallback = (await getTranslations("today.calendar"))("defaultTitle");
  return { row: { title: title || fallback, starts_at: startsAt, ends_at: endsAt, note: note || null } };
}

/** Nová / upravená vlastná udalosť (RLS client_events_all_own_client — len vlastný riadok). */
export async function saveClientEventAction(input: ClientEventInput): Promise<ActionState> {
  const supabase = await createClient();
  const clientId = await currentClientId(supabase);
  if (!clientId) return { error: await tErr("client.clientProfileMissing") };
  const v = await validateClientEvent(input);
  if ("error" in v) return { error: v.error };
  const { error } = input.id
    ? await supabase.from("client_events").update(v.row).eq("id", input.id).eq("client_id", clientId)
    : await supabase.from("client_events").insert({ ...v.row, client_id: clientId });
  if (error) return { error: await dbErr(error, "actions") };
  revalidatePath("/portal");
  return ok;
}

export async function deleteClientEventAction(id: string): Promise<ActionState> {
  if (typeof id !== "string" || !id) return { error: await tErr("calendar.appointmentNotFound") };
  const supabase = await createClient();
  const clientId = await currentClientId(supabase);
  if (!clientId) return { error: await tErr("client.clientProfileMissing") };
  const { error } = await supabase.from("client_events").delete().eq("id", id).eq("client_id", clientId);
  if (error) return { error: await dbErr(error, "actions") };
  revalidatePath("/portal");
  return ok;
}

/** GDPR — klient požiada o zmazanie vlastných dát (30-dňová grace period, 0013_client_deletion.sql). */
export async function requestOwnDeletionAction(): Promise<ActionState> {
  const supabase = await createClient();
  const clientId = await currentClientId(supabase);
  if (!clientId) return { error: await tErr("client.clientProfileMissing") };
  const { error } = await supabase.rpc("request_client_deletion", { p_client_id: clientId });
  if (error) return { error: await dbErr(error, "actions") };
  revalidatePath("/portal/profil");
  return ok;
}

/** GDPR — zrušenie žiadosti o zmazanie počas grace period. */
export async function cancelOwnDeletionAction(): Promise<ActionState> {
  const supabase = await createClient();
  const clientId = await currentClientId(supabase);
  if (!clientId) return { error: await tErr("client.clientProfileMissing") };
  const { error } = await supabase.rpc("cancel_client_deletion", { p_client_id: clientId });
  if (error) return { error: await dbErr(error, "actions") };
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
    if (error.message.includes("no_client")) return { error: await tErr("client.clientProfileMissing") };
    return { error: await tErr("client.disconnectFailed") };
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
  if (!clientId) return { error: await tErr("client.clientProfileMissing") };
  const { error } = await supabase.rpc("dismiss_cooperation_notice", { p_client_id: clientId });
  if (error) return { error: await dbErr(error, "actions") };
  revalidatePath("/portal");
  return ok;
}

/** Klient prepojený s prihláseným používateľom, alebo null. */
async function currentClientId(supabase: Awaited<ReturnType<typeof createClient>>): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return clientIdForUser(supabase, user.id);
}

async function clientIdForUser(supabase: Awaited<ReturnType<typeof createClient>>, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from("clients")
    .select("id")
    .eq("user_id", userId)
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
  if (!user) return { error: await tErr("notSignedIn") };

  const { data: client } = await supabase
    .from("clients")
    .select("id, trainer_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!client) return { error: await tErr("client.notLinkedTrainer") };

  const measuredOn = (formData.get("measured_on") as string | null) || new Date().toISOString().slice(0, 10);
  const weightKg = optionalNum(formData.get("weight_kg"), 20, 400);
  const waistCm = optionalNum(formData.get("waist_cm"), 20, 250);
  const chestCm = optionalNum(formData.get("chest_cm"), 20, 250);
  const hipsCm = optionalNum(formData.get("hips_cm"), 20, 250);
  const armCm = optionalNum(formData.get("arm_cm"), 5, 100);
  const thighCm = optionalNum(formData.get("thigh_cm"), 5, 150);

  if (weightKg == null && waistCm == null && chestCm == null && hipsCm == null && armCm == null && thighCm == null) {
    return { error: await tErr("client.atLeastOneValue") };
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
  if (error) return { error: await dbErr(error, "actions") };

  // gamifikácia: odznak „Prvé meranie“ (server si všetko dopočíta sám, nikdy nie z klienta)
  await syncGamification(supabase, { clientId: client.id }, "body");

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
type IncomingExercise = { entryId: string | null; name: string; note?: string; superset?: string | null; sets: IncomingSet[] };

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
      superset: cleanSupersetId(e.superset),
      sets,
    });
  }
  // superséria (plán aj spojená počas tréningu): vynechaný cvik bez sérií mohol nechať
  // skupinu s jedným členom; null sa neukladá
  return normalizeSupersets(out).map(({ superset, ...rest }) => (superset ? { ...rest, superset } : rest));
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
  if (!user) return { error: await tErr("notSignedIn") };

  const dayId = formData.get("day_id") as string | null;
  if (!dayId) return { error: await tErr("client.missingDay") };

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
  if (entries === null) return { error: await tErr("client.invalidSetValue") };

  const rpeRaw = Number(formData.get("rpe"));
  const rpe = Number.isInteger(rpeRaw) && rpeRaw >= 1 && rpeRaw <= 10 ? rpeRaw : null;
  const note = ((formData.get("note") as string | null) ?? "").trim().slice(0, 1000) || null;

  const { data: client } = await supabase
    .from("clients")
    .select("id, active_plan_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!client) return { error: await tErr("client.profileMissing") };

  // Insert a RPC sa navzájom nepotrebujú (RPC len čistí `active_day_id` podľa
  // dayId, nie podľa výsledku insertu) — paralelne namiesto čakania jedného na
  // druhé, ušetrí jeden round-trip priamo v ceste "klik na Ukončiť tréning".
  const [{ error, data: inserted }] = await Promise.all([
    supabase
      .from("workout_logs")
      .insert({
        client_id: client.id,
        workout_day_id: dayId,
        entries,
        rpe,
        note,
        status: "completed",
      })
      .select("id")
      .maybeSingle(),
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
      return { error: await tErr("client.alreadyLogged") };
    }
    return { error: await dbErr(error, "actions") };
  }

  // Gamifikácia: osobné rekordy a odznaky z tohto tréningu. Nikdy nezhodí zápis — chyby
  // syncGamification ticho pohltí (viď lib/gamification/server.ts). Oslava sa ukáže cez
  // revalidáciu layoutu nižšie (AchievementHost číta nezobrazené úspechy).
  const report = emptyReport();
  await syncGamification(supabase, { clientId: client.id, activePlanId: client.active_plan_id }, "workout", {
    logId: (inserted?.id as string | undefined) ?? null,
    report,
  });
  // „Tréning v číslach“ (v2): súhrn z toho, čo server sám zapísal a vyhodnotil; čas štartu je jediné číslo od klienta
  // (overí sa: 1–360 min). Krátkodobá cookie → layout portálu ho ukáže raz (FinishSummaryHost).
  const startedAt = Number(formData.get("started_at"));
  await setFinishSummaryCookie(
    await buildFinishSummary(supabase, { clientId: client.id, entries, startedAtMs: startedAt > 0 ? startedAt : null, report, today: todayIso() }),
  );

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
  if (!input.logId) return { error: await tErr("client.missingLog") };

  let entries: IncomingExercise[] | null;
  try {
    entries = sanitizeEntries(JSON.parse(input.entries));
  } catch {
    entries = null;
  }
  if (entries === null) return { error: await tErr("client.invalidSetValue") };

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
    .select("id, client_id");
  if (error) return { error: await dbErr(error, "actions") };
  if (!data || data.length === 0) {
    return { error: await tErr("client.editWindow") };
  }

  // opravené hodnoty môžu rekord zmeniť alebo zrušiť — prepočítať rekordy tohto tréningu
  const { data: owner } = await supabase
    .from("clients")
    .select("id, active_plan_id")
    .eq("id", data[0].client_id as string)
    .maybeSingle();
  if (owner) await syncGamification(supabase, { clientId: owner.id, activePlanId: owner.active_plan_id }, "workout", { logId: input.logId });

  revalidatePath("/portal", "layout");
  // tréner vidí opravené hodnoty (a štítok "Upravené") v detaile tréningu
  revalidatePath("/dashboard", "layout");
  return ok;
}

type FoodForLog = {
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

/** Potravina pre zápis do denníka; údaje o porciách (0066) sa pred migráciou nedajú načítať — bez nich. */
async function loadFoodForLog(supabase: Awaited<ReturnType<typeof createClient>>, id: string): Promise<FoodForLog | null> {
  const base = "name, kcal_100g, protein_100g, carbs_100g, fat_100g, serving_g";
  const full = await supabase.from("foods").select(`${base}, unit_base, piece_g, package_g`).eq("id", id).maybeSingle();
  if (!full.error) return full.data as unknown as FoodForLog | null;
  const plain = await supabase.from("foods").select(base).eq("id", id).maybeSingle();
  return (plain.data as unknown as FoodForLog | null) ?? null;
}

/**
 * Porcia z formulára (portion_unit + portion_qty). Neplatná / chýbajúca → null (ostanú len gramy).
 * Ukladá sa len ako „ako to klient zadal“, makrá idú vždy z `grams`.
 */
function parsePortion(formData: FormData): { portion_unit: PortionUnit; portion_qty: number; portion_base: "g" | "ml" } | null {
  const unit = formData.get("portion_unit");
  const qty = Number(formData.get("portion_qty"));
  if (!isPortionUnit(unit) || !Number.isFinite(qty) || qty <= 0 || qty > MAX_PORTION_GRAMS) return null;
  return { portion_unit: unit, portion_qty: Math.round(qty * 100) / 100, portion_base: formData.get("portion_base") === "ml" ? "ml" : "g" };
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

  const foodId = (formData.get("food_id") as string | null) || null;
  const name = ((formData.get("food_name") as string | null) ?? "").trim();
  const slot = (formData.get("meal_slot") as string | null) ?? "";
  let grams = Number(formData.get("grams"));
  let portion = parsePortion(formData);

  if (!MEAL_SLOT_ORDER.includes(slot as (typeof MEAL_SLOT_ORDER)[number])) return { error: await tErr("client.chooseSlot") };
  if (!Number.isFinite(grams) || grams <= 0 || grams > 5000) return { error: await tErr("client.gramsRange") };

  // Zápis aj za iný deň (QA 2026-09-23) — rovnaký povolený rozsah ako zobrazenie.
  const today = todayBratislava();
  const eatenOnRaw = (formData.get("eaten_on") as string | null) || today;
  const eatenOn = validDiaryDate(eatenOnRaw, today);
  if (!eatenOn) return { error: await tErr("client.diaryRange", { days: DIARY_MAX_DAYS_BACK }) };

  // Vlastná potravina (custom=1): názov a kcal zadáva klient, žiadny food_id — povinné polia
  // overíme tu. Číselné hranice makier sa overujú nižšie pre každú cestu, kde makrá
  // pochádzajú z formulára (vlastná potravina aj snapshot z plánu/online).
  if (formData.get("custom") === "1") {
    if (!name || name.length > 120) return { error: await tErr("client.foodNameRequired") };
    if (((formData.get("kcal_100g") as string | null) ?? "").trim() === "") return { error: await tErr("client.kcalRequired") };
  }

  // Autoritatívne makrá z DB; fallback na snapshot z formulára.
  let macros = {
    kcal_100g: Number(formData.get("kcal_100g")) || 0,
    protein_100g: Number(formData.get("protein_100g")) || 0,
    carbs_100g: Number(formData.get("carbs_100g")) || 0,
    fat_100g: Number(formData.get("fat_100g")) || 0,
  };
  let foodName = name;

  // Klient a potravina sa nepotrebujú navzájom — oba dopyty naraz (predtým za sebou).
  const [clientId, food] = await Promise.all([
    currentClientId(supabase),
    foodId ? loadFoodForLog(supabase, foodId) : Promise.resolve(null),
  ]);
  if (!clientId) return { error: await tErr("client.notLinkedTrainer") };

  // Makrá z formulára (nenašla sa potravina v DB) — klientovi neveríme: konečné, nezáporné,
  // kcal <= 900 a spolu P+S+T <= 100 g na 100 g. Prázdne pole = 0 (snapshot bez makier).
  if (!food) {
    const vals = ["kcal_100g", "protein_100g", "carbs_100g", "fat_100g"].map((k) => {
      const raw = ((formData.get(k) as string | null) ?? "").trim();
      return raw === "" ? 0 : Number(raw);
    });
    if (vals.some((v) => !Number.isFinite(v) || v < 0)) return { error: await tErr("client.macrosNonNegative") };
    const [kcal, protein, carbs, fat] = vals;
    if (kcal > 900) return { error: await tErr("client.kcalMax") };
    if (protein + carbs + fat > 100) return { error: await tErr("client.macrosMax") };
  }

  if (food) {
    // Množstvo × jednotku prepočítame z hodnôt potraviny v DB (klient neurčuje gramy pre ks/porciu);
    // jednotka, ktorú potravina nemá, porciu zahodí a ostane zadaná gramáž.
    if (portion) {
      const g = portionGrams(portion.portion_unit, portion.portion_qty, {
        unitBase: food.unit_base === "ml" ? "ml" : "g",
        pieceGrams: food.piece_g == null ? null : Number(food.piece_g),
        servingGrams: food.serving_g == null ? null : Number(food.serving_g),
        packageGrams: food.package_g == null ? null : Number(food.package_g),
      });
      if (g !== null && g <= MAX_PORTION_GRAMS) {
        grams = g;
        portion.portion_base = food.unit_base === "ml" ? "ml" : "g";
      }
      else portion = null;
    }
    macros = {
      kcal_100g: food.kcal_100g,
      protein_100g: food.protein_100g,
      carbs_100g: food.carbs_100g,
      fat_100g: food.fat_100g,
    };
    foodName = food.name;
  }

  if (!foodName) return { error: await tErr("client.missingFoodName") };

  const row = {
    client_id: clientId,
    eaten_on: eatenOn,
    meal_slot: slot,
    food_id: foodId,
    food_name: foodName,
    grams,
    ...macros,
  };
  let { error } = await supabase.from("food_logs").insert(portion ? { ...row, ...portion } : row);
  // stĺpce portion_* vznikli až v 0066 — pred ňou sa zapíše len gramáž, zápis sa nesmie pokaziť
  if (error && portion && isMissingColumn(error)) ({ error } = await supabase.from("food_logs").insert(row));

  if (error) return { error: await dbErr(error, "actions") };

  // gamifikácia: séria dní so zápisom, týždeň s cieľom bielkovín — oslava (ak nejaká padla)
  // sa ukáže po obnovení layoutu portálu
  const fresh = await syncGamification(supabase, { clientId }, "food");
  if (fresh > 0) revalidatePath("/portal", "layout");
  revalidatePath("/portal/dennik");
  return ok;
}

/** Denník — zmena gramáže / jedla dňa zapísanej položky (RLS: food_logs_update_own_client, 0045). */
// Úprava aj odobratie: RLS (food_logs_update/delete_own_client) pustí len riadky
// vlastného klienta (tréner má na food_logs len čítanie), takže dohľadávanie
// klienta pred zápisom (sieťový auth.getUser + dopyt) bolo 2 round-tripy navyše.
export async function updateFoodLogAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient();

  const id = formData.get("entry_id") as string | null;
  const grams = Number(formData.get("grams"));
  if (!id) return { error: await tErr("client.missingRecordId") };
  if (!Number.isFinite(grams) || grams <= 0 || grams > 5000) return { error: await tErr("client.gramsRange") };

  // Bez platnej porcie (g, starý záznam) sa jednotka vynuluje — inak by „2 ks“ ostalo pri novej gramáži.
  const portion = parsePortion(formData);
  const update = (patch: Record<string, unknown>) =>
    supabase.from("food_logs").update(patch).eq("id", id).select("id").maybeSingle();
  let { data, error } = await update({ grams, ...(portion ?? { portion_unit: null, portion_qty: null, portion_base: null }) });
  // stĺpce portion_* vznikli až v 0066
  if (error && isMissingColumn(error)) ({ data, error } = await update({ grams }));
  if (error) return { error: await dbErr(error, "actions") };
  if (!data) return { error: await tErr("client.recordNotFound") };

  // zvýšená gramáž môže doplniť cieľ bielkovín dňa — odznak „týždeň bielkovín“
  const owner = await currentClientId(supabase);
  if (owner && (await syncGamification(supabase, { clientId: owner }, "food")) > 0) revalidatePath("/portal", "layout");
  revalidatePath("/portal/dennik");
  return ok;
}

/** Denník — odobrať záznam (RLS: food_logs_delete_own_client). */
export async function removeFoodLogAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient();

  const id = formData.get("entry_id") as string | null;
  if (!id) return { error: await tErr("client.missingRecordId") };

  const { data, error } = await supabase.from("food_logs").delete().eq("id", id).select("id");
  if (error) return { error: await dbErr(error, "actions") };
  if (!data || data.length === 0) return { error: await tErr("client.recordNotFound") };

  revalidatePath("/portal/dennik");
  return ok;
}

/** Chat — klient odošle správu trénerovi (RLS messages_insert, sender='client'). */
export async function sendClientMessageAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: await tErr("notSignedIn") };

  // Používateľ je už overený vyššie — currentClientId by sieťový auth.getUser() zopakoval.
  const clientId = await clientIdForUser(supabase, user.id);
  if (!clientId) return { error: await tErr("client.notLinkedTrainer") };

  const body = ((formData.get("body") as string | null) ?? "").trim();
  if (!body) return { error: await tErr("emptyMessage") };
  if (body.length > 4000) return { error: await tErr("messageTooLong") };

  const { error } = await supabase.from("messages").insert({
    client_id: clientId,
    sender: "client",
    sender_id: user.id,
    body,
  });
  if (error) return { error: await dbErr(error, "actions") };

  revalidatePath("/portal/chat");
  return ok;
}

/**
 * Chat — označí správy od trénera ako prečítané (volané pri otvorení / návrate na kartu).
 * Vlastný clients riadok + počet neprečítaných jedným dopytom; RPC aj revalidatePath
 * (re-render celej stránky) len keď je naozaj čo označiť. Session overuje lokálne
 * getUser (claims) — RPC si účastníka vlákna overí samo cez auth.uid() (0019).
 */
export async function markClientChatSeenAction(): Promise<void> {
  const {
    data: { user },
  } = await getUser();
  if (!user) return;
  const supabase = await createClient();
  const { data: client } = await supabase
    .from("clients")
    .select("id, messages(count)")
    .eq("user_id", user.id)
    .in("messages.sender", ["trainer", "system"])
    .is("messages.read_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const unread = (client?.messages as { count: number }[] | undefined)?.[0]?.count ?? 0;
  if (!client || unread === 0) return;
  const { error } = await supabase.rpc("mark_messages_read", { p_client_id: client.id });
  if (!error) revalidatePath("/portal", "layout");
}
