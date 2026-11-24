import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AppLink as Link } from "@/app/components/AppLink";
import { LogoMark } from "@/app/components/LogoMark";
import { getUser } from "@/lib/supabase/server";
import { loadBrandingForTrainer } from "@/lib/branding/server";
import { brandStyle } from "@/lib/branding/theme";
import styles from "../branding.module.css";
import brand from "@/app/components/branding.module.css";
import portal from "@/app/portal/portal.module.css";
import pa from "@/app/components/planActions.module.css";

/* „Pozrieť ako klient“ — READ-ONLY náhľad portálu so značkou trénera na ukážkových dátach.
   Nepoužíva žiadne DEV/preview mechanizmy portálu (tie bežia len v `next dev`) — je to samostatná
   trasa pod /dashboard (layout overuje session a rolu trénera), ktorá z DB číta výlučne značku
   PRIHLÁSENÉHO trénera (loadBrandingForTrainer — rovnaká funkcia ako portál klienta, takže sa ukáže
   presne to, čo klient reálne uvidí; bez Business sa nezobrazí nič → späť do nastavení).
   Obsah je statický, bez odkazov a akcií (pointer-events: none). */
export default async function BrandingPreviewPage() {
  const {
    data: { user },
  } = await getUser();
  if (!user) redirect("/prihlasenie");
  const branding = await loadBrandingForTrainer(user.id);
  if (!branding) redirect("/dashboard/nastavenia");

  const t = await getTranslations("branding");
  const name = branding.brandName || "FitPilot";

  return (
    <div className={styles.pvPage} data-testid="branding-client-preview">
      <Link href="/dashboard/nastavenia" className={styles.pvBack}>
        {t("preview.back")}
      </Link>
      <p className={styles.pvBanner}>{t("preview.banner")}</p>

      <div className={`${styles.pvFrame} ${branding.theme ? brand.branded : ""}`} style={brandStyle(branding.theme)}>
        <header className={portal.v6Top} style={{ position: "static", display: "block" }}>
          <div className={portal.v6TopInner}>
            <span className={portal.v6Brand}>
              {branding.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={branding.logoUrl} alt="" className={brand.brandLogo} />
              ) : (
                <LogoMark className={portal.v6BrandMark} />
              )}
              <span className={portal.v6BrandText}>{name}</span>
            </span>
            <span className={styles.phoneAvatar} aria-hidden="true">J</span>
          </div>
        </header>

        <div className={styles.pvMain}>
          <p className={styles.phoneHello}>{t("previewGreeting")}</p>
          <div className={styles.pvCard}>
            <span className={styles.pvCardLabel}>{t("preview.todayTitle")}</span>
            <h4 className={styles.pvCardTitle}>{t("preview.workoutName")}</h4>
            <p className={styles.pvCardText}>{t("preview.workoutMeta")}</p>
            <span className={styles.phoneBtn}>{t("previewButton")}</span>
          </div>
          <div className={styles.pvCard}>
            <span className={styles.pvCardLabel}>{t("preview.progressTitle")}</span>
            <p className={styles.pvCardText}>{t("preview.progressText")}</p>
            <span className={styles.pvBar}>
              <span className={styles.pvBarFill} />
            </span>
          </div>
          <div className={styles.pvCard}>
            <span className={styles.pvCardLabel}>{t("preview.nutritionTitle")}</span>
            <p className={styles.pvCardText}>{t("preview.nutritionText")}</p>
            <span className={styles.phoneLink}>{t("previewLink")}</span>
          </div>
          <p className={brand.poweredBy}>{t("poweredBy")}</p>
        </div>

        <nav className={styles.pvNav} aria-hidden="true">
          <span className={`${styles.pvNavItem} ${styles.pvNavOn}`}>
            <span className={styles.pvNavDot} />
            {t("preview.navToday")}
          </span>
          <span className={styles.pvNavItem}>
            <span className={styles.pvNavDot} />
            {t("preview.navTraining")}
          </span>
          <span className={styles.pvNavItem}>
            <span className={styles.pvNavDot} />
            {t("preview.navDiary")}
          </span>
          <span className={styles.pvNavItem}>
            <span className={styles.pvNavDot} />
            {t("preview.navChat")}
          </span>
        </nav>
      </div>
      <Link href="/dashboard/nastavenia" className={`${pa.action} ${pa.small} ${pa.inline}`}>
        {t("preview.back")}
      </Link>
    </div>
  );
}
