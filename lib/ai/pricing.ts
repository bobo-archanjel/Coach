// FitPilot — AI blok: cenník za 1M tokenov (USD), na odhad nákladov pre
// trénera v Nastaveniach. Aktualizovať pri zmene modelu v lib/ai/client.ts —
// nie je to volanie API, len konštanty pre orientačný odhad zobrazený v UI.

const PRICING_USD_PER_MTOK: Record<string, { input: number; output: number }> = {
  "claude-haiku-4-5": { input: 1, output: 5 },
  "claude-sonnet-5": { input: 2, output: 10 },
};

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICING_USD_PER_MTOK[model];
  if (!p) return 0;
  return (inputTokens / 1_000_000) * p.input + (outputTokens / 1_000_000) * p.output;
}
