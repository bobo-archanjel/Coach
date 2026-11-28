import type { ReactNode } from "react";
import { SectionTabs, type SectionTabItem } from "@/app/components/SectionTabs";
import { AppLink as Link } from "../../components/AppLink";
import { createClient, getUser } from "@/lib/supabase/server";
import { getTrainerAiUsageSummary } from "@/lib/ai/usageSummary";
import { getTranslations } from "next-intl/server";
import styles from "@/app/dashboard/dashboard.module.css";
import { v6Theme } from "@/app/dashboard/dashTheme";
import { ThemeSwitch } from "@/app/v6design/ThemeSwitch";
import { SignOutButton } from "@/app/components/SignOutButton";
import pa from "@/app/components/planActions.module.css";
import { ActionResumeIcon } from "@/app/components/ActionIcons";
import { ChangePasswordForm } from "@/app/components/ChangePasswordForm";
import { LanguageSelect } from "@/app/components/LanguageSelect";
import { DeleteTrainerAccount } from "./DeleteTrainerAccount";
import { BrandingForm } from "./BrandingForm";
import { ClientCommsCard } from "./ClientCommsCard";
import { tryCreateAdminClient } from "@/lib/supabase/admin";
import { mailConfigured } from "@/lib/mail/config";
import { loadInviteQuota } from "@/lib/mail/invite";
import { getMyTrainerBilling } from "@/lib/billing/server";
import { brandingPublicUrl } from "@/lib/branding/server";
import { PublicPageForm, type PublicPageInitial } from "./PublicPageForm";
import { TemplatePicker } from "./TemplatePicker";
import { coerceTemplate } from "@/lib/publicPage/templates";
import { mailSiteUrl } from "@/lib/mail/config";
import { siteUrl } from "@/lib/site";
import { trainerSubdomainBase } from "@/lib/publicPage/subdomain";
import { readSocials } from "@/lib/publicPage/socials";
import { LockedNotice } from "../LockedFeature";
import { LeadsPanel, type LeadRow } from "../zaujemcovia/LeadsPanel";
import { isLeadStatus } from "@/lib/publicPage/leads";
import brandingStyles from "./branding.module.css";

const usdFormat = (v: number) => `$${v.toFixed(v < 1 ? 3 : 2)}`;

