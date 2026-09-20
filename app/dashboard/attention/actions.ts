"use server";

// Zvonček upozornení (feature/funkcionalita) — zbiera dáta z existujúcich zdrojov
// pravdy, nič nepočíta po svojom. Volá sa z klientskej komponenty NotificationBell
// PO hydratácii (mimo kritickej cesty renderu — layout beží pri každej navigácii,
// ťažšie dopyty sem preto do neho nepatria). RLS scopuje všetko na klientov tohto
// trénera; explicitné trainer_id filtre sú len pre istotu/index.

import { createClient, getUser } from "@/lib/supabase/server";
import { getLateStatusByClient } from "@/lib/dashboard/lateStatus";
import { getHealthDigest } from "@/lib/dashboard/healthDigest";
import type { AttentionData } from "@/lib/dashboard/attention";

// DEV bez session (rovnaký princíp ako DEV_OPEN v app/dashboard/layout.tsx): vzorové
// dáta, nech sa dá zvonček pozerať bez prihlásenia. V produkcii sa nikdy nepoužije.
const PREVIEW_DATA: AttentionData = {
  unread: 3,
  late: [
    { id: "p1", name: "Lucia K.", days: 9 },
    { id: "p2", name: "Ohrozený Oto", days: 6 },
  ],
  digest: { from: "watch", to: "risk", count: 2 },
};

/** `null` = nepodarilo sa načítať (UI ponechá posledný známy stav, nič nehlási). */
export async function getAttentionAction(): Promise<AttentionData | null> {
  const {
    data: { user },
  } = await getUser();
  if (!user) return process.env.NODE_ENV !== "production" ? PREVIEW_DATA : null;

  const supabase = await createClient();

  const [{ data: clients, error: clientsErr }, { count: unread, error: unreadErr }, digest] = await Promise.all([
    supabase
      .from("clients")
      .select("id, full_name, ended_at, deletion_requested_at")
      .eq("trainer_id", user.id),
    supabase.from("messages").select("id", { count: "exact", head: true }).eq("sender", "client").is("read_at", null),
    getHealthDigest(supabase, user.id),
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
    .map((c) => ({ id: c.id, name: c.name, days: c.status.days }))
    .sort((a, b) => b.days - a.days);

  return { unread: unread ?? 0, late, digest };
}
