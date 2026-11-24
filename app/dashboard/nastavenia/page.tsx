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
import { mailSiteUrl } from "@/lib/mail/config";
import { readSocials } from "@/lib/publicPage/socials";
import billingStyles from "../billing.module.css";
import brandingStyles from "./branding.module.css";

const usdFormat = (v: number) => `$${v.toFixed(v < 1 ? 3 : 2)}`;

export default async function NastaveniaPage() {
  const supabase = await createClient();
  const [
    {
      data: { user },
    },
    t,
    tl,
  ] = await Promise.all([getUser(), getTranslations("settings"), getTranslations("language")]);

  const tb = await getTranslations("branding");
  const billing = user ? await getMyTrainerBilling(user.id) : null;
  const brandingUnlocked = billing?.state.features.branding === true;
  // uložená značka trénera (RLS: len vlastný riadok); pred migráciou 0075 tabuľka chýba → prázdne
  // (0081 pridala tmavé logo a ikony; ak ešte nebehla, načíta sa starý tvar bez nich)
  let brandingRow: Record<string, string | null> | null = null;
  if (user && brandingUnlocked) {
    const base = "brand_name, accent_color, welcome_text, logo_path, photo_path, invite_slug";
    const full = await supabase
      .from("trainer_branding")
      .select(`${base}, logo_dark_path, icon_apple_path`)
      .eq("trainer_id", user.id)
      .maybeSingle();
    const res = full.error ? await supabase.from("trainer_branding").select(base).eq("trainer_id", user.id).maybeSingle() : full;
    brandingRow = (res.data as Record<string, string | null> | null) ?? null;
  }

  // verejná stránka trénera (Business; 0083 — pred migráciou tabuľky chýbajú → prázdna stránka bez chyby)
  let publicInitial: PublicPageInitial | null = null;
  if (user && brandingUnlocked) {
    const [prof, svc, gal, tst] = await Promise.all([
      supabase.from("trainer_public_profiles").select("handle, published, headline, bio, location, online, specializations, socials").eq("trainer_id", user.id).maybeSingle(),
      supabase.from("trainer_services").select("name, description, price_text").eq("trainer_id", user.id).order("position"),
      supabase.from("trainer_gallery").select("id, path").eq("trainer_id", user.id).order("position"),
      supabase.from("trainer_testimonials").select("author, body").eq("trainer_id", user.id).order("position"),
    ]);
    const pr = (prof.error ? null : prof.data) as { handle: string; published: boolean; headline: string; bio: string; location: string; online: boolean; specializations: string[]; socials: unknown } | null;
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
      saved: !!pr,
    };
  }
  const tp = await getTranslations("publicPage.settings");
  const siteHost = (() => {
    try {
      return new URL(mailSiteUrl()).host;
    } catch {
      return "myfitpilot.sk";
    }
  })();

  // komunikácia s klientmi (všetky tarify): uvítacia správa (RLS: len vlastný riadok; pred 0082 tabuľka chýba → prázdne)
  // a zostatok pozvánok e-mailom (len ak je na serveri nastavené SMTP)
  let welcomeRow: { body: string; enabled: boolean } | null = null;
  let invitesLeft: number | null = null;
  const smtpReady = mailConfigured();
  if (user) {
    const { data: w, error: wErr } = await supabase.from("trainer_welcome_messages").select("body, enabled").eq("trainer_id", user.id).maybeSingle();
    if (!wErr) welcomeRow = (w as { body: string; enabled: boolean } | null) ?? null;
    const adminForQuota = smtpReady ? tryCreateAdminClient() : null;
    if (adminForQuota) invitesLeft = (await loadInviteQuota(adminForQuota, user.id)).now;
  }
  const tc = await getTranslations("branding.comms");
  const tn = await getTranslations("nav");

  const fullName = (user?.user_metadata?.full_name as string | undefined) ?? "—";
  const email = user?.email ?? "—";
  const [aiUsage, deletionRequestedAt] = user
    ? await Promise.all([
        getTrainerAiUsageSummary(supabase, user.id),
        // samostatný dopyt — pred migráciou 0062 stĺpec neexistuje, chyba = žiadna žiadosť
        supabase
          .from("profiles")
          .select("deletion_requested_at")
          .eq("id", user.id)
          .maybeSingle()
          .then(({ data, error }) => (error ? null : ((data?.deletion_requested_at as string | null) ?? null))),
      ])
    : [null, null];

  return (
    <div className={styles.settingsPage}>
      <div className={styles.pageHead}>
        <h1>{t("title")}</h1>
        <p>{t("subtitle")}</p>
      </div>

      <div className={styles.settingsGrid}>
        {/* Na mobile nie sú Výzvy a Záujemcovia v spodnej lište (bola by pritesná) — odkazy sú tu */}
        <div className={`${styles.card} ${styles.mobileOnly}`} data-testid="settings-more-sections">
          <h3>{t("moreSections")}</h3>
          <div className={styles.settingsMoreLinks}>
            <Link href="/dashboard/vyzvy" className={`${pa.action} ${pa.small} ${pa.inline}`}>
              {tn("challenges")}
            </Link>
            <Link href="/dashboard/zaujemcovia" className={`${pa.action} ${pa.small} ${pa.inline}`}>
              {tn("leads")}
            </Link>
          </div>
        </div>
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

        <div className={styles.card}>
          <div className={styles.settingsRowHead}>
            <h3 style={{ marginBottom: 0 }}>{t("notifications")}</h3>
            <span className={styles.comingSoon}>{t("comingSoon")}</span>
          </div>
          <p style={{ color: "var(--paper-dim)", fontSize: 13.5, marginTop: 10 }}>{t("notificationsHint")}</p>
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

        <div className={styles.card}>
          <h3>{t("billing")}</h3>
          <p style={{ color: "var(--paper-dim)", fontSize: 13.5, marginBottom: 14 }}>{t("billingHint")}</p>
          <Link href="/dashboard/predplatne" className={`${pa.action} ${pa.small} ${pa.inline}`} data-testid="open-billing">
            {t("billingOpen")}
          </Link>
        </div>

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
                    photoUrl: brandingPublicUrl(brandingRow?.photo_path),
                    invitePath: brandingRow?.invite_slug ? `/pozvanka/${brandingRow.invite_slug}` : null,
                  }}
                />
              </>
            ) : (
              <div className={billingStyles.locked} role="note" data-testid="feature-locked" data-feature="branding">
                <span className={billingStyles.lockIcon} aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="4" y="11" width="16" height="9" rx="2.5" />
                    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                  </svg>
                </span>
                <div className={billingStyles.lockBody}>
                  <strong>{tb("locked.title")}</strong>
                  <p>{tb("locked.text")}</p>
                  <Link href="/dashboard/predplatne" className={billingStyles.lockLink}>
                    {tb("locked.upgrade")}
                  </Link>
                </div>
              </div>
            )}
          </div>
        )}

        {user && (
          <div className={`${styles.card} ${brandingStyles.wide}`} data-testid="public-page-card">
            <div className={brandingStyles.head}>
              <h3>{tp("title")}</h3>
              <span className={brandingStyles.badge}>{tp("badge")}</span>
            </div>
            {publicInitial ? (
              <>
                <p className={brandingStyles.sub}>{tp("subtitle")}</p>
                <PublicPageForm initial={publicInitial} host={siteHost} businessReady={brandingUnlocked} />
              </>
            ) : (
              <div className={billingStyles.locked} role="note" data-testid="public-page-locked" data-feature="publicPage">
                <span className={billingStyles.lockIcon} aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="4" y="11" width="16" height="9" rx="2.5" />
                    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                  </svg>
                </span>
                <div className={billingStyles.lockBody}>
                  <strong>{tp("locked.title")}</strong>
                  <p>{tp("locked.text")}</p>
                  <Link href="/dashboard/predplatne" className={billingStyles.lockLink}>
                    {tp("locked.upgrade")}
                  </Link>
                </div>
              </div>
            )}
          </div>
        )}

        <div className={styles.card} data-tour="settings-guide">
          <h3>{t("tour")}</h3>
          <p style={{ color: "var(--paper-dim)", fontSize: 13.5, marginTop: 10, marginBottom: 14 }}>{t("tourHint")}</p>
          <Link href="/dashboard?tour=1" className={`${pa.action} ${pa.small} ${pa.inline}`}>
            <ActionResumeIcon />
            {t("tourRestart")}
          </Link>
        </div>

        {/* úplne dole — ako „Zmazanie dát“ v Profile klienta */}
        {user && <DeleteTrainerAccount requestedAt={deletionRequestedAt} />}
      </div>
    </div>
  );
}
