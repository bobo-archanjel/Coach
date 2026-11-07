"use server";

// Skrývanie upozornení zvončeka klienta a "prečítané" (feature/AIupgrade, mirror
// app/dashboard/attention/actions.ts). Načítanie dát je GET /api/portal/attention
// (lib/portal/attentionData.ts) — čítanie nemá čakať vo fronte server actions
// spolu so zápismi.

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient, getUser } from "@/lib/supabase/server";
import { isValidClientDismissKey } from "@/lib/portal/attention";

const DEV_NO_SESSION = process.env.NODE_ENV === "development";

const DAY_MS = 86_400_000;
const PRUNE_AFTER_DAYS = 90;

async function getOwnClientId(supabase: Awaited<ReturnType<typeof createClient>>, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from("clients")
    .select("id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

/**
 * Skryje upozornenia. `days` = na koľko dní (null = kým sa nezmení situácia — kľúč
 * nesie jej identitu, viď lib/portal/attention.ts). Kľúče sa validujú, server
 * neprijme ľubovoľný reťazec.
 */
export async function dismissPortalNotificationsAction(
  keys: string[],
  days: number | null,
  revalidate = true,
): Promise<{ ok: boolean }> {
  if (!Array.isArray(keys) || keys.length === 0 || keys.length > 200 || !keys.every(isValidClientDismissKey)) {
    return { ok: false };
  }
  if (days !== null && !(Number.isInteger(days) && days >= 1 && days <= 90)) return { ok: false };

  const {
    data: { user },
  } = await getUser();
  if (!user) return { ok: DEV_NO_SESSION }; // dev náhľad: nič sa neukladá, UI skrýva optimisticky

  const supabase = await createClient();
  const clientId = await getOwnClientId(supabase, user.id);
  if (!clientId) return { ok: false };

  const now = Date.now();
  const until = days == null ? null : new Date(now + days * DAY_MS).toISOString();

  const { error } = await supabase.from("client_notification_dismissals").upsert(
    keys.map((key) => ({
      client_id: clientId,
      key,
      dismissed_until: until,
      created_at: new Date(now).toISOString(),
    })),
    { onConflict: "client_id,key" },
  );
  if (error) {
    console.error("dismissPortalNotificationsAction:", error.message);
    return { ok: false };
  }

  // Poriadok: kľúče staršie než 90 dní už nikdy nebudú relevantné. Až po odoslaní
  // odpovede (after) — skrytie na ňu nemusí čakať.
  after(async () => {
    await supabase
      .from("client_notification_dismissals")
      .delete()
      .eq("client_id", clientId)
      .lt("created_at", new Date(now - PRUNE_AFTER_DAYS * DAY_MS).toISOString());
  });

  if (revalidate) revalidatePath("/portal");
  return { ok: true };
}

/**
 * "Označiť všetko ako prečítané" — nastaví SKUTOČNÉ read_at (mark_messages_read
 * RPC, 0008; klient nemá UPDATE na messages), takže zmizne aj bodka pri "Chat".
 */
export async function markAllPortalMessagesReadAction(): Promise<{ ok: boolean }> {
  const {
    data: { user },
  } = await getUser();
  if (!user) return { ok: DEV_NO_SESSION };

  const supabase = await createClient();
  const clientId = await getOwnClientId(supabase, user.id);
  if (!clientId) return { ok: false };

  const { error } = await supabase.rpc("mark_messages_read", { p_client_id: clientId });
  if (error) return { ok: false };

  revalidatePath("/portal");
  revalidatePath("/portal/chat");
  return { ok: true };
}
