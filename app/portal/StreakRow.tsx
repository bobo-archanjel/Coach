import { MIN_VISIBLE_STREAK, pluralSk, type PortalStreaks } from "@/lib/portal/streak";
import styles from "./portal.module.css";

/* Série klienta pod pásom dosiek na karte Dnes (feature/funkcionalita).
   Pravidlá výpočtu sú v lib/portal/streak.ts. Zámerne nikdy neukazuje "0" ani
   "séria stratená" — kým séria nie je aspoň MIN_VISIBLE_STREAK, riadok sa vôbec
   nevykreslí (motivácia, nie vina). Pripomienka je pokojná informácia, nie alarm. */

export function StreakRow({ streaks }: { streaks: PortalStreaks }) {
  const { training, food } = streaks;
  const showTraining = training.count >= MIN_VISIBLE_STREAK;
  const showFood = food.count >= MIN_VISIBLE_STREAK;
  if (!showTraining && !showFood) return null;

  const need = training.needThisWeek;
  let hint: string | null = null;
  if (showTraining && need > 0) {
    const what = `${need} ${pluralSk(need, "tréning", "tréningy", "tréningov")}`;
    hint = training.atRisk ? `Ešte ${what} tento týždeň a séria pokračuje.` : `Do splnenia týždňa chýba ešte ${what}.`;
  } else if (showFood && food.atRisk) {
    hint = "Zapíš dnes aspoň jedno jedlo, nech séria pokračuje.";
  }

  return (
    <div style={{ marginTop: 14 }}>
      <div className={styles.sessionChips}>
        {showTraining && (
          <span className={styles.chip}>
            Tréning: {training.count} {pluralSk(training.count, "týždeň", "týždne", "týždňov")} v rade
          </span>
        )}
        {showFood && (
          <span className={styles.chip}>
            Zápis jedla: {food.count} {pluralSk(food.count, "deň", "dni", "dní")} v rade
          </span>
        )}
      </div>
      {hint && (
        <p className={styles.sessionFocus} style={{ marginTop: 8 }}>
          {hint}
        </p>
      )}
    </div>
  );
}
