import styles from "./dashboard.module.css";
import builderStyles from "./treningy/[planId]/builder.module.css";
import { DashboardSkeleton } from "./DashboardSkeleton";

/**
 * Skeleton TVAROM podľa cieľovej stránky (pokračovanie feature/navod) — predtým
 * `NavSkeletonOverlay` ukazoval vždy rovnaký `DashboardSkeleton` (tvar Klientov)
 * bez ohľadu na to, kam sa naviguje, takže klik na "Tréningy" alebo "Nastavenia"
 * zobrazil skeleton, ktorý s reálnou stránkou vôbec netvarovo nesedel. Každá
 * funkcia nižšie zodpovedá presne jednej sekcii — kontajnery znovupoužívajú
 * SKUTOČNÉ CSS triedy tej sekcie (`.cardStack`, `.settingsGrid`, `.inboxGrid`,
 * `.builderGrid`) pre presné medzery/mriežku, len obsah vnútri je shimmer blok.
 */

function B({ className }: { className: string }) {
  return <div className={`${styles.skeletonBlock} ${className}`} />;
}

function Head() {
  return <B className={styles.skeletonHead} />;
}

function CardSkeleton({ lines = 2 }: { lines?: number }) {
  return (
    <div className={styles.skeletonCardBlock}>
      <B className={styles.skeletonCardTitle} />
      {Array.from({ length: lines }).map((_, i) => (
        <B key={i} className={i % 2 === 1 ? styles.skeletonLineShort : styles.skeletonLine} />
      ))}
    </div>
  );
}

function ListRows({ count = 4 }: { count?: number }) {
  return (
    <div className={styles.skeletonListBlock}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={styles.skeletonListRow}>
          <div className={styles.skeletonListText}>
            <B className={styles.skeletonLine} />
            <B className={styles.skeletonLineShort} />
          </div>
          <B className={styles.skeletonChip} />
        </div>
      ))}
    </div>
  );
}

/** /dashboard — Klienti (nezmenené, existujúci presný tvar). */
function KlientiSkeleton() {
  return <DashboardSkeleton />;
}

/** /dashboard/treningy — 2 formuláre (nový plán, AI generátor) + zoznam plánov + knižnica. */
function TreningySkeleton() {
  return (
    <div className={styles.skeletonWrap}>
      <Head />
      <div style={{ marginBottom: 20 }}>
        <CardSkeleton lines={3} />
      </div>
      <div style={{ marginBottom: 20 }}>
        <CardSkeleton lines={3} />
      </div>
      <div style={{ marginBottom: 28 }}>
        <ListRows count={3} />
      </div>
      <CardSkeleton lines={2} />
    </div>
  );
}

/** /dashboard/vyziva — zoznam klientov (rovnaký tvar riadku ako Klienti, bez formulára). */
function VyzivaListSkeleton() {
  return (
    <div className={styles.skeletonWrap}>
      <Head />
      <ListRows count={4} />
    </div>
  );
}

/** /dashboard/kalendar — formulár nového termínu + karty zoskupené podľa dňa. */
function KalendarSkeleton() {
  return (
    <div className={styles.skeletonWrap}>
      <Head />
      <div style={{ marginBottom: 20 }}>
        <CardSkeleton lines={3} />
      </div>
      <div className={styles.cardStack}>
        <CardSkeleton lines={2} />
        <CardSkeleton lines={2} />
      </div>
    </div>
  );
}

/** /dashboard/sablony — 2 karty (tréningové/jedálničkové šablóny), filtre + riadky. */
function SablonySkeleton() {
  return (
    <div className={styles.skeletonWrap}>
      <Head />
      <div className={styles.cardStack}>
        <div className={styles.skeletonCardBlock}>
          <B className={styles.skeletonCardTitle} />
          <div className={styles.skeletonPillRow}>
            <B className={styles.skeletonPill} />
            <B className={styles.skeletonPill} />
            <B className={styles.skeletonPill} />
          </div>
          <ListRows count={2} />
        </div>
        <CardSkeleton lines={2} />
      </div>
    </div>
  );
}

/** /dashboard/nastavenia — mriežka menších kariet (profil, notifikácie, AI náklady, fakturácia, návod). */
function NastaveniaSkeleton() {
  return (
    <div className={styles.skeletonWrap}>
      <Head />
      <div className={styles.settingsGrid}>
        {[0, 1, 2, 3, 4].map((i) => (
          <CardSkeleton key={i} lines={2} />
        ))}
      </div>
    </div>
  );
}

