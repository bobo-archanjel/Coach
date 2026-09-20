// FitPilot — jednoduchý in-memory limitér okna (feature/security). Slúži na levné
// spomalenie zneužitia endpointov, ktoré volajú externé služby (napr. Open Food
// Facts), bez nutnosti DB. Je "best effort": stav je v pamäti jednej inštancie
// servera (pri viacerých inštanciách/serverless sa počíta per inštancia) a po
// reštarte sa vynuluje — na ochranu nákladov/účtov sa preto nepoužíva (tam slúži
// atomický limit v DB, lib/ai/rateLimit.ts).

const buckets = new Map<string, number[]>();
const MAX_KEYS = 5000; // poistka proti neobmedzenému rastu pamäte

/** True = požiadavka je v limite (a zaznamená sa); false = prekročené. */
export function allowWithinWindow(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    buckets.set(key, recent);
    return false;
  }
  recent.push(now);
  buckets.set(key, recent);

  if (buckets.size > MAX_KEYS) {
    for (const [k, times] of buckets) {
      if (times.every((t) => now - t >= windowMs)) buckets.delete(k);
      if (buckets.size <= MAX_KEYS / 2) break;
    }
  }
  return true;
}
