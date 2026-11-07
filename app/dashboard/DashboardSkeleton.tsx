import styles from "@/app/dashboard/dashboard.module.css";

/**
 * Loading-stav pre /dashboard/* routy — tvarom podľa skutočnej najčastejšej
 * stránky (Klienti: formulár na pridanie hore, zoznam kariet pod ním), nie tri
 * identické kartičky pod sebou. Generický naprieč routami (nie 1:1 podľa
 * konkrétnej stránky), ale aspoň vyzerá ako appka, nie ako univerzálny placeholder.
 * Zdieľané aj s `NavSkeletonOverlay` (feature/navod) — menu ostáva reálne a
 * viditeľné, tento skeleton prekrýva len obsah, nie sidebar. Viď aj
 * app/portal/PortalSkeleton.tsx (rovnaký dôvod, zdieľané tokeny).
 *
 * Každý tvarový prvok nesie `styles.skeletonBlock` (shimmer pozadie) SPOLU so
 * svojou veľkostnou triedou — bez `skeletonBlock` by prvok nemal pozadie vôbec.
 */
export async function DashboardSkeleton() {
  return (
    <div className={styles.skeletonWrap} aria-hidden="true">
      <div className={`${styles.skeletonBlock} ${styles.skeletonHead}`} />

      <div className={styles.skeletonFormBlock}>
        <div className={`${styles.skeletonBlock} ${styles.skeletonFormLabel}`} />
        <div className={`${styles.skeletonBlock} ${styles.skeletonFormInput}`} />
        <div className={`${styles.skeletonBlock} ${styles.skeletonFormButton}`} />
      </div>

      <div className={styles.skeletonListBlock}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={styles.skeletonListRow}>
            <div className={`${styles.skeletonBlock} ${styles.skeletonAvatar}`} />
            <div className={styles.skeletonListText}>
              <div className={`${styles.skeletonBlock} ${styles.skeletonLine}`} />
              <div className={`${styles.skeletonBlock} ${styles.skeletonLineShort}`} />
            </div>
            <div className={`${styles.skeletonBlock} ${styles.skeletonChip}`} />
          </div>
        ))}
      </div>
    </div>
  );
}
