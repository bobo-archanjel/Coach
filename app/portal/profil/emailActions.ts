"use server";

// Klient si zapne/vypne „Týždenné zhrnutie e-mailom“. Zápis ide cez bežný klient (RLS 0082:
// klient smie len VLASTNÝ riadok client_email_prefs), takže nič cudzie sa zmeniť nedá.

import { revalidatePath } from "next/cache";
import { createClient, getMyClient } from "@/lib/supabase/server";

export async function setWeeklyEmailAction(enabled: boolean): Promise<{ ok: boolean }> {
  if (typeof enabled !== "boolean") return { ok: false };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };
  const { data: client } = await getMyClient(user.id);
  if (!client?.id) return { ok: false };
  const { error } = await supabase
    .from("client_email_prefs")
    .upsert({ client_id: client.id as string, weekly_summary: enabled, updated_at: new Date().toISOString() }, { onConflict: "client_id" });
  if (error) {
    console.error("portal.setWeeklyEmail:", error.message);
    return { ok: false };
  }
  revalidatePath("/portal/profil");
  return { ok: true };
}
