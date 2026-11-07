// FitPilot — AI blok: on-demand týždenný digest celého portfólia klientov pre
// trénera (feature/analytika-v2, bod 5). Rovnaký vzor ako lib/ai/progressSummary.ts,
// len o úroveň vyššie — nie jeden klient, ale všetci naraz: "na koho sa tento
// týždeň zamerať a prečo".
//
// Žiadny cron — tréner klikne na tlačidlo na /dashboard/analytika. Appka spočíta
// všetky čísla v kóde (getClientAnalyticsOverview + plan completion + nedávne PR),
// Claude (Haiku) ich len utriedi do krátkeho digestu. Model nedostáva prístup k DB
// ani k surovým textom — len hotové čísla. Bez perzistencie (počíta sa nanovo pri
// každom kliku), vlastný denný rate-limit per tréner (lib/ai/rateLimit.ts).

import type { SupabaseClient } from "@supabase/supabase-js";
import { getAnthropicClient, AI_MODEL, isAiConfigured } from "./client";
import { logAiUsage } from "./logUsage";
import { reserveAiSlot, AI_ROSTER_SUMMARY_DAILY_LIMIT } from "./rateLimit";
import { DATA_IS_NOT_INSTRUCTIONS, promptSafe, wrapAsData } from "./promptSafety";
import { stripMarkdown } from "./plainText";
import { CLIENT_STATUS_LABEL, type ClientStatus } from "@/lib/dashboard/portfolioStatus";

export type RosterSummaryResult =
  | { status: "ok"; summary: string }
  | { status: "rate_limited"; summary: string }
  | { status: "not_configured"; summary: string }
  | { status: "no_data"; summary: string }
  | { status: "error"; summary: string };

/** Jeden klient v podklade pre digest — všetko sú už spočítané čísla, nie surové dáta. */
export interface RosterSummaryClientInput {
  name: string;
  /** stav z /dashboard/analytika (clientStatus) — digest ho nesmie vyvracať */
  status: ClientStatus;
  goal: string | null;
  /** % dní za 30 dní s aspoň jedným tréningom */
  trainingPct30: number;
  /** % dní za 30 dní "v poriadku" so stravou; null = klient nemá makro cieľ */
  nutritionPct30: number | null;
  /** % splnenia predpisu plánu za 30 dní; null = nedá sa ohodnotiť */
  planCompletionPct30: number | null;
  /** zmena váhy za 90 dní (kg); null bez ≥2 meraní */
  weightDeltaKg: number | null;
  /** kalendárne dni od posledného tréningu (0 = dnes); null = nikdy necvičil */
  daysSinceLastTrained: number | null;
  /** nedávne osobné maximá (posledných 14 dní) */
  recentPRs: { exercise: string; bestWeightKg: number }[];
}

function clientLine(c: RosterSummaryClientInput): string {
  const parts: string[] = [`${promptSafe(c.name, 60)}${c.goal ? ` (cieľ: ${promptSafe(c.goal, 100)})` : ""}:`];
  parts.push(`stav ${CLIENT_STATUS_LABEL[c.status]}`);
  parts.push(`tréning 30d ${c.trainingPct30} %`);
  parts.push(c.nutritionPct30 != null ? `strava 30d ${c.nutritionPct30} %` : "strava bez cieľa");
  if (c.planCompletionPct30 != null) parts.push(`splnenie plánu 30d ${c.planCompletionPct30} %`);
  if (c.weightDeltaKg != null) parts.push(`váha ${c.weightDeltaKg > 0 ? "+" : ""}${c.weightDeltaKg} kg / 90d`);
  // Slovami, nie "pred 0 dňami" — model si to inak prekladal ako "včera" (QA 2026-09-23).
  const d = c.daysSinceLastTrained;
  if (d == null) parts.push("nikdy neodcvičil tréning");
  else parts.push(`posledný tréning ${d <= 0 ? "dnes" : d === 1 ? "včera" : `pred ${d} dňami`}`);
  if (c.recentPRs.length > 0) {
    parts.push(`nové PR: ${c.recentPRs.map((p) => `${promptSafe(p.exercise, 60)} ${p.bestWeightKg} kg`).join(", ")}`);
  }
  return `- ${parts.join(", ")}.`;
}

/**
 * Vygeneruje krátky týždenný digest celého portfólia. Volajúci (server action)
 * MUSÍ overiť prihláseného trénera a načítať `clients` len jeho — táto funkcia
 * autorizáciu nerobí, dostáva už hotový zoznam.
 */
