// FitPilot — AI blok: on-demand sumarizácia progresu klienta pre trénera
// (PRODUCT.md AI moduly: "sumarizácia progresu, upozornenia na nízku
// adherenciu"). Žiadny cron/scheduler — tréner klikne na karte klienta,
// appka spočíta čísla v kóde (rovnaké zdroje ako AnalyticsPanel/analytics.ts:
// getTrainingAdherence, getNutritionAdherence, body_metrics, workout_logs) a
// Claude (Haiku) len sformuluje krátke zhrnutie + jedno odporúčanie. Model
// nedostáva prístup k DB ani k surovým textom klienta — len hotové čísla.
//
// Bez perzistencie zámerne (Krok "AI sumarizácia" v ROADMAP) — počíta sa
// nanovo pri každom kliku, jedno lacné volanie Haiku, žiadna nová tabuľka.

import type { SupabaseClient } from "@supabase/supabase-js";
import { getAnthropicClient, AI_MODEL, isAiConfigured } from "./client";
import { logAiUsage } from "./logUsage";
import { getNutritionAdherence, getTrainingAdherence } from "@/lib/dashboard/adherence";
import { getBodyMetrics, getAllStrengthProgress } from "@/lib/dashboard/bodyMetrics";
import { isProgressSummaryRateLimited, AI_PROGRESS_SUMMARY_DAILY_LIMIT } from "./rateLimit";

export type ProgressSummaryResult =
  | { status: "ok"; summary: string }
  | { status: "rate_limited"; summary: string }
  | { status: "not_configured"; summary: string }
  | { status: "no_data"; summary: string }
  | { status: "error"; summary: string };

/** Posledné meranie vs. najstaršie v poslednej ~90-dňovej histórii — jednoduchý trend, nie AI výpočet. */
function weightTrendLine(metrics: Awaited<ReturnType<typeof getBodyMetrics>>): string | null {
  if (!metrics || metrics.length === 0) return null;
  const withWeight = metrics.filter((m) => m.weightKg != null);
  if (withWeight.length === 0) return null;
  const first = withWeight[0];
  const last = withWeight[withWeight.length - 1];
  if (withWeight.length === 1) return `Jediné zaznamenané meranie: ${last.weightKg} kg (${last.measuredOn}).`;
  const deltaKg = Math.round(((last.weightKg as number) - (first.weightKg as number)) * 10) / 10;
  return `Váha: ${first.weightKg} kg (${first.measuredOn}) → ${last.weightKg} kg (${last.measuredOn}), zmena ${deltaKg > 0 ? "+" : ""}${deltaKg} kg.`;
}

/** Prvá vs. posledná zaznamenaná najťažšia séria pre max. 3 najčastejšie trénované cviky. */
function strengthTrendLines(progress: Awaited<ReturnType<typeof getAllStrengthProgress>>): string[] {
  if (!progress || progress.names.length === 0) return [];
  const ranked = progress.names
    .map((name) => ({ name, points: progress.byExercise[name] ?? [] }))
    .filter((e) => e.points.length >= 2)
    .sort((a, b) => b.points.length - a.points.length)
    .slice(0, 3);

  return ranked.map(({ name, points }) => {
    const first = points[0];
    const last = points[points.length - 1];
    return `${name}: ${first.bestWeightKg} kg×${first.reps} (${first.date}) → ${last.bestWeightKg} kg×${last.reps} (${last.date}).`;
  });
}

/**
 * Vygeneruje krátke AI zhrnutie progresu jedného klienta pre trénera. Volajúci
 * (server action) MUSÍ overiť, že klient patrí prihlásenému trénerovi PRED
 * zavolaním tejto funkcie — táto funkcia už len číta dáta cez RLS-scoped
 * `supabase` klienta odovzdaného zvonku, žiadnu vlastnú autorizáciu nerobí.
 */
