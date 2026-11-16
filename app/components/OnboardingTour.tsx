"use client";

// FitPilot — plynulý sprievodca appkou cez skutočné UI prvky (nie mockup screenshoty).
// Prejde sekcie z menu jednu po druhej (lib/onboarding/tourSteps.ts): ukáže položku menu,
// vysvetlí hlavné funkcie sekcie priamo na jej stránke a sám prejde na ďalšiu sekciu.
// Vykreslenie (zvýraznenie, bublina) je v TourBubble; tu je poradie krokov, prechody
// medzi stránkami a kedy sa sprievodca spustí a ukončí.
//
// Krok sa ukáže, až keď je jeho prvok na stránke. Prvok, ktorý na načítanej stránke nie
// je (prázdny zoznam, žiadna neprečítaná správa…), sa preskočí.
//
// Automatické spustenie: layout (dashboard/portal) odovzdá `tourSeen` z
// lib/onboarding/actions.ts (profiles.tour_completed_at). Manuálne znova
// spustenie: odkaz s `?tour=1` na domovskej trase danej role (pozri
// Nastavenia / Profil) — číta sa cez useSearchParams.

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { completeTourAction } from "@/lib/onboarding/actions";
import type { TourStep } from "@/lib/onboarding/tourSteps";
import { announceGuidesReset } from "./guideEvents";
import { findTourTarget, TourBubble } from "./TourOverlay";

const CHECK_MS = 150;
/** koľko kontrol sa čaká na chýbajúci prvok na už načítanej stránke (voliteľný krok) */
const MISSING_TRIES = 3;
/** najdlhšie čakanie na obsah sekcie pri kroku — potom sa chýbajúci krok preskočí */
const LOAD_MS = 4000;

