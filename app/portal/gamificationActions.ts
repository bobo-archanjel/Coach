"use server";

// FitPilot — klientska strana gamifikácie: „videné“ oslavy. Klient smie len označiť VLASTNÉ
// úspechy ako videné; nič iné (rekordy, odznaky, XP) cez túto akciu zapísať nejde. Zápis
// robí service role (tabuľka nemá write práva, 0078) po overení vlastníctva.

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { tryCreateAdminClient } from "@/lib/supabase/admin";
import { cookies } from "next/headers";
import { todayIso, weekStartOf } from "@/lib/reports/period";
import { loadXpBreakdown } from "@/lib/gamification/server";
import { levelDetail } from "@/lib/gamification/xp";
import { celebrationUnlocked, frameUnlocked, isCelebrationId, isFrameId, isThemeId, normalizeTitleLevel, themeUnlocked, titleUnlocked } from "@/lib/gamification/rewards";
import { loadBrandingForTrainer } from "@/lib/branding/server";
import { validateNickname } from "@/lib/gamification/nickname";
import { FINISH_COOKIE } from "@/lib/gamification/finishSummary";
import type { SupabaseClient } from "@supabase/supabase-js";
import { canMarkRest } from "@/lib/gamification/rings";
import { claimRingsCelebration, type ClaimResult } from "@/lib/gamification/ringsServer";

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
  if (typeof weekStart !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart) || weekStartOf(weekStart) !== weekStart || weekStart > todayIso()) {
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

// ---------- v2: prezývka v rebríčku, rámik avatara, téma, „Tréning v číslach“ ----------
// Všetko zapisuje výlučne server po overení session; úroveň odomykajúca rámik/tému sa počíta z dát
// (XP nikdy neprichádza od klienta), prezývka sa validuje (lib/gamification/nickname.ts).

export type SettingsResult = { ok: true } | { ok: false; error: "invalid" | "length" | "chars" | "blocked" | "locked" | "failed" };

export async function setNicknameAction(raw: string | null): Promise<SettingsResult> {
  const clientId = await myClientId();
  if (!clientId) return { ok: false, error: "failed" };
  const admin = tryCreateAdminClient();
  if (!admin) return { ok: false, error: "failed" };
  // null alebo prázdny reťazec = vrátiť predvolenú prezývku („Meno P.“)
  let value: string | null = null;
  if (raw != null && raw.trim() !== "") {
    const v = validateNickname(raw);
    if (!v.ok) return { ok: false, error: v.error };
    value = v.value;
  }
  const { error } = await admin
    .from("gamification_settings")
    .upsert({ client_id: clientId, nickname: value, updated_at: new Date().toISOString() }, { onConflict: "client_id" });
  if (error) return { ok: false, error: "failed" };
  revalidatePath("/portal/uspechy");
  return { ok: true };
}

async function currentLevel(clientId: string): Promise<number | null> {
  const supabase = await createClient();
  const xp = await loadXpBreakdown(supabase, clientId);
  return xp ? levelDetail(xp.total).n : null;
}

/** Má tréner klienta aktívnu značku (Business)? Vtedy sa témy portálu nezobrazujú ani neukladajú. */
async function isBrandedClient(clientId: string): Promise<boolean> {
  const admin = tryCreateAdminClient();
  if (!admin) return false;
  const { data } = await admin.from("clients").select("trainer_id").eq("id", clientId).maybeSingle();
  return Boolean(await loadBrandingForTrainer((data?.trainer_id as string | null | undefined) ?? null));
}

export async function setFrameAction(frame: string): Promise<SettingsResult> {
  if (!isFrameId(frame)) return { ok: false, error: "invalid" };
  const clientId = await myClientId();
  if (!clientId) return { ok: false, error: "failed" };
  const level = await currentLevel(clientId);
  if (level == null) return { ok: false, error: "failed" };
  if (!frameUnlocked(frame, level)) return { ok: false, error: "locked" };
  const admin = tryCreateAdminClient();
  if (!admin) return { ok: false, error: "failed" };
  const { error } = await admin
    .from("gamification_settings")
    .upsert({ client_id: clientId, avatar_frame: frame, updated_at: new Date().toISOString() }, { onConflict: "client_id" });
  if (error) return { ok: false, error: "failed" };
  revalidatePath("/portal", "layout");
  return { ok: true };
}

export async function setThemeAction(theme: string): Promise<SettingsResult> {
  if (!isThemeId(theme)) return { ok: false, error: "invalid" };
  const clientId = await myClientId();
  if (!clientId) return { ok: false, error: "failed" };
  // klient so značkou trénera témy nemá (značka vyhráva) — server to vynúti aj keď by UI niekto obišiel
  if (await isBrandedClient(clientId)) return { ok: false, error: "locked" };
  const level = await currentLevel(clientId);
  if (level == null) return { ok: false, error: "failed" };
  if (!themeUnlocked(theme, level)) return { ok: false, error: "locked" };
  const admin = tryCreateAdminClient();
  if (!admin) return { ok: false, error: "failed" };
  const { error } = await admin
    .from("gamification_settings")
    .upsert({ client_id: clientId, portal_theme: theme, updated_at: new Date().toISOString() }, { onConflict: "client_id" });
  if (error) return { ok: false, error: "failed" };
  revalidatePath("/portal", "layout");
  return { ok: true };
}

/** Štýl osláv (konfety / hviezdy / ohňostroj): server overí, že ho úroveň klienta odomkla. */
export async function setCelebrationAction(style: string): Promise<SettingsResult> {
  if (!isCelebrationId(style)) return { ok: false, error: "invalid" };
  const clientId = await myClientId();
  if (!clientId) return { ok: false, error: "failed" };
  const level = await currentLevel(clientId);
  if (level == null) return { ok: false, error: "failed" };
  if (!celebrationUnlocked(style, level)) return { ok: false, error: "locked" };
  const admin = tryCreateAdminClient();
  if (!admin) return { ok: false, error: "failed" };
  const { error } = await admin
    .from("gamification_settings")
    .upsert({ client_id: clientId, celebration_style: style, updated_at: new Date().toISOString() }, { onConflict: "client_id" });
  if (error) return { ok: false, error: "failed" };
  revalidatePath("/portal", "layout");
  return { ok: true };
}

/** Titul vedľa prezývky v rebríčku = číslo úrovne 10–20 nepresahujúce aktuálnu úroveň; null = bez titulu. */
export async function setTitleAction(titleLevel: number | null): Promise<SettingsResult> {
  if (titleLevel !== null && normalizeTitleLevel(titleLevel) == null) return { ok: false, error: "invalid" };
  const clientId = await myClientId();
  if (!clientId) return { ok: false, error: "failed" };
  if (titleLevel !== null) {
    const level = await currentLevel(clientId);
    if (level == null) return { ok: false, error: "failed" };
    if (!titleUnlocked(titleLevel, level)) return { ok: false, error: "locked" };
  }
  const admin = tryCreateAdminClient();
  if (!admin) return { ok: false, error: "failed" };
  const { error } = await admin
    .from("gamification_settings")
    .upsert({ client_id: clientId, leaderboard_title: titleLevel, updated_at: new Date().toISOString() }, { onConflict: "client_id" });
  if (error) return { ok: false, error: "failed" };
  revalidatePath("/portal/uspechy");
  return { ok: true };
}

/** „Tréning v číslach“ sa už videl — zmaže krátkodobú cookie (inak by sa po obnovení ukázal znova). */
export async function clearFinishSummaryAction(): Promise<{ ok: boolean }> {
  (await cookies()).set(FINISH_COOKIE, "", { path: "/portal", maxAge: 0, httpOnly: true, sameSite: "lax" });
  return { ok: true };
}

// ---------- denné prstence: „Dnes oddychujem“ a oslava uzavretých prstencov ----------
// Klient smie označiť len DNEŠNÝ deň a len keď dnes nemá dokončený tréning; zápis robí service role po overení
// session (tabuľka client_rest_days nemá write práva, 0087). Odpočinok zatvára len prstenec Pohyb — nie je to
// tréning a nikde inde sa nepočíta (série, misie, odznaky, reporty čítajú workout_logs).

export type RestResult = { ok: true } | { ok: false; error: "workout" | "unavailable" | "failed" };

export async function setRestDayAction(rest: boolean): Promise<RestResult> {
  if (typeof rest !== "boolean") return { ok: false, error: "failed" };
  const clientId = await myClientId();
  if (!clientId) return { ok: false, error: "failed" };
  const admin = tryCreateAdminClient();
  if (!admin) return { ok: false, error: "failed" };
  const today = todayIso();
  if (rest) {
    const supabase = await createClient();
    const { data, error: wErr } = await supabase
      .from("workout_logs")
      .select("id")
      .eq("client_id", clientId)
      .eq("performed_on", today)
      .eq("status", "completed")
      .limit(1);
    if (wErr) return { ok: false, error: "failed" };
    if (!canMarkRest((data ?? []).length > 0)) return { ok: false, error: "workout" };
    // jeden riadok na deň (PRIMARY KEY); opakovaný klik nič nezdvojí
    const { error } = await admin.from("client_rest_days").upsert({ client_id: clientId, day: today }, { onConflict: "client_id,day", ignoreDuplicates: true });
    if (error) return { ok: false, error: "unavailable" };
  } else {
    // vrátenie späť len pre dnešok — staršie dni sa nemenia
    const { error } = await admin.from("client_rest_days").delete().eq("client_id", clientId).eq("day", today);
    if (error) return { ok: false, error: "unavailable" };
  }
  revalidatePath("/portal", "layout");
  return { ok: true };
}

/** Oslava „Všetky kruhy uzavreté!“: server prepočíta prstence z dát a deň zapíše (raz za deň, +XP). */
export async function claimRingsCelebrationAction(): Promise<ClaimResult> {
  const clientId = await myClientId();
  if (!clientId) return { status: "open" };
  const admin = tryCreateAdminClient();
  if (!admin) return { status: "open" };
  const result = await claimRingsCelebration(await createClient(), admin as unknown as SupabaseClient, clientId, todayIso());
  if (result.status === "celebrate" && result.persisted) revalidatePath("/portal/uspechy");
  return result;
}
