import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getNutritionAdherence, getTrainingAdherence } from "@/lib/dashboard/adherence";
import { getBodyMetrics, getAllStrengthProgress } from "@/lib/dashboard/bodyMetrics";
import type { LoggedExercise } from "@/lib/portal/types";
import styles from "../../dashboard.module.css";
import { DangerZone } from "./DangerZone";
import { AnalyticsPanel } from "./AnalyticsPanel";

const BackIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <path d="M9 3 4 7l5 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// DEV náhľad Progresu bez session (?preview=progress) — váha/sila/objem + rozšírená adherencia.
function daysAgoIso(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
}
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
  names: ["Drep s veľkou činkou", "Bench press", "Mŕtvy ťah"],
  byExercise: {
    "Drep s veľkou činkou": [60, 45, 31, 17, 3].map((d, i) => ({ date: daysAgoIso(d), bestWeightKg: 80 + i * 5, reps: 6 })),
    "Bench press": [58, 44, 30, 16, 2].map((d, i) => ({ date: daysAgoIso(d), bestWeightKg: 60 + i * 3, reps: 5 })),
    "Mŕtvy ťah": [56, 28, 4].map((d, i) => ({ date: daysAgoIso(d), bestWeightKg: 100 + i * 8, reps: 5 })),
  },
};
export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ preview?: string }>;
}) {
  const { id } = await params;
  const { preview } = await searchParams;

  if ((preview === "progress" || preview === "progress_empty") && process.env.NODE_ENV !== "production") {
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
          }}
          bodyMetrics={empty ? [] : PROGRESS_PREVIEW_METRICS}
          strengthNames={empty ? [] : PROGRESS_PREVIEW_STRENGTH.names}
          strengthByExercise={empty ? {} : PROGRESS_PREVIEW_STRENGTH.byExercise}
        />
      </>
    );
  }

  const supabase = await createClient();

  // `client` samotný nie je vstupom pre žiadny z ostatných dopytov (všetky berú
  // `id` z route parametra priamo) — predtým čakal na svoj round-trip, kým sa
  // spustilo zvyšných 8. Beží teraz v tej istej dávke; ak klient neexistuje,
  // ostatné vrátia prázdno/null a zahodia sa spolu s `notFound()` nižšie.
  const [{ data: client }, { data: plans }, { data: nutrition }, { data: logs }, adherence, trainingAdherence, bodyMetrics, strengthProgress] =
    await Promise.all([
      supabase
        .from("clients")
        .select(
          "id, full_name, goal, notes, invite_code, created_at, age, weight_kg, height_cm, ended_at, deletion_requested_at, deletion_requested_by",
        )
        .eq("id", id)
        .maybeSingle(),
      supabase
        .from("workout_plans")
        .select("id, name, created_at, workout_days(count)")
        .eq("client_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("nutrition_profiles")
        .select("calories_target, protein_g, carbs_g, fat_g")
        .eq("client_id", id)
        .maybeSingle(),
      supabase
        .from("workout_logs")
        .select("id, performed_on, entries, workout_days(name)")
        .eq("client_id", id)
        .order("performed_on", { ascending: false })
        .limit(8),
      getNutritionAdherence(id),
      getTrainingAdherence(id),
      getBodyMetrics(id),
      getAllStrengthProgress(id),
    ]);

  if (!client) {
    notFound();
  }

  const firstName = client.full_name.split(/\s+/)[0];

  const memberSince = new Date(client.created_at).toLocaleDateString("sk-SK", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <>
      <Link href="/dashboard" className={styles.backLink}>
        <BackIcon />
        Späť na klientov
      </Link>

      <div className={styles.detailHead}>
        <div>
          <h1>{client.full_name}</h1>
          {client.goal && <div className={styles.clientGoal}>{client.goal}</div>}
        </div>
      </div>

      <AnalyticsPanel
        clientId={id}
        nutrition={nutrition}
        adherence={adherence}
        trainingAdherence={trainingAdherence}
        bodyMetrics={bodyMetrics ?? []}
        strengthNames={strengthProgress?.names ?? []}
        strengthByExercise={strengthProgress?.byExercise ?? {}}
      />

      <div className={styles.detailGrid}>
        <div className={styles.card}>
          <h3>Informácie</h3>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Klient od</span>
            <span className={styles.infoValue}>{memberSince}</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Pozývací kód</span>
            <span className={styles.infoValue}>{client.invite_code}</span>
          </div>
          {(client.age || client.weight_kg || client.height_cm) && (
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>Vek / váha / výška</span>
              <span className={styles.infoValue}>
                {[
                  client.age ? `${client.age} rokov` : null,
                  client.weight_kg ? `${client.weight_kg} kg` : null,
                  client.height_cm ? `${client.height_cm} cm` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </div>
          )}
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Poznámky</span>
            {client.notes ? (
              <span className={styles.infoValue}>{client.notes}</span>
            ) : (
              <span className={styles.notesEmpty}>Žiadne poznámky</span>
            )}
          </div>
        </div>

        <div className={styles.cardStack}>
          <div className={styles.card}>
            <h3>Tréningové plány</h3>
            {plans && plans.length > 0 ? (
              <div className={styles.roster}>
                {plans.map((plan) => {
                  const dayCount = (plan.workout_days as unknown as { count: number }[] | null)?.[0]?.count ?? 0;
                  return (
                    <Link key={plan.id} href={`/dashboard/treningy/${plan.id}`} className={styles.clientCard}>
                      <div className={styles.clientName}>{plan.name}</div>
                      <span className={styles.clientSince}>{dayCount} dní</span>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <p className={styles.noWorkouts}>
                Klient zatiaľ nemá vytvorený tréningový plán — pridaj ho na{" "}
                <Link href="/dashboard/treningy">Tréningy</Link>.
              </p>
            )}
          </div>

          <div className={styles.card}>
            <h3>Posledná aktivita</h3>
            {logs && logs.length > 0 ? (
              <div className={styles.roster}>
                {logs.map((log) => {
                  const dayName = (log.workout_days as unknown as { name: string } | null)?.name ?? "Tréning";
                  const performedOn = new Date(`${log.performed_on}T12:00:00Z`).toLocaleDateString("sk-SK", {
                    weekday: "short",
                    day: "numeric",
                    month: "numeric",
                    timeZone: "UTC",
                  });
                  const entries = Array.isArray(log.entries) ? (log.entries as LoggedExercise[]) : [];
                  return (
                    <details key={log.id} className={styles.logDetails}>
                      <summary className={styles.logSummary}>
                        <span className={styles.clientName}>{dayName}</span>
                        <span className={styles.clientSince}>{performedOn}</span>
                      </summary>
                      {entries.length > 0 ? (
                        <div className={styles.logExercises}>
                          {entries.map((ex, i) => (
                            <div key={`${ex.entryId ?? "ex"}-${i}`} className={styles.logExerciseRow}>
                              <p className={styles.logExerciseTitle}>{ex.name}</p>
                              <ol className={styles.logSetList}>
                                {ex.sets.map((s, j) => (
                                  <li key={j}>
                                    {s.reps != null ? `${s.reps} op.` : "—"}
                                    {s.weight != null ? ` × ${s.weight} kg` : ""}
                                  </li>
                                ))}
                              </ol>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className={styles.noWorkouts}>Klient nezadal skutočné hodnoty (len odklikol tréning).</p>
                      )}
                    </details>
                  );
                })}
              </div>
            ) : (
              <p className={styles.noWorkouts}>Klient zatiaľ neodklikol žiadny tréning.</p>
            )}
          </div>

          <DangerZone
            clientId={id}
            firstName={firstName}
            endedAt={client.ended_at}
            deletionRequestedAt={client.deletion_requested_at}
            deletionRequestedBy={client.deletion_requested_by}
          />
        </div>
      </div>
    </>
  );
}
