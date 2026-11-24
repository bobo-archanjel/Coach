import type { Metadata, Viewport } from "next";
import { cookies, headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { V6_THEME_COOKIE, parseV6Theme, v6ThemeColor } from "@/app/v6design/theme";
import tokens from "@/app/v6design/styles/tokens.module.css";
import brand from "@/app/components/branding.module.css";
import { LogoMark } from "@/app/components/LogoMark";
import { loadBrandingByInviteSlug } from "@/lib/branding/server";
import { brandStyle } from "@/lib/branding/theme";
import { allowWithinWindow } from "@/lib/rateLimitMemory";
import styles from "../invite.module.css";

/* Pozývacia stránka trénera s Business: ukáže LEN jeho verejnú značku (názov, logo, fotka,
   uvítací text, farba). Odkaz je tajný (80 bitov) a stránka je zámerne NEINDEXOVATEĽNÁ
   a bez referrera. Neplatný odkaz, tréner bez Business aj prekročený limit pokusov končia
   rovnako — generickým 404 (nedá sa rozlíšiť, čo z toho nastalo → žiadna enumerácia).
   Samotné spárovanie klienta s trénerom sa tým NEMENÍ (klient po registrácii pošle trénerovi
   svoj kód FP-…, ktorým ho tréner pridá — add_client_by_code). */

export const dynamic = "force-dynamic";

const MAX_LOOKUPS_PER_IP = 30;
const WINDOW_MS = 10 * 60_000;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("branding.inviteLanding");
  return {
    title: t("metaTitle"),
    robots: { index: false, follow: false, nocache: true },
    referrer: "no-referrer",
  };
}

export async function generateViewport(): Promise<Viewport> {
  return { themeColor: v6ThemeColor(parseV6Theme((await cookies()).get(V6_THEME_COOKIE)?.value)) };
}

export default async function InvitePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim() || "unknown";
  // prekročený limit = rovnaká odpoveď ako neplatný odkaz (nič sa nedá rozlíšiť)
  if (!allowWithinWindow(`invite-lookup:${ip}`, MAX_LOOKUPS_PER_IP, WINDOW_MS)) notFound();

  const branding = await loadBrandingByInviteSlug(slug);
  if (!branding) notFound();

  const [t, ti, theme] = await Promise.all([
    getTranslations("branding"),
    getTranslations("branding.inviteLanding"),
    cookies().then((c) => parseV6Theme(c.get(V6_THEME_COOKIE)?.value)),
  ]);

  return (
    <div
      className={`${tokens.root} ${branding.theme ? brand.branded : ""}`}
      style={brandStyle(branding.theme)}
      data-theme={theme}
      data-v6-root=""
    >
      <main className={styles.shell}>
        <div className={styles.card} data-testid="invite-landing">
          {branding.photoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={branding.photoUrl} alt="" className={styles.photo} />
          )}
          {branding.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={branding.logoUrl} alt="" className={styles.logo} />
          ) : (
            !branding.photoUrl && <LogoMark className={styles.logo} />
          )}
          <h1 className={styles.heading}>
            {branding.brandName ? ti("heading", { brand: branding.brandName }) : ti("headingNoName")}
          </h1>
          <p className={styles.welcome}>{branding.welcomeText || ti("defaultWelcome")}</p>
          <Link href="/prihlasenie#register" className={styles.cta} data-testid="invite-cta">
            {ti("cta")}
          </Link>
          <p className={styles.steps}>{ti("steps")}</p>
          <p className={styles.loginRow}>
            {ti("haveAccount")}{" "}
            <Link href="/prihlasenie" className={styles.login}>
              {ti("login")}
            </Link>
          </p>
          <p className={styles.powered}>{t("poweredBy")}</p>
        </div>
      </main>
    </div>
  );
}
