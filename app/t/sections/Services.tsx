import { getTranslations } from "next-intl/server";
import { SECTION_ANCHOR, type SectionSpec } from "@/lib/publicPage/templates";
import type { PublicPageData } from "@/lib/publicPage/types";
import styles from "../site.module.css";
import { ArrowIcon, Section } from "./shared";

/* Služby a ceny. Jedno značkovanie, vzhľad podľa variantu: cards (klasik, cenníkové karty), numbered (šport, číslované),
   list (minimal, elegantný cenník), soft (wellness, mäkké karty). Cena je text od trénera (nič sa nepočíta). */
export async function Services({ page, spec, band }: { page: PublicPageData; spec: SectionSpec; band: "base" | "alt" }) {
  if (page.services.length === 0) return null;
  const t = await getTranslations("publicPage");
  return (
    <Section id={SECTION_ANCHOR.services} kind="services" variant={spec.variant} band={band} title={t("sections.services")} eyebrow={t("eyebrow.services")}>
      <ul className={styles.svcList} data-count={page.services.length}>
        {page.services.map((s, i) => (
          <li key={`${i}-${s.name}`} className={styles.svc}>
            <span className={styles.svcNum} aria-hidden="true">
              {String(i + 1).padStart(2, "0")}
            </span>
            <h3 className={styles.svcName}>{s.name}</h3>
            {s.priceText && <p className={styles.svcPrice}>{s.priceText}</p>}
            {s.description && <p className={styles.svcDesc}>{s.description}</p>}
            <a href={`#${SECTION_ANCHOR.contact}`} className={styles.svcLink}>
              {t("serviceCta")}
              <ArrowIcon />
            </a>
          </li>
        ))}
      </ul>
    </Section>
  );
}
