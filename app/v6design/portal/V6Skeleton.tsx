import s from "./styles/portal.module.css";

/* Načítavanie /v6design/portal/* (loading.tsx) — zobrazí sa hneď pri prechode na
   záložku, kým server dotiahne dáta (rovnaký účel ako app/portal/PortalSkeleton). */
export function V6Skeleton() {
  return (
    <div className={s.skeletonWrap} aria-hidden="true">
      <div className={`${s.skeletonBlock} ${s.skeletonHead}`} />
      <div className={`${s.skeletonBlock} ${s.skeletonHero}`} />
      <div className={`${s.skeletonBlock} ${s.skeletonPanelSmall}`} />
      <div className={`${s.skeletonBlock} ${s.skeletonPanelSmall}`} />
    </div>
  );
}
