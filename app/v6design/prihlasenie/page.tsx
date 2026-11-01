import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { AuthView } from "@/app/prihlasenie/AuthView";
import { ThemeSwitch } from "../ThemeSwitch";
import { V6_THEME_COOKIE, parseV6Theme, v6ThemeColor } from "../theme";
import { V6AuthSkin } from "./V6AuthSkin";
import t from "../styles/tokens.module.css";
import a from "./styles/auth.module.css";

/* /v6design/prihlasenie — prihlásenie a registrácia v dizajne v6. Ten istý formulár,
   validácia a akcie ako /prihlasenie (AuthView); mení sa vzhľad a vstup do appky
   po prihlásení (V6AuthSkin). Odkaz na nové heslo z e-mailu vedie stále na
   /prihlasenie/nove-heslo (adresa povolená v Supabase). */

export const metadata: Metadata = {
  title: "Prihlásenie (nový dizajn)",
  robots: { index: false, follow: false },
};

export async function generateViewport(): Promise<Viewport> {
  return { themeColor: v6ThemeColor(parseV6Theme((await cookies()).get(V6_THEME_COOKIE)?.value)) };
}

export default async function V6LoginPage() {
  const theme = parseV6Theme((await cookies()).get(V6_THEME_COOKIE)?.value);
  return (
    <div className={t.root} data-theme={theme} data-v6-root="">
      <V6AuthSkin>
        <AuthView
          footer={
            <div className={a.themeRow}>
              <ThemeSwitch initial={theme} />
            </div>
          }
        />
      </V6AuthSkin>
    </div>
  );
}
