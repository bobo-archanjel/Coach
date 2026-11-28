import { getTranslations } from "next-intl/server";
import { LogoMark } from "@/app/components/LogoMark";
import { BrandLogo } from "@/app/components/BrandLogo";
import type { PublicPageData } from "@/lib/publicPage/types";
import type { SectionSpec } from "@/lib/publicPage/templates";
import styles from "../publicPage.module.css";
import tpl from "../templates.module.css";
import { GlobeIcon, PinIcon } from "./shared";

/* Hrdina stránky: meno (h1), nadpis, miesto, online a tlačidlo na #kontakt.
   Varianty: card (klasik), cover (fotka na celú šírku s tmavým prelivom — šport), text (textový, malá fotka — minimal),
   split (veľká zaoblená fotka vedľa textu — wellness). Bez fotky každý variant elegantne padne na text / farebný podklad. */
export async function Hero({ page, spec }: { page: PublicPageData; spec: SectionSpec }) {
  const t = await getTranslations("publicPage");
  const hasLogo = !!(page.logoUrl || page.logoDarkUrl);

  const meta =
    page.location || page.online ? (
      <ul className={tpl.meta}>
        {page.location && (
          <li className={tpl.chip}>
            <PinIcon />
            <span className={styles.srOnly}>{t("hero.locationLabel")}: </span>
            {page.location}
          </li>
        )}
        {page.online && (
          <li className={tpl.chip}>
            <GlobeIcon />
            {t("hero.online")}
          </li>
        )}
      </ul>
    ) : null;

  if (spec.variant === "cover") {
    return (
      <header className={`${tpl.cover} ${page.photoUrl ? "" : tpl.coverPlain}`}>
        {page.photoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={page.photoUrl} alt={page.displayName} width={800} height={800} className={tpl.coverImg} fetchPriority="high" />
        )}
        <div className={tpl.coverShade} aria-hidden="true" />
        <div className={tpl.coverBody}>
          {hasLogo && (
            <div className={tpl.coverLogo}>
              <BrandLogo src={page.logoUrl} darkSrc={page.logoDarkUrl} />
            </div>
          )}
          <h1 className={tpl.coverName}>{page.displayName}</h1>
          {page.headline && <p className={tpl.coverHeadline}>{page.headline}</p>}
          {meta}
          <a href="#kontakt" className={tpl.cta}>
            {t("hero.cta")}
          </a>
        </div>
      </header>
    );
  }

  if (spec.variant === "split") {
    return (
      <header className={`${tpl.split} ${page.photoUrl ? "" : tpl.splitNoPhoto}`}>
        {page.photoUrl && (
          <div className={tpl.splitMedia}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={page.photoUrl} alt={page.displayName} width={800} height={800} className={tpl.splitPhoto} fetchPriority="high" />
          </div>
        )}
        <div className={tpl.splitText}>
          {hasLogo && (
            <div className={tpl.splitLogo}>
              <BrandLogo src={page.logoUrl} darkSrc={page.logoDarkUrl} />
            </div>
          )}
          {!hasLogo && !page.photoUrl && <LogoMark className={tpl.splitLogoMark} />}
          <h1 className={tpl.splitName}>{page.displayName}</h1>
          {page.headline && <p className={tpl.splitHeadline}>{page.headline}</p>}
          {meta}
          <a href="#kontakt" className={tpl.cta}>
            {t("hero.cta")}
          </a>
        </div>
      </header>
    );
  }

  if (spec.variant === "text") {
    return (
      <header className={tpl.plain}>
        <div className={tpl.plainTop}>
          {page.photoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={page.photoUrl} alt={page.displayName} width={160} height={160} className={tpl.plainPhoto} />
          )}
          {hasLogo ? (
            <div className={tpl.plainLogo}>
              <BrandLogo src={page.logoUrl} darkSrc={page.logoDarkUrl} />
            </div>
          ) : (
            !page.photoUrl && <LogoMark className={tpl.plainLogoMark} />
          )}
        </div>
        <h1 className={tpl.plainName}>{page.displayName}</h1>
        {page.headline && <p className={tpl.plainHeadline}>{page.headline}</p>}
        {meta}
        <a href="#kontakt" className={tpl.cta}>
          {t("hero.cta")}
        </a>
      </header>
    );
  }

  // card — dnešný vzhľad (klasik), bez zmeny značky aj tried
  return (
    <header className={`${styles.card} ${styles.hero}`}>
      <div className={styles.identity}>
        {page.photoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={page.photoUrl} alt={page.displayName} width={160} height={160} className={styles.photo} />
        )}
        {hasLogo ? <BrandLogo src={page.logoUrl} darkSrc={page.logoDarkUrl} /> : !page.photoUrl && <LogoMark className={styles.logo} />}
      </div>
      <div className={styles.heroText}>
        <h1 className={styles.name}>{page.displayName}</h1>
        {page.headline && <p className={styles.headline}>{page.headline}</p>}
        {(page.location || page.online) && (
          <ul className={styles.meta}>
            {page.location && (
              <li className={styles.chip}>
                <PinIcon />
                <span className={styles.srOnly}>{t("hero.locationLabel")}: </span>
                {page.location}
              </li>
            )}
            {page.online && (
              <li className={styles.chip}>
                <GlobeIcon />
                {t("hero.online")}
              </li>
            )}
          </ul>
        )}
        <a href="#kontakt" className={styles.cta}>
          {t("hero.cta")}
        </a>
      </div>
    </header>
  );
}
