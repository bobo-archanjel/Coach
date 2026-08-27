"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { TodayIcon, TrainingIcon, FoodIcon, ChatIcon, ProfileIcon } from "./icons";
import styles from "./portal.module.css";

const NAV_ITEMS = [
  { href: "/portal", label: "Dnes", Icon: TodayIcon, match: (p: string) => p === "/portal" },
  { href: "/portal/trening", label: "Tréning", Icon: TrainingIcon, match: (p: string) => p.startsWith("/portal/trening") },
  { href: "/portal/strava", label: "Strava", Icon: FoodIcon, match: (p: string) => p.startsWith("/portal/strava") },
  { href: "/portal/chat", label: "Chat", Icon: ChatIcon, match: (p: string) => p.startsWith("/portal/chat") },
  { href: "/portal/profil", label: "Profil", Icon: ProfileIcon, match: (p: string) => p.startsWith("/portal/profil") },
];

export function PortalNav() {
  const pathname = usePathname();

  return (
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
  );
}
