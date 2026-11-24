import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { LogoMark } from "@/app/components/LogoMark";
import { BrandLogo } from "@/app/components/BrandLogo";
import brand from "@/app/components/branding.module.css";
import tokens from "@/app/v6design/styles/tokens.module.css";
import { brandStyle } from "@/lib/branding/theme";
import { EXTERNAL_REL, SOCIAL_KINDS } from "@/lib/publicPage/socials";
import type { PublicPageData } from "@/lib/publicPage/types";
import { LeadForm } from "./LeadForm";
import styles from "./publicPage.module.css";

/* Vykreslenie verejnej stránky trénera (Business). Zdieľa ho /t/<handle> aj náhľad v dashboarde.
   Všetky texty od trénera sú obyčajný text — React ich escapuje, zalomenia rieši CSS (pre-line);
   žiadne dangerouslySetInnerHTML ani markdown. Externé odkazy majú rel="nofollow noopener noreferrer".
   Téma podľa telefónu (data-theme="auto"), takže stránka nepotrebuje cookie → dá sa cachovať (ISR). */

function PinIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" />
      <circle cx="12" cy="10" r="2.4" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.6 2.7 3.9 5.7 3.9 9S14.6 18.3 12 21c-2.6-2.7-3.9-5.7-3.9-9S9.4 5.7 12 3Z" />
    </svg>
  );
}

export async function TrainerPublicPage({ page, preview = false, previewBanner }: { page: PublicPageData; preview?: boolean; previewBanner?: string }) {
  const t = await getTranslations("publicPage");
  const hasSocials = SOCIAL_KINDS.some((k) => page.socials[k]);
  const hasLogo = !!(page.logoUrl || page.logoDarkUrl);

  return (
    <div className={`${tokens.root} ${page.theme ? brand.branded : ""}`} style={brandStyle(page.theme)} data-theme="auto" data-v6-root="" data-testid="public-trainer-page">
      <main className={styles.page}>
        {previewBanner && (
          <p className={styles.previewBanner} role="note">
            {previewBanner}
          </p>
        )}

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

        {(page.bio || page.specializations.length > 0) && (
          <section className={`${styles.card} ${styles.section}`} aria-labelledby="sec-about">
            <h2 id="sec-about">{page.bio ? t("sections.about") : t("sections.specializations")}</h2>
            {page.bio && <p className={styles.bio}>{page.bio}</p>}
            {page.specializations.length > 0 && (
              <ul className={styles.tags} aria-label={t("sections.specializations")}>
                {page.specializations.map((s) => (
                  <li key={s} className={styles.tag}>
                    {s}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {page.services.length > 0 && (
          <section className={`${styles.card} ${styles.section}`} aria-labelledby="sec-services">
            <h2 id="sec-services">{t("sections.services")}</h2>
            <ul className={styles.services}>
              {page.services.map((s, i) => (
                <li key={`${i}-${s.name}`} className={styles.service}>
                  <h3 className={styles.serviceName}>{s.name}</h3>
                  {s.priceText && <p className={styles.servicePrice}>{s.priceText}</p>}
                  {s.description && <p className={styles.serviceDesc}>{s.description}</p>}
                </li>
              ))}
            </ul>
          </section>
        )}

        {page.galleryUrls.length > 0 && (
          <section className={`${styles.card} ${styles.section}`} aria-labelledby="sec-gallery">
            <h2 id="sec-gallery">{t("sections.gallery")}</h2>
            <ul className={styles.gallery}>
              {page.galleryUrls.map((url, i) => (
                <li key={url} className={styles.galleryItem}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={t("galleryAlt", { n: i + 1, name: page.displayName })} width={700} height={700} loading="lazy" decoding="async" />
                </li>
              ))}
            </ul>
          </section>
        )}

        {page.testimonials.length > 0 && (
          <section className={`${styles.card} ${styles.section}`} aria-labelledby="sec-testimonials">
            <h2 id="sec-testimonials">{t("sections.testimonials")}</h2>
            <ul className={styles.testimonials}>
              {page.testimonials.map((r, i) => (
                <li key={`${i}-${r.author}`}>
                  <figure className={styles.testimonial}>
                    <blockquote className={styles.quote}>{r.body}</blockquote>
                    <figcaption className={styles.author}>{r.author}</figcaption>
                  </figure>
                </li>
              ))}
            </ul>
            <p className={styles.honest}>{t("sections.testimonialsNote")}</p>
          </section>
        )}

        <section id="kontakt" className={`${styles.card} ${styles.section} ${styles.contact}`} aria-labelledby="sec-contact">
          <h2 id="sec-contact">{t("sections.contact")}</h2>
          <LeadForm handle={page.handle} disabled={preview} />
        </section>

        {hasSocials && (
          <nav aria-label={t("sections.links")}>
            <ul className={styles.socials}>
              {SOCIAL_KINDS.filter((k) => page.socials[k]).map((k) => (
                <li key={k}>
                  <a href={page.socials[k]} className={styles.social} target="_blank" rel={EXTERNAL_REL}>
                    {t(`social.${k}`)}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}

        <p className={styles.powered}>
          {t("powered")}{" "}
          {preview ? (
            <span>{t("poweredLink")}</span>
          ) : (
            <Link href="/?utm_source=trainer-page&utm_medium=referral&utm_campaign=powered-by" data-testid="powered-by-link">
              {t("poweredLink")}
            </Link>
          )}
        </p>
      </main>
    </div>
  );
}
