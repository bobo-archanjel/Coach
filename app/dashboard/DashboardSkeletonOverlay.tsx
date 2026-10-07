"use client";

// `layout.tsx` je Server Component — funkcia (resolveSkeleton) sa cez RSC hranicu
// zo servera na klienta NEDÁ poslať ako prop ("Functions cannot be passed directly
// to Client Components"). Tento wrapper je celý klientský, takže funkciu vytvára
// AŽ TU, nie v layout.tsx — layout potom volá len `<DashboardSkeletonOverlay />`
// bez akýchkoľvek props, ktoré by museli cez hranicu prejsť ako funkcia.
import { NavSkeletonOverlay } from "../components/NavigationProgress";
import { DashboardRouteSkeleton } from "./RouteSkeletons";
import styles from "./dashboard.module.css";

export function DashboardSkeletonOverlay() {
  return (
    <NavSkeletonOverlay
      // Volané ako OBYČAJNÁ funkcia, nie JSX (`<DashboardRouteSkeleton .../>`)
      // — JSX by vytvorilo React element, ktorý je VŽDY pravdivý (objekt), aj
      // keď komponent vnútri vráti `null`. Overlay by tak nikdy nezistil, že
      // pre danú cestu (napr. Správy) sa nemá zobraziť vôbec — len by ukázal
      // prázdny tmavý box namiesto skutočného obsahu. DashboardRouteSkeleton
      // nepoužíva žiadne hooky, takže priame volanie je bezpečné.
      resolveSkeleton={(href) => DashboardRouteSkeleton({ href })}
      insetClassName={styles.wrap}
      outerClassName={styles.skeletonOuterInset}
    />
  );
}
