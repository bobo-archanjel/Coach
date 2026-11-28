import { getTranslations } from "next-intl/server";
import { SECTION_ANCHOR, type SectionSpec } from "@/lib/publicPage/templates";
import type { PublicPageData } from "@/lib/publicPage/types";
import styles from "../site.module.css";
import { Section, initial } from "./shared";

/* Referencie. Varianty (CSS): cards (klasik), bars (šport), quotes (minimal, veľké citáty), soft (wellness).
   Poznámka „Referencie zadal tréner.“ ostáva vždy — referencie píše tréner, nie klienti. */
export async function Testimonials({ page, spec, band }: { page: PublicPageData; spec: SectionSpec; band: "base" | "alt" }) {
  if (page.testimonials.length === 0) return null;
  const t = await getTranslations("publicPage");
  return (
    <Section id={SECTION_ANCHOR.testimonials} kind="testimonials" variant={spec.variant} band={band} title={t("sections.testimonials")} eyebrow={t("eyebrow.testimonials")}>
      <ul className={styles.tstList} data-count={page.testimonials.length}>
        {page.testimonials.map((r, i) => (
          <li key={`${i}-${r.author}`}>
            <figure className={styles.tst}>
              <blockquote className={styles.quote}>{r.body}</blockquote>
              <figcaption className={styles.author}>
                <span className={styles.avatar} aria-hidden="true">
                  {initial(r.author)}
                </span>
                {r.author}
              </figcaption>
            </figure>
          </li>
        ))}
      </ul>
      <p className={styles.note}>{t("sections.testimonialsNote")}</p>
    </Section>
  );
}
