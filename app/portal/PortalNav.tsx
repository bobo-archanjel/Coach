"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoMark } from "../components/LogoMark";
import { SignOutButton } from "../components/SignOutButton";
import { TodayIcon, TrainingIcon, FoodIcon, DiaryIcon, ChatIcon, ProfileIcon } from "./icons";
import styles from "./portal.module.css";

const NAV_ITEMS = [
  { href: "/portal", label: "Dnes", Icon: TodayIcon, match: (p: string) => p === "/portal" },
  { href: "/portal/trening", label: "Tréning", Icon: TrainingIcon, match: (p: string) => p.startsWith("/portal/trening") },
  { href: "/portal/strava", label: "Strava", Icon: FoodIcon, match: (p: string) => p.startsWith("/portal/strava") },
  { href: "/portal/dennik", label: "Denník", Icon: DiaryIcon, match: (p: string) => p.startsWith("/portal/dennik") },
  { href: "/portal/chat", label: "Chat", Icon: ChatIcon, match: (p: string) => p.startsWith("/portal/chat") },
  { href: "/portal/profil", label: "Profil", Icon: ProfileIcon, match: (p: string) => p.startsWith("/portal/profil") },
];

/**
 * Pod 880px: fixná bottom tab bar (pôvodné mobilné správanie, nezmenené).
 * Nad 880px: ľavý sidebar (rovnaký vzor ako app/dashboard/DashboardNav) — .navShell
 * je vtedy sidebar kontajner, .navBrand a .navFoot (odhlásenie) sa zobrazia len tu,
 * kým na mobile ostávajú skryté (bottom bar má na ne príliš málo miesta).
 */
export function PortalNav() {
  const pathname = usePathname();

  return (
    <aside className={styles.navShell}>
      <Link href="/portal" className={styles.navBrand}>
        <LogoMark className={styles.navLogo} />
        FitPilot
      </Link>

      <nav className={styles.nav} aria-label="Klientsky portál">
        {NAV_ITEMS.map(({ href, label, Icon, match }) => {
          const active = match(pathname);
          return (
            <Link
              key={href}
              href={href}
              className={`${styles.navItem} ${active ? styles.navItemActive : ""}`}
              aria-current={active ? "page" : undefined}
            >
              <Icon className={styles.navIcon} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className={styles.navFoot}>
        <SignOutButton />
      </div>
    </aside>
  );
}