export default async function NastaveniaPage({ searchParams }: { searchParams: Promise<{ sekcia?: string; stav?: string }> }) {
  const { sekcia, stav } = await searchParams;
  const leadsFilter = isLeadStatus(stav) ? stav : "all";
  const supabase = await createClient();
  const [
    {
      data: { user },
    },
    t,
    tl,
  ] = await Promise.all([getUser(), getTranslations("settings"), getTranslations("language")]);

  // Dopyty sú nezávislé okrem toho, že značka a verejná stránka čakajú na tarifu (Business) — predtým 6 stupňov
  // round-tripov za sebou, teraz tarifa → všetko ostatné súbežne.
  const billingP = user ? getMyTrainerBilling(user.id) : Promise.resolve(null);

  // uložená značka trénera + verejná stránka (Business; RLS: len vlastný riadok). Pred migráciou 0075 / 0083 tabuľky
  // chýbajú → prázdne (0081 pridala tmavé logo a ikony; ak ešte nebehla, načíta sa starý tvar bez nich).
  const brandingBlockP = billingP.then(async (billing) => {
    const brandingUnlocked = billing?.state.features.branding === true;
    let brandingRow: Record<string, string | null> | null = null;
    let publicInitial: PublicPageInitial | null = null;
    if (!user || !brandingUnlocked) return { brandingUnlocked, brandingRow, publicInitial };
    const base = "brand_name, accent_color, welcome_text, logo_path, photo_path, invite_slug";
    const [res, [prof, svc, gal, tst]] = await Promise.all([
      (async () => {
        const full = await supabase
          .from("trainer_branding")
          .select(`${base}, logo_dark_path, icon_apple_path`)
          .eq("trainer_id", user.id)
          .maybeSingle();
        return full.error ? await supabase.from("trainer_branding").select(base).eq("trainer_id", user.id).maybeSingle() : full;
      })(),
      Promise.all([
        (async () => {
          // `template` pridáva až 0090 — bez nej sa dopyt zopakuje bez stĺpca a šablóny sú vypnuté
          const cols = "handle, published, headline, bio, location, online, specializations, socials";
          const full = await supabase.from("trainer_public_profiles").select(`${cols}, template`).eq("trainer_id", user.id).maybeSingle();
          if (!full.error) return { ...full, templateReady: true };
          const bare = await supabase.from("trainer_public_profiles").select(cols).eq("trainer_id", user.id).maybeSingle();
          return { ...bare, templateReady: false };
        })(),
        supabase.from("trainer_services").select("name, description, price_text").eq("trainer_id", user.id).order("position"),
        supabase.from("trainer_gallery").select("id, path").eq("trainer_id", user.id).order("position"),
        supabase.from("trainer_testimonials").select("author, body").eq("trainer_id", user.id).order("position"),
      ]),
    ]);
    brandingRow = (res.data as Record<string, string | null> | null) ?? null;
    const pr = (prof.error ? null : prof.data) as { handle: string; published: boolean; headline: string; bio: string; location: string; online: boolean; specializations: string[]; socials: unknown; template?: string } | null;
    publicInitial = {
      handle: pr?.handle ?? "",
      published: pr?.published ?? false,
      headline: pr?.headline ?? "",
      bio: pr?.bio ?? "",
      location: pr?.location ?? "",
      online: pr?.online ?? false,
      specializations: pr?.specializations ?? [],
      socials: readSocials(pr?.socials),
      services: ((svc.error ? [] : svc.data) ?? []).map((s) => ({ name: s.name as string, description: s.description as string, priceText: s.price_text as string })),
      testimonials: ((tst.error ? [] : tst.data) ?? []).map((r) => ({ author: r.author as string, body: r.body as string })),
      gallery: ((gal.error ? [] : gal.data) ?? []).flatMap((g) => {
        const url = brandingPublicUrl(g.path as string);
        return url ? [{ id: g.id as string, url }] : [];
      }),
      photoUrl: brandingPublicUrl(brandingRow?.photo_path),
      saved: !!pr,
      template: coerceTemplate(pr?.template),
      templateReady: prof.templateReady,
    };
    return { brandingUnlocked, brandingRow, publicInitial };
  });

  // záujemcovia z verejnej stránky (RLS: len vlastní) — súbežne s ostatnými; pred 0083 tabuľka chýba → error, nie pád
  const leadsP = user
    ? supabase
        .from("trainer_leads")
        .select("id, name, email, goal, status, created_at")
        .eq("trainer_id", user.id)
        .order("created_at", { ascending: false })
        .limit(300)
        .then(({ data, error }) => ({ rows: (error ? [] : (data ?? [])) as LeadRow[], error: !!error }))
    : Promise.resolve({ rows: [] as LeadRow[], error: false });

  const siteHost = (() => {
    try {
      return new URL(mailSiteUrl()).host;
    } catch {
      return "myfitpilot.sk";
    }
  })();

  // komunikácia s klientmi (všetky tarify): uvítacia správa (RLS: len vlastný riadok; pred 0082 tabuľka chýba → prázdne)
  // a zostatok pozvánok e-mailom (len ak je na serveri nastavené SMTP)
  const smtpReady = mailConfigured();
  const commsP = (async () => {
    let welcomeRow: { body: string; enabled: boolean } | null = null;
    let invitesLeft: number | null = null;
    if (user) {
      const adminForQuota = smtpReady ? tryCreateAdminClient() : null;
      const [{ data: w, error: wErr }, quota] = await Promise.all([
        supabase.from("trainer_welcome_messages").select("body, enabled").eq("trainer_id", user.id).maybeSingle(),
        adminForQuota ? loadInviteQuota(adminForQuota, user.id) : Promise.resolve(null),
      ]);
      if (!wErr) welcomeRow = (w as { body: string; enabled: boolean } | null) ?? null;
      if (quota) invitesLeft = quota.now;
    }
    return { welcomeRow, invitesLeft };
  })();

  const fullName = (user?.user_metadata?.full_name as string | undefined) ?? "—";
  const email = user?.email ?? "—";
  const usageP = user
    ? Promise.all([
        getTrainerAiUsageSummary(supabase, user.id),
        // samostatný dopyt — pred migráciou 0062 stĺpec neexistuje, chyba = žiadna žiadosť
        supabase
          .from("profiles")
          .select("deletion_requested_at")
          .eq("id", user.id)
          .maybeSingle()
          .then(({ data, error }) => (error ? null : ((data?.deletion_requested_at as string | null) ?? null))),
      ])
    : Promise.resolve([null, null] as const);

  const [tb, tp, tc, { brandingUnlocked, brandingRow, publicInitial }, { welcomeRow, invitesLeft }, [aiUsage, deletionRequestedAt], leads, billing] =
    await Promise.all([
      getTranslations("branding"),
      getTranslations("publicPage.settings"),
      getTranslations("branding.comms"),
      brandingBlockP,
      commsP,
      usageP,
      leadsP,
      billingP,
    ]);

  const grid = (children: ReactNode) => <div className={styles.settingsGrid}>{children}</div>;

  const sections: SectionTabItem[] = [
    {
      id: "ucet",
      label: t("tabs.account"),
      content: grid(
        <>
        <div className={styles.card}>
          <h3>{t("profile")}</h3>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>{t("name")}</span>
            <span className={styles.infoValue}>{fullName}</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>{t("email")}</span>
            <span className={styles.infoValue}>{email}</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>{t("role")}</span>
            <span className={styles.infoValue}>{t("roleTrainer")}</span>
          </div>
          {/* odhlásenie len tu — v hornej lište / bočnom paneli je avatar, ktorý sem vedie */}
          <div className={styles.settingsSignOut}>
            <SignOutButton />
          </div>
        </div>

        {user?.email && (
          <div className={styles.card}>
            <h3>{t("password")}</h3>
            <ChangePasswordForm email={user.email} />
          </div>
        )}

          {/* úplne dole — ako „Zmazanie dát“ v Profile klienta */}
          {user && <DeleteTrainerAccount requestedAt={deletionRequestedAt} />}
        </>,
      ),
    },
    {
      id: "komunikacia",
      label: t("tabs.comms"),
      content: grid(
        <>
        {user && (
          <div className={`${styles.card} ${brandingStyles.wide}`} data-testid="comms-card">
            <div className={brandingStyles.head}>
              <h3>{tc("title")}</h3>
            </div>
            <p className={brandingStyles.sub}>{tc("subtitle")}</p>
            <ClientCommsCard
              initial={{
                welcomeBody: welcomeRow?.body ?? "",
                welcomeEnabled: welcomeRow?.enabled ?? true,
                mailConfigured: smtpReady,
                invitesLeft,
                business: brandingUnlocked,
              }}
            />
          </div>
        )}
        </>,
      ),
    },
    {
      id: "znacka",
      label: t("tabs.brand"),
      content: grid(
        <>
        {user && (
          <div className={`${styles.card} ${brandingStyles.wide}`} data-testid="branding-card">
            <div className={brandingStyles.head}>
              <h3>{tb("title")}</h3>
              <span className={brandingStyles.badge}>{tb("badge")}</span>
            </div>
            {brandingUnlocked ? (
              <>
                <p className={brandingStyles.sub}>{tb("subtitle")}</p>
                <BrandingForm
                  initial={{
                    brandName: brandingRow?.brand_name ?? "",
                    welcomeText: brandingRow?.welcome_text ?? "",
                    accent: brandingRow?.accent_color ?? null,
                    logoUrl: brandingPublicUrl(brandingRow?.logo_path),
                    logoDarkUrl: brandingPublicUrl(brandingRow?.logo_dark_path),
                    iconUrl: brandingPublicUrl(brandingRow?.icon_apple_path),
                    invitePath: brandingRow?.invite_slug ? `/pozvanka/${brandingRow.invite_slug}` : null,
                  }}
                />
              </>
            ) : (
              <LockedNotice testId="feature-locked" feature="branding" title={tb("locked.title")} text={tb("locked.text")} linkLabel={tb("locked.upgrade")} />
            )}
          </div>
        )}
        </>,
      ),
    },
    {
      id: "stranka",
      label: t("tabs.page"),
      content: grid(
        <>
        {user && (
          <div className={`${styles.card} ${brandingStyles.wide}`} data-testid="public-page-card">
            <div className={brandingStyles.head}>
              <h3>{tp("title")}</h3>
              <span className={brandingStyles.badge}>{tp("badge")}</span>
            </div>
            {publicInitial ? (
              <>
                <p className={brandingStyles.sub}>{tp("subtitle")}</p>
                <PublicPageForm initial={publicInitial} host={siteHost} siteOrigin={siteUrl()} subdomainBase={trainerSubdomainBase()} businessReady={brandingUnlocked} />
              </>
            ) : (
              <>
                <LockedNotice testId="public-page-locked" feature="publicPage" title={tp("locked.title")} text={tp("locked.text")} linkLabel={tp("locked.upgrade")} />
                <TemplatePicker initial="klasik" ready={false} hasPage={false} disabledReason="locked" />
              </>
            )}
          </div>
        )}
        </>,
      ),
    },
    {
      id: "zaujemcovia",
      label: t("tabs.leads"),
      content: grid(
        user ? <LeadsPanel rows={leads.rows} error={leads.error} business={billing?.state.features.branding === true} filter={leadsFilter} /> : null,
      ),
    },
    {
      id: "predplatne",
      label: t("tabs.billing"),
      content: grid(
        <>
        <div className={styles.card}>
          <h3>{t("billing")}</h3>
          <p style={{ color: "var(--paper-dim)", fontSize: 13.5, marginBottom: 14 }}>{t("billingHint")}</p>
          <Link href="/dashboard/predplatne" className={`${pa.action} ${pa.small} ${pa.inline}`} data-testid="open-billing">
            {t("billingOpen")}
          </Link>
        </div>

        <div className={styles.card}>
          <h3>{t("aiCosts")}</h3>
          {aiUsage ? (
            <>
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>{t("today")}</span>
                <span className={styles.infoValue}>
                  {t("aiRequests", { count: aiUsage.todayCount })} · ~{usdFormat(aiUsage.todayCostUsd)}
                </span>
              </div>
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>{t("last7Days")}</span>
                <span className={styles.infoValue}>
                  {t("aiRequests", { count: aiUsage.weekCount })} · ~{usdFormat(aiUsage.weekCostUsd)}
                </span>
              </div>
              <p style={{ color: "var(--paper-dim)", fontSize: 12.5, marginTop: 10 }}>{t("aiCostsHint")}</p>
            </>
          ) : (
            <p style={{ color: "var(--paper-dim)", fontSize: 13.5 }}>{t("aiNone")}</p>
          )}
        </div>
        </>,
      ),
    },
    {
      id: "aplikacia",
      label: t("tabs.app"),
      content: grid(
        <>
        <div className={styles.card}>
          <h3>{t("appearance")}</h3>
          <ThemeSwitch initial={await v6Theme()} />
          <p style={{ color: "var(--paper-dim)", fontSize: 13, marginTop: 10 }}>{t("appearanceHint")}</p>
        </div>
        <div className={styles.card}>
          <h3>{tl("title")}</h3>
          <LanguageSelect />
          <p style={{ color: "var(--paper-dim)", fontSize: 13, marginTop: 10 }}>{tl("hint")}</p>
        </div>

        <div className={styles.card}>
          <div className={styles.settingsRowHead}>
            <h3 style={{ marginBottom: 0 }}>{t("notifications")}</h3>
            <span className={styles.comingSoon}>{t("comingSoon")}</span>
          </div>
          <p style={{ color: "var(--paper-dim)", fontSize: 13.5, marginTop: 10 }}>{t("notificationsHint")}</p>
        </div>

        <div className={styles.card} data-tour="settings-guide">
          <h3>{t("tour")}</h3>
          <p style={{ color: "var(--paper-dim)", fontSize: 13.5, marginTop: 10, marginBottom: 14 }}>{t("tourHint")}</p>
          <Link href="/dashboard?tour=1" className={`${pa.action} ${pa.small} ${pa.inline}`}>
            <ActionResumeIcon />
            {t("tourRestart")}
          </Link>
        </div>
        </>,
      ),
    },
  ];

  return (
    <div className={styles.settingsPageWide}>
      <div className={styles.pageHead}>
        <h1>{t("title")}</h1>
        <p>{t("subtitle")}</p>
      </div>

      <SectionTabs sections={sections} initialId={sekcia} param="sekcia" ariaLabel={t("tabsAria")} layout="side" clearParams={["stav"]} />
    </div>
  );
}
