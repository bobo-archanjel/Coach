import type { SupabaseClient } from "@supabase/supabase-js";

// Weekly in-app digest (feature/OnBoarding) — banner na /dashboard s
// medzitýždennou zmenou portfolio-health, napr. "3 klienti klesli zo 'Sleduj'
// do 'Riziko' tento týždeň". Číta z client_health_snapshots (migrácia 0034),
// naplnenej týždenným pg_cron jobom — táto vrstva len porovná posledné dva
// týždne, nič neprepočítava naživo.

export type HealthBucket = "ok" | "watch" | "risk";

export const BUCKET_LABEL: Record<HealthBucket, string> = {
  ok: "V poriadku",
  watch: "Sleduj",
  risk: "Riziko",
};

const BUCKET_RANK: Record<HealthBucket, number> = { ok: 0, watch: 1, risk: 2 };

export interface HealthDigest {
  from: HealthBucket;
  to: HealthBucket;
  count: number;
}

/**
 * Najväčšia skupina klientov, ktorí sa medzi posledným a predposledným
 * týždenným snapshotom ZHORŠILI (ok→watch, watch→risk, ok→risk) — `null`
 * ak ešte nie sú aspoň 2 odlišné snapshoty, alebo ak sa nikto nezhoršil.
 * "none" (klient bez dát) sa do porovnania nepočíta — nie je to smer
 * zhoršenia/zlepšenia, len chýbajúci signál.
 */
export async function getHealthDigest(supabase: SupabaseClient, trainerId: string): Promise<HealthDigest | null> {
  const { data, error } = await supabase
    .from("client_health_snapshots")
    .select("client_id, week_start, bucket")
    .eq("trainer_id", trainerId)
    .order("week_start", { ascending: false });
  if (error || !data || data.length === 0) return null;

  const weeks = [...new Set(data.map((r) => r.week_start as string))].sort().reverse();
  if (weeks.length < 2) return null;
  const [currentWeek, previousWeek] = weeks;

  const currentByClient = new Map<string, HealthBucket>();
  const previousByClient = new Map<string, HealthBucket>();
  for (const r of data) {
    if (r.bucket !== "ok" && r.bucket !== "watch" && r.bucket !== "risk") continue; // "none" vylúčené
    if (r.week_start === currentWeek) currentByClient.set(r.client_id, r.bucket);
    else if (r.week_start === previousWeek) previousByClient.set(r.client_id, r.bucket);
  }

  const groups = new Map<string, number>();
  for (const [clientId, curr] of currentByClient) {
    const prev = previousByClient.get(clientId);
    if (!prev || BUCKET_RANK[curr] <= BUCKET_RANK[prev]) continue;
    const key = `${prev}|${curr}`;
    groups.set(key, (groups.get(key) ?? 0) + 1);
  }

  let best: { key: string; count: number } | null = null;
  for (const [key, count] of groups) {
    if (!best || count > best.count) best = { key, count };
  }
  if (!best) return null;

  const [from, to] = best.key.split("|") as [HealthBucket, HealthBucket];
  return { from, to, count: best.count };
}
