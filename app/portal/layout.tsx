import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { cookies } from "next/headers";
import Link from "next/link";
import { getUser } from "@/lib/supabase/server";
import { getTourSeen, hasTourSeenCookie } from "@/lib/onboarding/actions";
import { CLIENT_TOUR_STEPS } from "@/lib/onboarding/tourSteps";
import { LogoMark } from "@/app/components/LogoMark";
import { OnboardingTour } from "@/app/components/OnboardingTour";
import { NavigationProgressProvider } from "@/app/components/NavigationProgress";
import { loadPortalShell } from "@/app/portal/portalShell";
import { PortalNav } from "./PortalNav";
import { PortalSkeletonOverlay } from "./PortalSkeletonOverlay";
import { NotificationBellSlot } from "./NotificationBell";
import { V6_THEME_COOKIE, parseV6Theme, v6ThemeColor } from "@/app/v6design/theme";
import t from "@/app/v6design/styles/tokens.module.css";
import s from "./portal.module.css";

/* /portal — klientsky portál ("liquid glass", terakota, svetlá/tmavá téma; dizajn v6,
   tokeny v app/v6design/styles/tokens.module.css). Auth guard a údaje navigácie
   v loadPortalShell (portalShell.ts). Bývalé /v6design/portal/* presmerúva next.config.ts. */

export const metadata: Metadata = {
  title: "FitPilot — Portál",
  description: "Tvoj dnešný tréning a plán týždňa na jednom mieste.",
};

export async function generateViewport(): Promise<Viewport> {
  return { themeColor: v6ThemeColor(parseV6Theme((await cookies()).get(V6_THEME_COOKIE)?.value)) };
}

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  // loadPortalShell robí auth guard (redirect bez session/tréner) aj dopyty navigácie.
  // Tour: nezávislý dopyt na user.id s rovnakým cookie fast-pathom ako dashboard
  // (DB len keď cookie „tour videný“ chýba).
  const [{ chatUnread, aiKoucVisible, displayName }, cookieStore, {
    data: { user },
  }] = await Promise.all([loadPortalShell(), cookies(), getUser()]);
  const theme = parseV6Theme(cookieStore.get(V6_THEME_COOKIE)?.value);
  const initial = displayName?.trim().charAt(0).toUpperCase() || "?";

  let tourSeen = true;
  if (user && !(await hasTourSeenCookie())) tourSeen = await getTourSeen(user.id);

  return (
    <div className={t.root} data-theme={theme} data-v6-root="">
      <NavigationProgressProvider>
        <header className={s.v6Top}>
          <div className={s.v6TopInner}>
            <Link href="/portal" className={s.v6Brand}>
              <LogoMark className={s.v6BrandMark} />
              <span className={s.v6BrandText}>FitPilot</span>
            </Link>
            <div className={s.v6TopActions}>
              <NotificationBellSlot placement="header" />
              <Link href="/portal/profil" className={s.v6Avatar} aria-label="Profil" data-tour="nav-profil">
                {initial}
              </Link>
            </div>
          </div>
        </header>
        <PortalNav chatUnread={chatUnread} aiKoucVisible={aiKoucVisible} displayName={displayName} />
        <div className={s.v6Frame}>
          {/* pozicionovaný obal len okolo obsahu — overlay skeleton pri navigácii
              (PortalSkeletonOverlay) prekryje presne stĺpec obsahu, nie panel/lištu */}
          <div className={s.v6Stage}>
            <main className={s.v6Main}>{children}</main>
            <PortalSkeletonOverlay />
          </div>
        </div>
        <Suspense fallback={null}>
          <OnboardingTour steps={CLIENT_TOUR_STEPS} tourSeen={tourSeen} />
        </Suspense>
      </NavigationProgressProvider>
    </div>
  );
}
