import { useTranslations } from "next-intl";
import styles from "../dashboard.module.css";

/**
 * Bez vlastného loading.tsx by Next použil NAJBLIŽŠIU predkovskú Suspense
 * hranicu (app/dashboard/loading.tsx — tvar Klientov), čo tu vyzeralo rozbito
 * (feature/navod). Klientský `DashboardSkeletonOverlay` navyše pre Správy
 * úmyselne nezobrazuje žiadny skeleton (inbox skeleton pôsobil rušivo) — tento
 * súbor je jeho serverový náprotivok: React Suspense VŽDY niečo vykreslí namiesto
 * starého obsahu, takže "nič" (`null`) by znamenalo prázdnu obrazovku. Namiesto
 * shimmer blokov len skutočný nadpis stránky — vyzerá to ako normálna stránka,
 * ktorá sa dokresľuje, nie ako rozbitý/cudzí placeholder.
 */
export default function Loading() {
  const t = useTranslations("inbox");
  return (
    <div className={styles.pageHead}>
      <h1>{t("title")}</h1>
      <p>{t("loading")}</p>
    </div>
  );
}
