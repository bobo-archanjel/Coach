import { getTranslations } from "next-intl/server";
import { siteUrl } from "@/lib/site";
import type { PublicPageData } from "@/lib/publicPage/types";
import type { SectionSpec } from "@/lib/publicPage/templates";
import { LeadForm } from "../LeadForm";
import styles from "../publicPage.module.css";
import { Shell } from "./shared";

/* Kontakt: kotva #kontakt + formulár záujemcu (v náhľade vypnutý). */
export async function Contact({ page, spec, preview }: { page: PublicPageData; spec: SectionSpec; preview: boolean }) {
  const t = await getTranslations("publicPage");
  return (
    <Shell id="contact" domId="kontakt" className={styles.contact} title={t("sections.contact")} surface={spec.surface}>
      <LeadForm handle={page.handle} disabled={preview} privacyHref={`${siteUrl()}/ochrana-sukromia`} />
    </Shell>
  );
}
