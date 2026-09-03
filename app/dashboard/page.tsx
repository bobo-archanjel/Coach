import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AddClientForm } from "./AddClientForm";
import styles from "./dashboard.module.css";

/** Koľko dní bez odklikaného tréningu už znamená "mešká" (Track "Tréner" #2, ROADMAP.md). */
const LATE_THRESHOLD_DAYS = 5;

/** Grace period pred hard delete (0018_client_deletion.sql, pg_cron `purge_deleted_clients`). */
const DELETION_GRACE_DAYS = 30;

type ClientStatus = { label: string; days: number; tone: "active" | "late" } | null;

/** Klient s ukončenou spoluprácou (0020) — dáta ostávajú, spolupráca sa dá obnoviť. */
const ENDED_LABEL = "spolupráca ukončená";

/** Dátum, kedy sa klient natrvalo zmaže (deletion_requested_at + grace period), sk-SK formát. */
function purgeDateLabel(requestedAt: string): string {
  const purgeDate = new Date(new Date(requestedAt).getTime() + DELETION_GRACE_DAYS * 86_400_000);
  return purgeDate.toLocaleDateString("sk-SK");
}

// DEV náhľad zoznamu klientov bez DB (?preview=deletion) — overuje presun na spodok,
// stlmený vzhľad a badge dátumu zmazania pre klienta v GDPR grace period (0018), aj
// medzistupeň ukončenej spolupráce (0020 — nad klientmi na zmazanie, dáta ostávajú).
const DELETION_PREVIEW = [
  {
    id: "p-active",
    full_name: "Aktívny Adam",
    goal: "Naberanie",
    created_at: "2026-06-01",
    ended_at: null as string | null,
    deletion_requested_at: null as string | null,
  },
  {
    id: "p-late",
    full_name: "Meškajúca Mária",
    goal: "Chudnutie",
    created_at: "2026-05-01",
    ended_at: null as string | null,
    deletion_requested_at: null as string | null,
  },
  {
    id: "p-ended",
    full_name: "Odídený Ivan",
    goal: "Kondícia",
    created_at: "2026-03-01",
    ended_at: new Date(Date.now() - 10 * 86_400_000).toISOString(),
    deletion_requested_at: null as string | null,
  },
  {
    id: "p-deleting",
    full_name: "Zmazaná Zuzana",
    goal: "Kondícia",
    created_at: "2026-04-01",
    ended_at: null as string | null,
    deletion_requested_at: new Date(Date.now() - 5 * 86_400_000).toISOString(),
  },
];

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  const { preview } = await searchParams;

  if (preview === "deletion" && process.env.NODE_ENV !== "production") {
    const rosterClients = [
      ...DELETION_PREVIEW.filter((c) => !c.ended_at && !c.deletion_requested_at),
      ...DELETION_PREVIEW.filter((c) => c.ended_at && !c.deletion_requested_at),
      ...DELETION_PREVIEW.filter((c) => c.deletion_requested_at),
    ];
    return (
      <>
        <div className={styles.pageHead}>
          <h1>Klienti</h1>
          <p>{DELETION_PREVIEW.length} klientov v starostlivosti — kliknutím otvoríš detail.</p>
        </div>
        <div className={styles.alertPanel} role="status">
          <p className={styles.alertPanelTitle}>1 klient mešká s tréningom</p>
          <ul className={styles.alertPanelList}>
            <li>
              <span>Meškajúca Mária</span>
              <span>9 dní bez tréningu</span>
            </li>
          </ul>
        </div>
        <div className={styles.roster}>
          {rosterClients.map((client) => {
            const pendingDeletion = Boolean(client.deletion_requested_at);
            const ended = Boolean(client.ended_at) && !pendingDeletion;
            return (
              <div
                key={client.id}
                className={`${styles.clientCard} ${
                  pendingDeletion ? styles.clientCardPendingDeletion : ended ? styles.clientCardEnded : ""
                }`}
              >
                <div>
                  <div className={styles.clientName}>{client.full_name}</div>
                  {client.goal && <div className={styles.clientGoal}>{client.goal}</div>}
                </div>
                <span className={styles.clientMeta}>
                  {pendingDeletion ? (
                    <span className={styles.deletionChip}>
                      Zmaže sa {purgeDateLabel(client.deletion_requested_at!)}
                    </span>
                  ) : ended ? (
                    <span className={`${styles.statusChip} ${styles.ended}`}>{ENDED_LABEL}</span>
                  ) : client.id === "p-late" ? (
                    <span className={`${styles.statusChip} ${styles.late}`}>9 dní bez tréningu</span>
                  ) : (
                    <span className={`${styles.statusChip} ${styles.active}`}>aktívny</span>
                  )}
                  <span className={styles.clientSince}>
                    od {new Date(client.created_at).toLocaleDateString("sk-SK")}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      </>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Layout guard robí vlastný getUser() call — pri studenom štarte (cookie ešte
  // neoverená) sa môžu rozísť. Radšej redirect než pád na `user!.id`.
  if (!user) {
    redirect("/prihlasenie");
  }

  const { data: clients } = await supabase
    .from("clients")
    .select("id, full_name, goal, created_at, ended_at, deletion_requested_at")
    .eq("trainer_id", user.id)
    .order("created_at", { ascending: false });

  // neprečítané správy od klientov → odznak pri klientovi (RLS scopuje na klientov trénera)
  const { data: unreadRows } = await supabase
    .from("messages")
    .select("client_id")
    .eq("sender", "client")
    .is("read_at", null);
  const unread = new Map<string, number>();
  for (const r of unreadRows ?? []) unread.set(r.client_id, (unread.get(r.client_id) ?? 0) + 1);

  const clientIds = (clients ?? []).map((c) => c.id);
  const statusByClient = new Map<string, ClientStatus>();

  if (clientIds.length > 0) {
    // "Mešká" = má priradený plán, ale posledný odklikaný tréning (alebo pridelenie
    // plánu, ak ešte necvičil vôbec) je viac ako LATE_THRESHOLD_DAYS dozadu. Bez
    // nového migračného kroku — počíta sa z existujúcich workout_plans/workout_logs.
    const [{ data: plans }, { data: logs }] = await Promise.all([
      supabase
        .from("workout_plans")
        .select("client_id, created_at")
        .in("client_id", clientIds)
        .order("created_at", { ascending: false }),
      supabase
        .from("workout_logs")
        .select("client_id, performed_on")
        .in("client_id", clientIds)
        .order("performed_on", { ascending: false }),
    ]);

    const latestPlanByClient = new Map<string, string>();
    for (const p of plans ?? []) {
      if (!latestPlanByClient.has(p.client_id)) latestPlanByClient.set(p.client_id, p.created_at);
    }
    const latestLogByClient = new Map<string, string>();
    for (const l of logs ?? []) {
      if (!latestLogByClient.has(l.client_id)) latestLogByClient.set(l.client_id, l.performed_on);
    }

    const todayMs = Date.now();
    for (const [clientId, planCreatedAt] of latestPlanByClient) {
      const reference = latestLogByClient.get(clientId) ?? planCreatedAt;
      const days = Math.floor((todayMs - new Date(reference).getTime()) / 86_400_000);
      statusByClient.set(
        clientId,
        days >= LATE_THRESHOLD_DAYS
          ? { label: `${days} dní bez tréningu`, days, tone: "late" }
          : { label: "aktívny", days, tone: "active" },
      );
    }
  }

  // Klient označený na zmazanie (0018) alebo s ukončenou spoluprácou (0020) sa už
  // nekvalifikuje na upozornenie o meškaní — nie je aktuálne v aktívnej starostlivosti.
  const lateClients = (clients ?? []).filter(
    (c) => statusByClient.get(c.id)?.tone === "late" && !c.ended_at && !c.deletion_requested_at,
  );

  // Aktívni klienti hore (pôvodné poradie podľa created_at desc), pod nimi klienti
  // s ukončenou spoluprácou (0020 — dáta ostávajú, dá sa obnoviť), úplne na spodku
  // klienti na zmazanie (0018) — filter trikrát namiesto sort, nech sa nestratí
  // stabilné poradie v rámci každej skupiny.
  const rosterClients = [
    ...(clients ?? []).filter((c) => !c.ended_at && !c.deletion_requested_at),
    ...(clients ?? []).filter((c) => c.ended_at && !c.deletion_requested_at),
    ...(clients ?? []).filter((c) => c.deletion_requested_at),
  ];

  return (
    <>
      <div className={styles.pageHead}>
        <h1>Klienti</h1>
        <p>{clients?.length ?? 0} klientov v starostlivosti — kliknutím otvoríš detail.</p>
      </div>

      {lateClients.length > 0 && (
        <div className={styles.alertPanel} role="status">
          <p className={styles.alertPanelTitle}>
            {lateClients.length === 1 ? "1 klient mešká s tréningom" : `${lateClients.length} klienti meškajú s tréningom`}
          </p>
          <ul className={styles.alertPanelList}>
            {lateClients.map((c) => (
              <li key={c.id}>
                <Link href={`/dashboard/klienti/${c.id}`}>{c.full_name}</Link>
                <span>{statusByClient.get(c.id)?.label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <AddClientForm />

      {rosterClients.length > 0 ? (
        <div className={styles.roster}>
          {rosterClients.map((client) => {
            const n = unread.get(client.id) ?? 0;
            const status = statusByClient.get(client.id);
            const pendingDeletion = Boolean(client.deletion_requested_at);
            const ended = Boolean(client.ended_at) && !pendingDeletion;
            return (
              <Link
                key={client.id}
                href={`/dashboard/klienti/${client.id}`}
                className={`${styles.clientCard} ${
                  pendingDeletion ? styles.clientCardPendingDeletion : ended ? styles.clientCardEnded : ""
                }`}
              >
                <div>
                  <div className={styles.clientName}>{client.full_name}</div>
                  {client.goal && <div className={styles.clientGoal}>{client.goal}</div>}
                </div>
                <span className={styles.clientMeta}>
                  {n > 0 && (
                    <span className={styles.unreadPill} title={`${n} neprečítaných správ`}>
                      {n} {n === 1 ? "správa" : n >= 2 && n <= 4 ? "správy" : "správ"}
                    </span>
                  )}
                  {pendingDeletion ? (
                    <span className={styles.deletionChip}>
                      Zmaže sa {purgeDateLabel(client.deletion_requested_at!)}
                    </span>
                  ) : ended ? (
                    <span className={`${styles.statusChip} ${styles.ended}`}>{ENDED_LABEL}</span>
                  ) : (
                    status && <span className={`${styles.statusChip} ${styles[status.tone]}`}>{status.label}</span>
                  )}
                  <span className={styles.clientSince}>
                    od {new Date(client.created_at).toLocaleDateString("sk-SK")}
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className={styles.emptyState}>
          <h2>Zatiaľ nemáš žiadnych klientov</h2>
          <p>Pridaj prvého klienta vyššie.</p>
        </div>
      )}
    </>
  );
}
