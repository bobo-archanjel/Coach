// i18n-ignore-file: podklad pre AI model (interné dáta v prompte); jazyk odpovede určuje outputLanguageRule
// FitPilot — deterministický tréningový kontext pre AI Kouča (QA 2026-09-23:
// na "aký tréning mám dnes" odpovedal, že vidí len jedálniček — tréningové dáta
// sa mu vôbec neposielali). Rovnaký princíp ako macroContext.ts: výber plánu,
// "ďalší deň v poradí" aj históriu počíta kód, model dostane hotový text.
// Výber plánu a rotácia dní zodpovedajú getPortalData (lib/portal/data.ts), aby
// AI hovorila o tom istom dni, aký klient vidí na karte Dnes.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlanDayForSwap } from "./exerciseSwap";

const TZ = "Europe/Bratislava";
const RECENT_LOGS = 5;

type ExerciseEntry = {
  exercise_id?: string | null;
  exercise_name?: string | null;
  sets?: number | null;
  reps?: string | null;
  load_kg?: number | null;
};
type LoggedSet = { reps?: number | null; weight?: number | null };
type LoggedEntry = { name?: string; exercise_name?: string; sets?: LoggedSet[] };

function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}

function formatPlanned(e: ExerciseEntry): string {
  const name = (e.exercise_name ?? "Cvik").trim();
  const scheme = e.sets && e.reps ? ` ${e.sets}× ${e.reps}` : "";
  const load = e.load_kg ? ` @ ${e.load_kg} kg` : "";
  return `${name}${scheme}${load}`;
}

function formatLogged(e: LoggedEntry): string {
  const name = (e.name ?? e.exercise_name ?? "Cvik").trim();
  const sets = (e.sets ?? [])
    .map((s) => (s.weight != null ? `${s.reps ?? "?"}×${s.weight} kg` : `${s.reps ?? "?"} op.`))
    .join(", ");
  return sets ? `${name} (${sets})` : name;
}

export interface TrainingContextResult {
  /** textový blok do system promptu */
  block: string;
  /** cviky z aktuálneho plánu s reálnym exercise_id (feature/AIupgrade) — appka
   *  nimi vie overiť/vyriešiť, ktorý cvik AI v odpovedi označila markerom
   *  [CVIKY: id,...] (viď lib/ai/chat.ts), aby k nemu priložila detail s fotkami. */
  exercises: { id: string; name: string }[];
  /** dni aktuálneho plánu s ID a príznakom vlastného plánu — podklad na overenie výmeny
   *  cviku (marker [VYMENA: ...], viď lib/ai/exerciseSwap.ts). Prázdne, keď plán nie je. */
  days: PlanDayForSwap[];
}

/**
 * Vráti textový blok do system promptu + zoznam cvikov s ID. Nikdy nehádže —
 * pri chybe vráti vetu, ktorá AI povie, že tréningové dáta teraz nemá (a nech
 * si nič nevymýšľa).
 */
