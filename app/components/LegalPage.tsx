import Link from "next/link";
import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { LogoMark } from "./LogoMark";
import { ThemeToggle } from "@/app/v6design/ThemeToggle";
import { LanguageToggle } from "@/app/v6design/LanguageToggle";
import { V6_THEME_COOKIE, parseV6Theme, v6ThemeColor } from "@/app/v6design/theme";
import tokens from "@/app/v6design/styles/tokens.module.css";
import styles from "@/app/legal.module.css";

/* Spoločný rám právnych stránok (ochrana súkromia, obchodné podmienky, cookies) aj 404 v
   dizajne v6 — rovnako ako landing a prihlásenie: koreň s tokenmi a témou z cookie
   (svetlá / tmavá / auto), sklenená hlavička s logom, jazykom a témou, obsah v sklenenej
   karte. Samotný text je celý dokument v jazyku používateľa — app/<stránka>/content.<jazyk>.tsx
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

/** Farba stavového riadku podľa témy — rovnako ako landing, prihlásenie a appka. */
export async function legalViewport(): Promise<Viewport> {
  return { themeColor: v6ThemeColor(parseV6Theme((await cookies()).get(V6_THEME_COOKIE)?.value)) };
}

/** Rám v6: koreň s témou, hlavička (logo → landing, jazyk, téma) a obsah. */
export async function V6Frame({ children }: { children: React.ReactNode }) {
  const theme = parseV6Theme((await cookies()).get(V6_THEME_COOKIE)?.value);
  return (
    <div className={`${tokens.root} ${styles.page}`} data-theme={theme} data-v6-root="">
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link href="/" className={styles.brand}>
            <LogoMark className={styles.logoMark} />
            FitPilot
          </Link>
          <div className={styles.headerActions}>
            <LanguageToggle />
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className={styles.main}>{children}</main>
    </div>
  );
}

export async function LegalPage({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("legal");
  return (
    <V6Frame>
      <article className={`${styles.card} ${styles.legal}`}>
        <span className={styles.eyebrow}>{t("eyebrow")}</span>
        {children}
        <Link href="/" className={styles.backLink}>
          {t("back")}
        </Link>
      </article>
    </V6Frame>
  );
}
