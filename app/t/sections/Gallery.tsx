import { getTranslations } from "next-intl/server";
import { SECTION_ANCHOR, type SectionSpec } from "@/lib/publicPage/templates";
import type { PublicPageData } from "@/lib/publicPage/types";
import styles from "../site.module.css";
import { Section } from "./shared";

/* Galéria. Varianty (CSS): grid (klasik, minimal), tall (šport, vysoké dlaždice), mosaic (wellness, mozaika).
   Obrázky sú object-fit: cover a načítavajú sa lenivo. */
export async function Gallery({ page, spec, band }: { page: PublicPageData; spec: SectionSpec; band: "base" | "alt" }) {
  if (page.galleryUrls.length === 0) return null;
  const t = await getTranslations("publicPage");
  return (
    <Section id={SECTION_ANCHOR.gallery} kind="gallery" variant={spec.variant} band={band} title={t("sections.gallery")} eyebrow={t("eyebrow.gallery")}>
      <ul className={styles.gallery} data-count={Math.min(page.galleryUrls.length, 6)}>
        {page.galleryUrls.map((url, i) => (
          <li key={url}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={t("galleryAlt", { n: i + 1, name: page.displayName })} width={700} height={700} loading="lazy" decoding="async" />
          </li>
        ))}
      </ul>
    </Section>
  );
}
