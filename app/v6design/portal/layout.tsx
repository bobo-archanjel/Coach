import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { LogoMark } from "@/app/components/LogoMark";
import { loadPortalShell } from "@/app/portal/portalShell";
import { V6Skin } from "./V6Skin";
import { V6Nav } from "./V6Nav";
import { V6_THEME_COOKIE, parseV6Theme, v6ThemeColor } from "../theme";
import t from "../styles/tokens.module.css";
import s from "./styles/portal.module.css";

/* /v6design/portal — dizajnový experiment klientskeho portálu ("liquid glass",
   terakota, svetlá/tmavá téma). Tie isté dáta, akcie a komponenty ako /portal;
   auth guard je zdieľaný (loadPortalShell), mení sa len vzhľad. */

export const metadata: Metadata = {
  title: "FitPilot — Portál (nový dizajn)",
  description: "Tvoj dnešný tréning a plán týždňa na jednom mieste.",
  robots: { index: false, follow: false },
};

export async function generateViewport(): Promise<Viewport> {
  return { themeColor: v6ThemeColor(parseV6Theme((await cookies()).get(V6_THEME_COOKIE)?.value)) };
}

export default async function V6PortalLayout({ children }: { children: React.ReactNode }) {
  const [{ chatUnread, aiKoucVisible, displayName }, cookieStore] = await Promise.all([loadPortalShell("/v6design/prihlasenie"), cookies()]);
  const theme = parseV6Theme(cookieStore.get(V6_THEME_COOKIE)?.value);
  const initial = displayName?.trim().charAt(0).toUpperCase() || "?";

  return (
    <div className={t.root} data-theme={theme} data-v6-root="">
      <V6Skin>
        <header className={s.v6Top}>
          <div className={s.v6TopInner}>
            <Link href="/v6design/portal" className={s.v6Brand}>
              <LogoMark className={s.v6BrandMark} />
              <span className={s.v6BrandText}>FitPilot</span>
            </Link>
            <Link href="/v6design/portal/profil" className={s.v6Avatar} aria-label="Profil">
              {initial}
            </Link>
          </div>
        </header>
        <V6Nav chatUnread={chatUnread} aiKoucVisible={aiKoucVisible} displayName={displayName} />
        <div className={s.v6Frame}>
          <main className={s.v6Main}>{children}</main>
        </div>
      </V6Skin>
    </div>
  );
}
