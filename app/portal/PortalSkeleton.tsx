import styles from "./portal.module.css";

/**
 * Loading-stav pre /portal/* routy (Next.js `loading.tsx` konvencia — automaticky
 * obalí stránku do Suspense, zobrazí sa OKAMŽITE pri navigácii, kým server robí
 * svoje Supabase dopyty). Predtým appka pri kliku na tab nezobrazila nič, kým
 * neprišli celé dáta — aj po znížení počtu round-tripov (viď lib/portal/data.ts)
 * ostáva ~100-300 ms na dopyt nevyhnutných, tento skeleton robí čakanie viditeľné
 * namiesto toho, aby appka pôsobila zaseknuto. Generický tvar (nie 1:1 podľa
 * konkrétnej stránky) — zámerne, nech ho vie zdieľať každá portálová routa.
 */
export function PortalSkeleton() {
  return (
    <div className={styles.skeletonWrap} aria-hidden="true">
      <div className={`${styles.skeletonBlock} ${styles.skeletonHead}`} />
      <div className={`${styles.skeletonBlock} ${styles.skeletonPanel}`} />
      <div className={`${styles.skeletonBlock} ${styles.skeletonPanelSmall}`} />
      <div className={`${styles.skeletonBlock} ${styles.skeletonPanelSmall}`} />
    </div>
  );
}
