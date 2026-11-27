import { getLocale, getTranslations } from "next-intl/server";
import { AppLink as Link } from "@/app/components/AppLink";
import { intlLocale, type Locale } from "@/lib/i18n/locales";
import { LEAD_STATUSES, type LeadStatus } from "@/lib/publicPage/leads";
import styles from "@/app/dashboard/dashboard.module.css";
import brandingStyles from "@/app/dashboard/nastavenia/branding.module.css";
import { LockedNotice } from "../LockedFeature";
import l from "./leads.module.css";

/* Zoznam záujemcov z verejnej stránky — záložka Nastavenia → Záujemcovia. Číta sa cez RLS (len vlastní). Bez Business
   a bez uložených záujemcov ukáže zamknutú kartu; po strate Business ostanú existujúci záujemcovia viditeľní
   (dá sa ich vybaviť aj zmazať). Pred migráciou 0083 tabuľka chýba → „nepodarilo sa načítať“, nie pád. */

export interface LeadRow {
  id: string;
  name: string;
  email: string;
  goal: string;
  status: LeadStatus;
  created_at: string;
}

/** Adresa záložky Záujemcovia (voliteľne s filtrom stavu). */
export const LEADS_TAB_HREF = "/dashboard/nastavenia?sekcia=zaujemcovia";

export async function LeadsPanel({ rows: all, error, business, filter }: { rows: LeadRow[]; error: boolean; business: boolean; filter: LeadStatus | "all" }) {
  const [t, tl, locale] = await Promise.all([getTranslations("publicPage.leads"), getTranslations("publicPage.lead.goals"), getLocale()]);
  const rows = filter === "all" ? all : all.filter((r) => r.status === filter);
  const dateFmt = new Intl.DateTimeFormat(intlLocale(locale as Locale), { day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Bratislava" });
  const counts = Object.fromEntries(LEAD_STATUSES.map((s) => [s, all.filter((r) => r.status === s).length])) as Record<LeadStatus, number>;

  if (!business && all.length === 0) {
    return <LockedNotice testId="leads-locked" title={t("locked.title")} text={t("locked.text")} linkLabel={t("locked.upgrade")} />;
  }

  return (
    <section className={`${styles.card} ${brandingStyles.wide}`} aria-label={t("title")} data-testid="leads-list">
      <div className={brandingStyles.head}>
        <h3>{t("title")}</h3>
      </div>
      <p className={brandingStyles.sub}>{t("subtitle")}</p>
      {error && <p className={l.empty}>{t("unavailable")}</p>}
      <nav className={l.filters} aria-label={t("setStatus")}>
        <Link href={LEADS_TAB_HREF} className={`${l.filter} ${filter === "all" ? l.filterOn : ""}`} aria-current={filter === "all" ? "page" : undefined}>
          {t("filterAll")} <span className={l.filterCount}>{all.length}</span>
        </Link>
        {LEAD_STATUSES.map((s) => (
          <Link key={s} href={`${LEADS_TAB_HREF}&stav=${s}`} className={`${l.filter} ${filter === s ? l.filterOn : ""}`} aria-current={filter === s ? "page" : undefined}>
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
  );
}
