// FitPilot — export jedálničku do PDF (feature/funkcionalita). Rovnaký vzor ako
// planReport.ts (tréningový plán): čistá funkcia nad už načítanými dátami, žiadne
// volanie Supabase — route handler ich načíta a prepošle.

import { createPdfContext, PdfWriter, truncate, type TableColumn } from "./document";
import { MEAL_SLOT_LABELS, MEAL_SLOT_ORDER, scaleFoodMacros, sumMacros, type MealSlot } from "@/lib/meals";

/** Tvar položky v meal_days.meals (JSONB), viď MealEntry v app/dashboard/vyziva/jedalnicek/actions.ts. */
export interface MealPlanReportEntry {
  food_name?: string;
  meal_slot?: MealSlot;
  grams?: number;
  kcal_100g?: number;
  protein_100g?: number;
  carbs_100g?: number;
  fat_100g?: number;
}

export interface MealPlanReportDay {
  name: string;
  meals: MealPlanReportEntry[];
}

export interface MealPlanReportInput {
  planName: string;
  clientName: string;
  /** Makro cieľ klienta (nutrition_profiles) — null, ak ho tréner zatiaľ nenastavil. */
  goal: { caloriesTarget: number; proteinG: number; carbsG: number; fatG: number } | null;
  days: MealPlanReportDay[];
}

const COLUMNS: TableColumn[] = [
  { text: "Potravina", width: 200 },
  { text: "Gramáž", width: 65, align: "right" },
  { text: "kcal", width: 55, align: "right" },
  { text: "B", width: 50, align: "right" },
  { text: "S", width: 50, align: "right" },
  { text: "T", width: 50, align: "right" },
];

// Súčet šírok = COLUMNS (470), nech nákupný zoznam lícuje s tabuľkami dní.
const SHOPPING_COLUMNS: TableColumn[] = [
  { text: "Potravina", width: 370 },
  { text: "Spolu", width: 100, align: "right" },
];

/** Miesto, ktoré musí zostať na strane, aby sa nadpis nezačal osamote (nadpis + hlavička + ~3 riadky). */
const KEEP_TOGETHER = 130;

const num = (v: number | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

function macrosOf(e: MealPlanReportEntry) {
  return scaleFoodMacros(
    { kcal_100g: num(e.kcal_100g), protein_100g: num(e.protein_100g), carbs_100g: num(e.carbs_100g), fat_100g: num(e.fat_100g) },
    num(e.grams),
  );
}

/**
 * Nákupný zoznam — gramáže rovnakej potraviny zlúčené naprieč VŠETKÝMI dňami plánu
 * (každý deň sa počíta raz). Kľúč je názov bez ohľadu na veľkosť písmen/medzery,
 * zobrazí sa prvý výskyt tak, ako ho tréner napísal.
 */
export function buildShoppingList(days: MealPlanReportDay[]): { name: string; grams: number }[] {
  const byKey = new Map<string, { name: string; grams: number }>();
  for (const day of days) {
    for (const e of day.meals) {
      const name = (e.food_name ?? "").trim();
      const grams = num(e.grams);
      if (!name || grams <= 0) continue;
      const key = name.toLocaleLowerCase("sk");
      const cur = byKey.get(key);
      if (cur) cur.grams += grams;
      else byKey.set(key, { name, grams });
    }
  }
  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name, "sk"));
}

export async function generateMealPlanPdf(input: MealPlanReportInput): Promise<Uint8Array> {
  const ctx = await createPdfContext();
  const w = new PdfWriter(ctx);

  w.heading(truncate(input.planName, 60));
  w.meta(`Klient: ${input.clientName}  ·  Vygenerované: ${new Date().toLocaleDateString("sk-SK")}`);
  if (input.goal) {
    w.meta(
      `Denný cieľ: ${input.goal.caloriesTarget} kcal · ${input.goal.proteinG} g bielkoviny · ${input.goal.carbsG} g sacharidy · ${input.goal.fatG} g tuky`,
    );
  }

  if (input.days.length === 0) {
    w.text("Jedálniček zatiaľ nemá žiadne dni.", { dim: true });
  }

  for (const day of input.days) {
    w.reserve(KEEP_TOGETHER);
    w.section(truncate(day.name, 70));

    const rows: string[][] = [];
    for (const slot of MEAL_SLOT_ORDER) {
      const items = day.meals.filter((e) => e.meal_slot === slot);
      if (items.length === 0) continue;
      rows.push([MEAL_SLOT_LABELS[slot].toUpperCase(), "", "", "", "", ""]);
      for (const e of items) {
        const m = macrosOf(e);
        rows.push([
          truncate(e.food_name ?? "Potravina", 34),
          `${num(e.grams)} g`,
          String(m.kcal),
          `${m.proteinG}`,
          `${m.carbsG}`,
          `${m.fatG}`,
        ]);
      }
    }

    if (rows.length === 0) {
      w.text("Tento deň zatiaľ nemá žiadne jedlá.", { dim: true });
      continue;
    }

    w.table(COLUMNS, rows);

    const total = sumMacros(day.meals.map(macrosOf));
    w.text(`Súčet dňa: ${total.kcal} kcal · B ${total.proteinG} g · S ${total.carbsG} g · T ${total.fatG} g`);
    if (input.goal) {
      const diff = total.kcal - input.goal.caloriesTarget;
      w.text(`Oproti cieľu: ${diff > 0 ? "+" : ""}${diff} kcal`, { dim: true });
    }
  }

  const shopping = buildShoppingList(input.days);
  if (shopping.length > 0) {
    w.reserve(KEEP_TOGETHER);
    w.section("Nákupný zoznam");
    w.text("Súčet všetkých dní jedálnička, každý deň raz. Ak sa dni striedajú, nakupuj podľa toho, ktoré ti vychádzajú.", {
      dim: true,
      size: 9.5,
    });
    w.table(
      SHOPPING_COLUMNS,
      shopping.map((s) => [truncate(s.name, 48), `${Math.round(s.grams)} g`]),
    );
  }

  return w.bytes();
}
