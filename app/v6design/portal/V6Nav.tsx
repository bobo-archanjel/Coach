"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoMark } from "@/app/components/LogoMark";
import { TodayIcon, TrainingIcon, FoodIcon, DiaryIcon, ChatIcon, AiIcon, ProfileIcon } from "@/app/portal/icons";
import s from "./styles/portal.module.css";

const BASE = "/v6design/portal";

const NAV_ITEMS = [
  { href: BASE, label: "Dnes", Icon: TodayIcon, match: (p: string) => p === BASE },
  { href: `${BASE}/trening`, label: "Tréning", Icon: TrainingIcon, match: (p: string) => p.startsWith(`${BASE}/trening`) },
  { href: `${BASE}/strava`, label: "Strava", Icon: FoodIcon, match: (p: string) => p.startsWith(`${BASE}/strava`) },
  { href: `${BASE}/dennik`, label: "Denník", Icon: DiaryIcon, match: (p: string) => p.startsWith(`${BASE}/dennik`) },
  { href: `${BASE}/chat`, label: "Chat", Icon: ChatIcon, match: (p: string) => p.startsWith(`${BASE}/chat`) },
  // AI Kouč len pre klientov s prideleným trénerom — rovnako ako PortalNav.
  { href: `${BASE}/ai-kouc`, label: "AI Kouč", Icon: AiIcon, match: (p: string) => p.startsWith(`${BASE}/ai-kouc`) },
  { href: `${BASE}/profil`, label: "Profil", Icon: ProfileIcon, match: (p: string) => p.startsWith(`${BASE}/profil`) },
];

/**
 * Navigácia v6 — tie isté položky, podmienky (AI Kouč, bodka neprečítanej správy)
 * a skrývanie pri otvorenej klávesnici ako PortalNav. Mobil: plávajúca sklenená
 * lišta dole. Počítač (od 880px): bočný panel ako trénerov dashboard v6 — logo,
 * položky pod sebou a klient dole (odkaz na Profil); hlavička sa skryje.
 */
export function V6Nav({
  chatUnread = false,
  aiKoucVisible = true,
  displayName = null,
}: {
  chatUnread?: boolean;
  aiKoucVisible?: boolean;
  displayName?: string | null;
}) {
  const pathname = usePathname();
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
      <Link href={BASE} className={s.v6SideBrand}>
        <LogoMark className={s.v6BrandMark} />
        <span className={s.v6BrandText}>FitPilot</span>
      </Link>
      <nav
        className={`${s.v6Nav} ${keyboardOpen ? s.v6NavHidden : ""}`}
        aria-label="Klientsky portál"
        aria-hidden={keyboardOpen || undefined}
      >
        {items.map(({ href, label, Icon, match }) => {
          const active = match(pathname);
          const showDot = href === `${BASE}/chat` && chatUnread && !active;
          return (
            <Link
              key={href}
              href={href}
              className={`${s.v6NavItem} ${active ? s.v6NavItemOn : ""}`}
              aria-current={active ? "page" : undefined}
            >
              <span className={s.v6NavIconWrap}>
                <Icon className={s.v6NavIcon} />
                {showDot && <span className={s.v6NavDot} aria-hidden="true" />}
              </span>
              {label}
              {showDot && <span className={s.srOnly}> (nová správa)</span>}
            </Link>
          );
        })}
      </nav>
      <Link
        href={`${BASE}/profil`}
        className={`${s.v6SideUser} ${pathname.startsWith(`${BASE}/profil`) ? s.v6SideUserOn : ""}`}
      >
        <span className={s.v6SideAvatar} aria-hidden="true">
          {displayName?.trim().charAt(0).toUpperCase() || "?"}
        </span>
        <span className={s.v6SideName}>{displayName?.trim() || "Profil"}</span>
      </Link>
    </aside>
  );
}
