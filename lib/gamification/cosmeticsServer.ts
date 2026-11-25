import "server-only";
import { cache } from "react";
import { createClient, getMyClient } from "@/lib/supabase/server";
import { tryCreateAdminClient } from "@/lib/supabase/admin";
import { todayIso, weekStartOf } from "@/lib/reports/period";
import { cachedStreakValid } from "./streakCache";
import {
  FLAME_HOT_STREAK,
  isCelebrationId,
  isFrameId,
  isThemeId,
  normalizeTitleLevel,
  type CelebrationId,
  type FrameId,
  type ThemeId,
} from "./rewards";

// FitPilot — zvolené kozmetické odmeny klienta (gamifikácia v2): rámik avatara, farebná téma, štýl oslavy a titul
// v rebríčku. Čítanie cez bežný klient (RLS: vlastný riadok gamification_settings), request-cache. Voľbu zapisuje
// výlučne server po overení úrovne (app/portal/gamificationActions.ts). Chýbajúca migrácia / riadok = predvolené.
// Nové stĺpce (0086: celebration_style, leaderboard_title): kým migrácia
// nebeží, rámik a téma fungujú ďalej a oslava ostáva „konfety“, titul žiadny.

export interface Cosmetics {
  frame: FrameId;
  theme: ThemeId;
  celebration: CelebrationId;
  /** zvolený titul = číslo úrovne 10–20 (null = bez titulu) */
  titleLevel: number | null;
  /** rámik Plameň sa rozžiari silnejšie pri dlhej sérii (≥ FLAME_HOT_STREAK týždňov) */
  flameHot: boolean;
}

export const DEFAULT_COSMETICS: Cosmetics = { frame: "none", theme: "default", celebration: "confetti", titleLevel: null, flameHot: false };

export const loadCosmetics = cache(async (userId: string): Promise<Cosmetics> => {
  try {
    const { data: client } = await getMyClient(userId);
    if (!client) return DEFAULT_COSMETICS;
    const supabase = await createClient();
    // jeden dopyt na všetky stĺpce; keď migrácia 0086 ešte nebeží (neznámy stĺpec), spadne na pôvodné dva stĺpce
    const full = await supabase
      .from("gamification_settings")
      .select("avatar_frame, portal_theme, celebration_style, leaderboard_title")
      .eq("client_id", client.id)
      .maybeSingle();
    let data: Record<string, unknown> | null = full.data as Record<string, unknown> | null;
    if (full.error) {
      const base = await supabase.from("gamification_settings").select("avatar_frame, portal_theme").eq("client_id", client.id).maybeSingle();
      if (base.error) return DEFAULT_COSMETICS;
      data = base.data as Record<string, unknown> | null;
    }
    if (!data) return DEFAULT_COSMETICS;
    const frame: FrameId = isFrameId(data.avatar_frame) ? data.avatar_frame : "none";
    const theme: ThemeId = isThemeId(data.portal_theme) ? data.portal_theme : "default";
    const celebration: CelebrationId = isCelebrationId(data.celebration_style) ? data.celebration_style : "confetti";
    const titleLevel = normalizeTitleLevel(data.leaderboard_title);

    // „horúci“ Plameň: jediný lacný dopyt na uloženú sériu, len keď má klient Plameň zvolený
    let flameHot = false;
    if (frame === "flame") {
      try {
        const admin = tryCreateAdminClient();
        if (admin) {
          const { data: row } = await admin.from("client_streak_cache").select("streak_weeks, expires_week").eq("client_id", client.id).maybeSingle();
          flameHot =
            !!row && (row.streak_weeks as number) >= FLAME_HOT_STREAK && cachedStreakValid({ streakWeeks: row.streak_weeks as number, expiresWeek: row.expires_week as string }, weekStartOf(todayIso()));
        }
      } catch {
        flameHot = false;
      }
    }
    return { frame, theme, celebration, titleLevel, flameHot };
  } catch {
    return DEFAULT_COSMETICS;
  }
});
