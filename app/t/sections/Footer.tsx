import { getTranslations } from "next-intl/server";
import { siteUrl } from "@/lib/site";
import { EXTERNAL_REL, SOCIAL_KINDS } from "@/lib/publicPage/socials";
import type { PublicPageData } from "@/lib/publicPage/types";
import styles from "../site.module.css";

/* Päta webu: meno, odkazy na siete, © a drobné „Stránka beží na FitPilot“ (v náhľade bez odkazu). */
export async function Footer({ page, preview }: { page: PublicPageData; preview: boolean }) {
  const t = await getTranslations("publicPage");
  const socials = SOCIAL_KINDS.filter((k) => page.socials[k]);
  return (
    <footer className={styles.footer}>
      <div className={styles.footerCard}>
        <div className={styles.footerTop}>
          <p className={styles.footerName}>{page.displayName}</p>
          {socials.length > 0 && (
            <nav aria-label={t("footer.links")}>
              <ul className={styles.footerLinks}>
                {socials.map((k) => (
                  <li key={k}>
                    <a href={page.socials[k]} target="_blank" rel={EXTERNAL_REL}>
                      {t(`social.${k}`)}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          )}
        </div>
        <div className={styles.footerBottom}>
          <p>{t("footer.copy", { year: new Date().getFullYear(), name: page.displayName })}</p>
          <p className={styles.powered}>
            {t("powered")}{" "}
            {preview ? (
              <span>{t("poweredLink")}</span>
            ) : (
              <a href={`${siteUrl()}/?utm_source=trainer-page&utm_medium=referral&utm_campaign=powered-by`} data-testid="powered-by-link">
                {t("poweredLink")}
              </a>
            )}
          </p>
        </div>
      </div>
    </footer>
  );
}