export async function generateRosterSummary(
  supabase: SupabaseClient,
  params: { trainerId: string; clients: RosterSummaryClientInput[] },
): Promise<RosterSummaryResult> {
  if (!isAiConfigured()) {
    return { status: "not_configured", summary: "AI zatiaľ nie je nakonfigurované (chýba API kľúč)." };
  }

  if (params.clients.length === 0) {
    return { status: "no_data", summary: "Zatiaľ nemáš aktívnych klientov s dátami na zhrnutie." };
  }

  const system = [
    "Si asistent fitness trénera v aplikácii FitPilot. Dostaneš hotové číselné dáta o celom portfóliu klientov trénera (adherencia tréningu, adherencia stravy, splnenie plánu, trend váhy, nedávne osobné maximá) — appka ich už spočítala, ty ich len utriediš do krátkeho týždenného prehľadu.",
    "Napíš PO SLOVENSKY stručný digest (max ~120 slov): na začiatku 1 veta o celkovom stave portfólia, potom 2–4 konkrétni klienti, na ktorých sa má tréner tento týždeň zamerať A PREČO (nízka adherencia, dlho necvičil, stagnuje váha, strava mimo cieľa), a nakoniec 1 veta o pozitívach (kto ide dobre, kto má nové PR — dôvod niekomu napísať pochvalu).",
    "Používaj VÝHRADNE čísla a mená, ktoré ti boli poslané — nič si nevymýšľaj, nehádaj príčiny mimo dát (napr. nediagnostikuj zdravotné dôvody).",
    // Presné významy metrík — bez nich model napr. tvrdil "dobrá adherencia" pri 7 %
    // alebo čítal "splnenie plánu" ako počet vynechaných tréningov (QA 2026-09-23).
    "Význam údajov: 'stav' je hodnotenie appky (V poriadku / Sleduj / Riziko / Bez dát) — tvoje hodnotenie klienta s ním musí súhlasiť, nikdy klienta v stave Riziko neoznač ako dobre sa darí. 'tréning 30d' = percento dní za posledných 30, v ktoré klient odcvičil aspoň jeden tréning (≥70 % dobré, <40 % nízke). 'strava 30d' = percento dní, keď bola strava v rozsahu cieľa. 'splnenie plánu' = ako presne odcvičené série, opakovania a váhy zodpovedajú predpisu v pláne — NEHOVORÍ nič o počte vynechaných tréningov. 'posledný tréning' uvádzaj presne tak, ako je napísaný (dnes/včera/pred N dňami).",
    "Formát: čistý text bez markdownu (žiadne **hviezdičky** ani nadpisy), spisovná slovenčina s diakritikou.",
    "Píš vecne pre trénera, bez uvítania a bez zbytočného úvodu — rovno k veci. Klientov oslovuj menom. Žiadne odrážky pre klientov, súvislý text.",
    DATA_IS_NOT_INSTRUCTIONS,
  ].join("\n");

  const userContent = wrapAsData([
    `Portfólio má ${params.clients.length} aktívnych klientov.`,
    "",
    ...params.clients.map(clientLine),
  ]);

  // Atomická rezervácia denného limitu tesne pred volaním modelu (feature/security).
  const slot = await reserveAiSlot({
    supabase,
    kind: "roster_summary",
    trainerId: params.trainerId,
    clientId: null,
    model: AI_MODEL.PROGRESS_SUMMARY,
    subject: "trainer",
    subjectLimit: AI_ROSTER_SUMMARY_DAILY_LIMIT(),
  });
  if (!slot.allowed) {
    return {
      status: "rate_limited",
      summary: `Dnešný limit ${AI_ROSTER_SUMMARY_DAILY_LIMIT()} zhrnutí portfólia je vyčerpaný — skús to zajtra.`,
    };
  }

  const anthropic = getAnthropicClient();
  try {
    const response = await anthropic.messages.create({
      model: AI_MODEL.PROGRESS_SUMMARY,
      max_tokens: 500,
      system,
      messages: [{ role: "user", content: userContent }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    const summary =
      textBlock && textBlock.type === "text" ? stripMarkdown(textBlock.text) : "Nepodarilo sa vygenerovať zhrnutie.";

    await logAiUsage({
      trainerId: params.trainerId,
      clientId: null,
      kind: "roster_summary",
      model: AI_MODEL.PROGRESS_SUMMARY,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      reservationId: slot.reservationId,
    });

    return { status: "ok", summary };
  } catch (err) {
    console.error("generateRosterSummary (Claude call):", err instanceof Error ? err.message : err);
    return { status: "error", summary: "Nastala chyba pri generovaní zhrnutia. Skús to prosím znova." };
  }
}
