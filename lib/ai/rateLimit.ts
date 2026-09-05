// FitPilot — AI blok, Krok 4: denný limit AI chat správ na klienta. Kontroluje
// sa PRED volaním Claude (nulové náklady pri zamietnutí) — počíta z ai_usage
// (0013), ktoré sa zapisuje po každom skutočnom volaní modelu (viď lib/ai/chat.ts).
// Limit je env premenná, aby sa dal meniť bez zásahu do kódu; eskalované
// odpovede (zdravotný pre-filter) sa do limitu nepočítajú — nevolajú model.

import type { SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_DAILY_LIMIT = 20;

function dailyLimit(): number {
  const raw = process.env.AI_CHAT_DAILY_LIMIT_PER_CLIENT;
  const parsed = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_DAILY_LIMIT;
}

function startOfTodayInTz(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Bratislava",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  // Bratislava je UTC+1/+2 — polnoc miestneho času je vždy ešte "včera" v UTC
  // v najhoršom prípade, takže mierny sklz na strane limitu (nikdy nie exploit,
  // len prípadne o pár hodín skôr resetovaný limit) je prijateľný pre MVP.
  return `${get("year")}-${get("month")}-${get("day")}T00:00:00+01:00`;
}

/** True = klient dnes už vyčerpal denný limit AI chat správ, appka nemá volať Claude. */
export async function isChatRateLimited(supabase: SupabaseClient, clientId: string): Promise<boolean> {
  const { count, error } = await supabase
    .from("ai_usage")
    .select("id", { count: "exact", head: true })
    .eq("client_id", clientId)
    .eq("kind", "chat")
    .gte("created_at", startOfTodayInTz());

  if (error) {
    // Pri chybe počítania radšej nezablokovať appku bezdôvodne — ale zaloguj,
    // nech sa to dá dohľadať, keby to malo maskovať skutočný rate-limit bug.
    console.error("isChatRateLimited:", error.message);
    return false;
  }
  return (count ?? 0) >= dailyLimit();
}

export const AI_CHAT_DAILY_LIMIT = dailyLimit;

const DEFAULT_PROGRESS_SUMMARY_DAILY_LIMIT = 5;

function progressSummaryDailyLimit(): number {
  const raw = process.env.AI_PROGRESS_SUMMARY_DAILY_LIMIT_PER_CLIENT;
  const parsed = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_PROGRESS_SUMMARY_DAILY_LIMIT;
}

/**
 * True = pre tohto klienta bol dnes už vyčerpaný limit AI zhrnutí progresu.
 * Tréner klika na tlačidlo sám (nie automatizované), ale bez limitu by opakované
 * klikanie vedelo natočiť zbytočné náklady — nízky limit stačí, zhrnutie sa
 * počíta z rovnakých dát znova a znova v priebehu jedného dňa.
 */
export async function isProgressSummaryRateLimited(supabase: SupabaseClient, clientId: string): Promise<boolean> {
  const { count, error } = await supabase
    .from("ai_usage")
    .select("id", { count: "exact", head: true })
    .eq("client_id", clientId)
    .eq("kind", "progress_summary")
    .gte("created_at", startOfTodayInTz());

  if (error) {
    console.error("isProgressSummaryRateLimited:", error.message);
    return false;
  }
  return (count ?? 0) >= progressSummaryDailyLimit();
}

export const AI_PROGRESS_SUMMARY_DAILY_LIMIT = progressSummaryDailyLimit;
