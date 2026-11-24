import { AppLink as Link } from "../components/AppLink";
import { Suspense } from "react";
import { AchievementsFeed } from "./AchievementsFeed";
import { TeamWeekCard } from "./TeamWeekCard";
import { LeadsCard } from "./LeadsCard";
import { redirect } from "next/navigation";
import { createClient, getUser } from "@/lib/supabase/server";
import { AddClientForm } from "./AddClientForm";
import { ClientRoster, type RosterItem } from "./ClientRoster";
import { ClientsBoard } from "./ClientsBoard";
import { getLateStatusByClient } from "@/lib/dashboard/lateStatus";
import { getPlanCompletion } from "@/lib/dashboard/planCompletion";
import { resolveActivePlanId } from "@/lib/portal/activePlan";
import { getHealthDigest } from "@/lib/dashboard/healthDigest";
import { getLocale, getTranslations } from "next-intl/server";
import { intlLocale, type Locale } from "@/lib/i18n/locales";
import { getActiveDismissals } from "@/lib/dashboard/dismissals";
import { digestDismissKey, lateDismissKey, ONBOARDING_DISMISS_KEY } from "@/lib/dashboard/attention";
import { DismissibleNotice, LateAlertPanel } from "./DashboardNotices";
import { pluralSk } from "@/lib/portal/streak"; // i18n: len DEV náhľad
import styles from "@/app/dashboard/dashboard.module.css";

/**
 * Údaje na karty klientov (feature/klienti-karty): tréningové plány trénera (bez skrytých
 * kópií úprav, 0071) s dňami — počet a aktívny plán s odcvičenosťou (getPlanCompletion,
 * rovnaká definícia ako badge „Hotovo“) — a počet jedálničkov. Dva dopyty pre všetkých klientov.
 */
async function getCardStats(supabase: Awaited<ReturnType<typeof createClient>>, clientIds: string[]) {
  const plansByClient = new Map<string, { id: string; name: string; published: boolean; dayIds: string[] }[]>();
  const mealPlanCount = new Map<string, number>();
  if (clientIds.length === 0) return { plansByClient, mealPlanCount, completion: new Map() as Awaited<ReturnType<typeof getPlanCompletion>> };
  const [{ data: planRows }, { data: mealRows }] = await Promise.all([
    supabase
      .from("workout_plans")
      .select("id, name, client_id, published, created_at, workout_days(id)")
      .in("client_id", clientIds)
      .is("edit_of", null)
      .order("created_at", { ascending: false }),
    supabase.from("meal_plans").select("client_id").in("client_id", clientIds),
  ]);
  for (const p of planRows ?? []) {
    const list = plansByClient.get(p.client_id as string) ?? [];
    list.push({
      id: p.id as string,
      name: p.name as string,
      published: Boolean(p.published),
      dayIds: ((p.workout_days as { id: string }[] | null) ?? []).map((d) => d.id),
    });
    plansByClient.set(p.client_id as string, list);
  }
  for (const m of mealRows ?? []) mealPlanCount.set(m.client_id as string, (mealPlanCount.get(m.client_id as string) ?? 0) + 1);
  const completion = await getPlanCompletion(
    supabase,
    [...plansByClient.values()].flat().filter((p) => p.published).map((p) => ({ id: p.id, dayIds: p.dayIds })),
  );
  return { plansByClient, mealPlanCount, completion };
}

/** Grace period pred hard delete (0018_client_deletion.sql, pg_cron `purge_deleted_clients`). */
const DELETION_GRACE_DAYS = 30;

type ClientStatus = { label: string; days: number; tone: "active" | "late" } | null;

/** Klient s ukončenou spoluprácou (0020) — dáta ostávajú, spolupráca sa dá obnoviť. */
const ENDED_LABEL = "spolupráca ukončená"; // i18n-ignore — len DEV náhľad nižšie

/** Dátum, kedy sa klient natrvalo zmaže (deletion_requested_at + grace period), v jazyku používateľa. */
function purgeDateLabel(requestedAt: string, locale: Locale = "sk"): string {
  const purgeDate = new Date(new Date(requestedAt).getTime() + DELETION_GRACE_DAYS * 86_400_000);
  return purgeDate.toLocaleDateString(intlLocale(locale));
}

