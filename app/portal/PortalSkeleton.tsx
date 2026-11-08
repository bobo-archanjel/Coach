import s from "./portal.module.css";

/**
 * Načítavanie Dnes (/portal) — loading.tsx aj NavSkeletonOverlay pri navigácii
 * (RouteSkeletons.tsx). Tvarom ako skutočná stránka: pozdrav, karta ďalšieho
 * tréningu (text vľavo, prstenec vpravo, akcia dole) a riadky pod ňou.
 * Každý tvarový prvok nesie `s.skeletonBlock` (plocha + lesk) spolu s veľkostnou triedou.
 */
export function PortalSkeleton() {
  return (
    <div className={s.skeletonWrap} aria-hidden="true">
      <div className={`${s.skeletonBlock} ${s.skeletonHead}`} />

      <div className={s.skeletonTodayBlock}>
        <div className={s.skeletonTodayTop}>
          <div className={s.skeletonTodayText}>
            <div className={`${s.skeletonBlock} ${s.skeletonLineShort}`} />
            <div className={`${s.skeletonBlock} ${s.skeletonLine}`} />
            <div className={`${s.skeletonBlock} ${s.skeletonLineShort}`} />
          </div>
          <div className={`${s.skeletonBlock} ${s.skeletonRing}`} />
        </div>
        <div className={`${s.skeletonBlock} ${s.skeletonCta}`} />
      </div>

      <div className={s.skeletonListBlock}>
        {[0, 1, 2].map((i) => (
          <div key={i} className={s.skeletonListRow}>
            <div className={s.skeletonListText}>
              <div className={`${s.skeletonBlock} ${s.skeletonLine}`} />
              <div className={`${s.skeletonBlock} ${s.skeletonLineShort}`} />
            </div>
            <div className={`${s.skeletonBlock} ${s.skeletonChip}`} />
          </div>
        ))}
      </div>
    </div>
  );
}