/** /dashboard/klienti/[id] — späť + hlavička + bočné sub-menu (190px) + karty. */
function KlientDetailSkeleton() {
  return (
    <div className={styles.skeletonWrap}>
      <B className={styles.skeletonBackLink} />
      <div className={styles.skeletonDetailHead}>
        <B className={styles.skeletonDetailTitle} />
        <B className={styles.skeletonLineShort} />
      </div>
      <div className={styles.clientDetailLayout}>
        <div className={styles.skeletonSubNav}>
          {[0, 1, 2].map((i) => (
            <B key={i} className={styles.skeletonSubNavItem} />
          ))}
        </div>
        <div className={styles.cardStack}>
          <CardSkeleton lines={3} />
          <ListRows count={3} />
        </div>
      </div>
    </div>
  );
}

/** /dashboard/treningy/[planId] — späť + hlavička + builder (260px knižnica / plátno). */
function PlanBuilderSkeleton() {
  return (
    <div className={styles.skeletonWrap}>
      <B className={styles.skeletonBackLink} />
      <div className={styles.skeletonDetailHead}>
        <B className={styles.skeletonDetailTitle} />
        <B className={styles.skeletonLineShort} />
      </div>
      <div className={builderStyles.builderGrid}>
        <div className={styles.skeletonCardBlock}>
          {[0, 1, 2, 3, 4].map((i) => (
            <B key={i} className={styles.skeletonLine} />
          ))}
        </div>
        <div className={styles.skeletonCardBlock}>
          <B className={styles.skeletonCardTitle} />
          <B className={styles.skeletonLine} />
          <B className={styles.skeletonCardTitle} />
          <B className={styles.skeletonLine} />
        </div>
      </div>
    </div>
  );
}

/** /dashboard/vyziva/[clientId] a /dashboard/vyziva/jedalnicek/[planId] — späť + hlavička + karta so zoznamom. */
function VyzivaDetailSkeleton() {
  return (
    <div className={styles.skeletonWrap}>
      <B className={styles.skeletonBackLink} />
      <div className={styles.skeletonDetailHead}>
        <B className={styles.skeletonDetailTitle} />
        <B className={styles.skeletonLineShort} />
      </div>
      <div style={{ marginTop: 20 }}>
        <div className={styles.skeletonCardBlock}>
          <B className={styles.skeletonCardTitle} />
          <ListRows count={3} />
        </div>
      </div>
    </div>
  );
}

/** /dashboard/analytika — riadok 4 štatistík + 2 panely + zoznam klientov. */
function AnalytikaSkeleton() {
  return (
    <div className={styles.skeletonWrap}>
      <Head />
      <div className={styles.portfolioHealth}>
        {[0, 1, 2, 3].map((i) => (
          <B key={i} className={styles.skeletonStat} />
        ))}
      </div>
      <div className={styles.cardStack} style={{ marginBottom: 20 }}>
        <CardSkeleton lines={3} />
        <CardSkeleton lines={3} />
      </div>
      <ListRows count={3} />
    </div>
  );
}

export function DashboardRouteSkeleton({ href }: { href: string | null }) {
  const path = href ?? "";

  // Detail pod sekciou (má UUID/ID navyše za prefixom) sa rozlíši od zoznamu
  // podľa presnej zhody s NAV_ITEMS href — rovnaký princíp ako `match()` v
  // DashboardNav.tsx, len navyše rozlišuje zoznam od detailu v tej istej sekcii.
  if (path.startsWith("/dashboard/treningy")) {
    return path === "/dashboard/treningy" ? <TreningySkeleton /> : <PlanBuilderSkeleton />;
  }
  if (path.startsWith("/dashboard/vyziva/jedalnicek")) return <VyzivaDetailSkeleton />;
  if (path.startsWith("/dashboard/vyziva")) {
    return path === "/dashboard/vyziva" ? <VyzivaListSkeleton /> : <VyzivaDetailSkeleton />;
  }
  if (path.startsWith("/dashboard/kalendar")) return <KalendarSkeleton />;
  if (path.startsWith("/dashboard/sablony")) return <SablonySkeleton />;
  // Správy — inbox skeleton (zoznam vlákien + prázdne vlákno) tu vyzeral rušivo
  // (napr. keď je otvorené konkrétne vlákno, karta vpravo by bola len prázdny
  // shimmer box) — bez overlay tu radšej žiadny, nech skočí rovno na obsah.
  if (path.startsWith("/dashboard/spravy")) return null;
  if (path.startsWith("/dashboard/nastavenia")) return <NastaveniaSkeleton />;
  if (path.startsWith("/dashboard/analytika")) return <AnalytikaSkeleton />;
  if (path.startsWith("/dashboard/klienti")) return <KlientDetailSkeleton />;
  return <KlientiSkeleton />; // /dashboard a neznáme cesty
}
