import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { V6Frame } from "./components/LegalPage";
import styles from "./legal.module.css";

const ArrowIcon = () => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
    <path d="M3 7.5h9M8 3l4.5 4.5L8 12" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/**
 * Custom 404 (feature/security#2) v dizajne v6 — rovnaký rám ako právne stránky
 * (hlavička s logom, jazykom a témou), nie generická stránka mimo brandu.
 */
export default async function NotFound() {
  const t = await getTranslations("common");
  return (
    <V6Frame>
      <div className={styles.notFound}>
        <h1 className={styles.notFoundCode}>404</h1>
        <p>{t("notFound")}</p>
        <Link href="/" className="btn btn-primary">
          {t("backHome")}
          <ArrowIcon />
        </Link>
      </div>
    </V6Frame>
  );
}
