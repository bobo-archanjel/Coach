import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getTranslations } from "next-intl/server";
import { createClient, getProfile, getUser } from "@/lib/supabase/server";
import { getTrainerBilling } from "@/lib/billing/server";
import { reportsUnlocked } from "./access";

export type ReportsAuth =
  | { ok: true; supabase: SupabaseClient; userId: string }
  | { ok: false; status: 401 | 403; error: string; locked: boolean };

/**
 * Stráž KAŽDÉHO loadera a exportu reportov (server action / route handler je verejný endpoint,
 * zamknutá karta v UI nestačí): prihlásený tréner + tarifa s funkciou `advancedReports`.
 * Údaje samotné chráni RLS a explicitné `trainer_id` filtre v loaderoch.
 */
export async function requireReports(): Promise<ReportsAuth> {
  const t = await getTranslations("reports.errors");
  const {
    data: { user },
  } = await getUser();
  if (!user) return { ok: false, status: 401, error: t("notSignedIn"), locked: false };
  const { data: profile } = await getProfile(user.id);
  if (profile?.role !== "trainer") return { ok: false, status: 403, error: t("trainerOnly"), locked: false };

  const supabase = await createClient();
  const { state } = await getTrainerBilling(supabase, user.id);
  if (!reportsUnlocked(state)) return { ok: false, status: 403, error: t("locked"), locked: true };
  return { ok: true, supabase, userId: user.id };
}
