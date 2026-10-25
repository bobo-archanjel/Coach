// FitPilot — deterministický tréningový kontext pre AI Kouča (QA 2026-09-23:
// na "aký tréning mám dnes" odpovedal, že vidí len jedálniček — tréningové dáta
// sa mu vôbec neposielali). Rovnaký princíp ako macroContext.ts: výber plánu,
// "ďalší deň v poradí" aj históriu počíta kód, model dostane hotový text.
// Výber plánu a rotácia dní zodpovedajú getPortalData (lib/portal/data.ts), aby
// AI hovorila o tom istom dni, aký klient vidí na karte Dnes.

import type { SupabaseClient } from "@supabase/supabase-js";

const TZ = "Europe/Bratislava";
const RECENT_LOGS = 5;

type ExerciseEntry = {
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

/**
 * Vráti textový blok do system promptu. Nikdy nehádže — pri chybe vráti vetu,
 * ktorá AI povie, že tréningové dáta teraz nemá (a nech si nič nevymýšľa).
 */
export async function getTrainingContextBlock(supabase: SupabaseClient, clientId: string): Promise<string> {
  try {
    // Aktívny plán klienta (clients.active_plan_id), inak najnovší zverejnený — ako karta
    // Dnes. Klient, najnovší plán s dňami (embed) a logy v jednom kole; samostatný
    // dopyt na aktívny plán len keď je iný než najnovší. Predtým 3-4 dopyty za sebou.
    type PlanWithDays = { id: string; name: string; workout_days: { id: string; name: string; exercises: unknown }[] | null };
    const planSelect = "id, name, workout_days(id, name, exercises, day_number)";
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

    if (!plan || days.length === 0) {
      lines.push(
        "Tréning: klient nemá aktívny tréningový plán. Ak sa pýta, čo má cvičiť, povedz mu, nech si plán vytvorí v sekcii Tréning alebo sa opýta trénera — konkrétny plán mu nevymýšľaj.",
      );
    } else {
      lines.push(`Aktívny tréningový plán klienta: „${plan.name}“ (${days.length} ${days.length === 1 ? "deň" : days.length <= 4 ? "dni" : "dní"}).`);
      for (const d of days) {
        const exercises = Array.isArray(d.exercises) ? (d.exercises as ExerciseEntry[]) : [];
        lines.push(`- ${d.name}: ${exercises.length > 0 ? exercises.map(formatPlanned).join("; ") : "bez cvikov"}`);
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

    return lines.join("\n");
  } catch (err) {
    console.error("getTrainingContextBlock:", err instanceof Error ? err.message : err);
    return "Tréningové dáta sa teraz nepodarilo načítať — ak sa klient pýta na tréning, povedz mu to a nič si nevymýšľaj.";
  }
}
