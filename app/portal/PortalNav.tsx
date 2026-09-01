"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoWordmark } from "../components/LogoMark";
import { SignOutButton } from "../components/SignOutButton";
import { TodayIcon, TrainingIcon, FoodIcon, DiaryIcon, ChatIcon, AiIcon, ProfileIcon } from "./icons";
import styles from "./portal.module.css";

const NAV_ITEMS = [
  { href: "/portal", label: "Dnes", Icon: TodayIcon, match: (p: string) => p === "/portal" },
  { href: "/portal/trening", label: "Tréning", Icon: TrainingIcon, match: (p: string) => p.startsWith("/portal/trening") },
  { href: "/portal/strava", label: "Strava", Icon: FoodIcon, match: (p: string) => p.startsWith("/portal/strava") },
  { href: "/portal/dennik", label: "Denník", Icon: DiaryIcon, match: (p: string) => p.startsWith("/portal/dennik") },
  { href: "/portal/chat", label: "Chat", Icon: ChatIcon, match: (p: string) => p.startsWith("/portal/chat") },
  // AI Kouč sa pridáva podmienene (len klienti s prideleným trénerom) — viď aiKoucVisible nižšie.
  { href: "/portal/ai-kouc", label: "AI Kouč", Icon: AiIcon, match: (p: string) => p.startsWith("/portal/ai-kouc") },
  { href: "/portal/profil", label: "Profil", Icon: ProfileIcon, match: (p: string) => p.startsWith("/portal/profil") },
];

/**
 * Pod 880px: fixná bottom tab bar (pôvodné mobilné správanie, nezmenené).
 * Nad 880px: ľavý sidebar (rovnaký vzor ako app/dashboard/DashboardNav) — .navShell
 * je vtedy sidebar kontajner, .navBrand a .navFoot (odhlásenie) sa zobrazia len tu,
 * kým na mobile ostávajú skryté (bottom bar má na ne príliš málo miesta).
 */
export function PortalNav({
  chatUnread = false,
  aiKoucVisible = true,
}: {
  chatUnread?: boolean;
  /** false pre self-klientov bez trénera — AI Kouč zatiaľ vyžaduje prideleného trénera. */
  aiKoucVisible?: boolean;
}) {
  const pathname = usePathname();
  const items = aiKoucVisible ? NAV_ITEMS : NAV_ITEMS.filter((item) => item.href !== "/portal/ai-kouc");

  return (
    <aside className={styles.navShell}>
      <Link href="/portal" className={styles.navBrand}>
        <LogoWordmark className={styles.brandLogo} />
      </Link>

      <nav className={styles.nav} aria-label="Klientsky portál">
        {items.map(({ href, label, Icon, match }) => {
          const active = match(pathname);
          const showDot = href === "/portal/chat" && chatUnread && !active;
          return (
            <Link
              key={href}
              href={href}
              className={`${styles.navItem} ${active ? styles.navItemActive : ""}`}
              aria-current={active ? "page" : undefined}
            >
              <span className={styles.navIconWrap}>
                <Icon className={styles.navIcon} />
                {showDot && <span className={styles.navDot} aria-hidden="true" />}
              </span>
              {label}
              {showDot && <span className={styles.srOnly}> (nová správa)</span>}
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
