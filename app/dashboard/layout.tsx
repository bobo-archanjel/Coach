import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient, getProfile, getUser } from "@/lib/supabase/server";
import { getTourSeen, hasTourSeenCookie } from "@/lib/onboarding/actions";
import { TRAINER_TOUR_STEPS } from "@/lib/onboarding/tourSteps";
import { OnboardingTour } from "../components/OnboardingTour";
import { NavigationProgressProvider } from "../components/NavigationProgress";
import { DashboardNav } from "./DashboardNav";
import { DashboardSkeletonOverlay } from "./DashboardSkeletonOverlay";
import { dashStyles, isV6Dashboard, v6Theme } from "@/app/dashboard/dashSkin";
import { V6DashSkin } from "@/app/v6design/dashboard/V6DashSkin";
import { v6ThemeColor } from "@/app/v6design/theme";
import tokens from "@/app/v6design/styles/tokens.module.css";

export const metadata: Metadata = {
  title: "FitPilot — Dashboard",
};

/** Farba stavového riadku len pri dizajnovom experimente v6 (svetlá/tmavá téma). */
export async function generateViewport(): Promise<Viewport> {
  if (!(await isV6Dashboard())) return {};
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
  const styles = await dashStyles();
  const {
    data: { user },
  } = await getUser();

  // Cookie fast-path (žiadna sieť) — DB dopyt na tour_completed_at sa spraví
  // len pri úplne prvej návšteve v tomto prehliadači, nie pri každej navigácii.
  const tourSeenCookie = await hasTourSeenCookie();

  let unreadCount = 0;
  let tourSeen = true;
  if (!user) {
    if (!DEV_OPEN) redirect("/prihlasenie");
    tourSeen = true;
  } else {
    // Všetky tri dopyty závisia len na `user.id`, nie jeden na druhom výsledku —
    // predtým getProfile() bežalo sekvenčne PRED messages/tour dvojicou (3
    // "kolá" round-tripov na KAŽDÚ navigáciu v dashboarde). Redirect rozhoduje
    // sa použitím `profile` až PO tomto Promise.all, ale samotné DOPYTOVANIE
    // môže bežať súbežne — jediný scenár, kde by to "plytvalo" dopytom navyše,
    // je klient omylom na /dashboard URL (redirect), čo je vzácny okrajový prípad
    // oproti bežnému toku (tréner, žiadny redirect).
    const supabase = await createClient();
    const [{ data: profile }, { count }, dbTourSeen] = await Promise.all([
      // Symetrický guard k app/portal/layout.tsx (ten posiela trénera na /dashboard) —
      // klient sa sem doteraz vedel dostať priamou URL bez presmerovania na svoj portál.
      getProfile(user.id),
      // Celkový počet neprečítaných správ od klientov → odznak na nav položke "Správy"
      // (RLS messages_select scopuje na klientov tohto trénera, netreba filtrovať client_id).
      supabase.from("messages").select("id", { count: "exact", head: true }).eq("sender", "client").is("read_at", null),
      // tourSeen z DB sa dopytuje LEN keď cookie chýba (prvá návšteva/iný prehliadač).
      tourSeenCookie ? Promise.resolve(true) : getTourSeen(user.id),
    ]);
    if (profile?.role === "client") {
      redirect("/portal");
    }
    unreadCount = count ?? 0;
    tourSeen = dbTourSeen;
  }

  const shell = (
    <NavigationProgressProvider>
      <div className={styles.shell}>
        <DashboardNav unreadCount={unreadCount} />
        <main className={styles.content}>
          <div className={styles.wrap}>{children}</div>
          <DashboardSkeletonOverlay />
        </main>
        <Suspense fallback={null}>
          <OnboardingTour steps={TRAINER_TOUR_STEPS} tourSeen={tourSeen} />
        </Suspense>
      </div>
    </NavigationProgressProvider>
  );
  if (!(await isV6Dashboard())) return shell;

  // Dizajnový experiment v6 (cookie z /v6design/dashboard) — ten istý dashboard,
  // koreň s tokenmi/témou a štýly v6 pre klientske komponenty (SkinProvider).
  return (
    <div className={tokens.root} data-theme={await v6Theme()} data-v6-root="">
      <V6DashSkin>{shell}</V6DashSkin>
    </div>
  );
}