export function OnboardingTour({ steps, tourSeen, home }: { steps: TourStep[]; tourSeen: boolean; home: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const forceReplay = searchParams.get("tour") === "1";
  // DEV náhľad bez prihlásenia (?preview=) — parameter sa nesie aj na ďalšie sekcie
  const preview = searchParams.get("preview");

  const [active, setActive] = useState(false);
  const [index, setIndex] = useState(0);
  /** krok, ktorého prvok je na stránke (iný než `index` = čaká sa na stránku / prvok) */
  const [shown, setShown] = useState<number | null>(null);
  /** predošlé zobrazené kroky — „Späť“ sa vracia len na krok, ktorý používateľ videl */
  const [history, setHistory] = useState<number[]>([]);
  const finishing = useRef(false);

  const pushed = useRef<string | null>(null);

  const hrefFor = useCallback((path: string) => (preview ? `${path}?preview=${encodeURIComponent(preview)}` : path), [preview]);

  // `OnboardingTour` je súčasť TRVALÉHO layoutu (dashboard/portal) — pri bežnej
  // navigácii v appke sa nemountuje znova, takže "len raz pri mounte" by
  // "Spustiť návod znova" (klik z inej stránky na `?tour=1`, klientská
  // navigácia bez remountu) nikdy nezachytilo. Závislosť na `forceReplay`
  // (nie na celom `searchParams` objekte, ktorý mení identitu pri KAŽDEJ zmene
  // query stringu) reaguje presne na prechod false→true. Sprievodca pri prechode na
  // ďalšiu sekciu `tour` z adresy stratí — spustený už ostáva.
  useEffect(() => {
    if (forceReplay || !tourSeen) {
      finishing.current = false;
      setHistory([]);
      setIndex(0);
      setShown(null);
      setActive(true);
    }
    // Automatické spustenie (prvé prihlásenie) sa hneď zapíše ako „videné“ — aj keď
    // používateľ sprievodcu nedokončí (zavrie kartu, odhlási sa), pri ďalšom prihlásení
    // sa už nespustí. Manuálne „Spustiť návod znova“ (?tour=1) nič nezapisuje vopred.
    if (!forceReplay && !tourSeen) void completeTourAction();
    // „Spustiť návod znova“ vráti aj sprievodcov hlbších okien (builder, detail klienta…)
    if (forceReplay) {
      void fetch("/api/onboarding/guides", { method: "DELETE" })
        .then(announceGuidesReset)
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forceReplay]);

  const finish = useCallback(
    async (goHome: boolean) => {
      if (finishing.current) return;
      finishing.current = true;
      // Cookie (zdroj pravdy pre layout na ĎALŠEJ navigácii) sa zapisuje touto
      // akciou — ak by sme skryli dialóg (setActive(false)) skôr, než sa stihne
      // zapísať, rýchla navigácia hneď po "Preskočiť"/"Dokončiť" by mohla predbehnúť
      // zápis cookie a tour by sa na ďalšej stránke spustil znova od kroku 0.
      await completeTourAction();
      setActive(false);
      setShown(null);
      if (goHome && pathname !== home) {
        router.push(hrefFor(home)); // po dokončení späť na úvodnú sekciu
      } else if (forceReplay) {
        const params = new URLSearchParams(searchParams.toString());
        params.delete("tour");
        const qs = params.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname);
      }
    },
    [forceReplay, home, hrefFor, pathname, router, searchParams],
  );

  // Aktuálny krok: prejsť na jeho sekciu, počkať na prvok, ukázať — alebo preskočiť.
  useEffect(() => {
    if (!active) return;
    const step = steps[index];
    if (!step) {
      void finish(true);
      return;
    }
    const skip = () => setIndex((i) => i + 1);
    if (step.gate && !findTourTarget(step.gate)) {
      skip();
      return;
    }
    if (pathname !== step.path) {
      const href = hrefFor(step.path);
      if (pushed.current !== href) {
        pushed.current = href;
        router.push(href);
      }
      return;
    }
    pushed.current = null;
    // Čas čakania sa počíta od TOHTO kroku, nie od príchodu na stránku — kým používateľ
    // číta krok s položkou menu, pomalá stránka (Nastavenia) sa ešte načítava; s časom od
    // príchodu by sa ďalší krok preskočil skôr, než sa obsah objavil.
    const started = Date.now();
    let tries = 0;
    const check = () => {
      if (findTourTarget(step.target)) {
        setShown(index);
        return true;
      }
      tries++;
      // obsah sekcie je načítaný, keď je vidieť aspoň jeden jej prvok — alebo po LOAD_MS
      // (sekcia v stave, kde žiadny z nich nie je, napr. Správy bez klientov)
      const loaded =
        steps.some((s) => s.path === step.path && !s.nav && findTourTarget(s.target)) || Date.now() - started > LOAD_MS;
      if (loaded && tries >= MISSING_TRIES) {
        skip();
        return true;
      }
      return false;
    };
    if (check()) return;
    const timer = window.setInterval(() => {
      if (check()) window.clearInterval(timer);
    }, CHECK_MS);
    return () => window.clearInterval(timer);
  }, [active, index, pathname, steps, router, hrefFor, finish]);

  /** Krok na tej istej stránke, ktorého prvok už je vidieť, sa ukáže hneď — zvýraznenie naň plynulo prejde. */
  const go = (to: number) => {
    const step = steps[to];
    if (step && step.path === pathname && findTourTarget(step.target)) setShown(to);
    setIndex(to);
  };
  // kým sa hľadá ďalší krok (shown !== index), tlačidlá nič nerobia — dvojklik nepreskočí krok
  const settled = shown === index;
  const next = () => {
    if (!settled) return;
    setHistory([...history, index]);
    go(index + 1);
  };
  const back = () => {
    if (!settled) return;
    setHistory(history.slice(0, -1));
    go(history[history.length - 1]);
  };
  const skipAll = useCallback(() => void finish(false), [finish]);

  if (!active) return null;
  // Zobrazený krok ostáva na obrazovke, kým sa na TEJ ISTEJ stránke hľadá ďalší (bez bliknutia).
  // Pri prechode na inú sekciu sa obrazovka len stlmí, kým sa nová stránka nenačíta.
  const current = steps[index];
  const step =
    shown !== null && current && steps[shown].path === current.path && pathname === current.path ? steps[shown] : null;
  return (
    <TourBubble
      // nová sekcia = nové meranie (bez preskoku zvýraznenia zo starej stránky)
      key={step ? step.path : "wait"}
      step={step}
      dots={{ count: (steps[steps.length - 1]?.section ?? 0) + 1, active: current?.section ?? 0 }}
      onBack={history.length > 0 ? back : undefined}
      onNext={next}
      last={shown === steps.length - 1}
      onSkip={skipAll}
    />
  );
}
