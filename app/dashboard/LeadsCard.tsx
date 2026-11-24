import { getTranslations } from "next-intl/server";
import { AppLink as Link } from "../components/AppLink";
import { createClient, getUser } from "@/lib/supabase/server";
import { getMyTrainerBilling } from "@/lib/billing/server";
import styles from "./dashboard.module.css";

/* „Záujemcovia“ na úvodnej stránke (Business) — hlavne pre mobil, kde odkaz v bočnom menu nie je.
   Server komponent v <Suspense>, aby nespomaľoval zoznam klientov. Bez Business, bez migrácie 0083
   alebo pri chybe sa karta nezobrazí. Nová správa z formulára svieti aj vo zvončeku. */
export async function LeadsCard() {
  const {
    data: { user },
  } = await getUser();
  if (!user) return null;
  const billing = await getMyTrainerBilling(user.id);
  if (!billing.state.features.branding) return null;

  const supabase = await createClient();
  const [prof, leads, t] = await Promise.all([
    supabase.from("trainer_public_profiles").select("trainer_id", { head: true, count: "exact" }).eq("trainer_id", user.id),
    supabase.from("trainer_leads").select("id", { head: true, count: "exact" }).eq("trainer_id", user.id).eq("status", "new"),
    getTranslations("publicPage.dash"),
  ]);
  if (prof.error || leads.error) return null;
  const hasPage = (prof.count ?? 0) > 0;
  const fresh = leads.count ?? 0;

  return (
    <section className={styles.card} aria-label={t("cardTitle")} data-testid="leads-card">
      <h3>{t("cardTitle")}</h3>
      {hasPage ? (
        <p style={{ color: "var(--paper-dim)", fontSize: 14, margin: "8px 0 12px" }}>{fresh > 0 ? t("cardNew", { count: fresh }) : t("cardNone")}</p>
      ) : (
        <p style={{ color: "var(--paper-dim)", fontSize: 14, margin: "8px 0 12px" }}>{t("cardSetup")}</p>
      )}
      <Link href={hasPage ? "/dashboard/zaujemcovia" : "/dashboard/nastavenia"} style={{ color: "var(--accent-text)", fontWeight: 650, fontSize: 14 }}>
        {hasPage ? t("cardOpen") : t("cardSetupLink")}
      </Link>
    </section>
  );
}
