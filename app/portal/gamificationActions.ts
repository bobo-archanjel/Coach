"use server";

// FitPilot — klientska strana gamifikácie: „videné“ oslavy. Klient smie len označiť VLASTNÉ
// úspechy ako videné; nič iné (rekordy, odznaky, XP) cez túto akciu zapísať nejde. Zápis
// robí service role (tabuľka nemá write práva, 0078) po overení vlastníctva.

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { tryCreateAdminClient } from "@/lib/supabase/admin";
import { todayIso, weekStartOf } from "@/lib/reports/period";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function markAchievementsSeenAction(ids: string[]): Promise<{ ok: boolean }> {
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 30 || !ids.every((i) => typeof i === "string" && UUID.test(i))) {
    return { ok: false };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };
  const { data: client } = await supabase
    .from("clients")
    .select("id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!client) return { ok: false };
  const admin = tryCreateAdminClient();
  if (!admin) return { ok: false };
  const { error } = await admin
    .from("client_achievements")
    .update({ seen_at: new Date().toISOString() })
    .eq("client_id", client.id)
    .in("id", ids)
    .is("seen_at", null);
  return { ok: !error };
}

// ---------- fáza B: nastavenia klienta (rebríček, týždenný súhrn) ----------

async function myClientId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: client } = await supabase
    .from("clients")
    .select("id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (client?.id as string | undefined) ?? null;
}

/** Klient sa zobrazí/skryje v rebríčku svojho trénera (opt-out; predvolene viditeľný). */
export async function setLeaderboardVisibleAction(visible: boolean): Promise<{ ok: boolean }> {
  if (typeof visible !== "boolean") return { ok: false };
  const clientId = await myClientId();
  if (!clientId) return { ok: false };
  const admin = tryCreateAdminClient();
  if (!admin) return { ok: false };
  const { error } = await admin
    .from("gamification_settings")
    .upsert({ client_id: clientId, leaderboard_visible: visible, updated_at: new Date().toISOString() }, { onConflict: "client_id" });
  if (!error) revalidatePath("/portal/uspechy");
  return { ok: !error };
}

/** Týždenný súhrn „Tvoj týždeň“ sa už videl — ukáže sa až ďalší týždeň. Akceptuje len pondelok, nie budúci. */
export async function markWeeklySummarySeenAction(weekStart: string): Promise<{ ok: boolean }> {
  if (typeof weekStart !== "string" || !/^d{4}-d{2}-d{2}$/.test(weekStart) || weekStartOf(weekStart) !== weekStart || weekStart > todayIso()) {
    return { ok: false };
  }
  const clientId = await myClientId();
  if (!clientId) return { ok: false };
  const admin = tryCreateAdminClient();
  if (!admin) return { ok: false };
  const { data: row } = await admin.from("gamification_settings").select("summary_seen_week").eq("client_id", clientId).maybeSingle();
  const prev = (row?.summary_seen_week as string | null | undefined) ?? null;
  if (prev && prev >= weekStart) return { ok: true };
  const { error } = await admin
    .from("gamification_settings")
    .upsert({ client_id: clientId, summary_seen_week: weekStart, updated_at: new Date().toISOString() }, { onConflict: "client_id" });
  return { ok: !error };
}
