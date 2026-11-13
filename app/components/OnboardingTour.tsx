"use client";

// FitPilot — feature/navod: úvodný sprievodca menu cez skutočné UI prvky (nie mockup
// screenshoty). Ukazuje na reálne `data-tour` atribúty v DashboardNav.tsx / PortalNav.tsx,
// funguje teda rovnako na sidebari (>880px) aj na bottom nav bare (mobile). Vykreslenie
// (zvýraznenie, bublina, kroky) je v TourOverlay; tu je len kedy sa spustí a ukončí.
//
// Automatické spustenie: layout (dashboard/portal) odovzdá `tourSeen` z
// lib/onboarding/actions.ts (profiles.tour_completed_at). Manuálne znova
// spustenie: odkaz s `?tour=1` na domovskej trase danej role (pozri
// Nastavenia / Profil) — číta sa cez useSearchParams a po zavretí sa parameter
// z URL odstráni (router.replace), nech sa pri refreshi znova nespustí.

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { completeTourAction } from "@/lib/onboarding/actions";
import type { TourStep } from "@/lib/onboarding/tourSteps";
import { TourOverlay } from "./TourOverlay";

export function OnboardingTour({ steps, tourSeen }: { steps: TourStep[]; tourSeen: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const forceReplay = searchParams.get("tour") === "1";

  const [active, setActive] = useState(false);

  // `OnboardingTour` je súčasť TRVALÉHO layoutu (dashboard/portal) — pri bežnej
  // navigácii v appke sa nemountuje znova, takže "len raz pri mounte" by
  // "Spustiť návod znova" (klik z inej stránky na `?tour=1`, klientská
  // navigácia bez remountu) nikdy nezachytilo. Závislosť na `forceReplay`
  // (nie na celom `searchParams` objekte, ktorý mení identitu pri KAŽDEJ zmene
  // query stringu) reaguje presne na prechod false→true. `finish()` nižšie
  // vždy odstráni `tour` z URL, takže sa tu nikdy nezacyklí.
  useEffect(() => {
    if (forceReplay || !tourSeen) {
      setActive(true);
    }
    // Automatické spustenie (prvé prihlásenie) sa hneď zapíše ako „videné“ — aj keď
    // používateľ sprievodcu nedokončí (zavrie kartu, odhlási sa), pri ďalšom prihlásení
    // sa už nespustí. Manuálne „Spustiť návod znova“ (?tour=1) nič nezapisuje vopred.
    if (!forceReplay && !tourSeen) void completeTourAction();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forceReplay]);

  const finish = useCallback(async () => {
    // Cookie (zdroj pravdy pre layout na ĎALŠEJ navigácii) sa zapisuje touto
    // akciou — ak by sme skryli dialóg (setActive(false)) skôr, než sa stihne
    // zapísať, rýchla navigácia hneď po "Preskočiť"/"Dokončiť" by mohla predbehnúť
    // zápis cookie a tour by sa na ďalšej stránke spustil znova od kroku 0
    // (nájdené pri reálnom e2e teste: skip na /dashboard, klik na "Správy" hneď
    // potom ukázal tour nanovo na "Klienti").
    await completeTourAction();
    setActive(false);
    if (forceReplay) {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("tour");
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    }
  }, [forceReplay, pathname, router, searchParams]);

  if (!active) return null;
  return <TourOverlay steps={steps} onFinish={finish} />;
}
