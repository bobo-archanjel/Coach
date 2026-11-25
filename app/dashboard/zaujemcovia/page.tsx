import { getLocale, getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { AppLink as Link } from "@/app/components/AppLink";
import { createClient, getUser } from "@/lib/supabase/server";
import { getMyTrainerBilling } from "@/lib/billing/server";
import { intlLocale, type Locale } from "@/lib/i18n/locales";
import { LEAD_STATUSES, isLeadStatus, type LeadStatus } from "@/lib/publicPage/leads";
import styles from "@/app/dashboard/dashboard.module.css";
import { LockedNotice } from "../LockedFeature";
import l from "./leads.module.css";

/* /dashboard/zaujemcovia — záujemcovia z verejnej stránky trénera. Číta sa cez RLS (len vlastní). Bez Business
   a bez uložených záujemcov ukáže zamknutú kartu; po strate Business ostanú existujúci záujemcovia viditeľní
   (dá sa ich vybaviť aj zmazať). Pred migráciou 0083 tabuľka chýba → „nepodarilo sa načítať“, nie pád. */

interface LeadRow {
  id: string;
  name: string;
  email: string;
  goal: string;
  status: LeadStatus;
  created_at: string;
}

export default async function ZaujemcoviaPage({ searchParams }: { searchParams: Promise<{ stav?: string }> }) {
  const {
    data: { user },
  } = await getUser();
  if (!user) redirect("/prihlasenie");
  const sp = await searchParams;
  const filter: LeadStatus | "all" = isLeadStatus(sp.stav) ? sp.stav : "all";

  const [t, tl, locale, billing] = await Promise.all([
    getTranslations("publicPage.leads"),
    getTranslations("publicPage.lead.goals"),
    getLocale(),
    getMyTrainerBilling(user.id),
  ]);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("trainer_leads")
    .select("id, name, email, goal, status, created_at")
    .eq("trainer_id", user.id)
    .order("created_at", { ascending: false })
    .limit(300);
  const all = (error ? [] : (data ?? [])) as LeadRow[];
  const rows = filter === "all" ? all : all.filter((r) => r.status === filter);
  const business = billing.state.features.branding === true;
  const dateFmt = new Intl.DateTimeFormat(intlLocale(locale as Locale), { day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Bratislava" });
  const counts = Object.fromEntries(LEAD_STATUSES.map((s) => [s, all.filter((r) => r.status === s).length])) as Record<LeadStatus, number>;

  return (
    <>
      <div className={styles.pageHead}>
        <h1>{t("title")}</h1>
        <p>{t("subtitle")}</p>
      </div>

      {!business && all.length === 0 ? (
        <LockedNotice testId="leads-locked" title={t("locked.title")} text={t("locked.text")} linkLabel={t("locked.upgrade")} />
      ) : (
        <section className={styles.card} aria-label={t("title")} data-testid="leads-list">
          {error && <p className={l.empty}>{t("unavailable")}</p>}
          <nav className={l.filters} aria-label={t("setStatus")}>
            <Link href="/dashboard/zaujemcovia" className={`${l.filter} ${filter === "all" ? l.filterOn : ""}`} aria-current={filter === "all" ? "page" : undefined}>
              {t("filterAll")} <span className={l.filterCount}>{all.length}</span>
            </Link>
            {LEAD_STATUSES.map((s) => (
              <Link key={s} href={`/dashboard/zaujemcovia?stav=${s}`} className={`${l.filter} ${filter === s ? l.filterOn : ""}`} aria-current={filter === s ? "page" : undefined}>
                {t(`status.${s}`)} <span className={l.filterCount}>{counts[s]}</span>
              </Link>
            ))}
          </nav>

          {!error && rows.length === 0 ? (
            <p className={l.empty}>{all.length === 0 ? t("empty") : t("emptyFilter")}</p>
          ) : (
            <ul className={l.list}>
              {rows.map((r) => (
                <li key={r.id}>
                  <Link href={`/dashboard/zaujemcovia/${r.id}`} className={l.row} data-testid="lead-row">
                    <span className={l.rowMain}>
                      <span className={l.rowName}>{r.name}</span>
                      <span className={l.rowMeta}>
                        {tl(r.goal as never)} · {dateFmt.format(new Date(r.created_at))}
                      </span>
                    </span>
                    <span className={`${l.badge} ${l[`s_${r.status}`]}`}>{t(`status.${r.status}`)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}
