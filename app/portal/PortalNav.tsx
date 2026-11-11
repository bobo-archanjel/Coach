"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoMark } from "@/app/components/LogoMark";
import { NavLinkPendingSignal } from "@/app/components/NavigationProgress";
import { NotificationBellSlot } from "./NotificationBell";
import { TodayIcon, TrainingIcon, FoodIcon, DiaryIcon, ChatIcon, AiIcon } from "@/app/portal/icons";
import s from "./portal.module.css";

const BASE = "/portal";

/** `tour` = kotva kroku onboarding návodu (lib/onboarding/tourSteps.ts, data-tour). */
const NAV_ITEMS: { href: string; label: "today" | "training" | "nutrition" | "diary" | "chat" | "aiCoach"; Icon: (p: { className?: string }) => React.ReactElement; tour: string | null; match: (p: string) => boolean }[] = [
  { href: BASE, label: "today", Icon: TodayIcon, tour: "nav-today", match: (p: string) => p === BASE },
  { href: `${BASE}/trening`, label: "training", Icon: TrainingIcon, tour: "nav-trening", match: (p: string) => p.startsWith(`${BASE}/trening`) },
  { href: `${BASE}/strava`, label: "nutrition", Icon: FoodIcon, tour: "nav-strava", match: (p: string) => p.startsWith(`${BASE}/strava`) },
  { href: `${BASE}/dennik`, label: "diary", Icon: DiaryIcon, tour: "nav-dennik", match: (p: string) => p.startsWith(`${BASE}/dennik`) },
  { href: `${BASE}/chat`, label: "chat", Icon: ChatIcon, tour: "nav-chat", match: (p: string) => p.startsWith(`${BASE}/chat`) },
  // AI Kouč len pre klientov s prideleným trénerom — viď aiKoucVisible nižšie.
  { href: `${BASE}/ai-kouc`, label: "aiCoach", Icon: AiIcon, tour: null, match: (p: string) => p.startsWith(`${BASE}/ai-kouc`) },
];

/**
 * Navigácia portálu — položky, podmienky (AI Kouč, bodka neprečítanej správy)
 * a skrývanie pri otvorenej klávesnici. Mobil: plávajúca sklenená lišta dole. Počítač (od 880px): bočný panel ako trénerov dashboard v6 — logo,
 * položky pod sebou a klient dole (odkaz na Profil); hlavička sa skryje.
 */
export function PortalNav({
  chatUnread = false,
  aiKoucVisible = true,
  displayName = null,
}: {
  chatUnread?: boolean;
  aiKoucVisible?: boolean;
  displayName?: string | null;
}) {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const items = aiKoucVisible ? NAV_ITEMS : NAV_ITEMS.filter((item) => item.href !== `${BASE}/ai-kouc`);

  // Otvorená mobilná klávesnica — visualViewport je spoľahlivejší signál než CSS
  // jednotky (rovnaká logika ako PortalNav); lišta by inak visela nad klávesnicou.
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => {
      setKeyboardOpen(window.innerHeight - vv.height > 150);
    };
    vv.addEventListener("resize", onResize);
    onResize();
    return () => vv.removeEventListener("resize", onResize);
  }, []);

  return (
    <aside className={s.v6Side}>
      <div className={s.v6SideTopRow}>
        <Link href={BASE} className={s.v6SideBrand}>
          <LogoMark className={s.v6BrandMark} />
          <span className={s.v6BrandText}>FitPilot</span>
        </Link>
        <NotificationBellSlot placement="side" />
      </div>
      <nav
        className={`${s.v6Nav} ${keyboardOpen ? s.v6NavHidden : ""}`}
        aria-label={t("clientLabel")}
        aria-hidden={keyboardOpen || undefined}
      >
        {items.map(({ href, label, Icon, tour, match }) => {
          const active = match(pathname);
          const showDot = href === `${BASE}/chat` && chatUnread && !active;
          return (
            <Link
              key={href}
              href={href}
              data-tour={tour ?? undefined}
              className={`${s.v6NavItem} ${active ? s.v6NavItemOn : ""}`}
              aria-current={active ? "page" : undefined}
            >
              <span className={s.v6NavIconWrap}>
                <Icon className={s.v6NavIcon} />
                {showDot && <span className={s.v6NavDot} aria-hidden="true" />}
              </span>
              {t(label)}
              {showDot && <span className={s.srOnly}>{t("newMessage")}</span>}
              <NavLinkPendingSignal id={href} />
            </Link>
          );
        })}
      </nav>
      <Link
        href={`${BASE}/profil`}
        className={`${s.v6SideUser} ${pathname.startsWith(`${BASE}/profil`) ? s.v6SideUserOn : ""}`}
        data-tour="nav-profil"
        aria-current={pathname.startsWith(`${BASE}/profil`) ? "page" : undefined}
      >
        <span className={s.v6SideAvatar} aria-hidden="true">
          {displayName?.trim().charAt(0).toUpperCase() || "?"}
        </span>
        <span className={s.v6SideName}>{displayName?.trim() || t("profile")}</span>
      </Link>
    </aside>
  );
}
