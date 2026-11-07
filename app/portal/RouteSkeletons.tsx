import styles from "./portal.module.css";
import { PortalSkeleton } from "./PortalSkeleton";

/**
 * Skeleton TVAROM podľa cieľovej záložky — loading.tsx aj NavSkeletonOverlay pri
 * navigácii (PortalSkeletonOverlay). Kontajnery znovupoužívajú skutočné triedy
 * portálu (.trHead, .trPlanList, .profileStack), len obsah je shimmer blok.
 * Rovnaký princíp ako app/dashboard/RouteSkeletons.tsx.
 */

function B({ className }: { className: string }) {
  return <div className={`${styles.skeletonBlock} ${className}`} />;
}

function PanelSkeleton({ lines = 2 }: { lines?: number }) {
  return (
    <div className={styles.skeletonPanelBlock}>
      <B className={styles.skeletonPanelLabel} />
      {Array.from({ length: lines }).map((_, i) => (
        <B key={i} className={i % 2 === 1 ? styles.skeletonLineShort : styles.skeletonLine} />
      ))}
    </div>
  );
}

function ListRows({ count = 3 }: { count?: number }) {
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

/** /portal — Dnes. */
function DnesSkeleton() {
  return <PortalSkeleton />;
}

/** /portal/trening — hlavička s tlačidlom + zoznam plánov (rovnaký tvar ako .trPlan). */
function TreningSkeleton() {
  return (
    <div className={styles.skeletonWrap}>
      <div className={styles.trHead} style={{ marginBottom: 14 }}>
        <B className={styles.skeletonPanelLabel} />
        <B className={styles.skeletonChip} />
      </div>
      <div className={styles.trPlanList}>
        {[0, 1].map((i) => (
          <div key={i} className={styles.skeletonListRow}>
            <div className={styles.skeletonListText}>
              <B className={styles.skeletonLine} />
              <B className={styles.skeletonLineShort} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** /portal/strava — makro cieľ (prstenec + chipy) + jedálniček (panely s riadkami jedál). */
function StravaSkeleton() {
  return (
    <div className={styles.skeletonWrap} style={{ gap: 14 }}>
      <div className={styles.skeletonTodayBlock} style={{ marginBottom: 0 }}>
        <div className={styles.skeletonTodayTop}>
          <B className={styles.skeletonRing} />
          <div className={styles.skeletonTodayText}>
            <B className={styles.skeletonLine} />
            <B className={styles.skeletonLineShort} />
          </div>
        </div>
      </div>
      <PanelSkeleton lines={2} />
      <PanelSkeleton lines={3} />
    </div>
  );
}

/** /portal/dennik — hrdina (kcal číslo) + makro pruhy + zoznam zjedených položiek. */
function DennikSkeleton() {
  return (
    <div className={styles.skeletonWrap} style={{ gap: 14 }}>
      <div className={styles.skeletonTodayBlock} style={{ marginBottom: 0 }}>
        <B className={styles.skeletonPanelLabel} />
        <B className={styles.skeletonBigNumber} />
      </div>
      <ListRows count={4} />
    </div>
  );
}

/** /portal/chat a /portal/ai-kouc — striedavé bubliny (ChatThread) + composer pruh dole. */
function ChatSkeleton() {
  return (
    <div className={styles.skeletonWrap} style={{ flex: 1, justifyContent: "flex-end" }}>
      <div className={`${styles.skeletonBubbleRow} ${styles.skeletonBubbleRowTheirs}`}>
        <B className={styles.skeletonBubble} />
      </div>
      <div className={`${styles.skeletonBubbleRow} ${styles.skeletonBubbleRowMine}`}>
        <B className={styles.skeletonBubble} />
      </div>
      <div className={`${styles.skeletonBubbleRow} ${styles.skeletonBubbleRowTheirs}`}>
        <B className={styles.skeletonBubble} />
      </div>
      <B className={styles.skeletonComposer} />
    </div>
  );
}

/** /portal/profil — hlavička + zvislý stĺpec panelov (rovnaký tvar ako .profileStack). */
function ProfilSkeleton() {
  return (
    <div className={styles.skeletonWrap}>
      <B className={styles.skeletonBackLink} />
      <div className={styles.profileStack}>
        <PanelSkeleton lines={2} />
        <PanelSkeleton lines={2} />
      </div>
    </div>
  );
}

export function PortalRouteSkeleton({ href }: { href: string | null }) {
  const path = href ?? "";

  if (path.startsWith("/portal/trening")) return <TreningSkeleton />;
  if (path.startsWith("/portal/strava")) return <StravaSkeleton />;
  if (path.startsWith("/portal/dennik")) return <DennikSkeleton />;
  if (path.startsWith("/portal/chat") || path.startsWith("/portal/ai-kouc")) return <ChatSkeleton />;
  if (path.startsWith("/portal/profil")) return <ProfilSkeleton />;
  return <DnesSkeleton />; // /portal a neznáme cesty
}
