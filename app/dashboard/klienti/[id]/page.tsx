import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ChatThread } from "@/app/components/ChatThread";
import type { LoggedExercise } from "@/lib/portal/types";
import styles from "../../dashboard.module.css";
import { markTrainerChatSeenAction, sendTrainerMessageAction } from "../actions";

const BackIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <path d="M9 3 4 7l5 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// DEV náhľad karty Správy bez session (?preview=chat) — trénerská polovica chatu.
const CHAT_PREVIEW = [
  { id: "c1", sender: "trainer" as const, body: "Ahoj Ján! Ako šlo dnešné nohy?", createdAt: new Date(Date.now() - 27 * 3600_000).toISOString() },
  { id: "c2", sender: "client" as const, body: "Zdravím, celkom dobre. Drep 4×6 na 92 kg, posledná séria ťažká.", createdAt: new Date(Date.now() - 26 * 3600_000).toISOString() },
  { id: "c3", sender: "trainer" as const, body: "Super progres. Nabudúce nechaj 92 a pridaj jednu rozcvičovaciu sériu navyše.", createdAt: new Date(Date.now() - 2 * 3600_000).toISOString() },
  { id: "c4", sender: "client" as const, body: "Ok, dík!", createdAt: new Date(Date.now() - 1.5 * 3600_000).toISOString() },
];

export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ preview?: string }>;
}) {
  const { id } = await params;
  const { preview } = await searchParams;

  if (preview === "chat" && process.env.NODE_ENV !== "production") {
    return (
      <>
        <Link href="/dashboard" className={styles.backLink}>
          <BackIcon />
          Späť na klientov
        </Link>
        <div className={styles.detailHead}>
          <div>
            <h1>Ján Novák</h1>
          </div>
        </div>
        <div className={styles.card} style={{ maxWidth: 560 }}>
          <h3>Správy</h3>
          <ChatThread
            messages={CHAT_PREVIEW}
            mySide="trainer"
            sendAction={sendTrainerMessageAction}
            extraFields={{ client_id: id }}
            emptyTitle="Zatiaľ žiadne správy"
            emptyText="Napíš klientovi prvú správu."
            placeholder="Správa pre Jána…"
            embedded
          />
        </div>
      </>
    );
  }

  const supabase = await createClient();

  const { data: client } = await supabase
    .from("clients")
    .select("id, full_name, goal, notes, invite_code, created_at, age, weight_kg, height_cm")
    .eq("id", id)
    .maybeSingle();

  if (!client) {
    notFound();
  }

  const [{ data: plans }, { data: nutrition }, { data: logs }, { data: msgRows }] = await Promise.all([
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
    supabase
      .from("messages")
      .select("id, sender, body, created_at")
      .eq("client_id", id)
      .order("created_at", { ascending: true })
      .limit(300),
  ]);

  const firstName = client.full_name.split(/\s+/)[0];
  const messages = (msgRows ?? []).map((m) => ({
    id: m.id as string,
    sender: m.sender as "trainer" | "client",
    body: m.body as string,
    createdAt: m.created_at as string,
  }));

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
            <h3>Makro cieľ</h3>
            {nutrition ? (
              <>
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
              </>
            ) : (
              <p className={styles.noWorkouts}>
                Makro cieľ zatiaľ nenastavený — <Link href={`/dashboard/vyziva/${id}`}>vypočítať teraz</Link>.
              </p>
            )}
          </div>

          <div className={styles.card}>
            <h3>Správy</h3>
            <ChatThread
              messages={messages}
              mySide="trainer"
              sendAction={sendTrainerMessageAction}
              extraFields={{ client_id: id }}
              onSeen={markTrainerChatSeenAction.bind(null, id)}
              emptyTitle="Zatiaľ žiadne správy"
              emptyText={`Napíš ${firstName}ovi prvú správu — spätná väzba k tréningu, úprava plánu, čokoľvek.`}
              placeholder={`Správa pre ${firstName}a…`}
              embedded
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
        </div>
      </div>
    </>
  );
}
