"use server";

// FitPilot — klientska strana gamifikácie: „videné“ oslavy. Klient smie len označiť VLASTNÉ
// úspechy ako videné; nič iné (rekordy, odznaky, XP) cez túto akciu zapísať nejde. Zápis
// robí service role (tabuľka nemá write práva, 0078) po overení vlastníctva.

import { createClient } from "@/lib/supabase/server";
import { tryCreateAdminClient } from "@/lib/supabase/admin";

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
