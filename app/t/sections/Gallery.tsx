import { getTranslations } from "next-intl/server";
import type { PublicPageData } from "@/lib/publicPage/types";
import type { SectionSpec } from "@/lib/publicPage/templates";
import styles from "../publicPage.module.css";
import tpl from "../templates.module.css";
import { Shell } from "./shared";

/* Galéria. Varianty: grid (klasik), strip (vodorovný pás so snapom — šport), grid3 (3 stĺpce — minimal),
   mosaic (mozaika s veľkou prvou fotkou — wellness). Pás sa posúva len sám v sebe, stránka nepretečie. */
export async function Gallery({ page, spec }: { page: PublicPageData; spec: SectionSpec }) {
  const n = page.galleryUrls.length;
  if (n === 0) return null;
  const t = await getTranslations("publicPage");
  const v = spec.variant;
  const listCls = v === "strip" ? tpl.galStrip : v === "grid3" ? tpl.galGrid3 : v === "mosaic" ? tpl.galMosaic : styles.gallery;
  const itemCls = v === "strip" ? tpl.galStripItem : v === "grid3" ? tpl.galGrid3Item : v === "mosaic" ? tpl.galMosaicItem : styles.galleryItem;
  return (
    <Shell id="gallery" title={t("sections.gallery")} surface={spec.surface} align={v === "mosaic" ? "center" : undefined}>
      <ul className={listCls} data-count={Math.min(n, 6)} tabIndex={v === "strip" ? 0 : undefined} aria-label={v === "strip" ? t("sections.gallery") : undefined}>
        {page.galleryUrls.map((url, i) => (
          <li key={url} className={itemCls}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={t("galleryAlt", { n: i + 1, name: page.displayName })} width={700} height={700} loading="lazy" decoding="async" />
          </li>
        ))}
      </ul>
    </Shell>
  );
}
