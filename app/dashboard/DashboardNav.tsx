"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoMark } from "../components/LogoMark";
import { SignOutButton } from "../components/SignOutButton";
import styles from "./dashboard.module.css";

const ClientsIcon = () => (
  <svg className={styles.navIcon} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.7" />
    <path d="M4 20c0-3.3 2.2-5.5 5-5.5s5 2.2 5 5.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    <circle cx="17" cy="9.5" r="2.2" stroke="currentColor" strokeWidth="1.6" />
    <path d="M13.5 20c.3-2.6 1.8-4.3 4-4.3s3.7 1.6 4 4.1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

const TrainingIcon = () => (
  <svg className={styles.navIcon} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M3 12h2M19 12h2M6.5 12h11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <rect x="4.5" y="8.5" width="2" height="7" rx="0.6" fill="currentColor" />
    <rect x="17.5" y="8.5" width="2" height="7" rx="0.6" fill="currentColor" />
    <rect x="2" y="9.7" width="1.5" height="4.6" rx="0.6" fill="currentColor" />
    <rect x="20.5" y="9.7" width="1.5" height="4.6" rx="0.6" fill="currentColor" />
  </svg>
);

const NutritionIcon = () => (
  <svg className={styles.navIcon} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M12 3c4.5 0 7.5 3.2 7.5 7.5 0 4.7-4 8-7.5 8-1.3 0-2.6-.3-3.7-.9L4 19l1.8-4.3C4.6 13.4 4.3 11.7 4.3 10 4.3 6.2 8 3 12 3Z"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinejoin="round"
    />
    <path d="M8.5 9.8c.7-1.5 1.8-2 2.5-1 .6.8-.2 1.5-.5 2.1-.4.7.2 1.4 1 1.4.9 0 1.6-.8 2.2-1.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);

const SettingsIcon = () => (
  <svg className={styles.navIcon} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.7" />
    <path
      d="M12 3.5v2M12 18.5v2M20.5 12h-2M5.5 12h-2M17.7 6.3l-1.4 1.4M7.7 16.3l-1.4 1.4M17.7 17.7l-1.4-1.4M7.7 7.7 6.3 6.3"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
    />
  </svg>
);

const NAV_ITEMS = [
  { href: "/dashboard", label: "Klienti", Icon: ClientsIcon, match: (p: string) => p === "/dashboard" || p.startsWith("/dashboard/klienti") },
  { href: "/dashboard/treningy", label: "Tréningy", Icon: TrainingIcon, match: (p: string) => p.startsWith("/dashboard/treningy") },
  { href: "/dashboard/vyziva", label: "Výživa", Icon: NutritionIcon, match: (p: string) => p.startsWith("/dashboard/vyziva") },
  { href: "/dashboard/nastavenia", label: "Nastavenia", Icon: SettingsIcon, match: (p: string) => p.startsWith("/dashboard/nastavenia") },
];

export function DashboardNav() {
  const pathname = usePathname();

  return (
    <aside className={styles.sidebar}>
      <Link href="/dashboard" className={styles.sidebarBrand}>
        <LogoMark className={styles.logoMark} />
        FitPilot
      </Link>

      <nav className={styles.navList} aria-label="Trénerský dashboard">
        {NAV_ITEMS.map(({ href, label, Icon, match }) => {
          const active = match(pathname);
          return (
            <Link
              key={href}
              href={href}
              className={`${styles.navLink} ${active ? styles.navLinkActive : ""}`}
              aria-current={active ? "page" : undefined}
            >
              <Icon />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className={styles.sidebarFoot}>
        <SignOutButton />
      </div>
    </aside>
  );
}
