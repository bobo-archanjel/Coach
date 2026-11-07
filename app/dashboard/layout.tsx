import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { createClient, getProfile, getUser } from "@/lib/supabase/server";
import { DashboardNav } from "./DashboardNav";
import styles from "@/app/dashboard/dashboard.module.css";
import { v6Theme } from "@/app/dashboard/dashTheme";
import { v6ThemeColor } from "@/app/v6design/theme";
import tokens from "@/app/v6design/styles/tokens.module.css";

export const metadata: Metadata = {
  title: "FitPilot — Dashboard",
};

/** Farba stavového riadku podľa témy (svetlá/tmavá/auto). */
export async function generateViewport(): Promise<Viewport> {
  return { themeColor: v6ThemeColor(await v6Theme()) };
}

/**
 * Auth guard + shell pre celý /dashboard. Klienti bežia na reálnych Supabase dátach
 * (tabuľka `clients`, RLS scoped na trainer_id).
 */
/** DEV: `next dev` bez session (lokál bez platných Supabase kľúčov) — nechá prejsť,
    nech sa dajú pozerať povrchy cez `?preview=`. V produkcii guard nepodmienený.
    Symetrické s app/portal/layout.tsx. */
const DEV_OPEN = process.env.NODE_ENV === "development";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const {
    data: { user },
  } = await getUser();

  let unreadCount = 0;
  if (!user) {
    if (!DEV_OPEN) redirect("/v6design/prihlasenie");
  } else {
    // Symetrický guard k app/portal/layout.tsx (ten posiela trénera na /dashboard) —
    // klient sa sem doteraz vedel dostať priamou URL bez presmerovania na svoj portál.
    // Celkový počet neprečítaných správ od klientov → odznak na nav položke "Správy"
    // (RLS messages_select scopuje na klientov tohto trénera, netreba filtrovať client_id).
    // Oba dopyty naraz (predtým počet čakal na profil — round-trip navyše pri každej
    // navigácii); redirect klienta až po nich, jeho počet sa jednoducho zahodí.
    const supabase = await createClient();
    const [{ data: profile }, { count }] = await Promise.all([
      getProfile(user.id),
      supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("sender", "client")
        .is("read_at", null),
    ]);
    if (profile?.role === "client") {
      redirect("/portal");
    }
    unreadCount = count ?? 0;
  }

  // koreň s tokenmi a témou dizajnu v6 (data-v6-root — sem idú aj okná cez createPortal)
  return (
    <div className={tokens.root} data-theme={await v6Theme()} data-v6-root="">
      <div className={styles.shell}>
        <DashboardNav unreadCount={unreadCount} />
        <main className={styles.content}>
          <div className={styles.wrap}>{children}</div>
        </main>
      </div>
    </div>
  );
}
