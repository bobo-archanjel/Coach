import { getLocale, getTranslations } from "next-intl/server";
import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { cookies } from "next/headers";
import Link from "next/link";
import { getUser } from "@/lib/supabase/server";
import { getTourSeen, hasTourSeenCookie } from "@/lib/onboarding/actions";
import { tourStepsFor } from "@/lib/onboarding/tourSteps";
import { MESSAGES } from "@/messages";
import { scopedMessages } from "@/lib/i18n/clientMessages";
import { ScopedMessages } from "@/app/components/ScopedMessages";
import { LogoMark } from "@/app/components/LogoMark";
import { OnboardingTour } from "@/app/components/OnboardingTour";
import { SectionGuide } from "@/app/components/SectionGuide";
import { NavigationProgressProvider } from "@/app/components/NavigationProgress";
import { loadPortalShell } from "@/app/portal/portalShell";
import { loadBrandingForTrainer } from "@/lib/branding/server";
import { loadClientBranding } from "@/lib/branding/portal";
import { brandStyle } from "@/lib/branding/theme";
import { BrandLogo } from "@/app/components/BrandLogo";
import brand from "@/app/components/branding.module.css";
import { PortalSplash, SPLASH_FLAG } from "./PortalSplash";
import { PortalNav } from "./PortalNav";
import { PortalSkeletonOverlay } from "./PortalSkeletonOverlay";
import { NotificationBellSlot } from "./NotificationBell";
import { AchievementHost } from "./AchievementHost";
import { FinishSummaryHost } from "./FinishSummaryHost";
import { RingsHost } from "./RingsHost";
import { loadCosmetics } from "@/lib/gamification/cosmeticsServer";
import { frameClassName } from "./frameClass";
import themes from "@/app/components/clientThemes.module.css";
import { V6_THEME_COOKIE, parseV6Theme, v6ThemeColor } from "@/app/v6design/theme";
import t from "@/app/v6design/styles/tokens.module.css";
import s from "./portal.module.css";

/* /portal — klientsky portál ("liquid glass", terakota, svetlá/tmavá téma; dizajn v6,
   tokeny v app/v6design/styles/tokens.module.css). Auth guard a údaje navigácie
   v loadPortalShell (portalShell.ts). Bývalé /v6design/portal/* presmerúva next.config.ts. */

/* Inštalácia na plochu: manifest portálu je dynamický (/portal/manifest.webmanifest) a <link> naň
   sa kreslí v layoute s crossorigin="use-credentials" (inak prehliadač manifest sťahuje BEZ cookie
   a nepoznal by klienta). Metadáta tu len vypnú predvolený FitPilot manifest z koreňa (`manifest: null`).
   iOS pri „Pridať na plochu“ číta názov z apple-mobile-web-app-title a ikonu z apple-touch-icon. */
export async function generateMetadata(): Promise<Metadata> {
  const [t, branding] = await Promise.all([getTranslations("nav"), loadClientBranding()]);
  return {
    title: t("portalMetaTitle"),
    description: t("portalMetaDescription"),
    // appka za loginom do indexu nepatrí
    robots: { index: false, follow: false },
    manifest: null,
    appleWebApp: { capable: true, title: branding?.brandName || "FitPilot", statusBarStyle: "default" },
    ...(branding?.icons
      ? {
          icons: {
            icon: [{ url: branding.icons.i192, sizes: "192x192", type: "image/png" }],
            apple: [{ url: branding.icons.apple, sizes: "180x180", type: "image/png" }],
          },
        }
      : {}),
  };
}

