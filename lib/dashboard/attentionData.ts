// Dáta zvončeka upozornení trénera (feature/funkcionalita, presunuté v feature/faster-app
// zo server action do GET /api/dashboard/attention). Zbiera dáta z existujúcich zdrojov
// pravdy, nič nepočíta po svojom. RLS scopuje všetko na klientov/riadky tohto trénera;
// explicitné trainer_id filtre sú len pre istotu/index.

import "server-only";
import { createClient, getUser } from "@/lib/supabase/server";
import { getLateStatusByClient } from "@/lib/dashboard/lateStatus";
import { getHealthDigest } from "@/lib/dashboard/healthDigest";
import { getActiveDismissals } from "@/lib/dashboard/dismissals";
import {
  APPOINTMENT_REMINDER_HOURS,
  applyDismissals,
  apptDismissKey,
  digestDismissKey,
  lateDismissKey,
  type AttentionData,
} from "@/lib/dashboard/attention";

const DEV_NO_SESSION = process.env.NODE_ENV === "development";

// DEV bez session (rovnaký princíp ako DEV_OPEN v app/dashboard/layout.tsx): vzorové
// dáta, nech sa dá zvonček pozerať bez prihlásenia. V produkcii sa nikdy nepoužije.
// i18n-ignore-start — DEV náhľad (vymyslené dáta)
const PREVIEW_DATA: AttentionData = {
  unread: 3,
  unreadByClient: [
    { id: "p1", name: "Lucia K.", count: 2 },
    { id: "p3", name: "Ján N.", count: 1 },
  ],
  appointments: [
    {
      id: "a1",
      clientName: "Ján N.",
      title: "Konzultácia",
      startsAt: new Date(Date.now() + 20 * 3_600_000).toISOString(),
      key: apptDismissKey("a1"),
    },
  ],
  late: [
    { id: "p1", name: "Lucia K.", days: 9, key: lateDismissKey("p1", "2026-09-11") },
    { id: "p2", name: "Ohrozený Oto", days: 6, key: lateDismissKey("p2", "2026-09-14") },
  ],
  digest: { from: "watch", to: "risk", count: 2, key: digestDismissKey("2026-09-14") },
};
// i18n-ignore-end

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
  const nowIso = new Date().toISOString();
  const reminderUntilIso = new Date(Date.now() + APPOINTMENT_REMINDER_HOURS * 3_600_000).toISOString();
  const [
    { clients, active, lateStatus, clientsErr },
    { data: unreadRows, error: unreadErr },
    { data: apptRows, error: apptErr },
    digest,
    dismissed,
  ] = await Promise.all([
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
        return { clients: clients ?? [], active, lateStatus, clientsErr: error };
      }),
    // neprečítané správy po klientoch (meno vo zvončeku namiesto „od klientov“) — len client_id
    supabase.from("messages").select("client_id").eq("sender", "client").is("read_at", null).limit(1000),
    // termíny do 24 h — pripomienka deň vopred
    supabase
      .from("appointments")
      .select("id, client_id, title, starts_at")
      .eq("trainer_id", user.id)
      .gte("starts_at", nowIso)
      .lte("starts_at", reminderUntilIso)
      .order("starts_at", { ascending: true }),
    getHealthDigest(supabase, user.id),
    getActiveDismissals(supabase, user.id),
  ]);
  if (clientsErr || unreadErr) return null;

  const nameOf = new Map(clients.map((c) => [c.id, c.full_name as string]));
  const perClient = new Map<string, number>();
  for (const r of unreadRows ?? []) perClient.set(r.client_id, (perClient.get(r.client_id) ?? 0) + 1);
  const unreadByClient = [...perClient.entries()]
    .map(([id, count]) => ({ id, name: nameOf.get(id) ?? "Klient", count }))
    .sort((a, b) => b.count - a.count);
  // chyba termínov nezhodí celý zvonček — len sa neukážu
  const appointments = (apptErr ? [] : (apptRows ?? [])).map((a) => ({
    id: a.id as string,
    clientName: nameOf.get(a.client_id as string) ?? "Klient",
    title: (a.title as string) || "Termín", // i18n-ignore — predvolený názov v DB (stĺpec NOT NULL)
    startsAt: a.starts_at as string,
    key: apptDismissKey(a.id as string),
  }));

  const late = active
    .map((c) => ({ id: c.id, name: c.full_name, status: lateStatus.get(c.id) }))
    .filter((c): c is { id: string; name: string; status: NonNullable<typeof c.status> } => c.status?.tone === "late")
    .map((c) => ({ id: c.id, name: c.name, days: c.status.days, key: lateDismissKey(c.id, c.status.since) }))
    .sort((a, b) => b.days - a.days);

  return applyDismissals(
    {
      unread: unreadRows?.length ?? 0,
      unreadByClient,
      appointments,
      late,
      digest: digest
        ? { from: digest.from, to: digest.to, count: digest.count, key: digestDismissKey(digest.weekStart) }
        : null,
    },
    dismissed,
  );
}
