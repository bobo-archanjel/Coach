import { getTranslations } from "next-intl/server";
import { siteUrl } from "@/lib/site";
import styles from "../publicPage.module.css";

/* Päta „Stránka beží na FitPilot“ — v náhľade bez odkazu. */
export async function Powered({ preview }: { preview: boolean }) {
  const t = await getTranslations("publicPage");
  return (
    <p className={styles.powered}>
      {t("powered")}{" "}
      {preview ? (
        <span>{t("poweredLink")}</span>
      ) : (
        <a href={`${siteUrl()}/?utm_source=trainer-page&utm_medium=referral&utm_campaign=powered-by`} data-testid="powered-by-link">
          {t("poweredLink")}
        </a>
      )}
    </p>
  );
}
