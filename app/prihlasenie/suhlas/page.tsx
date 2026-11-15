import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { LogoMark } from "@/app/components/LogoMark";
import { signOutAction } from "@/app/components/actions";
import { needsTermsConsent } from "@/lib/legal/terms";
import { getProfile, getUser } from "@/lib/supabase/server";
import { acceptTermsAction } from "./actions";
import { AcceptButton } from "./AcceptButton";
import styles from "../auth.module.css";

/**
 * Súhlas s obchodnými podmienkami pred vstupom do appky (0063). Sem presmeruje layout
 * dashboardu / portálu účet bez súhlasu s aktuálnou verziou (lib/legal/terms.ts):
 *  - nový účet bez súhlasu (registrácia či prihlásenie cez Google),
 *  - účet so staršou verziou po podstatnej zmene podmienok — vidí aj súhrn zmien.
 */
export const dynamic = "force-dynamic";

export default async function ConsentPage({ searchParams }: { searchParams: Promise<{ chyba?: string }> }) {
  const [{ chyba }, t, ta, {
    data: { user },
  }] = await Promise.all([searchParams, getTranslations("auth.consent"), getTranslations("auth"), getUser()]);
  if (!user) redirect("/prihlasenie");
  const { data: profile } = await getProfile(user.id);
  // súhlas už je (alebo sa nedá zistiť) — rovno do appky
  if (!profile || !needsTermsConsent(profile.terms_version)) {
    redirect(profile?.role === "client" ? "/portal" : "/dashboard");
  }
  const updated = profile.terms_version != null; // mal súhlas so staršou verziou

  return (
    <div className={styles.shell}>
      <aside className={styles.brandPanel}>
        <div className={styles.plateField} aria-hidden="true" />
        <div>
          <Link className={styles.brand} href="/">
            <LogoMark className={styles.logoMark} />
            FitPilot
          </Link>
          <p className={styles.brandTagline}>{ta("tagline")}</p>
        </div>
      </aside>

      <main className={styles.formPanel}>
        <div className={styles.authCard} data-testid="terms-consent">
          <div className={styles.authHead}>
            <h2>{updated ? t("updatedTitle") : t("title")}</h2>
            <p>{updated ? t("updatedText") : t("text")}</p>
          </div>

          {updated && (
            <div className={styles.consentChanges}>
              <p className={styles.consentChangesTitle}>{t("changesTitle")}</p>
              <p>{t("changes")}</p>
            </div>
          )}

          <p className={styles.consentLinks}>
            {t.rich("links", {
              terms: (chunks) => (
                <a href="/obchodne-podmienky" target="_blank" rel="noopener noreferrer" className={styles.link}>
                  {chunks}
                </a>
              ),
              privacy: (chunks) => (
                <a href="/ochrana-sukromia" target="_blank" rel="noopener noreferrer" className={styles.link}>
                  {chunks}
                </a>
              ),
            })}
          </p>

          {chyba && (
            <p className={styles.consentError} role="alert">
              {t("error")}
            </p>
          )}

          <form action={acceptTermsAction}>
            <AcceptButton label={t("accept")} />
          </form>

          <p className={styles.consentDecline}>
            {t.rich("decline", {
              mail: (chunks) => (
                <a href="mailto:podpora@myfitpilot.sk" className={styles.link}>
                  {chunks}
                </a>
              ),
            })}
          </p>
          <form action={signOutAction} className={styles.consentSignOut}>
            <button type="submit" className={styles.link}>
              {t("signOut")}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
