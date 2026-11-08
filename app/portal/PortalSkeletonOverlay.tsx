"use client";

// Rovnaký dôvod ako app/dashboard/DashboardSkeletonOverlay.tsx — funkcia sa cez
// RSC hranicu zo servera (layout.tsx) na klienta poslať nedá, takže sa vytvára
// tu, v čisto klientskom wrapperi.
import { NavSkeletonOverlay } from "../components/NavigationProgress";
import { PortalRouteSkeleton } from "./RouteSkeletons";
import styles from "./portal.module.css";

export function PortalSkeletonOverlay() {
  // Volané ako obyčajná funkcia, nie JSX — viď komentár v
  // app/dashboard/DashboardSkeletonOverlay.tsx (JSX element je vždy pravdivý
  // objekt, aj keď komponent vnútri vráti `null`).
  return <NavSkeletonOverlay resolveSkeleton={(href) => PortalRouteSkeleton({ href })} insetClassName={styles.v6Main} />;
}
