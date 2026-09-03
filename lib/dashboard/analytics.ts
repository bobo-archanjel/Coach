import { createClient } from "@/lib/supabase/server";
import { scaleFoodMacros, sumMacros } from "@/lib/meals";
import { todayInTz, addDays, iso, ON_TRACK_MIN_PCT, ON_TRACK_MAX_PCT } from "./adherence";

// Agregovaný prehľad naprieč klientmi pre `/dashboard/analytika` (feature/progress-analyst).
// Štyri dotazy naraz (nie N+1 na klienta) — rovnaký vzor ako "meškajúci klienti" v
// app/dashboard/page.tsx, len rozšírený o food_logs a body_metrics.

const WINDOW_DAYS = 90;

export interface ClientAnalyticsRow {
  nutritionPct30: number | null; // null = klient nemá makro cieľ
  nutritionPct90: number | null;
  trainingPct30: number;
  trainingPct90: number;
  lastTrainedOn: string | null;
  latestWeightKg: number | null;
  /** zmena váhy v rámci posledných 90 dní (posledné − prvé meranie v okne), null bez ≥2 meraní */
  weightDeltaKg: number | null;
}

/** Per-klient prehľad adherencie + progresu za posledných 90 dní. `null` len pri chybe načítania. */
export async function getClientAnalyticsOverview(clientIds: string[]): Promise<Map<string, ClientAnalyticsRow> | null> {
  if (clientIds.length === 0) return new Map();

  const supabase = await createClient();
  const { isoDate, base } = todayInTz();
  const historyStart = iso(addDays(base, -(WINDOW_DAYS - 1)));

  const [
    { data: profiles, error: profErr },
    { data: foodRows, error: foodErr },
    { data: logRows, error: logErr },
    { data: metricRows, error: metricErr },
  ] = await Promise.all([
    supabase.from("nutrition_profiles").select("client_id, calories_target").in("client_id", clientIds),
    supabase
      .from("food_logs")
      .select("client_id, eaten_on, grams, kcal_100g, protein_100g, carbs_100g, fat_100g")
      .in("client_id", clientIds)
      .gte("eaten_on", historyStart)
      .lte("eaten_on", isoDate),
    supabase
      .from("workout_logs")
      .select("client_id, performed_on")
      .in("client_id", clientIds)
      .gte("performed_on", historyStart)
      .lte("performed_on", isoDate),
    supabase
      .from("body_metrics")
      .select("client_id, measured_on, weight_kg")
      .in("client_id", clientIds)
      .gte("measured_on", historyStart)
      .lte("measured_on", isoDate)
      .order("measured_on", { ascending: true }),
  ]);

  if (profErr || foodErr || logErr || metricErr) return null;

  const goalByClient = new Map<string, number>();
  for (const p of profiles ?? []) if (p.calories_target) goalByClient.set(p.client_id, p.calories_target);

  const kcalByClientDate = new Map<string, Map<string, number>>();
  for (const r of foodRows ?? []) {
    const macros = scaleFoodMacros(
      { kcal_100g: r.kcal_100g, protein_100g: r.protein_100g, carbs_100g: r.carbs_100g, fat_100g: r.fat_100g },
      r.grams,
    );
    const kcal = sumMacros([macros]).kcal;
    const perClient = kcalByClientDate.get(r.client_id) ?? new Map<string, number>();
    perClient.set(r.eaten_on, (perClient.get(r.eaten_on) ?? 0) + kcal);
    kcalByClientDate.set(r.client_id, perClient);
  }

  const trainedDatesByClient = new Map<string, Set<string>>();
  for (const l of logRows ?? []) {
    const set = trainedDatesByClient.get(l.client_id) ?? new Set<string>();
    set.add(l.performed_on);
    trainedDatesByClient.set(l.client_id, set);
  }

  const metricsByClient = new Map<string, { date: string; weight: number }[]>();
  for (const m of metricRows ?? []) {
    if (m.weight_kg == null) continue;
    const list = metricsByClient.get(m.client_id) ?? [];
    list.push({ date: m.measured_on, weight: m.weight_kg });
    metricsByClient.set(m.client_id, list);
  }

  const result = new Map<string, ClientAnalyticsRow>();
  for (const clientId of clientIds) {
    const goal = goalByClient.get(clientId) ?? null;
    const kcalByDate = kcalByClientDate.get(clientId) ?? new Map<string, number>();
    const trainedDates = trainedDatesByClient.get(clientId) ?? new Set<string>();

    const nutritionPct = (days: number): number | null => {
      if (!goal) return null;
      let onTrack = 0;
      for (let i = 0; i < days; i++) {
        const kcal = kcalByDate.get(iso(addDays(base, -i)));
        if (kcal == null) continue;
        const pct = (kcal / goal) * 100;
        if (pct >= ON_TRACK_MIN_PCT && pct <= ON_TRACK_MAX_PCT) onTrack++;
      }
      return Math.round((onTrack / days) * 100);
    };

    const trainingPct = (days: number): number => {
      let trained = 0;
      for (let i = 0; i < days; i++) {
        if (trainedDates.has(iso(addDays(base, -i)))) trained++;
      }
      return Math.round((trained / days) * 100);
    };

    const lastTrainedOn = trainedDates.size > 0 ? [...trainedDates].sort().at(-1)! : null;

    const metrics = metricsByClient.get(clientId) ?? [];
    const latestWeightKg = metrics.length > 0 ? metrics[metrics.length - 1].weight : null;
    const weightDeltaKg =
      metrics.length >= 2 ? Math.round((metrics[metrics.length - 1].weight - metrics[0].weight) * 10) / 10 : null;

    result.set(clientId, {
      nutritionPct30: nutritionPct(30),
      nutritionPct90: nutritionPct(90),
      trainingPct30: trainingPct(30),
      trainingPct90: trainingPct(90),
      lastTrainedOn,
      latestWeightKg,
      weightDeltaKg,
    });
  }

  return result;
}