export async function generateProgressSummary(
  supabase: SupabaseClient,
  params: { trainerId: string; clientId: string; clientName: string; clientGoal: string | null },
): Promise<ProgressSummaryResult> {
  if (!isAiConfigured()) {
    return { status: "not_configured", summary: "AI zatiaľ nie je nakonfigurované (chýba API kľúč)." };
  }

  if (await isProgressSummaryRateLimited(supabase, params.clientId)) {
    return {
      status: "rate_limited",
      summary: `Dnešný limit ${AI_PROGRESS_SUMMARY_DAILY_LIMIT()} zhrnutí pre tohto klienta je vyčerpaný — skús to zajtra.`,
    };
  }

  const [trainingAdherence, nutritionAdherence, bodyMetrics, strengthProgress] = await Promise.all([
    getTrainingAdherence(params.clientId),
    getNutritionAdherence(params.clientId),
    getBodyMetrics(params.clientId),
    getAllStrengthProgress(params.clientId),
  ]);

  const lines: string[] = [];
  lines.push(`Klient: ${params.clientName}${params.clientGoal ? ` (cieľ: ${params.clientGoal})` : ""}.`);

  if (trainingAdherence) {
    lines.push(
      `Adherencia tréningu: 30 dní ${trainingAdherence.window30.pct} % (${trainingAdherence.window30.trainedDays}/${trainingAdherence.window30.totalDays} dní), 90 dní ${trainingAdherence.window90.pct} % (${trainingAdherence.window90.trainedDays}/${trainingAdherence.window90.totalDays} dní).`,
    );
  }

  if (nutritionAdherence?.hasGoal) {
    lines.push(
      `Adherencia stravy: 30 dní ${nutritionAdherence.window30.pct} %, 90 dní ${nutritionAdherence.window90.pct} % (cieľ ${nutritionAdherence.kcalGoal} kcal/deň).`,
    );
  } else {
    lines.push("Klient nemá nastavený makro cieľ — adherenciu stravy nemožno sledovať.");
  }

  const weightLine = weightTrendLine(bodyMetrics);
  if (weightLine) lines.push(weightLine);

  const strengthLines = strengthTrendLines(strengthProgress);
  if (strengthLines.length > 0) {
    lines.push("Silový progres (najťažšia séria pri prvom a poslednom zázname):");
    lines.push(...strengthLines.map((l) => `- ${l}`));
  }

  // Bez tréningov, meraní aj cieľa stravy nie je z čoho zhrnúť nič zmysluplné.
  const hasAnyData = Boolean(trainingAdherence && trainingAdherence.window90.trainedDays > 0) || Boolean(weightLine) || strengthLines.length > 0;
  if (!hasAnyData) {
    return { status: "no_data", summary: "Klient zatiaľ nemá dosť dát (žiadne tréningy, merania ani makro cieľ) na zmysluplné zhrnutie." };
  }

  const system = [
    "Si asistent trénera vo fitness aplikácii FitPilot. Dostaneš hotové číselné dáta o progrese jedného klienta (adherencia, váha, sila) — appka ich už spočítala, ty ich len interpretuješ a zhrnieš.",
    "Napíš PO SLOVENSKY 3-5 vetné zhrnutie: čo sa zlepšilo, čo sa zhoršilo alebo stagnuje, a na konci JEDNU konkrétnu odporúčanú akciu pre trénera (napr. 'skús skontaktovať klienta', 'zváž zvýšenie záťaže', 'prehodnoťte kalorický cieľ').",
    "Používaj VÝHRADNE čísla, ktoré ti boli poslané — nič si nevymýšľaj, nehádaj príčiny mimo dát (napr. nediagnostikuj zdravotné dôvody stagnácie).",
    "Píš vecne pre trénera (nie pre klienta), bez uvítania a bez zbytočného úvodu — rovno k veci.",
  ].join("\n");

  const anthropic = getAnthropicClient();
  try {
    const response = await anthropic.messages.create({
      model: AI_MODEL.PROGRESS_SUMMARY,
      max_tokens: 400,
      system,
      messages: [{ role: "user", content: lines.join("\n") }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    const summary = textBlock && textBlock.type === "text" ? textBlock.text.trim() : "Nepodarilo sa vygenerovať zhrnutie.";

    await logAiUsage({
      trainerId: params.trainerId,
      clientId: params.clientId,
      kind: "progress_summary",
      model: AI_MODEL.PROGRESS_SUMMARY,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    });

    return { status: "ok", summary };
  } catch (err) {
    console.error("generateProgressSummary (Claude call):", err instanceof Error ? err.message : err);
    return { status: "error", summary: "Nastala chyba pri generovaní zhrnutia. Skús to prosím znova." };
  }
}
