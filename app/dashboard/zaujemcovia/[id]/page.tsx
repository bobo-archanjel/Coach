import { getLocale, getTranslations } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import { AppLink as Link } from "@/app/components/AppLink";
import { createClient, getUser } from "@/lib/supabase/server";
import { intlLocale, type Locale } from "@/lib/i18n/locales";
import type { LeadStatus } from "@/lib/publicPage/leads";
import { mailConfigured } from "@/lib/mail/config";
import styles from "@/app/dashboard/dashboard.module.css";
import l from "../leads.module.css";
import { LeadActions } from "./LeadActions";

/* Detail záujemcu: všetko z formulára (len na čítanie), stav, poznámky, pozvánka, zmazanie. Číta sa cez RLS
   — cudzie alebo neexistujúce id = 404. Obsah formulára sa vykresľuje ako obyčajný text (React escapuje). */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface LeadFull {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  goal: string;
  experience: string;
  availability: string;
  message: string;
  status: LeadStatus;
  notes: string;
  consent_version: string;
  consent_at: string;
  invited_at: string | null;
  created_at: string;
}

export default async function ZaujemcaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const {
    data: { user },
  } = await getUser();
  if (!user) redirect("/prihlasenie");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("trainer_leads")
    .select("id, name, email, phone, goal, experience, availability, message, status, notes, consent_version, consent_at, invited_at, created_at")
    .eq("id", id)
    .eq("trainer_id", user.id)
    .maybeSingle();
  if (error || !data) notFound();
  const lead = data as LeadFull;

  const [t, tg, te, locale] = await Promise.all([
    getTranslations("publicPage.leads"),
    getTranslations("publicPage.lead.goals"),
    getTranslations("publicPage.lead.experiences"),
    getLocale(),
  ]);
  const dateFmt = new Intl.DateTimeFormat(intlLocale(locale as Locale), { day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Bratislava" });
  const dayFmt = new Intl.DateTimeFormat(intlLocale(locale as Locale), { day: "numeric", month: "numeric", year: "numeric", timeZone: "Europe/Bratislava" });

  return (
    <>
      <div className={styles.pageHead}>
        <Link href="/dashboard/zaujemcovia" className={l.back}>
          {t("back")}
        </Link>
        <h1 style={{ overflowWrap: "anywhere" }}>{lead.name}</h1>
        <p>{t("received", { date: dateFmt.format(new Date(lead.created_at)) })}</p>
      </div>

      <div className={l.detail}>
        <section className={styles.card} aria-label={lead.name} data-testid="lead-detail">
          <dl className={l.facts}>
            <div>
              <dt>{t("email")}</dt>
              <dd>
                <a href={`mailto:${lead.email}`}>{lead.email}</a>
              </dd>
            </div>
            {lead.phone && (
              <div>
                <dt>{t("phone")}</dt>
                <dd>
                  <a href={`tel:${lead.phone.replace(/[^+\d]/g, "")}`}>{lead.phone}</a>
                </dd>
              </div>
            )}
            <div>
              <dt>{t("goal")}</dt>
              <dd>{tg(lead.goal as never)}</dd>
            </div>
            <div>
              <dt>{t("experience")}</dt>
              <dd>{te(lead.experience as never)}</dd>
            </div>
            {lead.availability && (
              <div>
                <dt>{t("availability")}</dt>
                <dd>{lead.availability}</dd>
              </div>
            )}
          </dl>
          <h3 className={l.sectionTitle}>{t("message")}</h3>
          <p className={l.message}>{lead.message || t("noMessage")}</p>
          <p className={l.consent}>{t("consent", { date: dayFmt.format(new Date(lead.consent_at)), version: lead.consent_version })}</p>
        </section>

        <LeadActions
          id={lead.id}
          status={lead.status}
          notes={lead.notes}
          invitedAt={lead.invited_at ? dateFmt.format(new Date(lead.invited_at)) : null}
          replyHref={`mailto:${lead.email}`}
          mailReady={mailConfigured()}
        />
      </div>
    </>
  );
}
