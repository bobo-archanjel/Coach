import { createClient } from "@/lib/supabase/server";
import { MEAL_SLOT_LABELS, MEAL_SLOT_ORDER, scaleFoodMacros, sumMacros, type MealSlot } from "@/lib/meals";
import type {
  CoachNote,
  DayCellState,
  ExerciseOption,
  LoggedExercise,
  LoggedExerciseView,
  LoggedSessionView,
  LoggedSetView,
  PlanSource,
  PortalAiChatData,
  PortalAiChatMessage,
  PortalAiChatResult,
  PortalWeekResult,
  PortalChatData,
  PortalChatMessage,
  PortalChatResult,
  PortalData,
  PortalDiaryData,
  PortalDiaryEntry,
  PortalDiaryGroup,
  PortalDiaryResult,
  PortalExercise,
  PortalFoodOption,
  PortalMealDay,
  PortalMealEntry,
  PortalMealGroup,
  PortalNutritionData,
  PortalNutritionResult,
  PortalPlan,
  PortalResult,
  PortalTrainingDay,
  PortalTrainingResult,
  StreakDayState,
  TodaySession,
  WeekDay,
  WeekView,
} from "./types";

const TZ = "Europe/Bratislava";
const WEEKDAY_LABELS = ["Po", "Ut", "St", "Št", "Pi", "So", "Ne"]; // index 0 = pondelok
const MONTH_ABBR = ["jan", "feb", "mar", "apr", "máj", "jún", "júl", "aug", "sep", "okt", "nov", "dec"];
const HISTORY_DAYS = 12;
/** Ako ďaleko dozadu sa dá listovať v páse „Tento týždeň" (≈ 1 rok). */
const WEEK_HISTORY_FLOOR_DAYS = 371;

type DayRow = {
  id: string;
  day_number: number;
  name: string;
  exercises: unknown;
};

/** Tvar cviku v workout_days.exercises (JSONB), viď app/dashboard/treningy/actions.ts. */
type ExerciseEntry = {
  entry_id?: string;
  exercise_id?: string | null;
  exercise_name?: string;
  sets?: number | null;
  reps?: string | null;
  load_kg?: number | null;
  tempo?: string | null;
  rest_seconds?: number | null;
};

/** Aktuálny deň v zóne Europe/Bratislava, nezávislý od zóny servera. */
function todayInTz() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const isoDate = `${get("year")}-${get("month")}-${get("day")}`;
  const hour = parseInt(get("hour"), 10) || 0;
  // Poludnie v UTC drží dátum stabilný pri posunoch o ±1 deň.
  const base = new Date(`${isoDate}T12:00:00Z`);
  return { isoDate, hour, base };
}

/** 1 = pondelok … 7 = nedeľa. */
function isoWeekday(d: Date): number {
  const js = d.getUTCDay(); // 0 = nedeľa
  return js === 0 ? 7 : js;
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000);
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Pondelok týždňa, do ktorého spadá `d` (UTC-poludnie základ z todayInTz/parse). */
function mondayOf(d: Date): Date {
  return addDays(d, -(isoWeekday(d) - 1));
}

/** „18. – 24. aug" (jeden mesiac) alebo „30. aug – 5. sep" (na prelome). */
function weekRangeLabel(monday: Date): string {
  const sunday = addDays(monday, 6);
  const m1 = MONTH_ABBR[monday.getUTCMonth()];
  const m2 = MONTH_ABBR[sunday.getUTCMonth()];
  const d1 = monday.getUTCDate();
  const d2 = sunday.getUTCDate();
  return m1 === m2 ? `${d1}. – ${d2}. ${m2}` : `${d1}. ${m1} – ${d2}. ${m2}`;
}

function firstNameOf(full: string | null | undefined): string | null {
  const n = (full ?? "").trim();
  if (!n) return null;
  return n.split(/\s+/)[0];
}

function restLabel(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return "";
  if (seconds >= 120 && seconds % 60 === 0) return `${seconds / 60} min`;
  return `${seconds} s`;
}

function scheme(sets: number | null | undefined, reps: string | null | undefined): string {
  if (sets && reps) return `${sets} × ${reps}`;
  if (reps) return reps;
  if (sets) return `${sets} série`;
  return "";
}

