import Link from "next/link";
import { notFound } from "next/navigation";
import { getMockClient } from "@/lib/mock/dashboard";
import styles from "../../dashboard.module.css";

const STATUS_LABEL: Record<string, string> = {
  active: "aktívny",
  late: "meškanie",
};

const BackIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <path d="M9 3 4 7l5 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = getMockClient(id);

  if (!client) {
    notFound();
  }

  const memberSince = new Date(client.memberSince).toLocaleDateString("sk-SK", {
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
          <h1>{client.name}</h1>
          <div className={styles.clientGoal}>{client.goal}</div>
        </div>
        <span className={`${styles.statusChip} ${styles[client.status]}`}>{STATUS_LABEL[client.status]}</span>
      </div>

      <div className={styles.detailGrid}>
        <div className={styles.cardStack}>
          <div className={styles.card}>
            <h3>Informácie</h3>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>Klient od</span>
              <span className={styles.infoValue}>{memberSince}</span>
            </div>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>Posledný log</span>
              <span className={styles.infoValue}>{client.lastLogLabel}</span>
            </div>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>Poznámky</span>
              {client.notes ? (
                <span className={styles.infoValue}>{client.notes}</span>
              ) : (
                <span className={styles.notesEmpty}>Žiadne poznámky</span>
              )}
            </div>
          </div>

          <div className={styles.card}>
            <h3>Makrá dnes</h3>
            <div className={styles.macroBarRow}>
              <div className={styles.macroTop}>
                <span>Bielkoviny</span>
                <span className={styles.macroVal}>
                  {client.macros.protein[0]} / {client.macros.protein[1]} g
                </span>
              </div>
              <div className={styles.macroTrack}>
                <div
                  className={`${styles.macroFill} ${styles.protein}`}
                  style={{ width: `${Math.min(100, (client.macros.protein[0] / client.macros.protein[1]) * 100)}%` }}
                />
              </div>
            </div>
            <div className={styles.macroBarRow} style={{ marginTop: 14 }}>
              <div className={styles.macroTop}>
                <span>Sacharidy</span>
                <span className={styles.macroVal}>
                  {client.macros.carbs[0]} / {client.macros.carbs[1]} g
                </span>
              </div>
              <div className={styles.macroTrack}>
                <div
                  className={`${styles.macroFill} ${styles.carbs}`}
                  style={{ width: `${Math.min(100, (client.macros.carbs[0] / client.macros.carbs[1]) * 100)}%` }}
                />
              </div>
            </div>
            <div className={styles.macroBarRow} style={{ marginTop: 14 }}>
              <div className={styles.macroTop}>
                <span>Tuky</span>
                <span className={styles.macroVal}>
                  {client.macros.fat[0]} / {client.macros.fat[1]} g
                </span>
              </div>
              <div className={styles.macroTrack}>
                <div
                  className={`${styles.macroFill} ${styles.fat}`}
                  style={{ width: `${Math.min(100, (client.macros.fat[0] / client.macros.fat[1]) * 100)}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        <div className={styles.card}>
          <h3>Posledné tréningy</h3>
          {client.recentWorkouts.length > 0 ? (
            <div className={styles.workoutList}>
              {client.recentWorkouts.map((workout) => (
                <div key={workout.day + workout.date} className={styles.workoutBlock}>
                  <div className={styles.workoutDay}>
                    <span>{workout.day}</span>
                    <span className={styles.workoutDate}>
                      {new Date(workout.date).toLocaleDateString("sk-SK")}
                    </span>
                  </div>
                  {workout.exercises.map((ex) => (
                    <div key={ex.idx} className={styles.exerciseRow}>
                      <span className={styles.exIdx}>{ex.idx}</span>
                      <span className={styles.exName}>{ex.name}</span>
                      <span className={styles.exLoad}>{ex.load}</span>
                      <span className={styles.exRest}>{ex.rest}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <p className={styles.noWorkouts}>Žiadne odcvičené tréningy zatiaľ nezaznamenané.</p>
          )}
        </div>
      </div>
    </>
  );
}
