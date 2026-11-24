import "server-only";
import { cache } from "react";
import { createClient, getMyClient } from "@/lib/supabase/server";
import { isFrameId, isThemeId, type FrameId, type ThemeId } from "./rewards";

// FitPilot — zvolený rámik avatara a farebná téma klienta (gamifikácia v2). Čítanie cez bežný klient (RLS: vlastný
// riadok gamification_settings), request-cache. Voľbu zapisuje výlučne server po overení úrovne
// (app/portal/gamificationActions.ts). Chýbajúca migrácia / riadok = predvolené (bez rámika, terakota).

export interface Cosmetics {
  frame: FrameId;
  theme: ThemeId;
}

export const DEFAULT_COSMETICS: Cosmetics = { frame: "none", theme: "default" };

export const loadCosmetics = cache(async (userId: string): Promise<Cosmetics> => {
  try {
    const { data: client } = await getMyClient(userId);
    if (!client) return DEFAULT_COSMETICS;
    const supabase = await createClient();
    const { data, error } = await supabase.from("gamification_settings").select("avatar_frame, portal_theme").eq("client_id", client.id).maybeSingle();
    if (error || !data) return DEFAULT_COSMETICS;
    return {
      frame: isFrameId(data.avatar_frame) ? data.avatar_frame : "none",
      theme: isThemeId(data.portal_theme) ? data.portal_theme : "default",
    };
  } catch {
    return DEFAULT_COSMETICS;
  }
});