function toPortalExercise(entry: ExerciseEntry, position: number): PortalExercise {
  return {
    idx: String(position + 1),
    name: (entry.exercise_name ?? "Cvik").trim(),
    scheme: scheme(entry.sets, entry.reps),
    load: entry.load_kg != null ? `${entry.load_kg} kg` : "vlastná váha",
    rest: restLabel(entry.rest_seconds),
    tempo: entry.tempo ?? undefined,
    entryId: entry.entry_id ?? null,
    plannedSets: entry.sets && entry.sets > 0 ? entry.sets : 1,
    plannedReps: entry.reps ?? null,
    exerciseId: entry.exercise_id ?? null,
    loadKg: entry.load_kg ?? null,
    restSeconds: entry.rest_seconds ?? null,
  };
}

function parseEntries(raw: unknown): ExerciseEntry[] {
  return Array.isArray(raw) ? (raw as ExerciseEntry[]) : [];
}

/**
 * Prečíta workout_logs.entries do pohľadu histórie. Odolné voči obom tvarom, ktoré
 * v DB reálne existujú: nové logy `{entryId, name, sets}` (finishWorkoutAction) aj
 * staršie / seed logy bez zápisu (`[]`) alebo v snake tvare `{exercise_name}`.
 */
function parseLoggedExercises(raw: unknown): LoggedExerciseView[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((e): LoggedExerciseView | null => {
      if (!e || typeof e !== "object") return null;
      const x = e as Record<string, unknown>;
      const rawName =
        (typeof x.name === "string" && x.name) || (typeof x.exercise_name === "string" && x.exercise_name) || "";
      const name = rawName.trim() || "Cvik";
      const setsRaw = Array.isArray(x.sets) ? x.sets : [];
      const sets = setsRaw
        .map((s): LoggedSetView | null => {
          if (!s || typeof s !== "object") return null;
          const r = s as Record<string, unknown>;
          const reps = typeof r.reps === "number" && Number.isFinite(r.reps) ? r.reps : null;
          const weight = typeof r.weight === "number" && Number.isFinite(r.weight) ? r.weight : null;
          if (reps === null && weight === null) return null;
          return { reps, weight };
        })
        .filter((s): s is LoggedSetView => s !== null);
      return { name, sets };
    })
    .filter((e): e is LoggedExerciseView => e !== null);
}

/**
 * Zostaví jeden týždeň pre pás „Tento týždeň" — Po–Ne, s odcvičenými tréningmi
 * v každom dni (na klik v UI, viď app/portal/WeekHistory.tsx). Počíta so **všetkými**
 * plánmi klienta (od trénera aj vlastnými), nie len s aktívnym. Žiadna migrácia —
 * číta workout_logs + workout_days, oboje má klient cez RLS z 0002/0003.
 */
async function buildWeekView(
  supabase: Awaited<ReturnType<typeof createClient>>,
  clientId: string,
  monday: Date,
  todayIso: string,
): Promise<WeekView> {
  const startIso = iso(monday);
  const endIso = iso(addDays(monday, 6));

  const { data: logRows } = await supabase
    .from("workout_logs")
    .select("workout_day_id, performed_on, entries")
    .eq("client_id", clientId)
    .gte("performed_on", startIso)
    .lte("performed_on", endIso)
    .order("performed_on", { ascending: true });

  const logs = logRows ?? [];

  // Názvy dní + plánov len pre tie workout_day_id, ktoré v tomto týždni padli.
  const dayIds = [...new Set(logs.map((l) => l.workout_day_id).filter(Boolean))] as string[];
  const dayMeta = new Map<string, { dayName: string; planName: string | null }>();
  if (dayIds.length > 0) {
    const { data: dayRows } = await supabase
      .from("workout_days")
      .select("id, name, workout_plans(name)")
      .in("id", dayIds);
    for (const d of dayRows ?? []) {
      const planName = (d.workout_plans as unknown as { name: string } | null)?.name ?? null;
      dayMeta.set(d.id as string, { dayName: (d.name as string)?.trim() || "Tréning", planName });
    }
  }

  const byDate = new Map<string, LoggedSessionView[]>();
  for (const l of logs) {
    const meta = dayMeta.get(l.workout_day_id as string);
    const list = byDate.get(l.performed_on as string) ?? [];
    list.push({
      dayName: meta?.dayName ?? "Tréning",
      planName: meta?.planName ?? null,
      exercises: parseLoggedExercises(l.entries),
    });
    byDate.set(l.performed_on as string, list);
  }

  const days: WeekDay[] = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(monday, i);
    const dISO = iso(date);
    const sessions = byDate.get(dISO) ?? [];
    const state: DayCellState =
      dISO === todayIso ? "today" : sessions.length > 0 ? "done" : dISO > todayIso ? "future" : "none";
    return { label: WEEKDAY_LABELS[i], dayNum: date.getUTCDate(), iso: dISO, state, sessions };
  });

  const currentMondayIso = iso(mondayOf(new Date(`${todayIso}T12:00:00Z`)));
  return {
    mondayIso: startIso,
    rangeLabel: weekRangeLabel(monday),
    isCurrentWeek: startIso === currentMondayIso,
    days,
  };
}

