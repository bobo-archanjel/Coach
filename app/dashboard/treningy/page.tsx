import Link from "next/link";
import { mockClients } from "@/lib/mock/dashboard";
import styles from "../dashboard.module.css";

export default function TreningyPage() {
  const withWorkouts = mockClients.filter((c) => c.recentWorkouts.length > 0);

  return (
    <>
      <div className={styles.pageHead}>
        <h1>Tréningy</h1>
        <p>Posledné odcvičené tréningy naprieč klientmi. Tréningový builder (zostavovanie plánov) je ďalšia úloha.</p>
      </div>

      <div className={styles.clientSectionGrid}>
        {withWorkouts.map((client) => (
          <div key={client.id} className={styles.clientSection}>
            <div className={styles.clientSectionHead}>
              <div>
                <span className={styles.clientName}>{client.name}</span>
                <span className={styles.clientGoal} style={{ marginLeft: 8 }}>
                  {client.goal}
                </span>
              </div>
              <Link href={`/dashboard/klienti/${client.id}`}>Detail klienta →</Link>
            </div>

            <div className={styles.workoutList}>
              {client.recentWorkouts.slice(0, 1).map((workout) => (
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
          </div>
        ))}
      </div>
    </>
  );
}
