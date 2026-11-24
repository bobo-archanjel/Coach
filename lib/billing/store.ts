import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SubscriptionRow } from "./entitlements";
import type { BillingStore, ClaimResult, EventLog, SubscriptionPatch } from "./webhook";

/**
 * Zápis predplatného a protokol Stripe udalostí — service role (RLS sa obchádza), preto
 * volať LEN z webhooku a z checkout akcie po overení trénera (každé volanie má explicitné
 * trainer_id / customer_id).
 */
const COLS =
  "trainer_id, stripe_customer_id, stripe_subscription_id, tier, status, trial_ends_at, current_period_end, cancel_at_period_end, past_due_since, comped, client_limit, scheduled_tier, scheduled_client_limit, scheduled_change_at";

export function createBillingStore(): BillingStore {
  const db = createAdminClient();
  return {
    async getByTrainer(trainerId) {
      const { data, error } = await db.from("trainer_subscriptions").select(COLS).eq("trainer_id", trainerId).maybeSingle();
      if (error) throw new Error(`billing.getByTrainer: ${error.message}`);
      return (data as SubscriptionRow | null) ?? null;
    },
    async getByCustomer(customerId) {
      const { data, error } = await db.from("trainer_subscriptions").select(COLS).eq("stripe_customer_id", customerId).maybeSingle();
      if (error) throw new Error(`billing.getByCustomer: ${error.message}`);
      return (data as SubscriptionRow | null) ?? null;
    },
    async save(trainerId: string, patch: SubscriptionPatch) {
      const { error } = await db
        .from("trainer_subscriptions")
        .upsert({ ...patch, trainer_id: trainerId, updated_at: new Date().toISOString() }, { onConflict: "trainer_id" });
      if (error) throw new Error(`billing.save: ${error.message}`);
    },
  };
}

/** Protokol udalostí (tabuľka stripe_events): processing → done; zaseknuté „processing“ >5 min sa dá znova. */
const STALE_MS = 5 * 60_000;

export function createEventLog(): EventLog {
  const db = createAdminClient();
  return {
    async claim(eventId, type): Promise<ClaimResult> {
      const { error } = await db.from("stripe_events").insert({ id: eventId, type, status: "processing" });
      if (!error) return "new";
      if (error.code !== "23505") throw new Error(`billing.claim: ${error.message}`);

      const { data } = await db.from("stripe_events").select("status, received_at").eq("id", eventId).maybeSingle();
      if (data?.status === "done") return "duplicate";
      const age = data?.received_at ? Date.now() - Date.parse(data.received_at as string) : Infinity;
      if (age < STALE_MS) return "busy";
      // zaseknutý pokus (spadol proces) — prevezmeme; podmienka na received_at zabráni dvom naraz
      const { data: taken } = await db
        .from("stripe_events")
        .update({ received_at: new Date().toISOString() })
        .eq("id", eventId)
        .eq("status", "processing")
        .eq("received_at", data?.received_at as string)
        .select("id");
      return taken && taken.length > 0 ? "new" : "busy";
    },
    async markDone(eventId) {
      const { error } = await db
        .from("stripe_events")
        .update({ status: "done", processed_at: new Date().toISOString() })
        .eq("id", eventId);
      if (error) throw new Error(`billing.markDone: ${error.message}`);
    },
    async release(eventId) {
      await db.from("stripe_events").delete().eq("id", eventId).eq("status", "processing");
    },
  };
}
