"use server";

// FitPilot — výzvy trénera a nastavenie rebríčka (gamifikácia, fáza B).
// Server action = verejný endpoint, preto v KAŽDEJ akcii: (1) stráž predplatného cez trainerBlock
// (read-only tréner nič nezapisuje; výzvy a rebríček vyžadujú Pro/Business), (2) overená session
// a rola tréner, (3) vlastníctvo — cieľoví klienti sa načítajú cez RLS a explicitne sa overí
// clients.trainer_id = auth.uid(), (4) zápis cez service role (tabuľky nemajú write práva, 0079).

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { trainerBlock } from "@/lib/billing/server";
import { createClient, getProfile } from "@/lib/supabase/server";
import { tryCreateAdminClient } from "@/lib/supabase/admin";
import { todayIso } from "@/lib/reports/period";
import { MAX_ACTIVE_CHALLENGES, validateChallenge, type ChallengeInput } from "@/lib/gamification/challenges";

export interface ChallengeFormState {
  error: string | null;
  ok?: boolean;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function requireTrainer() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await getProfile(user.id);
  if (profile?.role !== "trainer") return null;
  return { supabase, userId: user.id };
}

export interface CreateChallengePayload extends Partial<ChallengeInput> {
  allClients?: boolean;
  clientIds?: string[];
}

export async function createChallengeAction(payload: CreateChallengePayload): Promise<ChallengeFormState> {
  const [t, te] = await Promise.all([getTranslations("gamification.challenges.errors"), getTranslations("gamification.challenges.errors")]);
  const blocked = await trainerBlock({ feature: "challenges" });
  if (blocked) return { error: blocked };
  const auth = await requireTrainer();
  if (!auth) return { error: t("notSignedIn") };

  const invalid = validateChallenge(
    {
      name: typeof payload?.name === "string" ? payload.name : "",
      description: typeof payload?.description === "string" ? payload.description : "",
      metric: payload?.metric,
      target: typeof payload?.target === "number" ? payload.target : Number.NaN,
      startsOn: payload?.startsOn,
      endsOn: payload?.endsOn,
    },
    todayIso(),
  );
  if (invalid) return { error: te(invalid) };

  const allClients = payload.allClients === true;
  const requested = Array.isArray(payload.clientIds) ? [...new Set(payload.clientIds)] : [];
  if (!allClients && (requested.length === 0 || requested.length > 500 || !requested.every((i) => typeof i === "string" && UUID.test(i)))) {
    return { error: te("clients") };
  }

  // aktívni klienti trénera (RLS + explicitný filter) — cieľ musí byť podmnožina
  const { data: mine, error: cErr } = await auth.supabase
    .from("clients")
    .select("id")
    .eq("trainer_id", auth.userId)
    .is("ended_at", null)
    .is("deletion_requested_at", null)
    .limit(500);
  if (cErr) return { error: t("failed") };
  const own = new Set((mine ?? []).map((c) => c.id as string));
  const targets = allClients ? [...own] : requested;
  if (!allClients && !targets.every((id) => own.has(id))) return { error: te("clients") };
  if (targets.length === 0) return { error: te("clients") };

  const { count } = await auth.supabase
    .from("challenges")
    .select("id", { count: "exact", head: true })
    .eq("trainer_id", auth.userId)
    .eq("status", "active");
  if ((count ?? 0) >= MAX_ACTIVE_CHALLENGES) return { error: te("limit", { max: MAX_ACTIVE_CHALLENGES }) };

  const admin = tryCreateAdminClient();
  if (!admin) return { error: t("failed") };
  const { data: row, error } = await admin
    .from("challenges")
    .insert({
      trainer_id: auth.userId,
      name: payload.name!.trim(),
      description: (payload.description ?? "").trim(),
      metric: payload.metric,
      target: payload.target,
      starts_on: payload.startsOn,
      ends_on: payload.endsOn,
      all_clients: allClients,
    })
    .select("id")
    .single();
  if (error || !row) return { error: error?.message?.includes("challenge_limit") ? te("limit", { max: MAX_ACTIVE_CHALLENGES }) : t("failed") };

  const { error: pErr } = await admin
    .from("challenge_participants")
    .insert(targets.map((client_id) => ({ challenge_id: row.id as string, client_id })));
  if (pErr) {
    await admin.from("challenges").delete().eq("id", row.id as string).eq("trainer_id", auth.userId);
    return { error: t("failed") };
  }

  revalidatePath("/dashboard/vyzvy");
  return { error: null, ok: true };
}

/** Ukončí výzvu (klienti ju prestanú vidieť ako bežiacu; odznaky za dokončenie ostanú). */
export async function endChallengeAction(challengeId: string): Promise<ChallengeFormState> {
  const t = await getTranslations("gamification.challenges.errors");
  const blocked = await trainerBlock();
  if (blocked) return { error: blocked };
  if (typeof challengeId !== "string" || !UUID.test(challengeId)) return { error: t("invalid") };
  const auth = await requireTrainer();
  if (!auth) return { error: t("notSignedIn") };
  const admin = tryCreateAdminClient();
  if (!admin) return { error: t("failed") };
  const { error } = await admin
    .from("challenges")
    .update({ status: "ended", ended_at: new Date().toISOString() })
    .eq("id", challengeId)
    .eq("trainer_id", auth.userId)
    .eq("status", "active");
  if (error) return { error: t("failed") };
  revalidatePath("/dashboard/vyzvy");
  return { error: null, ok: true };
}

/** Zmaže výzvu aj s účastníkmi (už získané odznaky klientov ostávajú). */
export async function deleteChallengeAction(challengeId: string): Promise<ChallengeFormState> {
  const t = await getTranslations("gamification.challenges.errors");
  const blocked = await trainerBlock();
  if (blocked) return { error: blocked };
  if (typeof challengeId !== "string" || !UUID.test(challengeId)) return { error: t("invalid") };
  const auth = await requireTrainer();
  if (!auth) return { error: t("notSignedIn") };
  const admin = tryCreateAdminClient();
  if (!admin) return { error: t("failed") };
  const { error } = await admin.from("challenges").delete().eq("id", challengeId).eq("trainer_id", auth.userId);
  if (error) return { error: t("failed") };
  revalidatePath("/dashboard/vyzvy");
  return { error: null, ok: true };
}

/** Tréner zapne/vypne rebríček všetkým svojim klientom. */
export async function setLeaderboardEnabledAction(enabled: boolean): Promise<ChallengeFormState> {
  const t = await getTranslations("gamification.challenges.errors");
  const blocked = await trainerBlock({ feature: "leaderboard" });
  if (blocked) return { error: blocked };
  if (typeof enabled !== "boolean") return { error: t("invalid") };
  const auth = await requireTrainer();
  if (!auth) return { error: t("notSignedIn") };
  const admin = tryCreateAdminClient();
  if (!admin) return { error: t("failed") };
  const { error } = await admin
    .from("trainer_gamification_settings")
    .upsert({ trainer_id: auth.userId, leaderboard_enabled: enabled, updated_at: new Date().toISOString() }, { onConflict: "trainer_id" });
  if (error) return { error: t("failed") };
  revalidatePath("/dashboard/vyzvy");
  return { error: null, ok: true };
}
