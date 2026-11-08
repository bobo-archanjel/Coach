import { cookies } from "next/headers";
import { ThemeSwitch } from "@/app/v6design/ThemeSwitch";
import { V6_THEME_COOKIE, parseV6Theme } from "@/app/v6design/theme";
import { AuthView } from "./AuthView";
import styles from "./auth.module.css";

/* force-dynamic: AuthView vytvára Supabase klienta už pri prvom renderi (useState), takže
   statický prerender tejto stránky by ho spustil počas buildu bez runtime env vars a build
   na Verceli by zlyhal (Invalid supabaseUrl). Téma z cookie je tiež per-request. */
export const dynamic = "force-dynamic";

export default async function AuthPage() {
  const theme = parseV6Theme((await cookies()).get(V6_THEME_COOKIE)?.value);
  return (
    <AuthView
      footer={
        <div className={styles.themeRow}>
          <ThemeSwitch initial={theme} />
        </div>
      }
    />
  );
}
