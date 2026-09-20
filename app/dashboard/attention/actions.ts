"use server";

// Zvonček upozornení + skrývanie (feature/funkcionalita) — zbiera dáta z existujúcich
// zdrojov pravdy, nič nepočíta po svojom. Volá sa z klientskej komponenty
// NotificationBell PO hydratácii (mimo kritickej cesty renderu — layout beží pri
// každej navigácii, ťažšie dopyty sem preto do neho nepatria). RLS scopuje všetko
// na klientov/riadky tohto trénera; explicitné trainer_id filtre sú len pre istotu/index.

import { revalidatePath } from "next/cache";
import { createClient, getUser } from "@/lib/supabase/server";
import { getLateStatusByClient } from "@/lib/dashboard/lateStatus";
import { getHealthDigest } from "@/lib/dashboard/healthDigest";
import { getActiveDismissals } from "@/lib/dashboard/dismissals";
import {
  applyDismissals,
  digestDismissKey,
  isValidDismissKey,
  lateDismissKey,
  type AttentionData,
} from "@/lib/dashboard/attention";

const DEV_NO_SESSION = process.env.NODE_ENV !== "production";

// DEV bez session (rovnaký princíp ako DEV_OPEN v app/dashboard/layout.tsx): vzorové
// dáta, nech sa dá zvonček pozerať bez prihlásenia. V produkcii sa nikdy nepoužije.
const PREVIEW_DATA: AttentionData = {
  unread: 3,
  late: [
    { id: "p1", name: "Lucia K.", days: 9, key: lateDismissKey("p1", "2026-09-11") },
    { id: "p2", name: "Ohrozený Oto", days: 6, key: lateDismissKey("p2", "2026-09-14") },
  ],
  digest: { from: "watch", to: "risk", count: 2, key: digestDismissKey("2026-09-14") },
};

/** `null` = nepodarilo sa načítať (UI ponechá posledný známy stav, nič nehlási). */
export async function getAttentionAction(): Promise<AttentionData | null> {
  const {
    data: { user },
  } = await getUser();
  if (!user) return DEV_NO_SESSION ? PREVIEW_DATA : null;

  const supabase = await createClient();

  const [{ data: clients, error: clientsErr }, { count: unread, error: unreadErr }, digest, dismissed] =
    await Promise.all([
      supabase.from("clients").select("id, full_name, ended_at, deletion_requested_at").eq("trainer_id", user.id),
      supabase.from("messages").select("id", { count: "exact", head: true }).eq("sender", "client").is("read_at", null),
      getHealthDigest(supabase, user.id),
      getActiveDismissals(supabase, user.id),
    ]);
  if (clientsErr || unreadErr) return null;

  // Ukončená spolupráca / žiadosť o zmazanie nie je aktuálna starostlivosť —
  // rovnaké vylúčenie ako alert panel "meškanie" na /dashboard.
  const active = (clients ?? []).filter((c) => !c.ended_at && !c.deletion_requested_at);
  const lateStatus = await getLateStatusByClient(
    supabase,
    active.map((c) => c.id),
  );

  const late = active
    .map((c) => ({ id: c.id, name: c.full_name, status: lateStatus.get(c.id) }))
    .filter((c): c is { id: string; name: string; status: NonNullable<typeof c.status> } => c.status?.tone === "late")
    .map((c) => ({ id: c.id, name: c.name, days: c.status.days, key: lateDismissKey(c.id, c.status.since) }))
    .sort((a, b) => b.days - a.days);

  return applyDismissals(
    {
      unread: unread ?? 0,
      late,
      digest: digest
        ? { from: digest.from, to: digest.to, count: digest.count, key: digestDismissKey(digest.weekStart) }
        : null,
    },
    dismissed,
  );
}

const DAY_MS = 86_400_000;
const PRUNE_AFTER_DAYS = 90;

/**
 * Skryje upozornenia. `days` = na koľko dní (null = kým sa nezmení situácia — kľúč
 * nesie jej identitu, viď lib/dashboard/attention.ts). Kľúče sa validujú, server
 * neprijme ľubovoľný reťazec.
 */
export async function dismissNotificationsAction(keys: string[], days: number | null): Promise<{ ok: boolean }> {
  if (!Array.isArray(keys) || keys.length === 0 || keys.length > 200 || !keys.every(isValidDismissKey)) {
    return { ok: false };
  }
  if (days !== null && !(Number.isInteger(days) && days >= 1 && days <= 90)) return { ok: false };

  const {
    data: { user },
  } = await getUser();
  if (!user) return { ok: DEV_NO_SESSION }; // dev náhľad: nič sa neukladá, UI skrýva optimisticky

  const supabase = await createClient();
  const now = Date.now();
  const until = days == null ? null : new Date(now + days * DAY_MS).toISOString();

  const { error } = await supabase.from("notification_dismissals").upsert(
    keys.map((key) => ({
      trainer_id: user.id,
      key,
      dismissed_until: until,
      created_at: new Date(now).toISOString(),
    })),
    { onConflict: "trainer_id,key" },
  );
  if (error) {
    console.error("dismissNotificationsAction:", error.message);
    return { ok: false };
  }

  // Poriadok: kľúče staršie než 90 dní už nikdy nebudú relevantné (klient mal medzitým iný `since`).
  await supabase
    .from("notification_dismissals")
    .delete()
    .eq("trainer_id", user.id)
    .lt("created_at", new Date(now - PRUNE_AFTER_DAYS * DAY_MS).toISOString());

  revalidatePath("/dashboard");
  return { ok: true };
}

/**
 * "Označiť všetko ako prečítané" — nastaví SKUTOČNÉ read_at (mark_messages_read
 * RPC, 0008; tréner nemá UPDATE na messages), takže zmizne aj odznak pri "Správy"
 * a pri klientoch. Neskrýva len upozornenie — stav v appke ostáva pravdivý.
 */
export async function markAllMessagesReadAction(): Promise<{ ok: boolean }> {
  const {
    data: { user },
  } = await getUser();
  if (!user) return { ok: DEV_NO_SESSION };

  const supabase = await createClient();
  const { data: rows, error } = await supabase
    .from("messages")
    .select("client_id")
    .eq("sender", "client")
    .is("read_at", null);
  if (error) return { ok: false };

  const clientIds = [...new Set((rows ?? []).map((r) => r.client_id as string))];
  const results = await Promise.all(clientIds.map((id) => supabase.rpc("mark_messages_read", { p_client_id: id })));
  if (results.some((r) => r.error)) return { ok: false };

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/spravy");
  return { ok: true };
}
