// FitPilot — export jedálničku do PDF (feature/funkcionalita, vzhľad v6). Rovnaký vzor ako
// planReport.ts (tréningový plán): čistá funkcia nad už načítanými dátami, žiadne
// volanie Supabase — route handler ich načíta a prepošle.

import type { Locale } from "@/lib/i18n/locales";
import { createTranslator } from "next-intl";
import skLabels from "@/messages/sk/labels.json";
import csLabels from "@/messages/cs/labels.json";
import { createPdfContext, MACRO_COLORS, PdfWriter, signed, type TableColumn, type TableRow } from "./document";
import { MEAL_SLOT_ORDER, scaleFoodMacros, sumMacros, type MealSlot } from "@/lib/meals";

/** Tvar položky v meal_days.meals (JSONB), viď MealEntry v app/dashboard/jedalnicky/jedalnicek/actions.ts. */
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

export async function generateMealPlanPdf(input: MealPlanReportInput, locale: Locale = "sk"): Promise<Uint8Array> {
  const ctx = await createPdfContext(locale);
  const t = (key: Parameters<typeof ctx.t>[0], values?: Record<string, string | number>) => ctx.t(key, values);
  const tl = createTranslator({
    locale,
    messages: { labels: (locale === "cs" ? csLabels : skLabels) as typeof skLabels },
    namespace: "labels.mealSlot",
  });
  const COLUMNS: TableColumn[] = [
    { text: t("meal.food"), width: 200 },
    { text: t("meal.grams"), width: 60, align: "right" },
    { text: t("meal.kcal"), width: 50, align: "right" },
    { text: t("meal.p"), width: 45, align: "right" },
    { text: t("meal.c"), width: 45, align: "right" },
    { text: t("meal.f"), width: 45, align: "right" },
  ];
  const SHOPPING_COLUMNS: TableColumn[] = [
    { text: t("meal.food"), width: 370 },
    { text: t("meal.total"), width: 100, align: "right" },
  ];
  const w = new PdfWriter(ctx, t("meal.kind"));

  w.title({ title: input.planName, meta: [t("client", { name: input.clientName })] });

  if (input.goal) {
    w.tiles([
      { label: t("meal.dailyGoal"), value: `${input.goal.caloriesTarget} kcal` },
      { label: t("meal.protein"), value: `${input.goal.proteinG} g`, dot: MACRO_COLORS.protein },
      { label: t("meal.carbs"), value: `${input.goal.carbsG} g`, dot: MACRO_COLORS.carbs },
      { label: t("meal.fat"), value: `${input.goal.fatG} g`, dot: MACRO_COLORS.fat },
    ]);
  }

  if (input.days.length === 0) {
    w.tableCard({ title: t("meal.noDays"), columns: COLUMNS, rows: [], empty: t("meal.noDaysHint") });
  }

  for (const day of input.days) {
    const rows: TableRow[] = [];
    for (const slot of MEAL_SLOT_ORDER) {
      const items = day.meals.filter((e) => e.meal_slot === slot);
      if (items.length === 0) continue;
      rows.push({ group: tl(slot) });
      for (const e of items) {
        const m = macrosOf(e);
        rows.push({
          cells: [e.food_name ?? t("meal.food"), `${num(e.grams)} g`, String(m.kcal), `${m.proteinG}`, `${m.carbsG}`, `${m.fatG}`],
        });
      }
    }

    const total = sumMacros(day.meals.map(macrosOf));
    const count = day.meals.length;
    w.tableCard({
      title: day.name,
      aside: count > 0 ? t("meal.items", { count }) : undefined,
      columns: COLUMNS,
      rows,
      empty: t("meal.noMeals"),
      footer: {
        chips: [
          { text: `${total.kcal} kcal`, accent: true },
          { text: `${t("meal.p")} ${total.proteinG} g`, dot: MACRO_COLORS.protein },
          { text: `${t("meal.c")} ${total.carbsG} g`, dot: MACRO_COLORS.carbs },
          { text: `${t("meal.f")} ${total.fatG} g`, dot: MACRO_COLORS.fat },
        ],
        note: input.goal ? t("meal.vsGoal", { kcal: signed(total.kcal - input.goal.caloriesTarget) }) : undefined,
      },
    });
  }

  const shopping = buildShoppingList(input.days);
  if (shopping.length > 0) {
    w.tableCard({
      title: t("meal.shopping"),
      aside: t("meal.items", { count: shopping.length }),
      subtitle: t("meal.shoppingHint"),
      columns: SHOPPING_COLUMNS,
      rows: shopping.map((s) => ({ cells: [s.name, `${Math.round(s.grams)} g`] })),
    });
  }

  return w.bytes();
}
