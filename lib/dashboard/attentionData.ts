// Dáta zvončeka upozornení trénera (feature/funkcionalita, presunuté v feature/faster-app
// zo server action do GET /api/dashboard/attention). Zbiera dáta z existujúcich zdrojov
// pravdy, nič nepočíta po svojom. RLS scopuje všetko na klientov/riadky tohto trénera;
// explicitné trainer_id filtre sú len pre istotu/index.

import "server-only";
import { createClient, getUser } from "@/lib/supabase/server";
import { getLateStatusByClient } from "@/lib/dashboard/lateStatus";
import { getHealthDigest } from "@/lib/dashboard/healthDigest";
import { getActiveDismissals } from "@/lib/dashboard/dismissals";
import { applyDismissals, digestDismissKey, lateDismissKey, type AttentionData } from "@/lib/dashboard/attention";

const DEV_NO_SESSION = process.env.NODE_ENV === "development";

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
export async function loadAttention(): Promise<AttentionData | null> {
  const {
    data: { user },
  } = await getUser();
  if (!user) return DEV_NO_SESSION ? PREVIEW_DATA : null;

  const supabase = await createClient();

  // Meškanie potrebuje len zoznam klientov — reťazí sa priamo naň v tej istej dávke
  // (rovnako ako app/dashboard/page.tsx), nie až po dobehnutí všetkých štyroch dopytov.
  // Ukončená spolupráca / žiadosť o zmazanie nie je aktuálna starostlivosť —
  // rovnaké vylúčenie ako alert panel "meškanie" na /dashboard.
  const [{ active, lateStatus, clientsErr }, { count: unread, error: unreadErr }, digest, dismissed] =
    await Promise.all([
      supabase
        .from("clients")
        .select("id, full_name, ended_at, deletion_requested_at")
        .eq("trainer_id", user.id)
        .then(async ({ data: clients, error }) => {
          const active = (clients ?? []).filter((c) => !c.ended_at && !c.deletion_requested_at);
          const lateStatus = await getLateStatusByClient(
            supabase,
            active.map((c) => c.id),
          );
          return { active, lateStatus, clientsErr: error };
        }),
      supabase.from("messages").select("id", { count: "exact", head: true }).eq("sender", "client").is("read_at", null),
      getHealthDigest(supabase, user.id),
      getActiveDismissals(supabase, user.id),
    ]);
  if (clientsErr || unreadErr) return null;

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