/**
 * Načíta domovskú obrazovku portálu ("Dnes") pre prihláseného klienta.
 * Auth guard (session + rola) rieši app/portal/layout.tsx — sem prídeme s klientom.
 *
 * Schéma: workout_plans / workout_days z 0002_workout_builder (cviky ako JSONB
 * v workout_days.exercises), workout_logs / coach_notes / workout_days.weekday z 0003.
 * "Aktívny" plán = najnovší plán klienta.
 */
export async function getPortalData(): Promise<PortalResult> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { state: "error", message: "Session vypršala." };

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle();

    const { data: client, error: clientErr } = await supabase
      .from("clients")
      .select("id, full_name, active_plan_id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (clientErr) return { state: "error", message: clientErr.message };

    const firstName = firstNameOf(client?.full_name) ?? firstNameOf(profile?.full_name);
    if (!client) return { state: "unlinked", firstName };

    // "Aktívny" plán = clients.active_plan_id (klient si ho volí v sekcii Tréning),
    // inak najnovší plán (spätne kompatibilné). Platí pre plán od trénera aj vlastný.
    let plan: { id: string; name: string } | null = null;
    if (client.active_plan_id) {
      const { data } = await supabase
        .from("workout_plans")
        .select("id, name")
        .eq("id", client.active_plan_id)
        .eq("client_id", client.id)
        .maybeSingle();
      plan = data ?? null;
    }
    if (!plan) {
      const { data, error: planErr } = await supabase
        .from("workout_plans")
        .select("id, name")
        .eq("client_id", client.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (planErr) return { state: "error", message: planErr.message };
      plan = data ?? null;
    }
    if (!plan) return { state: "no_plan", firstName: firstName ?? "" };

    const { data: dayRows, error: daysErr } = await supabase
      .from("workout_days")
      .select("id, day_number, name, exercises")
      .eq("plan_id", plan.id)
      .order("day_number", { ascending: true });

    if (daysErr) return { state: "error", message: daysErr.message };

    const days = (dayRows ?? []) as DayRow[];
    if (days.length === 0) return { state: "no_plan", firstName: firstName ?? "" };

    const { isoDate, hour, base } = todayInTz();

    const dayIds = days.map((d) => d.id);
    const { data: logRows, error: logErr } = await supabase
      .from("workout_logs")
      .select("workout_day_id, performed_on, entries")
      .eq("client_id", client.id)
      .in("workout_day_id", dayIds)
      .order("performed_on", { ascending: false });

    if (logErr) return { state: "error", message: logErr.message };

    const logs = logRows ?? [];
    const loggedDates = new Set(logs.map((l) => l.performed_on));
    const doneToday = loggedDates.has(isoDate);

    // ---------- ktorý deň zobraziť ----------
    // Dokončené dni, nie celý plán naraz: klient odklikáva jednotlivé dni tréningu
    // (workout_logs má riadok na deň, nie na plán). Kým je dnešný deň hotový, karta
    // zostáva na NOM — nesmie ticho preskočiť na ďalší v poradí len preto, že sa
    // deň zmenil vo výpočte (predtým sa "ďalší" počítal z posledného logu vôbec,
    // takže hneď po dokončení ukazoval iný deň než ten, čo sa práve odcvičil —
    // vyzeralo to, akoby sa "zaškrtol" celý tréning namiesto jedného dňa). Rotácia
    // na ďalší nedokončený deň nastane až zajtra, keď dnešok ešte nemá záznam.
    const todaysLog = doneToday ? (logs.find((l) => l.performed_on === isoDate) ?? null) : null;
    let targetDay: DayRow;
    if (todaysLog) {
      targetDay = days.find((d) => d.id === todaysLog.workout_day_id) ?? days[0];
    } else {
      // Klient si sám vyberá kedy cvičí — deň nie je pripnutý na konkrétny deň
      // v týždni. "Ďalší tréning" = deň nasledujúci po naposledy odcvičenom podľa
      // poradia v pláne (day_number), cyklicky. Bez histórie = prvý deň plánu.
      const mostRecent = logs[0] ?? null;
      const lastIdx = mostRecent ? days.findIndex((d) => d.id === mostRecent.workout_day_id) : -1;
      targetDay = lastIdx === -1 ? days[0] : days[(lastIdx + 1) % days.length];
    }

    const exList = parseEntries(targetDay.exercises).map((e, i) => toPortalExercise(e, i));
    // Po dokončení sa namiesto plánovaných cvikov ukazuje to, čo klient skutočne
    // zadal (Fáza B) — "vrátiť sa do tréningu" má zmysel len ak vidí svoje dáta,
    // nie znovu ten istý plán, ktorý mu ešte len je pripravený. Bez zadaných
    // hodnôt (len odklikol, entries: []) ostáva fallback na plánované cviky.
    const loggedExercises: LoggedExercise[] | null =
      todaysLog && Array.isArray(todaysLog.entries) && todaysLog.entries.length > 0
        ? (todaysLog.entries as LoggedExercise[])
        : null;
    const session: TodaySession = {
      kind: doneToday ? "done" : "training",
      title: targetDay.name,
      // Builder nemá "focus" dňa — pod názov dňa dáme aspoň názov plánu ako kontext.
      focus: plan.name ?? "",
      durationLabel: "",
      exercises: exList,
      loggedExercises,
      completedCount: doneToday ? exList.length : 0,
      dayId: targetDay.id,
    };

    // ---------- týždenný pás (Po–Ne) — prehľad aktivity + história na klik (WeekHistory) ----------
    const week = await buildWeekView(supabase, client.id, mondayOf(base), isoDate);

    // ---------- história (posledných 12 dní pred dneškom) ----------
    const streakHistory: StreakDayState[] = [];
    for (let i = HISTORY_DAYS; i >= 1; i--) {
      const date = addDays(base, -i);
      streakHistory.push(loggedDates.has(iso(date)) ? "done" : "rest");
    }

    const totalSessions = logs.length;

    // ---------- odkaz trénera ----------
    let coachNote: CoachNote | null = null;
    const { data: note } = await supabase
      .from("coach_notes")
      .select("body, trainer_id")
      .eq("client_id", client.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (note?.body) {
      let trainerName = "tréner";
      if (note.trainer_id) {
        const { data: trainer } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", note.trainer_id)
          .maybeSingle();
        trainerName = firstNameOf(trainer?.full_name) ?? trainerName;
      }
      coachNote = {
        trainer: trainerName,
        initials: (trainerName[0] ?? "T").toUpperCase(),
        text: note.body,
      };
    }

    const data: PortalData = {
      clientFirstName: firstName ?? "",
      today: isoDate,
      hour,
      coachNote,
      session,
      week,
      totalSessions,
      streakHistory,
    };

    return { state: "ok", data };
  } catch (err) {
    return {
      state: "error",
      message: err instanceof Error ? err.message : "Neznáma chyba pri načítaní.",
    };
  }
}

/** Nájde klienta prepojeného s prihláseným používateľom (rovnaká logika ako v getPortalData). */
async function getLinkedClient(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", userId).maybeSingle();
  const { data: client, error } = await supabase
    .from("clients")
    .select("id, full_name, active_plan_id, trainer_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const firstName = firstNameOf(client?.full_name) ?? firstNameOf(profile?.full_name);
  return { client, firstName, error };
}

/**
 * Jeden týždeň pre pás „Tento týždeň" — volané zo servera pri listovaní dozadu
 * (app/portal/actions.ts → WeekHistory). `mondayIso` sa normalizuje na pondelok,
 * budúce týždne sa zrezávajú na aktuálny, dozadu je strop ≈ 1 rok.
 */
export async function getPortalWeek(mondayIso: string): Promise<PortalWeekResult> {
  try {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(mondayIso)) return { state: "error", message: "Neplatný týždeň." };
    const parsed = new Date(`${mondayIso}T12:00:00Z`);
    if (Number.isNaN(parsed.getTime())) return { state: "error", message: "Neplatný týždeň." };

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { state: "error", message: "Session vypršala." };

    const { client, error } = await getLinkedClient(supabase, user.id);
    if (error) return { state: "error", message: error.message };
    if (!client) return { state: "error", message: "Účet ešte nie je prepojený." };

    const { isoDate, base } = todayInTz();
    const currentMonday = mondayOf(base);
    const floor = addDays(currentMonday, -WEEK_HISTORY_FLOOR_DAYS);

    let monday = mondayOf(parsed);
    if (iso(monday) > iso(currentMonday)) monday = currentMonday;
    if (iso(monday) < iso(floor)) monday = floor;

    const week = await buildWeekView(supabase, client.id, monday, isoDate);
    return { state: "ok", week };
  } catch (err) {
    return { state: "error", message: err instanceof Error ? err.message : "Neznáma chyba pri načítaní." };
  }
}

/**
 * Zoznam tréningových plánov klienta pre sekciu Tréning — plány od trénera aj
 * vlastné (`workout_plans.trainer_id is null` ⇔ vytvoril klient). Každý plán nesie
 * všetky svoje dni; "aktívny" (riadi kartu Dnes) je `clients.active_plan_id`, inak
 * najnovší. Vracia aj globálnu knižnicu cvikov pre builder vlastného tréningu.
 * Klient bez `clients` riadku (bez trénera, ešte nič nevytvoril) → prázdny zoznam,
 * builder ostáva dostupný (self riadok vznikne pri prvom uložení).
 */
export async function getPortalTraining(): Promise<PortalTrainingResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { state: "error", message: "Session vypršala." };

    const { data: libRows, error: libErr } = await supabase
      .from("exercises")
      .select("id, name, name_sk, muscle_group, image_url")
      .is("trainer_id", null)
      .order("name", { ascending: true });
    if (libErr) return { state: "error", message: libErr.message };
    const exerciseLibrary: ExerciseOption[] = (libRows ?? []).map((e) => ({
      id: e.id,
      name: e.name,
      nameSk: e.name_sk ?? null,
      muscleGroup: e.muscle_group ?? null,
      imageUrl: Array.isArray(e.image_url) && e.image_url.length > 0 ? e.image_url[0] : null,
    }));

    const { client, error: clientErr } = await getLinkedClient(supabase, user.id);
    if (clientErr) return { state: "error", message: clientErr.message };

    if (!client) {
      return { state: "ok", data: { plans: [], activePlanId: null, exerciseLibrary } };
    }

    const { data: planRows, error: planErr } = await supabase
      .from("workout_plans")
      .select("id, name, trainer_id, created_at")
      .eq("client_id", client.id)
      .order("created_at", { ascending: true });
    if (planErr) return { state: "error", message: planErr.message };

    const planList = planRows ?? [];
    const newestId = planList.length > 0 ? planList[planList.length - 1].id : null;
    const activePlanId =
      client.active_plan_id && planList.some((p) => p.id === client.active_plan_id)
        ? client.active_plan_id
        : newestId;

    let plans: PortalPlan[] = [];
    if (planList.length > 0) {
      const { data: dayRows, error: daysErr } = await supabase
        .from("workout_days")
        .select("id, plan_id, name, exercises, day_number")
        .in(
          "plan_id",
          planList.map((p) => p.id),
        )
        .order("day_number", { ascending: true });
      if (daysErr) return { state: "error", message: daysErr.message };

      const daysByPlan = new Map<string, PortalTrainingDay[]>();
      for (const d of (dayRows ?? []) as (DayRow & { plan_id: string })[]) {
        const list = daysByPlan.get(d.plan_id) ?? [];
        list.push({
          id: d.id,
          name: d.name,
          exercises: parseEntries(d.exercises).map((e, i) => toPortalExercise(e, i)),
        });
        daysByPlan.set(d.plan_id, list);
      }

      plans = planList.map((p) => ({
        id: p.id,
        name: p.name,
        source: (p.trainer_id ? "trainer" : "client") as PlanSource,
        isActive: p.id === activePlanId,
        days: daysByPlan.get(p.id) ?? [],
      }));
    }

    return { state: "ok", data: { plans, activePlanId, exerciseLibrary } };
  } catch (err) {
    return { state: "error", message: err instanceof Error ? err.message : "Neznáma chyba pri načítaní." };
  }
}

