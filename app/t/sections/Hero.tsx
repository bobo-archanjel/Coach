import { getTranslations } from "next-intl/server";
import { SECTION_ANCHOR, type SectionSpec } from "@/lib/publicPage/templates";
import type { PublicPageData } from "@/lib/publicPage/types";
import styles from "../site.module.css";
import { ArrowIcon, GlobeIcon, PinIcon } from "./shared";

/* Hrdina webu: meno (h1), nadpis, miesto / online, hlavné tlačidlo na #kontakt a druhý odkaz na služby (alebo „O mne“).
   Jedno značkovanie pre všetky šablóny — vzhľad podľa variantu rieši CSS: split (klasik, text vľavo + fotka vpravo),
   cover (šport, fotka na celú šírku s tmavým prelivom), editorial (minimal, veľký serif + vysoká fotka),
   arch (wellness, oblúková fotka). Bez fotky sa hrdina zjednoduší na text na farebnom podklade. */
export async function Hero({ page, spec, hasServices, hasAbout }: { page: PublicPageData; spec: SectionSpec; hasServices: boolean; hasAbout: boolean }) {
  const t = await getTranslations("publicPage");
  // „štatistické“ štítky (šport): prvé špecializácie vedľa miesta a online
  const tags = spec.variant === "cover" ? page.specializations.slice(0, 3) : [];
  const secondary = hasServices
    ? { href: `#${SECTION_ANCHOR.services}`, label: t("hero.secondaryServices") }
    : hasAbout
      ? { href: `#${SECTION_ANCHOR.about}`, label: t("hero.secondaryAbout") }
      : null;

  const cover = spec.variant === "cover";
  const media = (
    <div className={styles.heroMedia}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={page.photoUrl ?? ""} alt={page.displayName} width={800} height={1000} fetchPriority="high" />
    </div>
  );

  return (
    <section id="top" className={styles.hero} aria-labelledby="hero-title" data-kind="hero" data-variant={spec.variant} data-band="base" data-photo={page.photoUrl ? "yes" : "no"}>
      {page.photoUrl && cover && media}
      <div className={`${styles.container} ${styles.heroInner}`}>
        <div className={styles.heroText}>
          <h1 id="hero-title" className={styles.h1}>
            {page.displayName}
          </h1>
          {page.headline && <p className={styles.headline}>{page.headline}</p>}
          {(page.location || page.online || tags.length > 0) && (
            <ul className={styles.meta}>
              {page.location && (
                <li>
                  <PinIcon />
                  <span className={styles.srOnly}>{t("hero.locationLabel")}: </span>
                  {page.location}
                </li>
              )}
              {page.online && (
                <li>
                  <GlobeIcon />
                  {t("hero.online")}
                </li>
              )}
              {tags.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          )}
          <div className={styles.actions}>
            <a href={`#${SECTION_ANCHOR.contact}`} className={`${styles.btn} ${styles.btnPrimary}`}>
              {t("hero.cta")}
              <ArrowIcon />
            </a>
            {secondary && (
              <a href={secondary.href} className={`${styles.btn} ${styles.btnGhost}`}>
                {secondary.label}
              </a>
            )}
          </div>
        </div>
        {page.photoUrl && !cover && media}
      </div>
    </section>
  );
}
