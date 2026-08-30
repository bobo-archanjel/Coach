import { createClient } from "@/lib/supabase/server";
import { scaleFoodMacros, sumMacros } from "@/lib/meals";

// Adherencia stravy pre trénera (`/dashboard/klienti/[id]`) — analogický follow-up
// ku karte tréningovej aktivity, len na strane výživy. Číta food_logs (0007) +
// nutrition_profiles (0004); RLS food_logs_select_own_trainer to už dovoľuje,
// žiadna nová migrácia. Rovnaká TZ konvencia ako lib/portal/data.ts (Europe/Bratislava).

const TZ = "Europe/Bratislava";
const WEEKDAY_LABELS = ["Po", "Ut", "St", "Št", "Pi", "So", "Ne"];
const HISTORY_DAYS = 7;

type FoodLogRow = {
  eaten_on: string;
  grams: number;
  kcal_100g: number;
  protein_100g: number;
  carbs_100g: number;
  fat_100g: number;
};

export interface AdherenceDay {
  label: string;
  dateNum: number;
  /** null = žiadny záznam ten deň (nerozlišuje sa od "0 kcal", ale to sa v praxi nestáva) */
  pct: number | null;
}

export interface NutritionAdherence {
  hasGoal: boolean;
  kcalGoal: number | null;
  todayKcal: number;
  /** zaokrúhlené % z cieľa, null keď cieľ nie je nastavený */
  todayPct: number | null;
  /** posledných 7 dní vrátane dneška, najstarší prvý */
  days: AdherenceDay[];
}

function todayInTz(): { isoDate: string; base: Date } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const isoDate = `${get("year")}-${get("month")}-${get("day")}`;
  return { isoDate, base: new Date(`${isoDate}T12:00:00Z`) };
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000);
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Adherencia stravy jedného klienta za posledných 7 dní — pre kartu na
 * `/dashboard/klienti/[id]`. Vracia `null` len pri chybe načítania (klient
 * bez makro cieľa dostane `hasGoal: false`, nie null — to nie je chyba).
 */
export async function getNutritionAdherence(clientId: string): Promise<NutritionAdherence | null> {
  const supabase = await createClient();
  const { isoDate, base } = todayInTz();
  const historyStart = iso(addDays(base, -(HISTORY_DAYS - 1)));

  const [{ data: profile, error: profileErr }, { data: logRows, error: logErr }] = await Promise.all([
    supabase.from("nutrition_profiles").select("calories_target").eq("client_id", clientId).maybeSingle(),
    supabase
      .from("food_logs")
      .select("eaten_on, grams, kcal_100g, protein_100g, carbs_100g, fat_100g")
      .eq("client_id", clientId)
      .gte("eaten_on", historyStart)
      .lte("eaten_on", isoDate),
  ]);

  if (profileErr || logErr) return null;

  const kcalGoal = profile?.calories_target ?? null;
  const rows = (logRows ?? []) as FoodLogRow[];

  const kcalByDate = new Map<string, number>();
  for (const r of rows) {
    const macros = scaleFoodMacros(
      { kcal_100g: r.kcal_100g, protein_100g: r.protein_100g, carbs_100g: r.carbs_100g, fat_100g: r.fat_100g },
      r.grams,
    );
    kcalByDate.set(r.eaten_on, (kcalByDate.get(r.eaten_on) ?? 0) + sumMacros([macros]).kcal);
  }

  const days: AdherenceDay[] = [];
  for (let i = HISTORY_DAYS - 1; i >= 0; i--) {
    const date = addDays(base, -i);
    const dateStr = iso(date);
    const kcal = kcalByDate.get(dateStr);
    const pct = kcal != null && kcalGoal ? Math.round((kcal / kcalGoal) * 100) : null;
    const weekdayIdx = (date.getUTCDay() + 6) % 7; // 0 = pondelok
    days.push({ label: WEEKDAY_LABELS[weekdayIdx], dateNum: date.getUTCDate(), pct });
  }

  const todayKcal = kcalByDate.get(isoDate) ?? 0;
  const todayPct = kcalGoal ? Math.round((todayKcal / kcalGoal) * 100) : null;

  return { hasGoal: kcalGoal != null, kcalGoal, todayKcal, todayPct, days };
}
