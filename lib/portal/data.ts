import { createClient } from "@/lib/supabase/server";
import type {
  CoachNote,
  DayCellState,
  PortalData,
  PortalExercise,
  PortalResult,
  StreakDayState,
  TodaySession,
  WeekDay,
} from "./types";

const TZ = "Europe/Bratislava";
const WEEKDAY_LABELS = ["Po", "Ut", "St", "Št", "Pi", "So", "Ne"]; // index 0 = pondelok
const HISTORY_DAYS = 12;
const STREAK_LOOKBACK_DAYS = 90;

type DayRow = {
  id: string;
  day_number: number;
  weekday: number | null;
  name: string;
  focus: string | null;
  duration_min: number | null;
};

type ExerciseRow = {
  day_id: string;
  position: number;
  label: string | null;
  name: string;
  sets: number | null;
  reps: string | null;
  load: string | null;
  rest_seconds: number | null;
  tempo: string | null;
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

/** "Deň C — Nohy" → "Deň C"; "Kardio" → "Kardio". */
function shortPlanLabel(name: string): string {
  return name.split(/\s[—–-]\s/)[0].trim() || name;
}

function firstNameOf(full: string | null | undefined): string | null {
  const n = (full ?? "").trim();
  if (!n) return null;
  return n.split(/\s+/)[0];
}

function restLabel(seconds: number | null): string {
  if (!seconds || seconds <= 0) return "";
  if (seconds >= 120 && seconds % 60 === 0) return `${seconds / 60} min`;
  return `${seconds} s`;
}

function scheme(sets: number | null, reps: string | null): string {
  if (sets && reps) return `${sets} × ${reps}`;
  if (reps) return reps;
  if (sets) return `${sets} série`;
  return "";
}

function toPortalExercise(row: ExerciseRow, fallbackIdx: number): PortalExercise {
  return {
    idx: (row.label ?? String(fallbackIdx)).trim(),
    name: row.name,
    scheme: scheme(row.sets, row.reps),
    load: (row.load ?? "").trim(),
    rest: restLabel(row.rest_seconds),
    tempo: row.tempo ?? undefined,
  };
}

/**
 * Načíta domovskú obrazovku portálu ("Dnes") pre prihláseného klienta.
 * Auth guard (session + rola) rieši app/portal/layout.tsx — sem prídeme s klientom.
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
      .select("id, full_name")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (clientErr) return { state: "error", message: clientErr.message };

    const firstName = firstNameOf(client?.full_name) ?? firstNameOf(profile?.full_name);
    if (!client) return { state: "unlinked", firstName };

    const { data: plan, error: planErr } = await supabase
      .from("workout_plans")
      .select("id, name")
      .eq("client_id", client.id)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (planErr) return { state: "error", message: planErr.message };
    if (!plan) return { state: "no_plan", firstName: firstName ?? "" };

    const { data: dayRows, error: daysErr } = await supabase
      .from("workout_days")
      .select("id, day_number, weekday, name, focus, duration_min")
      .eq("plan_id", plan.id)
      .order("day_number", { ascending: true });

    if (daysErr) return { state: "error", message: daysErr.message };

    const days = (dayRows ?? []) as DayRow[];
    if (days.length === 0) return { state: "no_plan", firstName: firstName ?? "" };

    const dayIds = days.map((d) => d.id);
    const { data: exRows, error: exErr } = await supabase
      .from("workout_exercises")
      .select("day_id, position, label, name, sets, reps, load, rest_seconds, tempo")
      .in("day_id", dayIds)
      .order("position", { ascending: true });

    if (exErr) return { state: "error", message: exErr.message };

    const exercisesByDay = new Map<string, ExerciseRow[]>();
    for (const row of (exRows ?? []) as ExerciseRow[]) {
      const list = exercisesByDay.get(row.day_id) ?? [];
      list.push(row);
      exercisesByDay.set(row.day_id, list);
    }

    const { isoDate, hour, base } = todayInTz();
    const todayWeekday = isoWeekday(base);
    const historyStart = iso(addDays(base, -STREAK_LOOKBACK_DAYS));

    const { data: logRows, error: logErr } = await supabase
      .from("workout_logs")
      .select("workout_day_id, performed_on")
      .eq("client_id", client.id)
      .gte("performed_on", historyStart)
      .order("performed_on", { ascending: false });

    if (logErr) return { state: "error", message: logErr.message };

    const logKeys = new Set(
      (logRows ?? []).map((l) => `${l.workout_day_id ?? "?"}|${l.performed_on}`),
    );
    const loggedDates = new Set((logRows ?? []).map((l) => l.performed_on));

    const dayByWeekday = new Map<number, DayRow>();
    for (const d of days) if (d.weekday) dayByWeekday.set(d.weekday, d);

    // ---------- dnešná session ----------
    const todayDay = dayByWeekday.get(todayWeekday) ?? null;
    const loggedToday = todayDay
      ? logKeys.has(`${todayDay.id}|${isoDate}`) || loggedDates.has(isoDate)
      : false;

    let session: TodaySession;
    if (!todayDay) {
      session = {
        kind: "rest",
        title: "Dnes máš voľno",
        focus: "",
        durationLabel: "",
        exercises: [],
        completedCount: 0,
      };
    } else {
      const exList = (exercisesByDay.get(todayDay.id) ?? []).map((r, i) =>
        toPortalExercise(r, i + 1),
      );
      session = {
        kind: loggedToday ? "done" : "training",
        title: todayDay.name,
        focus: todayDay.focus ?? "",
        durationLabel: todayDay.duration_min ? `~${todayDay.duration_min} min` : "",
        exercises: exList,
        completedCount: loggedToday ? exList.length : 0,
      };
    }

    // ---------- týždenný pás (Po–Ne aktuálneho týždňa) ----------
    const monday = addDays(base, -(todayWeekday - 1));
    const week: WeekDay[] = Array.from({ length: 7 }, (_, i) => {
      const date = addDays(monday, i);
      const wd = i + 1;
      const planDay = dayByWeekday.get(wd) ?? null;
      const dateStr = iso(date);

      let state: DayCellState;
      if (wd === todayWeekday) state = "today";
      else if (!planDay) state = "rest";
      else if (date < base) {
        const done = logKeys.has(`${planDay.id}|${dateStr}`) || loggedDates.has(dateStr);
        state = done ? "done" : "missed";
      } else state = "upcoming";

      return {
        label: WEEKDAY_LABELS[i],
        dayNum: date.getUTCDate(),
        state,
        plan: planDay ? shortPlanLabel(planDay.name) : "Voľno",
      };
    });

    // ---------- séria + história ----------
    let streakDays = 0;
    for (let i = 1; i <= STREAK_LOOKBACK_DAYS; i++) {
      const date = addDays(base, -i);
      const planDay = dayByWeekday.get(isoWeekday(date)) ?? null;
      if (!planDay) continue; // rest deň nereťaz nelomí
      const dateStr = iso(date);
      const done = logKeys.has(`${planDay.id}|${dateStr}`) || loggedDates.has(dateStr);
      if (done) streakDays++;
      else break;
    }
    if (session.kind === "done") streakDays++;

    const streakHistory: StreakDayState[] = [];
    for (let i = HISTORY_DAYS; i >= 1; i--) {
      const date = addDays(base, -i);
      const planDay = dayByWeekday.get(isoWeekday(date)) ?? null;
      if (!planDay) {
        streakHistory.push("rest");
        continue;
      }
      const dateStr = iso(date);
      const done = logKeys.has(`${planDay.id}|${dateStr}`) || loggedDates.has(dateStr);
      streakHistory.push(done ? "done" : "missed");
    }

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
      streakDays,
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
