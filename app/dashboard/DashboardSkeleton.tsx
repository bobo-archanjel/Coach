import styles from "@/app/dashboard/dashboard.module.css";

/** Loading-stav pre /dashboard/* routy — viď app/portal/PortalSkeleton.tsx (rovnaký dôvod, zdieľané tokeny). */
export async function DashboardSkeleton() {
  return (
    <div className={styles.skeletonWrap} aria-hidden="true">
      <div className={`${styles.skeletonBlock} ${styles.skeletonHead}`} />
      <div className={`${styles.skeletonBlock} ${styles.skeletonCard}`} />
      <div className={`${styles.skeletonBlock} ${styles.skeletonCard}`} />
      <div className={`${styles.skeletonBlock} ${styles.skeletonCard}`} />
    </div>
  );
}
