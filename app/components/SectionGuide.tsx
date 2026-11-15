"use client";

// FitPilot — sprievodcovia hlbších okien (feature/sprievodca-sekcii). Plynulý sprievodca
// (OnboardingTour) prejde sekcie z menu; okná, na ktoré sa sám nedostane (builder, detail
// klienta, zapisovanie tréningu — lib/onboarding/guides.ts), vysvetlí tento pri ich PRVOM
// otvorení. Každý sa spustí sám raz — zoznam videných je v účte (GET/POST
// /api/onboarding/guides, migrácia 0060); „Spustiť návod znova“ ho vynuluje.
//
// Sám sa spustí, len keď:
//  - zoznam videných je známy a sprievodca v ňom nie je,
//  - jeho povinné prvky sú na stránke (dve kontroly po sebe — obsah sa donačítava),
//  - nebeží iný sprievodca, nie je otvorené okno a používateľ práve nepíše.
// Hneď pri spustení sa zapíše ako videný (ako úvodný sprievodca), aj keď ho používateľ
// nedokončí.

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { guidesFor, type GuideDef, type GuideRole } from "@/lib/onboarding/guides";
import { GUIDES_RESET_EVENT } from "./guideEvents";
import { findTourTarget, TourOverlay, type OverlayStep } from "./TourOverlay";

const CHECK_MS = 700;

/** Povinné prvky sprievodcu sú na stránke. */
function isReady(guide: GuideDef): boolean {
  if (guide.root && !findTourTarget(guide.root)) return false;
  return guide.steps.every((s) => s.optional || findTourTarget(s.target));
}

/** Iný sprievodca, otvorené okno alebo rozpísaný text — sprievodca nevyskočí do práce. */
function isBlocked(): boolean {
  if (document.querySelector("[data-tour-overlay], [role='dialog'], [role='alertdialog']")) return true;
  const el = document.activeElement;
  return el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
}

export function SectionGuide({ role }: { role: GuideRole }) {
  const t = useTranslations("tour");
  const pathname = usePathname();
  const search = useSearchParams().toString();
  // null = zoznam videných neznámy (ešte sa načítava / bez session / bez migrácie) → nič sa samo nespúšťa
  const [seen, setSeen] = useState<ReadonlySet<string> | null>(null);
  const [active, setActive] = useState<GuideDef | null>(null);

  const loadSeen = useCallback(async () => {
    try {
      const res = await fetch("/api/onboarding/guides", { cache: "no-store" });
      const json = res.ok ? ((await res.json()) as { auto: boolean; seen: string[] }) : null;
      setSeen(json?.auto ? new Set(json.seen) : null);
    } catch {
      setSeen(null);
    }
  }, []);
  useEffect(() => {
    void loadSeen();
    window.addEventListener(GUIDES_RESET_EVENT, loadSeen);
    return () => window.removeEventListener(GUIDES_RESET_EVENT, loadSeen);
  }, [loadSeen]);

  const candidates = useMemo(() => guidesFor(role, pathname, new URLSearchParams(search)), [role, pathname, search]);

  const start = useCallback(
    (guide: GuideDef) => {
      setActive(guide);
      if (!seen || seen.has(guide.id)) return;
      setSeen(new Set(seen).add(guide.id));
      void fetch("/api/onboarding/guides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: guide.id }),
        keepalive: true,
      }).catch(() => {});
    },
    [seen],
  );

  // automatické spustenie pri prvej návšteve
  useEffect(() => {
    if (active || !seen) return;
    const pending = candidates.filter((g) => !seen.has(g.id));
    if (pending.length === 0) return;
    let readyId: string | null = null;
    const timer = window.setInterval(() => {
      const guide = document.visibilityState === "visible" && !isBlocked() ? pending.find(isReady) : undefined;
      if (!guide) {
        readyId = null;
        return;
      }
      if (readyId !== guide.id) {
        readyId = guide.id; // prvá kontrola — spustí sa až pri druhej (ustálená stránka)
        return;
      }
      window.clearInterval(timer);
      start(guide);
    }, CHECK_MS);
    return () => window.clearInterval(timer);
  }, [active, seen, candidates, start]);

  const finish = useCallback(() => setActive(null), []);

  const steps = useMemo<OverlayStep[]>(() => {
    if (!active) return [];
    const text = (key: string, part: "title" | "body") => t(`guides.${active.id}.${key}.${part}` as Parameters<typeof t>[0]);
    return active.steps.map((s) => ({ target: s.target, title: text(s.key, "title"), body: text(s.key, "body") }));
  }, [active, t]);

  if (!active) return null;
  return <TourOverlay key={active.id} steps={steps} onFinish={finish} />;
}