/** Tvar položky v meal_days.meals (JSONB), viď app/dashboard/vyziva/jedalnicek/actions.ts. */
type MealEntryRow = {
  entry_id?: string;
  food_name?: string;
  meal_slot?: MealSlot;
  grams?: number;
  kcal_100g?: number;
  protein_100g?: number;
  carbs_100g?: number;
  fat_100g?: number;
};

/**
 * Makro cieľ (BMR/TDEE/makrá) a najnovší jedálniček klienta — pre kartu Strava.
 * Obe časti sú nezávislé (klient môže mať jedno bez druhého), preto jediný "no_plan"
 * stav nedáva zmysel — každá časť má vlastný empty-state priamo v UI.
 */
export async function getPortalNutrition(): Promise<PortalNutritionResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { state: "error", message: "Session vypršala." };

    const { client, firstName, error: clientErr } = await getLinkedClient(supabase, user.id);
    if (clientErr) return { state: "error", message: clientErr.message };
    if (!client) return { state: "unlinked", firstName };

    const [{ data: profile, error: profileErr }, { data: plan, error: planErr }] = await Promise.all([
      supabase
        .from("nutrition_profiles")
        .select("bmr, tdee, calories_target, protein_g, carbs_g, fat_g")
        .eq("client_id", client.id)
        .maybeSingle(),
      supabase
        .from("meal_plans")
        .select("id, name")
        .eq("client_id", client.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (profileErr) return { state: "error", message: profileErr.message };
    if (planErr) return { state: "error", message: planErr.message };

    const macroGoal = profile
      ? {
          bmr: profile.bmr,
          tdee: profile.tdee,
          caloriesTarget: profile.calories_target,
          proteinG: profile.protein_g,
          carbsG: profile.carbs_g,
          fatG: profile.fat_g,
        }
      : null;

    let mealPlanName: string | null = null;
    let mealDays: PortalMealDay[] = [];

    if (plan) {
      mealPlanName = plan.name;
      const { data: dayRows, error: daysErr } = await supabase
        .from("meal_days")
        .select("id, name, meals")
        .eq("plan_id", plan.id)
        .order("day_number", { ascending: true });
      if (daysErr) return { state: "error", message: daysErr.message };

      mealDays = (dayRows ?? []).map((d) => {
        const entries = (Array.isArray(d.meals) ? d.meals : []) as MealEntryRow[];
        const scaled = entries.map((e) => ({
          entry: e,
          macros: scaleFoodMacros(
            {
              kcal_100g: e.kcal_100g ?? 0,
              protein_100g: e.protein_100g ?? 0,
              carbs_100g: e.carbs_100g ?? 0,
              fat_100g: e.fat_100g ?? 0,
            },
            e.grams ?? 0,
          ),
        }));

        const groups: PortalMealGroup[] = MEAL_SLOT_ORDER.map((slot) => {
          const items = scaled.filter(({ entry }) => entry.meal_slot === slot);
          const mealEntries: PortalMealEntry[] = items.map(({ entry, macros }) => ({
            name: entry.food_name ?? "Potravina",
            grams: entry.grams ?? 0,
            kcal: macros.kcal,
            proteinG: macros.proteinG,
            carbsG: macros.carbsG,
            fatG: macros.fatG,
          }));
          return { slotLabel: MEAL_SLOT_LABELS[slot], entries: mealEntries };
        }).filter((g) => g.entries.length > 0);

        const totalKcal = sumMacros(scaled.map(({ macros }) => macros)).kcal;

        return { id: d.id, name: d.name, groups, totalKcal };
      });
    }

    const data: PortalNutritionData = { macroGoal, mealPlanName, mealDays };
    return { state: "ok", data };
  } catch (err) {
    return { state: "error", message: err instanceof Error ? err.message : "Neznáma chyba pri načítaní." };
  }
}

type FoodLogRow = {
  id: string;
  meal_slot: MealSlot;
  food_name: string;
  grams: number;
  kcal_100g: number;
  protein_100g: number;
  carbs_100g: number;
  fat_100g: number;
};

type FoodRow = {
  id: string;
  name: string;
  kcal_100g: number;
  protein_100g: number;
  carbs_100g: number;
  fat_100g: number;
};

/**
 * Denník — čo klient dnes zjedol, oproti makro cieľu. Plus knižnica potravín
 * (globálna + trénerova) na vyhľadávanie a položky z najnovšieho jedálnička na
 * rýchle pridanie. Zápis: app/portal/actions.ts (addFoodLogAction / removeFoodLogAction).
 */
export async function getPortalFoodDiary(): Promise<PortalDiaryResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { state: "error", message: "Session vypršala." };

    const { client, firstName, error: clientErr } = await getLinkedClient(supabase, user.id);
    if (clientErr) return { state: "error", message: clientErr.message };
    if (!client) return { state: "unlinked", firstName };

    const { isoDate, hour } = todayInTz();

    const [
      { data: profile, error: profileErr },
      { data: logRows, error: logErr },
      { data: foodRows, error: foodErr },
      { data: plan, error: planErr },
    ] = await Promise.all([
      supabase
        .from("nutrition_profiles")
        .select("bmr, tdee, calories_target, protein_g, carbs_g, fat_g")
        .eq("client_id", client.id)
        .maybeSingle(),
      supabase
        .from("food_logs")
        .select("id, meal_slot, food_name, grams, kcal_100g, protein_100g, carbs_100g, fat_100g")
        .eq("client_id", client.id)
        .eq("eaten_on", isoDate)
        .order("created_at", { ascending: true }),
      supabase
        .from("foods")
        .select("id, name, kcal_100g, protein_100g, carbs_100g, fat_100g")
        .order("name", { ascending: true }),
      supabase
        .from("meal_plans")
        .select("id")
        .eq("client_id", client.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (profileErr) return { state: "error", message: profileErr.message };
    if (logErr) return { state: "error", message: logErr.message };
    if (foodErr) return { state: "error", message: foodErr.message };
    if (planErr) return { state: "error", message: planErr.message };

    const goal = profile
      ? {
          bmr: profile.bmr,
          tdee: profile.tdee,
          caloriesTarget: profile.calories_target,
          proteinG: profile.protein_g,
          carbsG: profile.carbs_g,
          fatG: profile.fat_g,
        }
      : null;

    // ---------- dnešné záznamy → skupiny podľa jedla dňa + súčty ----------
    const scaled = ((logRows ?? []) as FoodLogRow[]).map((r) => ({
      row: r,
      macros: scaleFoodMacros(
        {
          kcal_100g: r.kcal_100g,
          protein_100g: r.protein_100g,
          carbs_100g: r.carbs_100g,
          fat_100g: r.fat_100g,
        },
        r.grams,
      ),
    }));

    const groups: PortalDiaryGroup[] = MEAL_SLOT_ORDER.map((slot) => {
      const items = scaled.filter(({ row }) => row.meal_slot === slot);
      const entries: PortalDiaryEntry[] = items.map(({ row, macros }) => ({
        id: row.id,
        slot,
        name: row.food_name,
        grams: row.grams,
        kcal: macros.kcal,
        proteinG: macros.proteinG,
        carbsG: macros.carbsG,
        fatG: macros.fatG,
      }));
      return {
        slot,
        slotLabel: MEAL_SLOT_LABELS[slot],
        entries,
        kcal: sumMacros(items.map(({ macros }) => macros)).kcal,
      };
    }).filter((g) => g.entries.length > 0);

    const totals = sumMacros(scaled.map(({ macros }) => macros));

    // ---------- knižnica potravín ----------
    const library: PortalFoodOption[] = ((foodRows ?? []) as FoodRow[]).map((f) => ({
      foodId: f.id,
      name: f.name,
      kcal100g: f.kcal_100g,
      protein100g: f.protein_100g,
      carbs100g: f.carbs_100g,
      fat100g: f.fat_100g,
    }));

    // ---------- položky z trénerovho jedálnička na rýchle pridanie ----------
    const planFoods: PortalFoodOption[] = [];
    if (plan) {
      const { data: dayRows } = await supabase
        .from("meal_days")
        .select("meals")
        .eq("plan_id", plan.id)
        .order("day_number", { ascending: true });

      const seen = new Set<string>();
      for (const day of dayRows ?? []) {
        const entries = (Array.isArray(day.meals) ? day.meals : []) as MealEntryRow[];
        for (const e of entries) {
          const key = `${e.food_name ?? ""}|${e.meal_slot ?? ""}`;
          if (!e.food_name || seen.has(key)) continue;
          seen.add(key);
          planFoods.push({
            foodId: null,
            name: e.food_name,
            kcal100g: e.kcal_100g ?? 0,
            protein100g: e.protein_100g ?? 0,
            carbs100g: e.carbs_100g ?? 0,
            fat100g: e.fat_100g ?? 0,
            plannedGrams: e.grams ?? 100,
            plannedSlot: e.meal_slot,
          });
        }
      }
    }

    const data: PortalDiaryData = {
      today: isoDate,
      hour,
      goal,
      groups,
      totals,
      planFoods,
      library,
    };
    return { state: "ok", data };
  } catch (err) {
    return { state: "error", message: err instanceof Error ? err.message : "Neznáma chyba pri načítaní." };
  }
}

/**
 * Chat klienta s trénerom — jedno vlákno na klienta. Pri načítaní označí správy
 * od trénera ako prečítané (RPC mark_messages_read). Refresh-based: ChatThread
 * polluje router.refresh(), Server Actions revalidujú /portal/chat.
 */
export async function getPortalChat(): Promise<PortalChatResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { state: "error", message: "Session vypršala." };

    const { client, firstName, error: clientErr } = await getLinkedClient(supabase, user.id);
    if (clientErr) return { state: "error", message: clientErr.message };
    if (!client) return { state: "unlinked", firstName };

    // Označenie prečítaného rieši markClientChatSeenAction (mount / focus), nie render.
    const [{ data: rows, error: msgErr }, { data: cRow }] = await Promise.all([
      supabase
        .from("messages")
        .select("id, sender, body, created_at")
        .eq("client_id", client.id)
        .order("created_at", { ascending: true })
        .limit(300),
      supabase.from("clients").select("trainer_id").eq("id", client.id).maybeSingle(),
    ]);

    if (msgErr) return { state: "error", message: msgErr.message };

    const messages: PortalChatMessage[] = (rows ?? []).map((m) => ({
      id: m.id,
      sender: m.sender as "trainer" | "client",
      body: m.body,
      createdAt: m.created_at,
    }));

    let trainerName = "tréner";
    if (cRow?.trainer_id) {
      const { data: t } = await supabase.from("profiles").select("full_name").eq("id", cRow.trainer_id).maybeSingle();
      trainerName = firstNameOf(t?.full_name) ?? "tréner";
    }

    const data: PortalChatData = { messages, trainerName };
    return { state: "ok", data };
  } catch (err) {
    return { state: "error", message: err instanceof Error ? err.message : "Neznáma chyba pri načítaní." };
  }
}