// i18n-ignore-start — DEV náhľady (vymyslené dáta)
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
    id: "p-noplan",
    full_name: "Nová Nina",
    goal: "Kondícia",
    created_at: new Date(Date.now() - 6 * 86_400_000).toISOString(),
    ended_at: null as string | null,
    deletion_requested_at: null as string | null,
  },
  {
    id: "p-done",
    full_name: "Hotový Hugo",
    goal: "Sila",
    created_at: "2025-11-15",
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

/** Karty náhľadu: rôzne stavy (aktívny s plánom, mešká, bez plánu, hotový plán, ukončený, na zmazanie). */
function previewRoster(clients: typeof DELETION_PREVIEW): RosterItem[] {
  const extra: Record<string, Partial<RosterItem>> = {
    "p-active": { statusLabel: "aktívny", statusTone: "active", unread: 2, planCount: 3, mealPlanCount: 2, lastWorkoutDays: 1, activePlan: { name: "Silový 3× týždenne", done: 5, total: 8 } },
    "p-late": { statusLabel: "9 dní bez tréningu", statusTone: "late", planCount: 1, mealPlanCount: 0, lastWorkoutDays: 9, activePlan: { name: "Chudnutie — základ", done: 2, total: 6 } },
    "p-noplan": { statusLabel: null, statusTone: null, planCount: 0, mealPlanCount: 1, lastWorkoutDays: null, activePlan: null },
    "p-done": { statusLabel: "aktívny", statusTone: "active", planCount: 2, mealPlanCount: 1, lastWorkoutDays: 0, activePlan: { name: "Jesenná forma", done: 4, total: 4 } },
    "p-ended": { planCount: 2, mealPlanCount: 1, lastWorkoutDays: 40, activePlan: null },
    "p-deleting": { planCount: 1, mealPlanCount: 0, lastWorkoutDays: null, activePlan: null },
  };
  return clients.map((c) => {
    const pendingDeletion = Boolean(c.deletion_requested_at);
    const ended = Boolean(c.ended_at) && !pendingDeletion;
    return {
      id: c.id,
      fullName: c.full_name,
      goal: c.goal,
      since: c.created_at,
      unread: 0,
      pendingDeletion,
      deletionLabel: pendingDeletion ? purgeDateLabel(c.deletion_requested_at!) : null,
      ended,
      statusLabel: ended ? ENDED_LABEL : null,
      statusTone: null,
      ...extra[c.id],
    };
  });
}
// i18n-ignore-end

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  const { preview } = await searchParams;

  // i18n-ignore-start — DEV náhľady (?preview=addclient|deletion|notices)
  // DEV náhľad formulára "Pridať klienta" bez session (feature/registracia-update).
  if (preview === "addclient" && process.env.NODE_ENV === "development") {
    return (
      <>
        <div className={styles.pageHead}>
          <h1>Klienti</h1>
          <p>0 klientov v starostlivosti — kliknutím otvoríš detail.</p>
        </div>
        <AddClientForm />
        <div className={styles.emptyState}>
          <h2>Zatiaľ žiadni klienti</h2>
          <p>Pridaj prvého cez „+ Nový klient“ — zadaj jeho kód alebo mu vytvor záznam.</p>
        </div>
      </>
    );
  }

  if (preview === "deletion" && process.env.NODE_ENV === "development") {
    const rosterClients = [
      ...DELETION_PREVIEW.filter((c) => !c.ended_at && !c.deletion_requested_at),
      ...DELETION_PREVIEW.filter((c) => c.ended_at && !c.deletion_requested_at),
      ...DELETION_PREVIEW.filter((c) => c.deletion_requested_at),
    ];
    return (
      <>
        <div className={styles.pageHead}>
          <h1>Klienti</h1>
          <p>
            {DELETION_PREVIEW.length} {pluralSk(DELETION_PREVIEW.length, "klient", "klienti", "klientov")} v
            starostlivosti — kliknutím otvoríš detail.
          </p>
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
        <ClientRoster items={previewRoster(rosterClients)} />
      </>
    );
  }

  // DEV náhľad skrývateľných upozornení bez session (feature/funkcionalita).
  if (preview === "notices" && process.env.NODE_ENV === "development") {
    return (
      <>
        <div className={styles.pageHead}>
          <h1>Klienti</h1>
          <p>Náhľad skrývateľných upozornení — nič sa neukladá.</p>
        </div>
        <DismissibleNotice
          dismissKey={ONBOARDING_DISMISS_KEY}
          label="Skryť prvé kroky"
          className={`${styles.card} ${styles.onboardingCard}`}
        >
          <h3>Prvé kroky</h3>
          <ul className={styles.onboardingList}>
            <li className={styles.onboardingDone}>
              <span className={styles.onboardingCheck} aria-hidden="true">✓</span>
              <span>Pridaj prvého klienta cez „+ Nový klient“</span>
            </li>
            <li>
              <span className={styles.onboardingCheck} aria-hidden="true">2</span>
              <span>Postav mu tréningový plán — <Link href="/dashboard/treningy">otvoriť Tréningy</Link></span>
            </li>
          </ul>
        </DismissibleNotice>
        <DismissibleNotice
          dismissKey={digestDismissKey("2026-09-14")}
          label="Skryť týždenný prehľad"
          className={styles.digestBanner}
        >
          <p className={styles.digestBannerTitle}>Týždenný prehľad</p>
          <p className={styles.digestBannerText}>
            2 klienti klesli zo „Sleduj“ do „Riziko“ tento týždeň. <Link href="/dashboard/analytika">Pozrieť analytiku</Link>
          </p>
        </DismissibleNotice>
        <LateAlertPanel
          clients={[
            { id: "p1", name: "Lucia K.", label: "9 dní bez tréningu", key: lateDismissKey("p1", "2026-09-11") },
            { id: "p2", name: "Ohrozený Oto", label: "6 dní bez tréningu", key: lateDismissKey("p2", "2026-09-14") },
            { id: "p3", name: "Peter S.", label: "12 dní bez tréningu", key: lateDismissKey("p3", "2026-09-08") },
          ]}
        />
      </>
    );
  }

  // i18n-ignore-end
  const supabase = await createClient();
  const [
    {
      data: { user },
    },
    t,
    tb,
    locale,
  ] = await Promise.all([getUser(), getTranslations("clients"), getTranslations("bell.bucket"), getLocale()]);

  // Layout guard robí vlastný getUser() call — pri studenom štarte (cookie ešte
  // neoverená) sa môžu rozísť. Radšej redirect než pád na `user!.id`.
  if (!user) {
    redirect("/prihlasenie");
  }

  // Nezávislé dopyty — zoznam klientov nepotrebuje neprečítané správy (a naopak,
  // RLS scopuje messages na klientov tohto trénera samo) — paralelne.
  const [{ clients, lateStatus, cards }, { data: unreadRows }, healthDigest, dismissed] = await Promise.all([
    supabase
      .from("clients")
      .select("id, full_name, goal, created_at, paired_at, ended_at, deletion_requested_at, active_plan_id")
      .eq("trainer_id", user.id)
      .order("created_at", { ascending: false })
      // Stav meškania a údaje na karty potrebujú len ID klientov — zreťazené priamo na ich
      // dopyt, nečakajú na digest/skrytia/správy. Meškanie je zdieľané s proaktívnym AI
      // check-in cronom (lib/dashboard/lateStatus.ts, migrácia 0033).
      .then(async ({ data: clients }) => {
        const ids = (clients ?? []).map((c) => c.id);
        const [lateStatus, cards] = await Promise.all([getLateStatusByClient(supabase, ids), getCardStats(supabase, ids)]);
        return { clients, lateStatus, cards };
      }),
    // neprečítané správy od klientov → odznak pri klientovi
    supabase.from("messages").select("client_id").eq("sender", "client").is("read_at", null),
    // Weekly digest (feature/OnBoarding, migrácia 0034) — porovnanie posledných
    // dvoch týždenných snapshotov portfolio-health, viď lib/dashboard/healthDigest.ts.
    getHealthDigest(supabase, user.id),
    // Skryté upozornenia (migrácia 0035) — pred jej spustením prázdna množina.
    getActiveDismissals(supabase, user.id),
  ]);
  const unread = new Map<string, number>();
  for (const r of unreadRows ?? []) unread.set(r.client_id, (unread.get(r.client_id) ?? 0) + 1);

  const statusByClient = new Map<string, ClientStatus>(
    [...lateStatus].map(([clientId, s]) => [
      clientId,
      s.tone === "late"
        ? { label: t("daysWithout", { count: s.days }), days: s.days, tone: "late" }
        : { label: t("active"), days: s.days, tone: "active" },
    ]),
  );

  // Klient označený na zmazanie (0018) alebo s ukončenou spoluprácou (0020) sa už
  // nekvalifikuje na upozornenie o meškaní — nie je aktuálne v aktívnej starostlivosti.
  // Skryté klienty (lib/dashboard/attention.ts: kľúč nesie aj dátum posledného tréningu,
  // skrytie platí 7 dní) tu vynecháme — rovnaký zdroj pravdy ako zvonček.
  const lateClients = (clients ?? [])
    .filter((c) => statusByClient.get(c.id)?.tone === "late" && !c.ended_at && !c.deletion_requested_at)
    .map((c) => ({
      id: c.id,
      name: c.full_name,
      label: statusByClient.get(c.id)?.label ?? "",
      key: lateDismissKey(c.id, lateStatus.get(c.id)?.since ?? ""),
    }))
    .filter((c) => !dismissed.has(c.key));

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
    const late = lateStatus.get(client.id);
    const plans = cards.plansByClient.get(client.id) ?? [];
    const activeId = resolveActivePlanId(
      client.active_plan_id,
      plans.filter((p) => p.published),
    );
    const active = activeId ? plans.find((p) => p.id === activeId) : undefined;
    const completion = active ? cards.completion.get(active.id) : undefined;
    return {
      id: client.id,
      fullName: client.full_name,
      goal: client.goal,
      // od kedy je klient s týmto trénerom (0047), pre starých klientov created_at
      since: client.paired_at ?? client.created_at,
      unread: unread.get(client.id) ?? 0,
      pendingDeletion,
      deletionLabel: pendingDeletion ? purgeDateLabel(client.deletion_requested_at!, locale) : null,
      ended,
      statusLabel: pendingDeletion ? null : ended ? t("ended") : (status?.label ?? null),
      statusTone: status?.tone ?? null,
      planCount: plans.length,
      mealPlanCount: cards.mealPlanCount.get(client.id) ?? 0,
      lastWorkoutDays: late?.lastWorkoutOn
        ? Math.max(0, Math.floor((Date.now() - new Date(late.lastWorkoutOn).getTime()) / 86_400_000))
        : null,
      activePlan: active
        ? { name: active.name, done: completion?.completedDays ?? 0, total: completion?.totalDays ?? active.dayIds.length }
        : null,
    };
  });

  // Onboarding checklist (feature/OnBoarding) — čerstvý účet s 0 klientmi nemá
  // žiadne vedenie. Auto-hide: len kým chýba niektorý krok, žiadny perzistentný
  // "zavrieť" stav (rozhodnuté vedome — jednoduchšie, nič na údržbu).
  const hasClient = (clients?.length ?? 0) > 0;
  const hasPlan = lateStatus.size > 0; // getLateStatusByClient vracia záznam len pre klienta s ≥1 priradeným plánom
  // (Krok „pošli klientovi pozývací kód“ zrušený — od 0032 sa klient pripája vlastným
  // FitPilot kódom priamo v kroku 1, pozývací kód nemá kam zadať.)
  const onboardingDone = hasClient && hasPlan;

  return (
    <>
      <div className={styles.pageHead}>
        <h1>{t("title")}</h1>
        <p>{t("countInCare", { count: clients?.length ?? 0 })}</p>
      </div>

      {!onboardingDone && !dismissed.has(ONBOARDING_DISMISS_KEY) && (
        <DismissibleNotice
          dismissKey={ONBOARDING_DISMISS_KEY}
          label={t("hideOnboarding")}
          className={`${styles.card} ${styles.onboardingCard}`}
        >
          <h3>{t("onboardingTitle")}</h3>
          <ul className={styles.onboardingList}>
            <li className={hasClient ? styles.onboardingDone : undefined}>
              <span className={styles.onboardingCheck} aria-hidden="true">
                {hasClient ? "✓" : "1"}
              </span>
              <span>{t("step1")}</span>
            </li>
            <li className={hasPlan ? styles.onboardingDone : undefined}>
              <span className={styles.onboardingCheck} aria-hidden="true">
                {hasPlan ? "✓" : "2"}
              </span>
              <span>{t.rich("step2", { link: (chunks) => <Link href="/dashboard/treningy">{chunks}</Link> })}</span>
            </li>
          </ul>
        </DismissibleNotice>
      )}

      {healthDigest && !dismissed.has(digestDismissKey(healthDigest.weekStart)) && (
        <DismissibleNotice
          dismissKey={digestDismissKey(healthDigest.weekStart)}
          label={t("hideDigest")}
          className={styles.digestBanner}
        >
          <p className={styles.digestBannerTitle}>{t("digestTitle")}</p>
          <p className={styles.digestBannerText}>
            {t("digestText", { count: healthDigest.count, from: tb(healthDigest.from), to: tb(healthDigest.to) })}{" "}
            <Link href="/dashboard/analytika">{t("digestLink")}</Link>
          </p>
        </DismissibleNotice>
      )}
      <LateAlertPanel clients={lateClients} />

      {/* „Tím tento týždeň“ — súhrn týždňa pre trénera (všetky tarify), dostreamuje sa */}
      <Suspense fallback={null}>
        <TeamWeekCard totalClients={(clients ?? []).filter((c) => !c.ended_at && !c.deletion_requested_at).length} needAttention={lateClients.length} />
      </Suspense>

      {/* záujemcovia z verejnej stránky (Business) — odkaz hlavne pre mobil */}
      <Suspense fallback={null}>
        <LeadsCard />
      </Suspense>

      {/* úspechy klientov (rekordy, odznaky) s high five — dostreamuje sa, nespomaľuje zoznam */}
      <Suspense fallback={null}>
        <AchievementsFeed />
      </Suspense>

      <ClientsBoard initialItems={rosterItems} />
    </>
  );
}
