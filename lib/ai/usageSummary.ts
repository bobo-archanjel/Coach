// FitPilot — AI blok: súhrn AI nákladov trénera pre kartu v Nastaveniach —
// viditeľná kontrola priamo v appke, bez nutnosti chodiť do Anthropic Console
// (kde je aj skutočný, záväzný spending limit — táto karta je len orientačná).

import type { SupabaseClient } from "@supabase/supabase-js";
import { estimateCostUsd } from "./pricing";

export interface AiUsageSummary {
  todayCount: number;
  todayCostUsd: number;
  weekCount: number;
  weekCostUsd: number;
}

const TZ = "Europe/Bratislava";
const WEEK_DAYS = 7;

function startOfTodayIso(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T00:00:00+01:00`;
}

function startOfWeekAgoIso(): string {
  const start = new Date(startOfTodayIso());
  return new Date(start.getTime() - (WEEK_DAYS - 1) * 86_400_000).toISOString();
}

export async function getTrainerAiUsageSummary(
  supabase: SupabaseClient,
  trainerId: string,
): Promise<AiUsageSummary | null> {
  const { data, error } = await supabase
    .from("ai_usage")
    .select("model, input_tokens, output_tokens, created_at")
    .eq("trainer_id", trainerId)
    .gte("created_at", startOfWeekAgoIso());
  if (error) {
    console.error("getTrainerAiUsageSummary:", error.message);
    return null;
  }

  const todayStart = startOfTodayIso();
  let todayCount = 0;
  let todayCostUsd = 0;
  let weekCount = 0;
  let weekCostUsd = 0;

  for (const row of data ?? []) {
    const cost = estimateCostUsd(row.model, row.input_tokens, row.output_tokens);
    weekCount += 1;
    weekCostUsd += cost;
    if (row.created_at >= todayStart) {
      todayCount += 1;
      todayCostUsd += cost;
    }
  }

  return { todayCount, todayCostUsd, weekCount, weekCostUsd };
}
