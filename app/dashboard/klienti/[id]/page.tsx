import { getLocale, getTranslations } from "next-intl/server";
import { intlLocale } from "@/lib/i18n/locales";
import { AppLink as Link } from "../../../components/AppLink";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getNutritionAdherence, getTrainingAdherence } from "@/lib/dashboard/adherence";
import { getBodyMetrics, getAllStrengthProgress } from "@/lib/dashboard/bodyMetrics";
import { getPlanCompletion } from "@/lib/dashboard/planCompletion";
import { parseLoggedEntries, parsePlanSnapshot } from "@/lib/workouts/completed";
import { DangerZone } from "./DangerZone";
import { AnalyticsPanel } from "./AnalyticsPanel";
import { ClientDetailTabs, type ClientDetailSection } from "./ClientDetailTabs";
import { ActivePlanButton } from "./ActivePlanButton";
import { CreateMealPlanButton } from "./CreateMealPlanButton";
import { NutritionForm } from "./NutritionForm";
import styles from "@/app/dashboard/dashboard.module.css";
import { mealPlanAvgDayKcal } from "@/lib/meals";
import { resolveActivePlanId } from "@/lib/portal/activePlan";

const BackIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <path d="M9 3 4 7l5 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// DEV náhľad Progresu bez session (?preview=progress) — váha/sila/objem + rozšírená adherencia.
function daysAgoIso(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
}
// i18n-ignore-start — DEV náhľad (vymyslené dáta)
const PROGRESS_PREVIEW_METRICS = [90, 76, 62, 48, 34, 20, 6].map((daysAgo, i) => ({
  measuredOn: daysAgoIso(daysAgo),
  weightKg: 88 - i * 1.1,
  waistCm: i === 0 || i === 6 ? 94 - i * 0.4 : null,
  chestCm: null,
  hipsCm: null,
  armCm: null,
  thighCm: null,
  note: null,
}));
const PROGRESS_PREVIEW_STRENGTH = {
  names: ["Bench press", "Drep s veľkou činkou", "Mŕtvy ťah"],
  byExercise: {
    // Drep + Mŕtvy ťah: posledný záznam je nové maximum → PR badge.
    "Drep s veľkou činkou": [60, 45, 31, 17, 3].map((d, i) => ({ date: daysAgoIso(d), bestWeightKg: 80 + i * 5, reps: 6 })),
    "Mŕtvy ťah": [56, 28, 4].map((d, i) => ({ date: daysAgoIso(d), bestWeightKg: 100 + i * 8, reps: 5 })),
    // Bench press: posledný tréning bol slabší než predtým → žiadny PR badge.
    "Bench press": [58, 44, 30, 16, 2].map((d, i) => ({
      date: daysAgoIso(d),
      bestWeightKg: [60, 66, 72, 75, 70][i],
      reps: 5,
    })),
  },
  prs: [
    { exercise: "Drep s veľkou činkou", bestWeightKg: 100, reps: 6, achievedOn: daysAgoIso(3) },
    { exercise: "Mŕtvy ťah", bestWeightKg: 116, reps: 5, achievedOn: daysAgoIso(4) },
  ],
};
// i18n-ignore-end
export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ preview?: string; sekcia?: string }>;
}) {
  const { id } = await params;
  const { preview, sekcia } = await searchParams;

  // i18n-ignore-start — DEV náhľad (?preview=progress)
  if ((preview === "progress" || preview === "progress_empty") && process.env.NODE_ENV === "development") {
    const empty = preview === "progress_empty";
    return (
      <>
        <Link href="/dashboard" className={styles.backLink}>
          <BackIcon />
          Späť na klientov
        </Link>
        <div className={styles.detailHead}>
          <div>
            <h1>{empty ? "Nový Norbert" : "Ján Novák"}</h1>
          </div>
        </div>
        <ClientDetailTabs
          sections={[
            {
              id: "analytika",
              label: "Analytika",
              content: (
                <AnalyticsPanel
                  clientId={id}
                  nutrition={empty ? null : { calories_target: 2400, protein_g: 180, carbs_g: 260, fat_g: 75 }}
                  adherence={
                    empty
                      ? null
                      : {
                          hasGoal: true,
                          kcalGoal: 2400,
                          todayKcal: 2180,
                          todayPct: 91,
                          days: [92, 78, null, 105, 88, 60, 91].map((pct, i) => ({
                            label: ["Po", "Ut", "St", "Št", "Pi", "So", "Ne"][i],
                            dateNum: i + 1,
                            pct,
                          })),
                          window30: { pct: 76, onTrackDays: 23, totalDays: 30 },
                          window90: { pct: 71, onTrackDays: 64, totalDays: 90 },
                        }
                  }
                  trainingAdherence={{
                    window30: { pct: empty ? 0 : 73, trainedDays: empty ? 0 : 22, totalDays: 30 },
                    window90: { pct: empty ? 0 : 68, trainedDays: empty ? 0 : 61, totalDays: 90 },
                    planCompletion: {
                      window30: { pct: empty ? null : 81, sessionsScored: empty ? 0 : 11 },
                      window90: { pct: empty ? null : 77, sessionsScored: empty ? 0 : 34 },
                    },
                  }}
                  bodyMetrics={empty ? [] : PROGRESS_PREVIEW_METRICS}
                  strengthNames={empty ? [] : PROGRESS_PREVIEW_STRENGTH.names}
                  strengthByExercise={empty ? {} : PROGRESS_PREVIEW_STRENGTH.byExercise}
                  strengthPRs={empty ? [] : PROGRESS_PREVIEW_STRENGTH.prs}
                />
              ),
            },
          ]}
        />
      </>
    );
  }

  // i18n-ignore-end
  const supabase = await createClient();
  const [t, locale] = await Promise.all([getTranslations("clientDetail"), getLocale()]);
  const dateLocale = intlLocale(locale);

  // Analytika (adherencia, merania, celá história sily) je najpomalšia časť stránky —
  // štartuje hneď, súbežne so zvyškom, ale stránka na ňu nečaká: hlavička, Tréningy
  // aj Info sa vykreslia hneď a karta Analytika sa dostreamuje cez <Suspense>
  // (predtým celá stránka čakala na najpomalší dopyt). Na notFound() ceste sa výsledok
  // len zahodí — catch nech nezostane neobslúžené odmietnutie.
  const analyticsData = Promise.all([
    getNutritionAdherence(id),
    getTrainingAdherence(id),
    getBodyMetrics(id),
    getAllStrengthProgress(id),
  ]);
  analyticsData.catch(() => {});

  // `client` samotný nie je vstupom pre žiadny z ostatných dopytov (všetky berú
  // `id` z route parametra priamo) — predtým čakal na svoj round-trip, kým sa
  // spustilo zvyšných 8. Beží teraz v tej istej dávke; ak klient neexistuje,
  // ostatné vrátia prázdno/null a zahodia sa spolu s `notFound()` nižšie.
  // Plány + ich odcvičenosť ako jeden reťazec v tej istej dávke: getPlanCompletion
  // potrebuje len ID dní plánov — predtým čakal na dobehnutie CELEJ dávky (vrátane
  // najpomalšieho dopytu) a pridal tak ďalší round-trip za ňou.
  const plansWithCompletion = supabase
    // `workout_days(id)` (nie `(count)`) — z tých istých ID sa počíta počet dní
    // aj odcvičenosť (getPlanCompletion, zdieľané so zoznamom /dashboard/treningy).
    .from("workout_plans")
    .select("id, name, created_at, published, workout_days(id)")
    .eq("client_id", id)
    .order("created_at", { ascending: false })
    .then(async ({ data: plans }) => ({
      plans,
      planCompletion: await getPlanCompletion(
        supabase,
        (plans ?? []).map((p) => ({
          id: p.id,
          dayIds: ((p.workout_days as unknown as { id: string }[] | null) ?? []).map((d) => d.id),
        })),
      ),
    }));

  const [
    { data: client },
    { plans, planCompletion },
    { data: nutrition },
    { data: logs },
    { data: privateNote },
    { data: mealPlans },
    { data: nutritionNote },
  ] = await Promise.all([
      supabase
        .from("clients")
        .select(
          "id, full_name, goal, invite_code, created_at, paired_at, age, weight_kg, height_cm, ended_at, deletion_requested_at, deletion_requested_by, active_plan_id",
        )
        .eq("id", id)
        .maybeSingle(),
      plansWithCompletion,
      // Vstupné údaje a výsledok makier (sekcia Jedálničky, NutritionForm) aj makro cieľ pre Analytiku.
      supabase
        .from("nutrition_profiles")
        .select("sex, age, weight_kg, height_cm, activity_level, goal, bmr, tdee, calories_target, protein_g, carbs_g, fat_g")
        .eq("client_id", id)
        .maybeSingle(),
      supabase
        .from("workout_logs")
        .select("id, performed_on, status, completed_at, entries, plan_snapshot, workout_days(name)")
        .eq("client_id", id)
        .order("performed_on", { ascending: false })
        .limit(8),
      // Súkromná poznámka trénera (trainer_private_notes, 0036) — klient ju nevidí.
      // Tabuľka ešte nemusí existovať (pred migráciou) → data je vtedy null, stránka funguje.
      supabase.from("trainer_private_notes").select("notes").eq("client_id", id).eq("scope", "client").maybeSingle(),
      // Jedálničky klienta od najnovšieho — RLS meal_plans_select_own_trainer: len tréner klienta.
      // meal_days(meals) kvôli priemerným kcal na deň (lib/meals.ts).
      supabase
        .from("meal_plans")
        .select("id, name, created_at, published, meal_days(meals)")
        .eq("client_id", id)
        .order("created_at", { ascending: false }),
      // Poznámka trénera k strave (alergie, intolerancie, preferencie) — klient ju nevidí; v NutritionForm.
      supabase.from("trainer_private_notes").select("notes").eq("client_id", id).eq("scope", "nutrition").maybeSingle(),
    ]);

  if (!client) {
    notFound();
  }

  const firstName = client.full_name.split(/\s+/)[0];

  // Od spárovania s týmto trénerom (0047), nie od registrácie klienta.
  const memberSince = new Date(client.paired_at ?? client.created_at).toLocaleDateString(dateLocale, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  // Hlavička karty sekcie — rovnaká vo všetkých sekciách (nadpis + počet/akcia vpravo).
  const cardHead = (title: string, side?: React.ReactNode) => (
    <div className={styles.sectionHead}>
      <h3>{title}</h3>
      {side}
    </div>
  );
  const count = (text: string) => <span className={styles.sectionMeta}>{text}</span>;

  // Portál ukazuje najnovší ZVEREJNENÝ jedálniček = aktívny; staršie zverejnené sú archív.
  const activeMealPlanId = mealPlans?.find((p) => p.published)?.id ?? null;
  // Aktívny tréningový plán = ten na klientovej karte Dnes (zvolený, inak najnovší zverejnený).
  const activePlanId = resolveActivePlanId(client.active_plan_id, (plans ?? []).filter((p) => p.published));
  const shortDate = (iso: string) =>
    new Date(iso).toLocaleDateString(dateLocale, { day: "numeric", month: "numeric", year: "numeric", timeZone: "Europe/Bratislava" });

  const sections: ClientDetailSection[] = [
    // Poradie = poradie kariet; prvá sa otvorí po kliknutí na klienta. Tréner sa
    // najčastejšie pozerá na tréningy, potom jedálničky a analytiku; Info (kód, poznámky,
    // ukončenie) je posledné. Analytika sa dostreamuje na pozadí aj keď nie je otvorená.
    // Každá sekcia = stĺpec kariet .card s rovnakou hlavičkou (cardHead) — aj na mobile.
    {
      id: "treningy",
      label: t("tabTrainings"),
      // Pridelené plány aj to, čo z nich klient odcvičil, na jednom mieste — predtým
      // samostatná karta "Aktivita" pôsobila ako duplicita tejto.
      content: (
        <div className={styles.cardStack}>
          <div className={styles.card}>
            {cardHead(t("plansTitle"), plans && plans.length > 0 ? count(t("planCount", { count: plans.length })) : undefined)}
            {plans && plans.length > 0 ? (
              <div className={styles.roster}>
                {plans.map((plan) => {
                  const dayCount = (plan.workout_days as unknown as { id: string }[] | null)?.length ?? 0;
                  const done = planCompletion.get(plan.id);
                  return (
                    <div key={plan.id} className={`${styles.planRow} ${plan.id === activePlanId ? styles.planRowActive : ""}`}>
                      <Link href={`/dashboard/treningy/${plan.id}`} className={styles.planRowLink}>
                        <span className={styles.clientName}>{plan.name}</span>
                        {done?.allDone ? (
                          <span className={styles.planDoneBadge}>{t("done")}</span>
                        ) : (
                          <span className={styles.clientSince}>
                            {done && done.completedDays > 0 ? `${done.completedDays}/${dayCount}` : dayCount}{" "}
                            {t("days", { count: dayCount })}
                          </span>
                        )}
                      </Link>
                      {/* aktívny = riadi klientovu kartu Dnes (0056); koncept klient nevidí */}
                      <span className={styles.planRowSide}>
                        {!plan.published ? (
                          <span className={`${styles.publishBadge} ${styles.publishBadgeDraft}`}>{t("draft")}</span>
                        ) : plan.id === activePlanId ? (
                          <span className={`${styles.publishBadge} ${styles.publishBadgeLive}`}>{t("active")}</span>
                        ) : (
                          <ActivePlanButton clientId={id} planId={plan.id} planName={plan.name} />
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className={styles.noWorkouts}>
                {t.rich("noPlans", { link: (chunks) => <Link href="/dashboard/treningy">{chunks}</Link> })}
              </p>
            )}
          </div>
          <div className={styles.card}>
            {cardHead(t("recentActivity"))}
            {logs && logs.length > 0 ? (
              <div className={styles.roster}>
                {logs.map((log) => {
                  // Názov dňa zo snapshotu (0048) — ostane aj keď tréner deň/plán neskôr zmaže.
                  const dayName =
                    parsePlanSnapshot(log.plan_snapshot)?.dayName ??
                    (log.workout_days as unknown as { name: string } | null)?.name ??
                    t("workoutFallback");
                  const performedOn = new Date(`${log.performed_on}T12:00:00Z`).toLocaleDateString(dateLocale, {
                    weekday: "short",
                    day: "numeric",
                    month: "numeric",
                    timeZone: "UTC",
                  });
                  const loggedCount = parseLoggedEntries(log.entries).filter((e) => e.sets.length > 0).length;
                  return (
                    <Link key={log.id} href={`/dashboard/klienti/${id}/treningy/${log.id}`} className={styles.logLinkRow}>
                      <span>
                        <span className={styles.clientName}>{dayName}</span>
                        <span className={styles.logLinkMeta}>
                          {loggedCount > 0
                            ? t("loggedExercises", { count: loggedCount })
                            : t("noValues")}
                        </span>
                      </span>
                      <span className={styles.logLinkSide}>
                        {log.status === "completed" && <span className={`${styles.statusChip} ${styles.active}`}>{t("completed")}</span>}
                        <span className={styles.clientSince}>{performedOn}</span>
                      </span>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <p className={styles.noWorkouts}>{t("noLogs")}</p>
            )}
          </div>
        </div>
      ),
    },
    {
      id: "jedalnicky",
      label: t("tabMealPlans"),
      content: (
        <div className={styles.cardStack}>
          {/* Vstupné údaje + Výsledok (BMR, TDEE, kalorický cieľ, makrá) — predtým na
              /dashboard/jedalnicky/[clientId], teraz rovno pri klientovi. */}
          <NutritionForm
            clientId={id}
            profile={nutrition ? { ...nutrition, notes: nutritionNote?.notes ?? null } : null}
            defaults={{ age: client.age, weight_kg: client.weight_kg, height_cm: client.height_cm }}
          />
          <div className={styles.card}>
            {cardHead(
              t("mealPlansTitle"),
              mealPlans && mealPlans.length > 0 ? count(t("mealPlanCount", { count: mealPlans.length })) : undefined,
            )}
            {mealPlans && mealPlans.length > 0 ? (
              <div className={styles.roster}>
                {mealPlans.map((plan) => {
                  const days = (plan.meal_days as unknown as { meals: unknown }[] | null) ?? [];
                  const kcal = mealPlanAvgDayKcal(days);
                  return (
                    <Link key={plan.id} href={`/dashboard/jedalnicky/jedalnicek/${plan.id}`} className={styles.logLinkRow}>
                      <span>
                        <span className={styles.clientName}>{plan.name}</span>
                        <span className={styles.logLinkMeta}>
                          {t("createdOn", { date: shortDate(plan.created_at), count: days.length })}
                        </span>
                      </span>
                      <span className={styles.logLinkSide}>
                        <span className={styles.clientSince}>{kcal != null ? t("kcalPerDay", { kcal }) : t("noMeals")}</span>
                        {!plan.published ? (
                          <span className={`${styles.publishBadge} ${styles.publishBadgeDraft}`}>{t("draft")}</span>
                        ) : plan.id === activeMealPlanId ? (
                          <span className={`${styles.publishBadge} ${styles.publishBadgeLive}`}>{t("active")}</span>
                        ) : (
                          <span className={`${styles.statusChip} ${styles.ended}`}>{t("archived")}</span>
                        )}
                      </span>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className={styles.sectionEmpty}>
                <p className={styles.noWorkouts}>{t("noMealPlans")}</p>
                <CreateMealPlanButton
                  clientId={id}
                  defaultName={t("defaultMealPlanName", { date: shortDate(new Date().toISOString()) })}
                />
              </div>
            )}
          </div>
        </div>
      ),
    },
    {
      id: "analytika",
      label: t("tabAnalytics"),
      content: (
        <Suspense fallback={<AnalyticsSkeleton />}>
          <ClientAnalytics clientId={id} nutrition={nutrition} data={analyticsData} />
        </Suspense>
      ),
    },
    {
      id: "info",
      label: t("tabInfo"),
      content: (
        <div className={styles.cardStack}>
          <div className={styles.card}>
            {cardHead(t("infoTitle"))}
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>{t("clientSince")}</span>
              <span className={styles.infoValue}>{memberSince}</span>
            </div>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>{t("inviteCode")}</span>
              <span className={styles.infoValue}>{client.invite_code}</span>
            </div>
            {(client.age || client.weight_kg || client.height_cm) && (
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>{t("ageWeightHeight")}</span>
                <span className={styles.infoValue}>
                  {[
                    client.age ? t("ageYears", { age: client.age }) : null,
                    client.weight_kg ? `${client.weight_kg} kg` : null,
                    client.height_cm ? `${client.height_cm} cm` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </div>
            )}
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>{t("notes")}</span>
              {privateNote?.notes ? (
                <span className={styles.infoValue}>{privateNote.notes}</span>
              ) : (
                <span className={styles.notesEmpty}>{t("noNotes")}</span>
              )}
            </div>
          </div>
          <div className={styles.card}>
            <DangerZone
              clientId={id}
              firstName={firstName}
              endedAt={client.ended_at}
              deletionRequestedAt={client.deletion_requested_at}
              deletionRequestedBy={client.deletion_requested_by}
            />
          </div>
        </div>
      ),
    },
  ];

  return (
    <>
      <Link href="/dashboard" className={styles.backLink}>
        <BackIcon />
        {t("back")}
      </Link>

      <div className={styles.detailHead}>
        <div>
          <h1>{client.full_name}</h1>
          {client.goal && <div className={styles.clientGoal}>{client.goal}</div>}
        </div>
      </div>

      {/* key: odkaz na inú ?sekcia= (napr. z Analytiky) prepne záložku aj bez reloadu */}
      <ClientDetailTabs key={sekcia ?? ""} sections={sections} initialId={sekcia} />
    </>
  );
}

type AnalyticsData = [
  Awaited<ReturnType<typeof getNutritionAdherence>>,
  Awaited<ReturnType<typeof getTrainingAdherence>>,
  Awaited<ReturnType<typeof getBodyMetrics>>,
  Awaited<ReturnType<typeof getAllStrengthProgress>>,
];

/** Karta Analytika — čaká na dopyty spustené už na začiatku stránky (viď vyššie). */
async function ClientAnalytics({
  clientId,
  nutrition,
  data,
}: {
  clientId: string;
  nutrition: React.ComponentProps<typeof AnalyticsPanel>["nutrition"];
  data: Promise<AnalyticsData>;
}) {
  const [adherence, trainingAdherence, bodyMetrics, strengthProgress] = await data;
  return (
    <AnalyticsPanel
      clientId={clientId}
      nutrition={nutrition}
      adherence={adherence}
      trainingAdherence={trainingAdherence}
      bodyMetrics={bodyMetrics ?? []}
      strengthNames={strengthProgress?.names ?? []}
      strengthByExercise={strengthProgress?.byExercise ?? {}}
      strengthPRs={strengthProgress?.prs ?? []}
    />
  );
}

async function AnalyticsSkeleton() {
  return (
    <div className={styles.skeletonWrap} aria-hidden="true">
      <div className={`${styles.skeletonBlock} ${styles.skeletonCard}`} />
      <div className={`${styles.skeletonBlock} ${styles.skeletonCard}`} />
    </div>
  );
}