export async function getTrainingContextBlock(supabase: SupabaseClient, clientId: string): Promise<TrainingContextResult> {
  try {
    // Aktívny plán klienta (clients.active_plan_id), inak najnovší zverejnený — ako karta
    // Dnes. Klient, najnovší plán s dňami (embed) a logy v jednom kole; samostatný
    // dopyt na aktívny plán len keď je iný než najnovší. Predtým 3-4 dopyty za sebou.
    type PlanWithDays = { id: string; name: string; trainer_id: string | null; workout_days: { id: string; name: string; exercises: unknown }[] | null };
    const planSelect = "id, name, trainer_id, workout_days(id, name, exercises, day_number)";
    const [{ data: client }, { data: newest }, { data: logRows }] = await Promise.all([
      supabase.from("clients").select("active_plan_id").eq("id", clientId).maybeSingle(),
      supabase
        .from("workout_plans")
        .select(planSelect)
        .eq("client_id", clientId)
        .eq("published", true)
        .order("created_at", { ascending: false })
        .order("day_number", { referencedTable: "workout_days", ascending: true })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("workout_logs")
        .select("performed_on, workout_day_id, entries, workout_days(name)")
        .eq("client_id", clientId)
        .order("performed_on", { ascending: false })
        .limit(RECENT_LOGS),
    ]);

    let plan = (newest as PlanWithDays | null) ?? null;
    if (client?.active_plan_id && client.active_plan_id !== plan?.id) {
      const { data: active } = await supabase
        .from("workout_plans")
        .select(planSelect)
        .eq("id", client.active_plan_id)
        .eq("client_id", clientId)
        .eq("published", true)
        .order("day_number", { referencedTable: "workout_days", ascending: true })
        .maybeSingle();
      if (active) plan = active as PlanWithDays;
    }
    const dayRows = plan?.workout_days ?? [];

    const lines: string[] = [];
    const days = dayRows ?? [];
    // Cviky s exercise_id (vlastné cviky bez ID appka do zoznamu nedáva — nemajú
    // detail/fotky, nebolo by čo priložiť). Zoskupené podľa ID, nie podľa riadku,
    // aby sa rovnaký cvik vo viacerých dňoch neobjavil v zozname viackrát.
    const exerciseIndex = new Map<string, string>();
    const swapDays: PlanDayForSwap[] = [];
    // trainer_id null = plán si vytvoril klient sám (0010) → AI smie ponúknuť tlačidlo výmeny
    const ownPlan = plan != null && plan.trainer_id === null;

    if (!plan || days.length === 0) {
      lines.push(
        "Tréning: klient nemá aktívny tréningový plán. Ak sa pýta, čo má cvičiť, povedz mu, nech si plán vytvorí v sekcii Tréning alebo sa opýta trénera — konkrétny plán mu nevymýšľaj.",
      );
    } else {
      lines.push(
        `Aktívny tréningový plán klienta: „${plan.name}“ (${days.length} ${days.length === 1 ? "deň" : days.length <= 4 ? "dni" : "dní"}). ` +
          (ownPlan
            ? "Je to jeho VLASTNÝ plán — výmenu cviku mu appka vie spraviť tlačidlom (marker [VYMENA], pri dni je dayId)."
            : "Plán mu zostavil tréner — výmenu cviku len odporuč, marker [VYMENA] nepoužívaj, plán nemení."),
      );
      for (const d of days) {
        const exercises = Array.isArray(d.exercises) ? (d.exercises as ExerciseEntry[]) : [];
        lines.push(`- ${d.name}${ownPlan ? ` (dayId ${d.id})` : ""}: ${exercises.length > 0 ? exercises.map(formatPlanned).join("; ") : "bez cvikov"}`);
        const dayExercises: { id: string; name: string }[] = [];
        for (const e of exercises) {
          if (e.exercise_id && e.exercise_name) {
            exerciseIndex.set(e.exercise_id, e.exercise_name.trim());
            dayExercises.push({ id: e.exercise_id, name: e.exercise_name.trim() });
          }
        }
        swapDays.push({ id: d.id, name: d.name, own: ownPlan, exercises: dayExercises });
      }

      // Rotácia ako na karte Dnes: dnes odcvičený deň ostáva "dnešný", inak deň
      // po naposledy odcvičenom dni tohto plánu (cyklicky), bez histórie prvý deň.
      const today = todayIso();
      const planLogs = (logRows ?? []).filter((l) => days.some((d) => d.id === l.workout_day_id));
      const doneToday = planLogs.find((l) => l.performed_on === today);
      if (doneToday) {
        const day = days.find((d) => d.id === doneToday.workout_day_id);
        lines.push(
          `Dnes už klient odcvičil: ${day?.name ?? "tréning"}. Ďalší deň v poradí príde na rad pri jeho ďalšom tréningu — kedy cvičí, si klient vyberá sám (neposielaj ho za tým za trénerom).`,
        );
      } else {
        const lastIdx = planLogs[0] ? days.findIndex((d) => d.id === planLogs[0].workout_day_id) : -1;
        const next = lastIdx === -1 ? days[0] : days[(lastIdx + 1) % days.length];
        lines.push(`Ďalší tréning v poradí (klient si sám vyberá, kedy cvičí): ${next.name}.`);
      }
    }

    const logs = logRows ?? [];
    if (logs.length > 0) {
      lines.push("Posledné odcvičené tréningy (najnovšie prvé):");
      for (const l of logs) {
        const dayName = (l.workout_days as unknown as { name: string } | null)?.name ?? "Tréning";
        const entries = Array.isArray(l.entries) ? (l.entries as LoggedEntry[]) : [];
        lines.push(`- ${l.performed_on} ${dayName}${entries.length > 0 ? ": " + entries.map(formatLogged).join("; ") : " (bez zapísaných sérií)"}`);
      }
    } else {
      lines.push("Klient zatiaľ nemá zapísaný žiadny odcvičený tréning.");
    }

    return {
      block: lines.join("\n"),
      exercises: [...exerciseIndex].map(([id, name]) => ({ id, name })),
      days: swapDays,
    };
  } catch (err) {
    console.error("getTrainingContextBlock:", err instanceof Error ? err.message : err);
    return {
      block: "Tréningové dáta sa teraz nepodarilo načítať — ak sa klient pýta na tréning, povedz mu to a nič si nevymýšľaj.",
      exercises: [],
      days: [],
    };
  }
}
