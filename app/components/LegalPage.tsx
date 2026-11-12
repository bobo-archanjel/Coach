import Link from "next/link";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LogoMark } from "./LogoMark";
import styles from "@/app/legal.module.css";

/* Spoločný rám právnych stránok (ochrana súkromia, obchodné podmienky, cookies).
   Samotný text je celý dokument v jazyku používateľa — app/<stránka>/content.<jazyk>.tsx
   (právny text sa prekladá ako celok, nie po vetách). */

export type LegalDoc = "privacy" | "terms" | "cookies";

export async function legalMetadata(doc: LegalDoc): Promise<Metadata> {
  const t = await getTranslations(`legal.${doc}`);
  return {
    title: t("title"),
    description: t("description"),
    robots: { index: false, follow: true }, // draft — nechceme indexovať, kým neprejde právnou kontrolou
  };
}

export async function LegalPage({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("legal");
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand}>
          <LogoMark className={styles.logoMark} />
          FitPilot
        </Link>
      </header>
      <main className={styles.main}>
        <article className={`${styles.card} ${styles.legal}`}>
          <span className={styles.eyebrow}>{t("eyebrow")}</span>
          {children}
          <Link href="/" className={styles.backLink}>
            {t("back")}
          </Link>
        </article>
      </main>
    </div>
  );
}
