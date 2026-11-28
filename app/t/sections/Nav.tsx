import { getTranslations } from "next-intl/server";
import { BrandLogo } from "@/app/components/BrandLogo";
import { SECTION_ANCHOR, type SectionSpec } from "@/lib/publicPage/templates";
import type { PublicPageData } from "@/lib/publicPage/types";
import styles from "../site.module.css";
import { NavMenu } from "./NavMenu";

/* Horná lišta webu: meno / logo vľavo, odkazy len na sekcie, ktoré existujú, a tlačidlo na #kontakt.
   Na úzkej obrazovke zostane meno + krátke tlačidlo a odkazy sú v rozbaľovacom menu (NavMenu). */
export async function Nav({ page, sections }: { page: PublicPageData; sections: SectionSpec[] }) {
  const t = await getTranslations("publicPage");
  const hasLogo = !!(page.logoUrl || page.logoDarkUrl);
  const links = sections.flatMap((s) => (s.kind === "hero" ? [] : [{ href: `#${SECTION_ANCHOR[s.kind]}`, label: t(`nav.${s.kind}`) }]));
  return (
    <header className={styles.nav}>
      <div className={`${styles.container} ${styles.navInner}`}>
        <a href="#top" className={styles.brand} data-logo={hasLogo ? "" : undefined}>
          {hasLogo && (
            <span className={styles.brandLogo}>
              <BrandLogo src={page.logoUrl} darkSrc={page.logoDarkUrl} />
            </span>
          )}
          <span className={styles.brandName}>{page.displayName}</span>
        </a>
        <nav aria-label={t("nav.label")} className={styles.navLinks}>
          <ul>
            {links.map((l) => (
              <li key={l.href}>
                <a href={l.href}>{l.label}</a>
              </li>
            ))}
          </ul>
        </nav>
        <div className={styles.navEnd}>
          <a href="#kontakt" className={`${styles.btn} ${styles.btnPrimary} ${styles.navCta}`}>
            <span className={styles.ctaLong}>{t("hero.cta")}</span>
            <span className={styles.ctaShort}>{t("nav.ctaShort")}</span>
          </a>
          <NavMenu links={links} label={t("nav.menu")} navLabel={t("nav.label")} />
        </div>
      </div>
    </header>
  );
}
