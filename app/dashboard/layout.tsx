import { getLocale, getTranslations } from "next-intl/server";
import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient, getProfile, getUser } from "@/lib/supabase/server";
import { getTourSeen, hasTourSeenCookie } from "@/lib/onboarding/actions";
import { tourStepsFor } from "@/lib/onboarding/tourSteps";
import { needsTermsConsent } from "@/lib/legal/terms";
import { MESSAGES } from "@/messages";
import { scopedMessages } from "@/lib/i18n/clientMessages";
import { ScopedMessages } from "../components/ScopedMessages";
import { OnboardingTour } from "../components/OnboardingTour";
import { SectionGuide } from "../components/SectionGuide";
import { NavigationProgressProvider } from "../components/NavigationProgress";
import { DashboardNav } from "./DashboardNav";
import { DashboardSkeletonOverlay } from "./DashboardSkeletonOverlay";
import { BillingProvider } from "./BillingContext";
import { BillingBanner } from "./BillingBanner";
import { getMyTrainerBilling } from "@/lib/billing/server";
import type { BillingState } from "@/lib/billing/entitlements";
import styles from "@/app/dashboard/dashboard.module.css";
import { v6Theme } from "@/app/dashboard/dashTheme";
import { v6ThemeColor } from "@/app/v6design/theme";
import tokens from "@/app/v6design/styles/tokens.module.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return {
  title: t("trainerMetaTitle"),
  };
}

/** Farba stavového riadku podľa témy (svetlá/tmavá/auto). */
export async function generateViewport(): Promise<Viewport> {
  return { themeColor: v6ThemeColor(await v6Theme()) };
}

/**
 * Auth guard + shell pre celý /dashboard. Klienti bežia na reálnych Supabase dátach
 * (tabuľka `clients`, RLS scoped na trainer_id).
 */
/** DEV: `next dev` bez session (lokál bez platných Supabase kľúčov) — nechá prejsť,
    nech sa dajú pozerať povrchy cez `?preview=`. V produkcii guard nepodmienený.
    Symetrické s app/portal/layout.tsx. */
const DEV_OPEN = process.env.NODE_ENV === "development";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const {
    data: { user },
  } = await getUser();

  // Cookie fast-path (žiadna sieť) — DB dopyt na tour_completed_at sa spraví
  // len pri úplne prvej návšteve v tomto prehliadači, nie pri každej navigácii.
  const tourSeenCookie = await hasTourSeenCookie();

  let unreadCount = 0;
  let tourSeen = true;
  // meno trénera pre avatar s iniciálou v hornej lište / bočnom paneli (ako klient v portáli)
  let displayName: string | null = null;
  // stav predplatného (banner, zamknuté funkcie) — null = DEV bez session / klient (presmeruje sa)
  let billing: BillingState | null = null;
  if (!user) {
    if (!DEV_OPEN) redirect("/prihlasenie");
  } else {
    // Všetky tri dopyty závisia len na `user.id`, nie jeden na druhom výsledku —
    // predtým getProfile() bežalo sekvenčne PRED messages/tour dvojicou (3
    // "kolá" round-tripov na KAŽDÚ navigáciu v dashboarde). Redirect rozhoduje
    // sa použitím `profile` až PO tomto Promise.all, ale samotné DOPYTOVANIE
    // môže bežať súbežne — jediný scenár, kde by to "plytvalo" dopytom navyše,
    // je klient omylom na /dashboard URL (redirect), čo je vzácny okrajový prípad
    // oproti bežnému toku (tréner, žiadny redirect).
    const supabase = await createClient();
    const [{ data: profile }, { count }, dbTourSeen, trainerBilling] = await Promise.all([
      // Symetrický guard k app/portal/layout.tsx (ten posiela trénera na /dashboard) —
      // klient sa sem doteraz vedel dostať priamou URL bez presmerovania na svoj portál.
      getProfile(user.id),
      // Celkový počet neprečítaných správ od klientov → odznak na nav položke "Správy"
      // (RLS messages_select scopuje na klientov tohto trénera, netreba filtrovať client_id).
      supabase.from("messages").select("id", { count: "exact", head: true }).eq("sender", "client").is("read_at", null),
      // tourSeen z DB sa dopytuje LEN keď cookie chýba (prvá návšteva/iný prehliadač).
      tourSeenCookie ? Promise.resolve(true) : getTourSeen(user.id),
      getMyTrainerBilling(user.id),
    ]);
    if (profile?.role === "client") {
      redirect("/portal");
    }
    // bez súhlasu s aktuálnou verziou obchodných podmienok (0063) — najprv súhlas
    if (profile && needsTermsConsent(profile.terms_version)) {
      redirect("/prihlasenie/suhlas");
    }
    billing = trainerBilling.state;
    unreadCount = count ?? 0;
    tourSeen = dbTourSeen;
    displayName = profile?.full_name?.trim() || (user.user_metadata?.full_name as string | undefined)?.trim() || null;
  }

  // koreň s tokenmi a témou dizajnu v6 (data-v6-root — sem idú aj okná cez createPortal)
  // ScopedMessages: texty oblasti dashboardu (koreňový layout posiela len verejné — lib/i18n/clientMessages.ts)
  return (
    <ScopedMessages extra={scopedMessages(MESSAGES[await getLocale()], "dashboard")}>
    <div className={tokens.root} data-theme={await v6Theme()} data-v6-root="">
      <NavigationProgressProvider>
        <div className={styles.shell}>
          <DashboardNav unreadCount={unreadCount} displayName={displayName} />
          <main className={styles.content}>
            <div className={styles.wrap}>
              <BillingProvider state={billing}>
                {billing && <BillingBanner state={billing} />}
                {children}
              </BillingProvider>
            </div>
            <DashboardSkeletonOverlay />
          </main>
          <Suspense fallback={null}>
            <OnboardingTour steps={await tourStepsFor("trainer")} tourSeen={tourSeen} home="/dashboard" />
            <SectionGuide role="trainer" />
          </Suspense>
        </div>
      </NavigationProgressProvider>
    </div>
    </ScopedMessages>
  );
}
