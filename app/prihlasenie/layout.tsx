import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { V6_THEME_COOKIE, parseV6Theme, v6ThemeColor } from "@/app/v6design/theme";
import tokens from "@/app/v6design/styles/tokens.module.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth");
  return {
    // Plain string tu prechádza cez title.template z root layout.tsx ("%s · FitPilot")
    // — nepridávať "FitPilot" manuálne, inak vznikne duplicita ("FitPilot — X · FitPilot").
    title: t("metaTitle"),
    description: t("metaDescription"),
    alternates: { canonical: "/prihlasenie" },
  };
}

/** Farba stavového riadku podľa témy (svetlá/tmavá/auto) — rovnako ako dashboard a portál. */
export async function generateViewport(): Promise<Viewport> {
  return { themeColor: v6ThemeColor(parseV6Theme((await cookies()).get(V6_THEME_COOKIE)?.value)) };
}

/* Prihlásenie, registrácia aj nové heslo v dizajne v6 — koreň s tokenmi a témou z cookie
   (spoločnej s appkou po prihlásení; prepína sa ikonou na landing page a v appke).
   Bývalé /v6design/prihlasenie trvalo presmeruje next.config.ts. */
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const theme = parseV6Theme((await cookies()).get(V6_THEME_COOKIE)?.value);
  return (
    <div className={tokens.root} data-theme={theme} data-v6-root="">
      {children}
    </div>
  );
}
