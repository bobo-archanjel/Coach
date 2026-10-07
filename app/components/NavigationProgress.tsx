"use client";

// FitPilot — feature/navod: okamžitá spätná väzba pri kliku v menu. Next.js
// server-rendered `loading.tsx` sa nezobrazí skôr, než layout dokončí svoje
// BLOKUJÚCE dáta (auth guard + profil + počty) — pri viacerých sekvenčných
// Supabase dopytoch to znamená, že stará stránka ostane "zamrznutá" 1-2s pred
// akoukoľvek zmenou. `useLinkStatus()` (Next 15.1+) vie o prebiehajúcej
// navigácii OKAMŽITE, synchrónne pri kliku, nezávisle od servera — na tom
// staviame globálny skeleton overlay, ktorý prekryje starú stránku HNEĎ.

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useLinkStatus } from "next/link";
import styles from "./NavigationProgress.module.css";

const NavPendingContext = createContext<{
  setPending: (id: string, value: boolean) => void;
  pending: boolean;
  /** href odkazu, na ktorý sa práve naviguje — nech overlay vie zvoliť skeleton
   * TVAROM zodpovedajúci cieľovej stránke (feature/navod), nie univerzálny. */
  pendingHref: string | null;
} | null>(null);

export function NavigationProgressProvider({ children }: { children: ReactNode }) {
  // Množina id-čiek aktuálne "pending" liniek — Set namiesto jedného booleanu,
  // nech dvojklik alebo prekrývajúce sa navigácie nezostanú v zlom stave.
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(new Set());
  // href, ktorý ZAČAL aktuálnu navigáciu — zamknutý, kým sa `pendingIds`
  // celkom nevyprázdni. Predtým sa prepisoval na KAŽDÉ hlásenie pending=true,
  // takže keď cieľová stránka počas prebiehajúcej navigácie stihla vykresliť
  // (a mount-nuť) VLASTNÉ odkazy skôr, než sa pôvodná navigácia dokončila, ich
  // signál (aj keď hneď zase pending=false) prepísal `activeHref` na ICH href
  // — overlay potom na poslednú sekundu preskočil na ZLÝ skeleton tesne pred
  // dokončením. Zamknutie na PRVÝ odkaz, ktorý naštartoval prázdnu množinu,
  // to rieši bez ohľadu na to, koľko ďalších signálov medzitým prebehne.
  const [activeHref, setActiveHref] = useState<string | null>(null);

  function setPending(id: string, value: boolean) {
    setPendingIds((prev) => {
      const isPending = prev.has(id);
      if (isPending === value) return prev;
      const next = new Set(prev);
      if (value) next.add(id);
      else next.delete(id);
      if (value && prev.size === 0) setActiveHref(id);
      else if (next.size === 0) setActiveHref(null);
      return next;
    });
  }

  return (
    <NavPendingContext.Provider value={{ setPending, pending: pendingIds.size > 0, pendingHref: activeHref }}>
      {children}
    </NavPendingContext.Provider>
  );
}

/** Vlož ako dieťa `<Link>` (nie mimo neho — useLinkStatus číta kontext z Linku). */
export function NavLinkPendingSignal({ id }: { id: string }) {
  const { pending } = useLinkStatus();
  const ctx = useContext(NavPendingContext);

  useEffect(() => {
    ctx?.setPending(id, pending);
    // Odhlásiť pri unmounte (napr. položka zmizne z navu) — nech "visí" navždy.
    return () => ctx?.setPending(id, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, id]);

  return null;
}

/**
 * Prekryje `children` (obsah stránky) skeletonom OKAMŽITE po kliku na nav odkaz.
 * `position:absolute; inset:0` sa počíta k PADDING BOXU najbližšieho pozicionovaného
 * predka — teda k jeho vonkajšiemu okraju VRÁTANE paddingu, kým skutočný obsah
 * (normálny flow) je o ten istý padding posunutý dovnútra. Preto dve nezávislé
 * korekcie (nájdené v reálnom použití — bez nich bol skeleton širší/vyššie než
 * skutočné karty):
 *  - `outerClassName` — trieda NA CELÝ overlay div, keď má pozicionovaný predok
 *    VLASTNÝ padding (napr. `.content` má `padding-block`, ktoré `.wrap` sám
 *    nenesie) — inak by skeleton začínal pred týmto paddingom, nie po ňom.
 *  - `insetClassName` — trieda na VNÚTORNÝ wrapper skeletonu, SKUTOČNÁ trieda
 *    kontajnera obsahu (`.wrap`/`.main`), nie duplikát jej hodnôt — zarovná
 *    max-width/horizontálny padding/centrovanie.
 */
export function NavSkeletonOverlay({
  resolveSkeleton,
  insetClassName,
  outerClassName,
}: {
  /** Vyberie skeleton TVAROM podľa cieľového href — každá sekcia appky má iný
   * layout (zoznam vs. formulár vs. 2-stĺpcový chat), skeleton musí sedieť s tým,
   * čo sa naozaj načíta, nie byť jeden univerzálny tvar naprieč celou appkou.
   * `null`/`undefined` = pre túto cieľovú stránku sa overlay nemá zobraziť vôbec
   * (napr. Správy — inbox skeleton tam vyzeral rušivo, radšej žiadny). */
  resolveSkeleton: (href: string | null) => ReactNode;
  insetClassName?: string;
  outerClassName?: string;
}) {
  const ctx = useContext(NavPendingContext);
  if (!ctx?.pending) return null;
  const skeleton = resolveSkeleton(ctx.pendingHref);
  if (!skeleton) return null;
  return (
    <div className={`${styles.overlay} ${outerClassName ?? ""}`} aria-hidden="true">
      <div className={insetClassName}>{skeleton}</div>
    </div>
  );
}
