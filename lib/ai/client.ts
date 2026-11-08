// FitPilot — AI blok: jediné miesto, kde sa inštancuje Anthropic klient.
// Server-side only (nikdy importovať z "use client" komponentu, viď PRODUCT.md
// "AI volania idú výhradne cez server-side endpoint").
//
// Modely (viď návrh v ROADMAP.md / rozhovor pri zakladaní feature/AI):
// - chat + progress summary: najlacnejší model (časté/jednoduché úlohy,
//   matematika makier sa počíta v kóde, nie modelom — viď lib/ai/chat.ts)
// - generátor tréningových/jedálničkových plánov: kvalitnejší model
//   (zriedkavé volanie, ale musí vybrať rozumnú kombináciu z stoviek cvikov)

import Anthropic from "@anthropic-ai/sdk";

export const AI_MODEL = {
  CHAT: "claude-haiku-4-5",
  PROGRESS_SUMMARY: "claude-haiku-4-5",
  PLAN_GENERATOR: "claude-sonnet-5",
  MEAL_GENERATOR: "claude-sonnet-5",
} as const;

let cached: Anthropic | null = null;

/**
 * Vráti zdieľaného Anthropic klienta. Hodí zrozumiteľnú chybu až pri
 * skutočnom pokuse o volanie (nie pri importe modulu) — kým ANTHROPIC_API_KEY
 * nie je nastavený, appka má fungovať normálne mimo AI funkcií.
 */
export function getAnthropicClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY nie je nastavený v .env.local — AI funkcie zatiaľ nie sú dostupné.",
    );
  }
  if (!cached) {
    // "Identity-linked" API kľúče (Console → API Keys s "Linked account") vyžadujú
    // aj hlavičku anthropic-workspace-id — inak API vráti 400. Klasické (staršie)
    // workspace kľúče tento env nepotrebujú, tak je to voliteľné.
    const workspaceId = process.env.ANTHROPIC_WORKSPACE_ID;
    cached = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
      defaultHeaders: workspaceId ? { "anthropic-workspace-id": workspaceId } : undefined,
    });
  }
  return cached;
}

/** True, ak je appka nakonfigurovaná na reálne volanie AI (kľúč je nastavený). */
export function isAiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}
