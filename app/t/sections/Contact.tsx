import { getTranslations } from "next-intl/server";
import { siteUrl } from "@/lib/site";
import { EXTERNAL_REL, SOCIAL_KINDS } from "@/lib/publicPage/socials";
import { SECTION_ANCHOR, type SectionSpec } from "@/lib/publicPage/templates";
import type { PublicPageData } from "@/lib/publicPage/types";
import { LeadForm } from "../LeadForm";
import styles from "../site.module.css";
import { GlobeIcon, PinIcon, Section } from "./shared";

/* Kontakt: vľavo krátky text + miesto, online a siete, vpravo formulár záujemcu (v náhľade vypnutý).
   Kotva je #kontakt — vedie na ňu tlačidlo v lište, v hrdinovi aj pri službách. */
export async function Contact({ page, spec, band, preview }: { page: PublicPageData; spec: SectionSpec; band: "base" | "alt"; preview: boolean }) {
  const t = await getTranslations("publicPage");
  const socials = SOCIAL_KINDS.filter((k) => page.socials[k]);
  const hasInfo = !!page.location || page.online;
  return (
    <Section id={SECTION_ANCHOR.contact} kind="contact" variant={spec.variant} band={band}>
      <div className={styles.contactGrid}>
        <div className={styles.contactInfo}>
          <div className={styles.head}>
            <p className={styles.eyebrow}>{t("eyebrow.contact")}</p>
            <h2 id="h-contact" className={styles.h2}>
              {t("sections.contact")}
            </h2>
          </div>
          <p className={styles.lead}>{t("contact.lead")}</p>
          {hasInfo && (
            <>
              <h3 className={styles.miniTitle}>{t("contact.where")}</h3>
              <ul className={styles.infoList}>
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
              </ul>
            </>
          )}
          {socials.length > 0 && (
            <>
              <h3 className={styles.miniTitle}>{t("contact.follow")}</h3>
              <ul className={styles.socials}>
                {socials.map((k) => (
                  <li key={k}>
                    <a href={page.socials[k]} target="_blank" rel={EXTERNAL_REL}>
                      {t(`social.${k}`)}
                    </a>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
        <div className={styles.formCard}>
          <LeadForm handle={page.handle} disabled={preview} privacyHref={`${siteUrl()}/ochrana-sukromia`} />
        </div>
      </div>
    </Section>
  );
}
