"use client";

// FitPilot — feature/navod: `DashboardNav`/`PortalNav` už dávajú okamžitú
// skeleton spätnú väzbu (NavLinkPendingSignal + NavSkeletonOverlay v layout.tsx),
// ale len pre odkazy v menu. Každý INÝ interný odkaz v appke (karta klienta,
// "späť na klienta", odkaz na plán v notifikácii…) je obyčajný next/link bez
// signálu, takže naň klik čaká na server ticho — presne to isté "zamrznutie",
// ktoré menu už nemá. `AppLink` je drop-in náhrada za `next/link`, ktorá
// automaticky pripojí signál na ROVNAKÝ kontext (NavigationProgressProvider je
// vo /dashboard aj /portal layout.tsx), takže skeleton overlay sa spustí
// z hocijakého interného odkazu v appke, nielen z menu.
import NextLink from "next/link";
import type { ComponentProps } from "react";
import { NavLinkPendingSignal } from "./NavigationProgress";

type AppLinkProps = Omit<ComponentProps<typeof NextLink>, "href"> & { href: string };

export function AppLink({ href, children, ...rest }: AppLinkProps) {
  return (
    <NextLink href={href} {...rest}>
      {children}
      <NavLinkPendingSignal id={href} />
    </NextLink>
  );
}
