import s from "./portal.module.css";

/* Načítavanie /portal/* (loading.tsx) — zobrazí sa hneď pri prechode na
   záložku, kým server dotiahne dáta. */
export function PortalSkeleton() {
  return (
    <div className={s.skeletonWrap} aria-hidden="true">
      <div className={`${s.skeletonBlock} ${s.skeletonHead}`} />
      <div className={`${s.skeletonBlock} ${s.skeletonHero}`} />
      <div className={`${s.skeletonBlock} ${s.skeletonPanelSmall}`} />
      <div className={`${s.skeletonBlock} ${s.skeletonPanelSmall}`} />
    </div>
  );
}
