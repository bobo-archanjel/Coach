import { getTranslations } from "next-intl/server";
import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { cookies } from "next/headers";
import Link from "next/link";
import { getUser } from "@/lib/supabase/server";
import { getTourSeen, hasTourSeenCookie } from "@/lib/onboarding/actions";
import { tourStepsFor } from "@/lib/onboarding/tourSteps";
import { LogoMark } from "@/app/components/LogoMark";
import { OnboardingTour } from "@/app/components/OnboardingTour";
import { SectionGuide } from "@/app/components/SectionGuide";
import { NavigationProgressProvider } from "@/app/components/NavigationProgress";
import { loadPortalShell } from "@/app/portal/portalShell";
import { loadBrandingForTrainer } from "@/lib/branding/server";
import { brandStyle } from "@/lib/branding/theme";
import brand from "@/app/components/branding.module.css";
import { PortalNav } from "./PortalNav";
import { PortalSkeletonOverlay } from "./PortalSkeletonOverlay";
import { NotificationBellSlot } from "./NotificationBell";
import { V6_THEME_COOKIE, parseV6Theme, v6ThemeColor } from "@/app/v6design/theme";
import t from "@/app/v6design/styles/tokens.module.css";
import s from "./portal.module.css";

/* /portal — klientsky portál ("liquid glass", terakota, svetlá/tmavá téma; dizajn v6,
   tokeny v app/v6design/styles/tokens.module.css). Auth guard a údaje navigácie
   v loadPortalShell (portalShell.ts). Bývalé /v6design/portal/* presmerúva next.config.ts. */

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return {
  title: t("portalMetaTitle"),
  description: t("portalMetaDescription"),
  };
}

export async function generateViewport(): Promise<Viewport> {
  return { themeColor: v6ThemeColor(parseV6Theme((await cookies()).get(V6_THEME_COOKIE)?.value)) };
}

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  // loadPortalShell robí auth guard (redirect bez session/tréner) aj dopyty navigácie.
  // Tour: nezávislý dopyt na user.id s rovnakým cookie fast-pathom ako dashboard
  // (DB len keď cookie „tour videný“ chýba).
  const [{ chatUnread, aiKoucVisible, displayName, trainerId }, cookieStore, {
    data: { user },
  }, tn] = await Promise.all([loadPortalShell(), cookies(), getUser(), getTranslations("nav")]);
  // Branding trénera (Business): logo + názov + akcentová farba namiesto FitPilot. null = predvolený
  // vzhľad (klient bez trénera, tréner bez Business, značka nenastavená).
  const branding = await loadBrandingForTrainer(trainerId);
  const tb = branding ? await getTranslations("branding") : null;
  const theme = parseV6Theme(cookieStore.get(V6_THEME_COOKIE)?.value);
  const initial = displayName?.trim().charAt(0).toUpperCase() || "?";

  let tourSeen = true;
  if (user && !(await hasTourSeenCookie())) tourSeen = await getTourSeen(user.id);

  return (
    <div
      className={`${t.root} ${branding?.theme ? brand.branded : ""}`}
      style={brandStyle(branding?.theme)}
      data-theme={theme}
      data-v6-root=""
      data-branded={branding ? "" : undefined}
    >
      <NavigationProgressProvider>
        <header className={s.v6Top}>
          <div className={s.v6TopInner}>
            <Link href="/portal" className={s.v6Brand}>
              {branding?.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={branding.logoUrl} alt="" className={brand.brandLogo} />
              ) : (
                <LogoMark className={s.v6BrandMark} />
              )}
              <span className={s.v6BrandText}>{branding?.brandName || "FitPilot"}</span>
            </Link>
            <div className={s.v6TopActions}>
              <NotificationBellSlot placement="header" />
              <Link href="/portal/profil" className={s.v6Avatar} aria-label={tn("profile")} data-tour="nav-profil">
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
          <OnboardingTour steps={await tourStepsFor("client")} tourSeen={tourSeen} home="/portal" />
          <SectionGuide role="client" />
        </Suspense>
      </NavigationProgressProvider>
    </div>
  );
}
