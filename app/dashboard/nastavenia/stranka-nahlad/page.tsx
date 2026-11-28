import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AppLink as Link } from "@/app/components/AppLink";
import { createClient, getUser } from "@/lib/supabase/server";
import { getMyTrainerBilling } from "@/lib/billing/server";
import { loadOwnPage } from "@/lib/publicPage/server";
import { isTemplateId } from "@/lib/publicPage/templates";
import { TrainerPublicPage } from "@/app/t/TrainerPublicPage";
import styles from "../branding.module.css";

/* „Náhľad“ verejnej stránky — READ-ONLY, vidí ho len prihlásený tréner s Business (layout dashboardu overuje
   session a rolu). Číta VLASTNÉ dáta cez RLS (aj nepublikované), formulár je v náhľade vypnutý. Neexistuje-li
   stránka alebo tréner nemá Business, vráti sa do nastavení. */
export default async function PublicPagePreview({ searchParams }: { searchParams: Promise<{ sablona?: string | string[] }> }) {
  const {
    data: { user },
  } = await getUser();
  if (!user) redirect("/prihlasenie");
  const billing = await getMyTrainerBilling(user.id);
  if (!billing.state.features.branding) redirect("/dashboard/nastavenia");
  const { page, published } = await loadOwnPage(await createClient(), user.id);
  if (!page) redirect("/dashboard/nastavenia");
  const t = await getTranslations("publicPage.preview");
  const tt = await getTranslations("publicPage.templates");
  // ?sablona=<id> — náhľad vlastných dát v inej šablóne bez uloženia (neplatná hodnota sa ignoruje)
  const raw = (await searchParams).sablona;
  const tpl = Array.isArray(raw) ? raw[0] : raw;
  const shown = isTemplateId(tpl) ? { ...page, template: tpl } : page;
  const banner = isTemplateId(tpl) ? tt("previewBanner", { name: tt(`names.${tpl}`) }) : published ? t("banner") : t("bannerDraft");

  return (
    <div className={styles.pvPage} data-testid="public-page-preview-page">
      <Link href="/dashboard/nastavenia?sekcia=stranka" className={styles.pvBack}>
        {t("back")}
      </Link>
      <div style={{ width: "100%", borderRadius: 28, overflow: "clip" }}>
        <TrainerPublicPage page={shown} preview previewBanner={banner} />
      </div>
    </div>
  );
}
