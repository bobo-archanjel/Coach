import { getTranslations } from "next-intl/server";
import type { PublicPageData } from "@/lib/publicPage/types";
import type { SectionSpec } from "@/lib/publicPage/templates";
import styles from "../publicPage.module.css";
import tpl from "../templates.module.css";
import { Shell } from "./shared";

/* Referencie. Varianty: grid (klasik), scroll (vodorovný rad so snapom — šport), stacked (veľké citáty pod sebou — minimal),
   soft (karty na jemnom podklade — wellness). Poznámka „referencie zadal tréner“ ostáva vždy. */
export async function Testimonials({ page, spec }: { page: PublicPageData; spec: SectionSpec }) {
  if (page.testimonials.length === 0) return null;
  const t = await getTranslations("publicPage");
  const v = spec.variant;
  const listCls = v === "scroll" ? tpl.tstScroll : v === "stacked" ? tpl.tstStacked : v === "soft" ? tpl.tstSoft : styles.testimonials;
  return (
    <Shell id="testimonials" title={t("sections.testimonials")} surface={spec.surface} align={v === "soft" ? "center" : undefined}>
      <ul className={listCls} tabIndex={v === "scroll" ? 0 : undefined} aria-label={v === "scroll" ? t("sections.testimonials") : undefined}>
        {page.testimonials.map((r, i) => (
          <li key={`${i}-${r.author}`} className={v === "scroll" ? tpl.tstScrollItem : v === "soft" ? tpl.tstSoftItem : undefined}>
            <figure className={v === "stacked" ? tpl.tstBig : v === "grid" ? styles.testimonial : tpl.tstFigure}>
              <blockquote className={v === "stacked" ? tpl.tstBigQuote : styles.quote}>{r.body}</blockquote>
              <figcaption className={v === "stacked" ? tpl.tstBigAuthor : styles.author}>{r.author}</figcaption>
            </figure>
          </li>
        ))}
      </ul>
      <p className={styles.honest}>{t("sections.testimonialsNote")}</p>
    </Shell>
  );
}