/**
 * AI Kouč (AI blok, Krok 4b) — história AI chatu klienta. Dostupné len klientom
 * s prideleným trénerom (self-klienti "no_trainer", dohodnuté vopred — bez
 * trénera by eskalácia pri zdravotnej téme nemala kam ísť). Konverzácia sa
 * lazy zakladá až pri prvej odoslanej správe (app/portal/ai-kouc/actions.ts),
 * takže tu jej neexistencia nie je chyba — len prázdny zoznam správ.
 */
export async function getPortalAiChat(): Promise<PortalAiChatResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { state: "error", message: "Session vypršala." };

    const { client, firstName, error: clientErr } = await getLinkedClient(supabase, user.id);
    if (clientErr) return { state: "error", message: clientErr.message };
    if (!client) return { state: "unlinked", firstName };
    if (!client.trainer_id) return { state: "no_trainer" };

    const { data: conv, error: convErr } = await supabase
      .from("ai_conversations")
      .select("id")
      .eq("client_id", client.id)
      .maybeSingle();
    if (convErr) return { state: "error", message: convErr.message };

    if (!conv) return { state: "ok", data: { messages: [] } satisfies PortalAiChatData };

    const { data: rows, error: msgErr } = await supabase
      .from("ai_messages")
      .select("id, role, content, escalated, created_at")
      .eq("conversation_id", conv.id)
      .order("created_at", { ascending: true })
      .limit(300);
    if (msgErr) return { state: "error", message: msgErr.message };

    const messages: PortalAiChatMessage[] = (rows ?? []).map((m) => ({
      id: m.id,
      role: m.role as "user" | "assistant",
      body: m.content,
      createdAt: m.created_at,
      escalated: m.escalated ?? false,
    }));

    const data: PortalAiChatData = { messages };
    return { state: "ok", data };
  } catch (err) {
    return { state: "error", message: err instanceof Error ? err.message : "Neznáma chyba pri načítaní." };
  }
}
