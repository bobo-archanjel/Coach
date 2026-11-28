import { getTranslations } from "next-intl/server";
import type { PublicPageData } from "@/lib/publicPage/types";
import type { SectionSpec } from "@/lib/publicPage/templates";
import styles from "../publicPage.module.css";
import tpl from "../templates.module.css";
import { Shell } from "./shared";

/* „O mne“ + špecializácie. Varianty: left (predvolený), centered. Bez bio aj štítkov sa nevykreslí. */
export async function About({ page, spec }: { page: PublicPageData; spec: SectionSpec }) {
  if (!page.bio && page.specializations.length === 0) return null;
  const t = await getTranslations("publicPage");
  const centered = spec.variant === "centered";
  return (
    <Shell id="about" title={page.bio ? t("sections.about") : t("sections.specializations")} surface={spec.surface} align={centered ? "center" : undefined} className={centered ? tpl.aboutCentered : ""}>
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
    </Shell>
  );
}
