import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, getUser } from "@/lib/supabase/server";
import { AddClientForm } from "./AddClientForm";
import { ClientRoster, type RosterItem } from "./ClientRoster";
import { getLateStatusByClient } from "@/lib/dashboard/lateStatus";
import { getHealthDigest, BUCKET_LABEL } from "@/lib/dashboard/healthDigest";
import styles from "./dashboard.module.css";

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

  // DEV náhľad formulára "Pridať klienta" bez session (feature/registracia-update).
  if (preview === "addclient" && process.env.NODE_ENV !== "production") {
    return (
      <>
        <div className={styles.pageHead}>
          <h1>Klienti</h1>
          <p>0 klientov v starostlivosti — kliknutím otvoríš detail.</p>
        </div>
        <AddClientForm />
        <div className={styles.emptyState}>
          <h2>Zatiaľ žiadni klienti</h2>
          <p>Pridaj prvého vyššie — zadaj jeho kód alebo mu vytvor záznam.</p>
        </div>
      </>
    );
  }

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
  } = await getUser();

  // Layout guard robí vlastný getUser() call — pri studenom štarte (cookie ešte
  // neoverená) sa môžu rozísť. Radšej redirect než pád na `user!.id`.
  if (!user) {
    redirect("/prihlasenie");
  }

  // Nezávislé dopyty — zoznam klientov nepotrebuje neprečítané správy (a naopak,
  // RLS scopuje messages na klientov tohto trénera samo) — paralelne. `user_id`
  // navyše oproti pôvodnému výberu — potrebné pre onboarding checklist (krok 3,
  // "klient sa pripojil cez svoj kód").
  const [{ data: clients }, { data: unreadRows }, healthDigest] = await Promise.all([
    supabase
      .from("clients")
      .select("id, full_name, goal, created_at, ended_at, deletion_requested_at, user_id")
      .eq("trainer_id", user.id)
      .order("created_at", { ascending: false }),
    // neprečítané správy od klientov → odznak pri klientovi
    supabase.from("messages").select("client_id").eq("sender", "client").is("read_at", null),
    // Weekly digest (feature/OnBoarding, migrácia 0034) — porovnanie posledných
    // dvoch týždenných snapshotov portfolio-health, viď lib/dashboard/healthDigest.ts.
    getHealthDigest(supabase, user.id),
  ]);
  const unread = new Map<string, number>();
  for (const r of unreadRows ?? []) unread.set(r.client_id, (unread.get(r.client_id) ?? 0) + 1);

  const clientIds = (clients ?? []).map((c) => c.id);
  // Zdieľané s proaktívnym AI check-in cronom (lib/dashboard/lateStatus.ts,
  // migrácia 0033) — rovnaká definícia "meškania" na oboch miestach.
  const lateStatus = await getLateStatusByClient(supabase, clientIds);
  const statusByClient = new Map<string, ClientStatus>(
    [...lateStatus].map(([clientId, s]) => [
      clientId,
      s.tone === "late" ? { label: `${s.days} dní bez tréningu`, days: s.days, tone: "late" } : { label: "aktívny", days: s.days, tone: "active" },
    ]),
  );

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

  const rosterItems: RosterItem[] = rosterClients.map((client) => {
    const pendingDeletion = Boolean(client.deletion_requested_at);
    const ended = Boolean(client.ended_at) && !pendingDeletion;
    const status = statusByClient.get(client.id);
    return {
      id: client.id,
      fullName: client.full_name,
      goal: client.goal,
      createdAt: client.created_at,
      unread: unread.get(client.id) ?? 0,
      pendingDeletion,
      deletionLabel: pendingDeletion ? purgeDateLabel(client.deletion_requested_at!) : null,
      ended,
      statusLabel: pendingDeletion ? null : ended ? ENDED_LABEL : (status?.label ?? null),
      statusTone: status?.tone ?? null,
    };
  });

  // Onboarding checklist (feature/OnBoarding) — čerstvý účet s 0 klientmi nemá
  // žiadne vedenie. Auto-hide: len kým chýba niektorý krok, žiadny perzistentný
  // "zavrieť" stav (rozhodnuté vedome — jednoduchšie, nič na údržbu).
  const hasClient = (clients?.length ?? 0) > 0;
  const hasPlan = lateStatus.size > 0; // getLateStatusByClient vracia záznam len pre klienta s ≥1 priradeným plánom
  const hasLinkedClient = (clients ?? []).some((c) => c.user_id != null);
  const onboardingDone = hasClient && hasPlan && hasLinkedClient;

  return (
    <>
      <div className={styles.pageHead}>
        <h1>Klienti</h1>
        <p>{clients?.length ?? 0} klientov v starostlivosti — kliknutím otvoríš detail.</p>
      </div>

      {!onboardingDone && (
        <div className={`${styles.card} ${styles.onboardingCard}`}>
          <h3>Prvé kroky</h3>
          <ul className={styles.onboardingList}>
            <li className={hasClient ? styles.onboardingDone : undefined}>
              <span className={styles.onboardingCheck} aria-hidden="true">
                {hasClient ? "✓" : "1"}
              </span>
              <span>Pridaj prvého klienta (formulár nižšie)</span>
            </li>
            <li className={hasPlan ? styles.onboardingDone : undefined}>
              <span className={styles.onboardingCheck} aria-hidden="true">
                {hasPlan ? "✓" : "2"}
              </span>
              <span>
                Postav mu tréningový plán —{" "}
                <Link href="/dashboard/treningy">otvoriť Tréningy</Link>
              </span>
            </li>
            <li className={hasLinkedClient ? styles.onboardingDone : undefined}>
              <span className={styles.onboardingCheck} aria-hidden="true">
                {hasLinkedClient ? "✓" : "3"}
              </span>
              <span>Pošli mu pozývací kód, nech si appku pripojí (kód nájdeš v detaile klienta)</span>
            </li>
          </ul>
        </div>
      )}

      {healthDigest && (
        <div className={styles.digestBanner} role="status">
          <p className={styles.digestBannerTitle}>Týždenný prehľad</p>
          <p className={styles.digestBannerText}>
            {healthDigest.count} {healthDigest.count === 1 ? "klient klesol" : "klienti klesli"} zo „
            {BUCKET_LABEL[healthDigest.from]}“ do „{BUCKET_LABEL[healthDigest.to]}“ tento týždeň.{" "}
            <Link href="/dashboard/analytika">Pozrieť analytiku</Link>
          </p>
        </div>
      )}

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

      <ClientRoster items={rosterItems} />
    </>
  );
}
