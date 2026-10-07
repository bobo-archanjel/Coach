import styles from "./portal.module.css";

/**
 * Loading-stav pre /portal/* routy (Next.js `loading.tsx` konvencia — automaticky
 * obalí stránku do Suspense, zobrazí sa OKAMŽITE pri navigácii, kým server robí
 * svoje Supabase dopyty). Tvar podľa skutočnej karty Dnes (prstenec postupu +
 * text, CTA pruh, týždenný pás riadkov), nie tri rovnaké panely pod sebou —
 * generický naprieč routami, ale aspoň vyzerá ako appka. Zdieľané aj s
 * `NavSkeletonOverlay` (feature/navod) — nav ostáva reálny a viditeľný, tento
 * skeleton prekrýva len obsah.
 *
 * Každý tvarový prvok nesie `styles.skeletonBlock` (shimmer pozadie) SPOLU so
 * svojou veľkostnou triedou — bez `skeletonBlock` by prvok nemal pozadie vôbec.
 */
export function PortalSkeleton() {
  return (
    <div className={styles.skeletonWrap} aria-hidden="true">
      <div className={`${styles.skeletonBlock} ${styles.skeletonHead}`} />

      <div className={styles.skeletonTodayBlock}>
        <div className={styles.skeletonTodayTop}>
          <div className={`${styles.skeletonBlock} ${styles.skeletonRing}`} />
          <div className={styles.skeletonTodayText}>
            <div className={`${styles.skeletonBlock} ${styles.skeletonLine}`} />
            <div className={`${styles.skeletonBlock} ${styles.skeletonLineShort}`} />
          </div>
        </div>
        <div className={`${styles.skeletonBlock} ${styles.skeletonCta}`} />
      </div>

      <div className={styles.skeletonListBlock}>
        {[0, 1, 2].map((i) => (
          <div key={i} className={styles.skeletonListRow}>
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