export async function generateViewport(): Promise<Viewport> {
  const [theme, branding] = await Promise.all([
    cookies().then((c) => parseV6Theme(c.get(V6_THEME_COOKIE)?.value)),
    loadClientBranding(),
  ]);
  // značka trénera: farba stavového riadku = akcent značky (svetlý/tmavý variant podľa témy)
  const bt = branding?.theme;
  if (bt) {
    if (theme === "auto") {
      return {
        themeColor: [
          { media: "(prefers-color-scheme: light)", color: bt.light.accent },
          { media: "(prefers-color-scheme: dark)", color: bt.dark.accent },
        ],
      };
    }
    return { themeColor: theme === "dark" ? bt.dark.accent : bt.light.accent };
  }
  return { themeColor: v6ThemeColor(theme) };
}

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  // loadPortalShell robí auth guard (redirect bez session/tréner) aj dopyty navigácie.
  // Tour: nezávislý dopyt na user.id s rovnakým cookie fast-pathom ako dashboard
  // (DB len keď cookie „tour videný“ chýba).
  // Cosmetics (rámik/téma) a tour (DB len bez cookie) potrebujú len user.id — štartujú súbežne s loadPortalShell
  // (predtým čakali sekvenčne za značkou, 2 round-tripy navyše na každú navigáciu v portáli).
  const userP = getUser();
  const cosmeticsP = userP.then(({ data: { user } }) => loadCosmetics(user?.id ?? ""));
  const tourSeenP = Promise.all([userP, hasTourSeenCookie()]).then(([{ data: { user } }, cookieSeen]) =>
    user && !cookieSeen ? getTourSeen(user.id) : true,
  );
  const [{ chatUnread, aiKoucVisible, displayName, trainerId }, cookieStore, tn, cosmetics, tourSeen] = await Promise.all([
    loadPortalShell(),
    cookies(),
    getTranslations("nav"),
    cosmeticsP,
    tourSeenP,
  ]);
  // Branding trénera (Business): logo + názov + akcentová farba namiesto FitPilot. null = predvolený
  // vzhľad (klient bez trénera, tréner bez Business, značka nenastavená). Zahriate v loadPortalShell (request-cache).
  const branding = await loadBrandingForTrainer(trainerId);
  const tb = branding ? await getTranslations("branding") : null;
  // v2: rámik avatara, farebná téma a štýl osláv z odmien za úrovne. Téma mení farby portálu LEN bez značky trénera
  // (značka vždy vyhráva); klient so značkou témy nemá (namiesto nich animované rámiky, tituly a štýly osláv).
  const themeActive = !branding && cosmetics.theme !== "default";
  const theme = parseV6Theme(cookieStore.get(V6_THEME_COOKIE)?.value);
  const initial = displayName?.trim().charAt(0).toUpperCase() || "?";

  // ScopedMessages: texty oblasti portálu (koreňový layout posiela len verejné — lib/i18n/clientMessages.ts)
  return (
    <ScopedMessages extra={scopedMessages(MESSAGES[await getLocale()], "portal")}>
    <div
      className={`${t.root} ${branding?.theme ? brand.branded : ""} ${themeActive ? themes.themed : ""}`}
      style={brandStyle(branding?.theme)}
      data-theme={theme}
      data-fp-theme={themeActive ? cosmetics.theme : undefined}
      data-celebration={cosmetics.celebration}
      data-v6-root=""
      data-branded={branding ? "" : undefined}
    >
      <link rel="manifest" href="/portal/manifest.webmanifest" crossOrigin="use-credentials" />
      {/* splash už ukázaný v tejto relácii → skryť ešte pred prvým vykreslením (bez zablikania pri znovunačítaní) */}
      <script
        dangerouslySetInnerHTML={{
          __html: `try{if(sessionStorage.getItem(${JSON.stringify(SPLASH_FLAG)})==="1")document.documentElement.dataset.fpSplash="done"}catch(e){}`,
        }}
      />
      <PortalSplash name={branding?.brandName || "FitPilot"} iconUrl={branding?.icons?.i512 ?? null} logoUrl={branding?.logoUrl ?? null} />
      <NavigationProgressProvider>
        <header className={s.v6Top}>
          <div className={s.v6TopInner}>
            <Link href="/portal" className={s.v6Brand}>
              {branding?.logoUrl || branding?.logoDarkUrl ? (
                <BrandLogo src={branding.logoUrl} darkSrc={branding.logoDarkUrl ?? null} />
              ) : (
                <LogoMark className={s.v6BrandMark} />
              )}
              <span className={s.v6BrandText}>{branding?.brandName || "FitPilot"}</span>
            </Link>
            <div className={s.v6TopActions}>
              <NotificationBellSlot placement="header" />
              <Link
                href="/portal/profil"
                className={`${s.v6Avatar} ${frameClassName(cosmetics.frame, cosmetics.flameHot)}`}
                data-frame={cosmetics.frame}
                aria-label={tn("profile")}
                data-tour="nav-profil"
              >
                {initial}
              </Link>
            </div>
          </div>
        </header>
        <PortalNav
          chatUnread={chatUnread}
          aiKoucVisible={aiKoucVisible}
          displayName={displayName}
          brandName={branding?.brandName || null}
          brandLogoUrl={branding?.logoUrl ?? null}
          brandLogoDarkUrl={branding?.logoDarkUrl ?? null}
          avatarFrameClass={frameClassName(cosmetics.frame, cosmetics.flameHot)}
        />
        <div className={s.v6Frame}>
          {/* pozicionovaný obal len okolo obsahu — overlay skeleton pri navigácii
              (PortalSkeletonOverlay) prekryje presne stĺpec obsahu, nie panel/lištu */}
          <div className={s.v6Stage}>
            <main className={s.v6Main}>
              {children}
              {tb && <p className={brand.poweredBy}>{tb("poweredBy")}</p>}
            </main>
            <PortalSkeletonOverlay />
          </div>
        </div>
        <Suspense fallback={null}>
          <AchievementHost />
        </Suspense>
        <Suspense fallback={null}>
          <FinishSummaryHost />
        </Suspense>
        <Suspense fallback={null}>
          <RingsHost />
        </Suspense>
        <Suspense fallback={null}>
          <OnboardingTour steps={await tourStepsFor("client")} tourSeen={tourSeen} home="/portal" />
          <SectionGuide role="client" />
        </Suspense>
      </NavigationProgressProvider>
    </div>
    </ScopedMessages>
  );
}
