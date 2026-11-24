import "server-only";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient, getProfile } from "@/lib/supabase/server";
import { tryCreateAdminClient } from "@/lib/supabase/admin";
import { tErr, type ErrorKey } from "@/lib/i18n/serverErrors";
import { computeBilling, coachAvailableForClients, TRIAL_DAYS, type BillingState, type SubscriptionRow } from "./entitlements";
import { TRIAL_CLIENT_LIMIT, minTierFor, type Feature } from "./plans";

const SUB_COLUMNS =
  "trainer_id, stripe_customer_id, stripe_subscription_id, tier, status, trial_ends_at, current_period_end, cancel_at_period_end, past_due_since, comped, client_limit, scheduled_tier, scheduled_client_limit, scheduled_change_at";

/**
 * Riadok predplatného trénera. Číta sa cez bežný klient (RLS: len vlastný riadok). Keď riadok
 * chýba (napr. trigger z 0073 ešte nebehol), dotvorí sa 14-dňová skúška cez service role —
 * len pre účet s rolou tréner a podľa dátumu založenia profilu (skúška sa nikdy nereštartuje).
 */
async function loadSubscription(supabase: SupabaseClient, trainerId: string): Promise<SubscriptionRow | null> {
  const { data, error } = await supabase.from("trainer_subscriptions").select(SUB_COLUMNS).eq("trainer_id", trainerId).maybeSingle();
  if (error) {
    // tabuľka ešte neexistuje (migrácia 0073 nebehla) alebo výpadok → uzavreté (read-only), nie otvorené
    console.error("billing.loadSubscription:", error.message);
    return null;
  }
  if (data) return data as SubscriptionRow;

  const { data: profile } = await supabase.from("profiles").select("role, created_at").eq("id", trainerId).maybeSingle();
  if (profile?.role !== "trainer") return null;
  const admin = tryCreateAdminClient();
  if (!admin) return null;
  const created = profile.created_at ? Date.parse(profile.created_at as string) : Date.now();
  const trialEnds = new Date(created + TRIAL_DAYS * 86_400_000).toISOString();
  const { error: insErr } = await admin
    .from("trainer_subscriptions")
    .upsert({ trainer_id: trainerId, tier: "starter", status: "app_trial", trial_ends_at: trialEnds, client_limit: TRIAL_CLIENT_LIMIT }, { onConflict: "trainer_id", ignoreDuplicates: true });
  if (insErr) {
    console.error("billing.ensureTrial:", insErr.message);
    return null;
  }
  const { data: again } = await supabase.from("trainer_subscriptions").select(SUB_COLUMNS).eq("trainer_id", trainerId).maybeSingle();
  return (again as SubscriptionRow | null) ?? null;
}

/** Počet aktívnych klientov trénera (nie ukončení ani v mazaní) — RLS scopuje na trénera. */
async function countActiveClients(supabase: SupabaseClient, trainerId: string): Promise<number> {
  const { count, error } = await supabase
    .from("clients")
    .select("id", { count: "exact", head: true })
    .eq("trainer_id", trainerId)
    .is("ended_at", null)
    .is("deletion_requested_at", null);
  if (error) console.error("billing.countActiveClients:", error.message);
  return count ?? 0;
}

export interface TrainerBilling {
  state: BillingState;
  row: SubscriptionRow | null;
}

/** Stav predplatného + oprávnenia trénera (tarifa, read-only a dôvod, dni skúšky, využitie klientov). */
export async function getTrainerBilling(supabase: SupabaseClient, trainerId: string): Promise<TrainerBilling> {
  const [row, count] = await Promise.all([loadSubscription(supabase, trainerId), countActiveClients(supabase, trainerId)]);
  return { row, state: computeBilling(row, count) };
}

/** Verzia pre layout/stránky: cache() zlúči volania v rámci jedného requestu. */
export const getMyTrainerBilling = cache(async (trainerId: string): Promise<TrainerBilling> => {
  return getTrainerBilling(await createClient(), trainerId);
});

