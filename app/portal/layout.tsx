import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { LogoMark } from "@/app/components/LogoMark";
import { loadPortalShell } from "@/app/portal/portalShell";
import { PortalNav } from "./PortalNav";
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
  const [{ chatUnread, aiKoucVisible, displayName }, cookieStore] = await Promise.all([loadPortalShell(), cookies()]);
  const theme = parseV6Theme(cookieStore.get(V6_THEME_COOKIE)?.value);
  const initial = displayName?.trim().charAt(0).toUpperCase() || "?";

  return (
    <div className={t.root} data-theme={theme} data-v6-root="">
      <header className={s.v6Top}>
        <div className={s.v6TopInner}>
          <Link href="/portal" className={s.v6Brand}>
            <LogoMark className={s.v6BrandMark} />
            <span className={s.v6BrandText}>FitPilot</span>
          </Link>
          <Link href="/portal/profil" className={s.v6Avatar} aria-label="Profil">
            {initial}
          </Link>
        </div>
      </header>
      <PortalNav chatUnread={chatUnread} aiKoucVisible={aiKoucVisible} displayName={displayName} />
      <div className={s.v6Frame}>
        <main className={s.v6Main}>{children}</main>
      </div>
    </div>
  );
}
