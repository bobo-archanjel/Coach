import styles from "@/app/dashboard/dashboard.module.css";

/** Kostra karty reportov — rovnaké tvary ako ostatné skeletony dashboardu (RouteSkeletons). */
export function ReportsSkeleton() {
  return (
    <div className={styles.skeletonWrap} aria-hidden="true" style={{ marginBottom: 20 }}>
      <div className={`${styles.skeletonBlock} ${styles.skeletonCard}`} />
    </div>
  );
}
