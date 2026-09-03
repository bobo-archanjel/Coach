import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getProfile, getUser } from "@/lib/supabase/server";
import { DashboardNav } from "./DashboardNav";
import styles from "./dashboard.module.css";

export const metadata: Metadata = {
  title: "FitPilot — Dashboard",
};

/**
 * Auth guard + shell pre celý /dashboard. Klienti bežia na reálnych Supabase dátach
 * (tabuľka `clients`, RLS scoped na trainer_id). Tréningy/Výživa sú zatiaľ honestné
 * "ešte nepostavené" — čakajú na tréningový builder a nutričný modul.
 */
/** DEV: `next dev` bez session (lokál bez platných Supabase kľúčov) — nechá prejsť,
    nech sa dajú pozerať povrchy cez `?preview=`. V produkcii guard nepodmienený.
    Symetrické s app/portal/layout.tsx. */
const DEV_OPEN = process.env.NODE_ENV !== "production";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const {
    data: { user },
  } = await getUser();

  if (!user) {
    if (!DEV_OPEN) redirect("/prihlasenie");
  } else {
    // Symetrický guard k app/portal/layout.tsx (ten posiela trénera na /dashboard) —
    // klient sa sem doteraz vedel dostať priamou URL bez presmerovania na svoj portál.
    const { data: profile } = await getProfile(user.id);
    if (profile?.role === "client") {
      redirect("/portal");
    }
  }

  return (
    <div className={styles.shell}>
      <DashboardNav />
      <main className={styles.content}>
        <div className={styles.wrap}>{children}</div>
      </main>
    </div>
  );
}
