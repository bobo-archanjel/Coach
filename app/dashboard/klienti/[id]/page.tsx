import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getNutritionAdherence, getTrainingAdherence } from "@/lib/dashboard/adherence";
import { getBodyMetrics, getAllStrengthProgress, getVolumeTrend } from "@/lib/dashboard/bodyMetrics";
import type { LoggedExercise } from "@/lib/portal/types";
import styles from "../../dashboard.module.css";
import { DangerZone } from "./DangerZone";
import { BodyMetricsCard } from "./BodyMetricsCard";
import { StrengthVolumeCard } from "./StrengthVolumeCard";

const BackIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <path d="M9 3 4 7l5 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** Farba bodky v páse adherencie — 85–115 % cieľa = v poriadku, inak potrebuje pozornosť. */
function adherenceToneClass(pct: number | null): string {
  if (pct == null) return styles.adherenceNone;
  return pct >= 85 && pct <= 115 ? styles.adherenceGood : styles.adherenceOff;
}

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
const PROGRESS_PREVIEW_VOLUME = [60, 44, 30, 16, 2].map((d, i) => ({ date: daysAgoIso(d), volumeKg: 3200 + i * 340 }));

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
        <div className={styles.detailGrid}>
          <div />
          <div className={styles.cardStack}>
            <div className={styles.card}>
              <h3>Trekovanie jedálnička</h3>
              {!empty ? (
                <>
                  <h4 className={styles.cardSubhead}>Makro cieľ</h4>
                  <div className={styles.infoRow}>
                    <span className={styles.infoLabel}>Kalorický cieľ</span>
                    <span className={styles.infoValue}>2400 kcal/deň</span>
                  </div>
                  <div className={styles.infoRow}>
                    <span className={styles.infoLabel}>Makrá</span>
                    <span className={styles.infoValue}>180 g B · 260 g S · 75 g T</span>
                  </div>
                  <Link href="#" className={styles.backLink} style={{ marginTop: 8, marginBottom: 0 }}>
                    Upraviť →
                  </Link>

                  <h4 className={styles.cardSubhead}>Adherencia stravy</h4>
                  <div className={styles.infoRow}>
                    <span className={styles.infoLabel}>Dnes</span>
                    <span className={styles.infoValue}>
                      2180 / 2400 kcal · <strong>91&nbsp;%</strong> z cieľa
                    </span>
                  </div>
                  <div className={styles.adherenceStrip} aria-hidden="true">
                    {[92, 78, null, 105, 88, 60, 91].map((pct, i) => (
                      <div key={i} className={styles.adherenceDay}>
                        <span className={`${styles.adherenceDot} ${adherenceToneClass(pct)}`} />
                        <span className={styles.adherenceDayLabel}>{["Po", "Ut", "St", "Št", "Pi", "So", "Ne"][i]}</span>
                      </div>
                    ))}
                  </div>
                  <p className={styles.adherenceHint}>Posledných 7 dní · zelená = 85–115 % cieľa, sivá = bez záznamu.</p>
                  <div className={styles.adherenceWindowRow}>
                    <span>
                      30 dní: <strong>76&nbsp;%</strong>
                    </span>
                    <span>
                      90 dní: <strong>71&nbsp;%</strong>
                    </span>
                  </div>
                </>
              ) : (
                <p className={styles.noWorkouts}>
                  Makro cieľ zatiaľ nenastavený — <Link href="#">vypočítať teraz</Link>. Bez cieľa sa nedá počítať ani
                  adherencia stravy.
                </p>
              )}
            </div>

            <div className={styles.card}>
              <h3>Analytika</h3>
              <h4 className={styles.cardSubhead}>Adherencia tréningu</h4>
              <div className={styles.adherenceWindowRow}>
                <span>
                  30 dní: <strong>{empty ? 0 : 73}&nbsp;%</strong>
                </span>
                <span>
                  90 dní: <strong>{empty ? 0 : 68}&nbsp;%</strong>
                </span>
              </div>
              <BodyMetricsCard clientId={id} entries={empty ? [] : PROGRESS_PREVIEW_METRICS} />
              <StrengthVolumeCard
                exerciseNames={empty ? [] : PROGRESS_PREVIEW_STRENGTH.names}
                byExercise={empty ? {} : PROGRESS_PREVIEW_STRENGTH.byExercise}
                volumePoints={empty ? [] : PROGRESS_PREVIEW_VOLUME}
              />
            </div>
          </div>
        </div>
      </>
    );
  }

  const supabase = await createClient();

  const { data: client } = await supabase
    .from("clients")
    .select(
      "id, full_name, goal, notes, invite_code, created_at, age, weight_kg, height_cm, ended_at, deletion_requested_at, deletion_requested_by",
    )
    .eq("id", id)
    .maybeSingle();

  if (!client) {
    notFound();
  }

  const [{ data: plans }, { data: nutrition }, { data: logs }, adherence, trainingAdherence, bodyMetrics, strengthProgress, volumeTrend] =
    await Promise.all([
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
      getVolumeTrend(id),
    ]);

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
            <h3>Trekovanie jedálnička</h3>
            {nutrition ? (
              <>
                <h4 className={styles.cardSubhead}>Makro cieľ</h4>
                <div className={styles.infoRow}>
                  <span className={styles.infoLabel}>Kalorický cieľ</span>
                  <span className={styles.infoValue}>{nutrition.calories_target} kcal/deň</span>
                </div>
                <div className={styles.infoRow}>
                  <span className={styles.infoLabel}>Makrá</span>
                  <span className={styles.infoValue}>
                    {nutrition.protein_g} g B · {nutrition.carbs_g} g S · {nutrition.fat_g} g T
                  </span>
                </div>
                <Link href={`/dashboard/vyziva/${id}`} className={styles.backLink} style={{ marginTop: 8, marginBottom: 0 }}>
                  Upraviť →
                </Link>

                {adherence?.hasGoal && (
                  <>
                    <h4 className={styles.cardSubhead}>Adherencia stravy</h4>
                    <div className={styles.infoRow}>
                      <span className={styles.infoLabel}>Dnes</span>
                      <span className={styles.infoValue}>
                        {adherence.todayKcal} / {adherence.kcalGoal} kcal · <strong>{adherence.todayPct}&nbsp;%</strong> z cieľa
                      </span>
                    </div>
                    <div className={styles.adherenceStrip} aria-hidden="true">
                      {adherence.days.map((day, i) => (
                        <div key={i} className={styles.adherenceDay}>
                          <span className={`${styles.adherenceDot} ${adherenceToneClass(day.pct)}`} />
                          <span className={styles.adherenceDayLabel}>{day.label}</span>
                        </div>
                      ))}
                    </div>
                    <p className={styles.adherenceHint}>Posledných 7 dní · zelená = 85–115 % cieľa, sivá = bez záznamu.</p>
                    <div className={styles.adherenceWindowRow}>
                      <span>
                        30 dní: <strong>{adherence.window30.pct}&nbsp;%</strong>
                      </span>
                      <span>
                        90 dní: <strong>{adherence.window90.pct}&nbsp;%</strong>
                      </span>
                    </div>
                  </>
                )}
              </>
            ) : (
              <p className={styles.noWorkouts}>
                Makro cieľ zatiaľ nenastavený — <Link href={`/dashboard/vyziva/${id}`}>vypočítať teraz</Link>. Bez cieľa sa
                nedá počítať ani adherencia stravy.
              </p>
            )}
          </div>

          <div className={styles.card}>
            <h3>Analytika</h3>
            <h4 className={styles.cardSubhead}>Adherencia tréningu</h4>
            {trainingAdherence ? (
              <>
                <div className={styles.adherenceWindowRow}>
                  <span>
                    30 dní: <strong>{trainingAdherence.window30.pct}&nbsp;%</strong> ({trainingAdherence.window30.trainedDays}/
                    {trainingAdherence.window30.totalDays} dní)
                  </span>
                  <span>
                    90 dní: <strong>{trainingAdherence.window90.pct}&nbsp;%</strong> ({trainingAdherence.window90.trainedDays}/
                    {trainingAdherence.window90.totalDays} dní)
                  </span>
                </div>
                <p className={styles.adherenceHint}>% dní, kedy klient odcvičil aspoň jeden tréning (bez pevného rozvrhu).</p>
              </>
            ) : (
              <p className={styles.noWorkouts}>Adherenciu tréningu sa nepodarilo načítať.</p>
            )}

            <BodyMetricsCard clientId={id} entries={bodyMetrics ?? []} />

            <StrengthVolumeCard
              exerciseNames={strengthProgress?.names ?? []}
              byExercise={strengthProgress?.byExercise ?? {}}
              volumePoints={volumeTrend ?? []}
            />
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
