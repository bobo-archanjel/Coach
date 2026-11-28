import { getTranslations } from "next-intl/server";
import { SECTION_ANCHOR, type SectionSpec } from "@/lib/publicPage/templates";
import type { PublicPageData } from "@/lib/publicPage/types";
import styles from "../site.module.css";
import { Section, SectionHead } from "./shared";

/* „O mne“ + špecializácie (štítky / zoznam s fajkami podľa šablóny). Bez bio aj špecializácií sa nevykreslí.
   Varianty: split (nadpis vľavo, text vpravo), editorial (minimal), centered (wellness). */
export async function About({ page, spec, band }: { page: PublicPageData; spec: SectionSpec; band: "base" | "alt" }) {
  if (!page.bio && page.specializations.length === 0) return null;
  const t = await getTranslations("publicPage");
  return (
    <Section id={SECTION_ANCHOR.about} kind="about" variant={spec.variant} band={band}>
      <div className={styles.aboutGrid}>
        <SectionHead kind="about" title={page.bio ? t("sections.about") : t("sections.specializations")} eyebrow={t("eyebrow.about")} />
        <div className={styles.aboutBody}>
          {page.bio && <p className={styles.bio}>{page.bio}</p>}
          {page.specializations.length > 0 && (
            <>
              {page.bio && <h3 className={styles.miniTitle}>{t("sections.specializations")}</h3>}
              <ul className={styles.tags} aria-label={t("sections.specializations")}>
                {page.specializations.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </Section>
  );
}
