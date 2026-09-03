import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ChatThread } from "@/app/components/ChatThread";
import { sendTrainerMessageAction, markTrainerChatSeenAction } from "../klienti/actions";
import styles from "../dashboard.module.css";

/* /dashboard/spravy — centrálna schránka správ (Track "Klient" bod 2, follow-up
   z ROADMAP.md). Predtým sa dalo písať len z detailu konkrétneho klienta
   (/dashboard/klienti/[id], karta "Správy") — táto stránka je zoznam VŠETKÝCH
   vlákien naraz, zoradený podľa poslednej aktivity, s náhľadom poslednej správy
   a odznakom neprečítaných. Výber vlákna cez ?client=<id> (server-driven, žiadny
   nový client-side state) — vpravo sa otvorí presne ten istý zdieľaný
   ChatThread, aké klient detailu vidí, žiadna nová logika na písanie/čítanie. */

type MessageRow = {
  id: string;
  client_id: string;
  sender: "trainer" | "client" | "system";
  body: string;
  created_at: string;
};

function previewOf(m: MessageRow): string {
  const prefix = m.sender === "trainer" ? "Ty: " : "";
  const text = m.body.replace(/\s+/g, " ").trim();
  const truncated = text.length > 64 ? `${text.slice(0, 64)}…` : text;
  return `${prefix}${truncated}`;
}

function timeLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString("sk-SK", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("sk-SK", { day: "numeric", month: "numeric" });
}

export default async function SpravyPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string }>;
}) {
  const { client: selectedClientId } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return (
      <div className={styles.emptyState}>
        <h2>Session vypršala</h2>
        <p>Prihlás sa prosím znova.</p>
      </div>
    );
  }

  const { data: clients } = await supabase
    .from("clients")
    .select("id, full_name")
    .eq("trainer_id", user.id)
    .order("full_name", { ascending: true });

  const clientIds = (clients ?? []).map((c) => c.id);
  const nameById = new Map((clients ?? []).map((c) => [c.id, c.full_name]));

  const lastByClient = new Map<string, MessageRow>();
  const unreadByClient = new Map<string, number>();

  if (clientIds.length > 0) {
    const { data: recentMessages } = await supabase
      .from("messages")
      .select("id, client_id, sender, body, created_at")
      .in("client_id", clientIds)
      .order("created_at", { ascending: false })
      .limit(1000);

    // Zoradené zostupne podľa created_at — prvý výskyt na klienta je jeho posledná správa.
    for (const m of (recentMessages ?? []) as MessageRow[]) {
      if (!lastByClient.has(m.client_id)) lastByClient.set(m.client_id, m);
    }

    const { data: unreadRows } = await supabase
      .from("messages")
      .select("client_id")
      .in("client_id", clientIds)
      .eq("sender", "client")
      .is("read_at", null);
    for (const r of unreadRows ?? []) unreadByClient.set(r.client_id, (unreadByClient.get(r.client_id) ?? 0) + 1);
  }

  const threads = (clients ?? [])
    .map((c) => ({
      id: c.id,
      name: c.full_name,
      last: lastByClient.get(c.id) ?? null,
      unread: unreadByClient.get(c.id) ?? 0,
    }))
    .sort((a, b) => {
      const at = a.last ? new Date(a.last.created_at).getTime() : 0;
      const bt = b.last ? new Date(b.last.created_at).getTime() : 0;
      return bt - at;
    });

  let selectedMessages: { id: string; sender: "trainer" | "client" | "system"; body: string; createdAt: string }[] = [];
  if (selectedClientId) {
    const { data: msgRows } = await supabase
      .from("messages")
      .select("id, sender, body, created_at")
      .eq("client_id", selectedClientId)
      .order("created_at", { ascending: true })
      .limit(300);
    selectedMessages = (msgRows ?? []).map((m) => ({
      id: m.id as string,
      sender: m.sender as "trainer" | "client" | "system",
      body: m.body as string,
      createdAt: m.created_at as string,
    }));
  }
  const selectedName = selectedClientId ? nameById.get(selectedClientId) : undefined;

  return (
    <>
      <div className={styles.pageHead}>
        <h1>Správy</h1>
        <p>Všetky konverzácie s klientmi na jednom mieste.</p>
      </div>

      {threads.length === 0 ? (
        <div className={styles.emptyState}>
          <h2>Zatiaľ žiadne konverzácie</h2>
          <p>Keď ti klient napíše, alebo mu napíšeš z jeho detailu, objaví sa tu.</p>
        </div>
      ) : (
        <div className={styles.inboxGrid} data-has-selection={selectedClientId ? "true" : "false"}>
          <div className={`${styles.card} ${styles.inboxList}`}>
            <div className={styles.roster}>
              {threads.map((t) => {
                const active = t.id === selectedClientId;
                return (
                  <Link
                    key={t.id}
                    href={`/dashboard/spravy?client=${t.id}`}
                    className={`${styles.clientCard} ${styles.inboxRow} ${active ? styles.inboxRowActive : ""}`}
                  >
                    <div>
                      <div className={styles.clientName}>{t.name}</div>
                      <div className={styles.clientGoal}>{t.last ? previewOf(t.last) : "Zatiaľ žiadna správa"}</div>
                    </div>
                    <div className={styles.clientMeta}>
                      {t.unread > 0 && (
                        <span className={styles.unreadPill} title={`${t.unread} neprečítaných správ`}>
                          {t.unread}
                        </span>
                      )}
                      {t.last && <span className={styles.clientSince}>{timeLabel(t.last.created_at)}</span>}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>

          <div className={`${styles.card} ${styles.inboxThread}`}>
            {selectedClientId && selectedName ? (
              <>
                <Link href="/dashboard/spravy" className={`${styles.backLink} ${styles.inboxBackLink}`}>
                  ← Späť na zoznam
                </Link>
                <h3>{selectedName}</h3>
                <ChatThread
                  messages={selectedMessages}
                  mySide="trainer"
                  sendAction={sendTrainerMessageAction}
                  extraFields={{ client_id: selectedClientId }}
                  onSeen={markTrainerChatSeenAction.bind(null, selectedClientId)}
                  emptyTitle="Zatiaľ žiadne správy"
                  emptyText={`Napíš ${selectedName.split(/\s+/)[0]}ovi prvú správu.`}
                  placeholder={`Správa pre ${selectedName.split(/\s+/)[0]}a…`}
                  embedded
                />
              </>
            ) : (
              <div className={styles.emptyState} style={{ border: "none", padding: "clamp(24px, 6vw, 48px)" }}>
                <h2>Vyber konverzáciu</h2>
                <p>Klikni na klienta vľavo a otvor jeho vlákno.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
