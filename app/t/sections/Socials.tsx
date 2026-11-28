import { getTranslations } from "next-intl/server";
import { EXTERNAL_REL, SOCIAL_KINDS } from "@/lib/publicPage/socials";
import type { PublicPageData } from "@/lib/publicPage/types";
import type { SectionSpec } from "@/lib/publicPage/templates";
import styles from "../publicPage.module.css";
import tpl from "../templates.module.css";

/* Odkazy na siete a web. Varianty: pills (štítky), links (podčiarknuté odkazy — minimal). */
export async function Socials({ page, spec }: { page: PublicPageData; spec: SectionSpec }) {
  const kinds = SOCIAL_KINDS.filter((k) => page.socials[k]);
  if (kinds.length === 0) return null;
  const t = await getTranslations("publicPage");
  const links = spec.variant === "links";
  return (
    <nav aria-label={t("sections.links")}>
      <ul className={`${styles.socials} ${links ? tpl.socialLinks : ""}`}>
        {kinds.map((k) => (
          <li key={k}>
            <a href={page.socials[k]} className={links ? tpl.socialLink : styles.social} target="_blank" rel={EXTERNAL_REL}>
              {t(`social.${k}`)}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