const READ_ONLY_KEY = {
  no_subscription: "billing.readOnly.no_subscription",
  trial_ended: "billing.readOnly.trial_ended",
  subscription_ended: "billing.readOnly.subscription_ended",
  past_due_expired: "billing.readOnly.past_due_expired",
  over_limit: "billing.readOnly.over_limit",
} as const satisfies Record<string, ErrorKey>;

export interface GuardOptions {
  /** funkcia, ktorú akcia vyžaduje (AI …) — ak ju tarifa nemá, akcia sa odmietne */
  feature?: Feature;
  /** akcia, ktorá počet klientov len znižuje (ukončiť/zmazať klienta) — povolená aj v read-only */
  allowReadOnly?: boolean;
}

/**
 * CENTRÁLNA stráž každej trénerskej mutácie (server action = verejný endpoint, tlačidlá
 * v UI nestačia). Vráti lokalizovanú chybovú hlášku, alebo `null` keď je akcia povolená:
 *
 *   const blocked = await trainerBlock();
 *   if (blocked) return { error: blocked };
 *
 * Bez session alebo nie-tréner (napr. klient volajúci zdieľanú akciu) sa tu nerieši — to robí
 * samotná akcia (RLS); stráž blokuje len trénera bez prístupu. Fail-closed: ak sa stav nedá
 * načítať (chýba tabuľka, výpadok), tréner je read-only.
 */
export async function trainerBlock(opts: GuardOptions = {}): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // bez session stráž nerozhoduje — každá akcia si prihláseného používateľa overuje sama
  // (a RLS bez session nepustí nič), takže jej pôvodné chyby (napr. validácia) ostávajú v poradí
  if (!user) return null;
  const { data: profile } = await getProfile(user.id);
  if (profile?.role !== "trainer") return null;

  const { state } = await getTrainerBilling(supabase, user.id);
  if (state.readOnly && !opts.allowReadOnly) {
    return tErr(READ_ONLY_KEY[state.reason ?? "no_subscription"]);
  }
  if (opts.feature && !state.features[opts.feature] && !(opts.allowReadOnly && state.readOnly)) {
    return tErr("billing.featureLocked", { tier: minTierFor(opts.feature).toUpperCase() });
  }
  return null;
}

/** Hláška pre pokus o pridanie klienta nad limit tarify. */
export async function clientLimitMessage(limit: number | null): Promise<string> {
  return tErr("billing.clientLimit", { limit: limit ?? 0 });
}

/**
 * Smie klient používať AI Kouča? Závisí od tarify JEHO trénera (klient jeho riadok
 * predplatného cez RLS nevidí → service role, výsledok je len boolean). Bez trénera,
 * bez service role kľúča alebo pri chybe = false (fail-closed).
 */
export async function trainerAllowsCoach(trainerId: string | null | undefined): Promise<boolean> {
  if (!trainerId) return false;
  const admin = tryCreateAdminClient();
  if (!admin) return false;
  const { data, error } = await admin.from("trainer_subscriptions").select(SUB_COLUMNS).eq("trainer_id", trainerId).maybeSingle();
  if (error) {
    console.error("billing.trainerAllowsCoach:", error.message);
    return false;
  }
  return coachAvailableForClients((data as SubscriptionRow | null) ?? null);
}

/**
 * Stráž pridania klienta (nový klient / spárovanie kódom): okrem read-only blokuje aj
 * dosiahnutý limit aktívnych klientov tarify. DB trigger billing_clients_limit_guard (0073)
 * je druhá, neobchádzateľná vrstva.
 */
export async function trainerAddClientBlock(): Promise<string | null> {
  const blocked = await trainerBlock();
  if (blocked) return blocked;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await getProfile(user.id);
  if (profile?.role !== "trainer") return null;
  const { state } = await getTrainerBilling(supabase, user.id);
  if (!state.canAddClient) return clientLimitMessage(state.clientLimit);
  return null;
}
