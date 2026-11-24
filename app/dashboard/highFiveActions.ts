"use server";

// FitPilot — „high five“ trénera klientovi za rekord/odznak (gamifikácia, fáza A).
// Server action = verejný endpoint, preto: (1) stráž predplatného (read-only tréner nič
// nezapisuje), (2) overená session, (3) úspech sa načíta cez RLS (tréner vidí len svojich
// klientov) a vlastníctvo sa navyše overí výslovne (clients.trainer_id = auth.uid()),
// (4) zápis cez service role — tabuľka high_fives nemá write práva (0078). Jeden high five
// na úspech zaručuje UNIQUE (achievement_id). Klient ho dostane ako položku zvončeka.

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { trainerBlock } from "@/lib/billing/server";
import { createClient } from "@/lib/supabase/server";
import { tryCreateAdminClient } from "@/lib/supabase/admin";

export interface HighFiveState {
  error: string | null;
  ok?: boolean;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function sendHighFiveAction(achievementId: string): Promise<HighFiveState> {
  const t = await getTranslations("gamification.errors");
  const blocked = await trainerBlock();
  if (blocked) return { error: blocked };
  if (typeof achievementId !== "string" || !UUID.test(achievementId)) return { error: t("invalid") };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: t("notSignedIn") };

  // RLS: tréner prečíta len úspechy svojich súčasných klientov
  const { data: achievement } = await supabase
    .from("client_achievements")
    .select("id, client_id, backfilled")
    .eq("id", achievementId)
    .maybeSingle();
  if (!achievement) return { error: t("notFound") };
  if (achievement.backfilled) return { error: t("invalid") };

  const { data: client } = await supabase
    .from("clients")
    .select("id")
    .eq("id", achievement.client_id as string)
    .eq("trainer_id", user.id)
    .is("ended_at", null)
    .is("deletion_requested_at", null)
    .maybeSingle();
  if (!client) return { error: t("notFound") };

  const admin = tryCreateAdminClient();
  if (!admin) return { error: t("failed") };
  const { error } = await admin.from("high_fives").insert({
    achievement_id: achievement.id,
    client_id: client.id,
    trainer_id: user.id,
  });
  // 23505 = tento úspech už high five má (dvojklik, druhé zariadenie) — pre trénera je to úspech
  if (error && error.code !== "23505") return { error: t("failed") };

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/klienti/${client.id}`);
  return { error: null, ok: true };
}
