import { getTranslations } from "next-intl/server";
import type { PublicPageData } from "@/lib/publicPage/types";
import type { SectionSpec } from "@/lib/publicPage/templates";
import styles from "../publicPage.module.css";
import tpl from "../templates.module.css";
import { Shell } from "./shared";

/* Služby a ceny. Varianty: rows (riadky s cenou vpravo — klasik), numbered (číslované karty — šport),
   list (riadky bez povrchu — minimal), soft (mäkké karty s cenou v štítku — wellness). */
export async function Services({ page, spec }: { page: PublicPageData; spec: SectionSpec }) {
  if (page.services.length === 0) return null;
  const t = await getTranslations("publicPage");
  const v = spec.variant;

  if (v === "numbered" || v === "soft") {
    return (
      <Shell id="services" title={t("sections.services")} surface={spec.surface} align={v === "soft" ? "center" : undefined}>
        <ul className={v === "numbered" ? tpl.svcCards : tpl.svcSoft}>
          {page.services.map((s, i) => (
            <li key={`${i}-${s.name}`} className={v === "numbered" ? tpl.svcCard : tpl.svcSoftCard}>
              {v === "numbered" && (
                <span className={tpl.svcNum} aria-hidden="true">
                  {String(i + 1).padStart(2, "0")}
                </span>
              )}
              <h3 className={tpl.svcName}>{s.name}</h3>
              {s.priceText && <p className={v === "numbered" ? tpl.svcPrice : tpl.svcPill}>{s.priceText}</p>}
              {s.description && <p className={tpl.svcDesc}>{s.description}</p>}
            </li>
          ))}
        </ul>
      </Shell>
    );
  }

  if (v === "list") {
    return (
      <Shell id="services" title={t("sections.services")} surface={spec.surface}>
        <ul className={tpl.svcList}>
          {page.services.map((s, i) => (
            <li key={`${i}-${s.name}`} className={tpl.listRow}>
              <h3 className={tpl.listName}>{s.name}</h3>
              {s.priceText && <p className={tpl.listPrice}>{s.priceText}</p>}
              {s.description && <p className={tpl.listDesc}>{s.description}</p>}
            </li>
          ))}
        </ul>
      </Shell>
    );
  }

  return (
    <Shell id="services" title={t("sections.services")} surface={spec.surface}>
      <ul className={styles.services}>
        {page.services.map((s, i) => (
          <li key={`${i}-${s.name}`} className={styles.service}>
            <h3 className={styles.serviceName}>{s.name}</h3>
            {s.priceText && <p className={styles.servicePrice}>{s.priceText}</p>}
            {s.description && <p className={styles.serviceDesc}>{s.description}</p>}
          </li>
        ))}
      </ul>
    </Shell>
  );
}
