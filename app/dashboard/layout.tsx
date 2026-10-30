import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { createClient, getProfile, getUser } from "@/lib/supabase/server";
import { DashboardNav } from "./DashboardNav";
import { dashStyles, isV6Dashboard, v6Theme } from "@/app/dashboard/dashSkin";
import { V6DashSkin } from "@/app/v6design/dashboard/V6DashSkin";
import { v6ThemeColor } from "@/app/v6design/theme";
import tokens from "@/app/v6design/styles/tokens.module.css";

export const metadata: Metadata = {
  title: "FitPilot — Dashboard",
};

/** Farba stavového riadku len pri dizajnovom experimente v6 (svetlá/tmavá téma). */
export async function generateViewport(): Promise<Viewport> {
  if (!(await isV6Dashboard())) return {};
  return { themeColor: v6ThemeColor(await v6Theme()) };
}

/**
 * Auth guard + shell pre celý /dashboard. Klienti bežia na reálnych Supabase dátach
 * (tabuľka `clients`, RLS scoped na trainer_id). Tréningy/Výživa sú zatiaľ honestné
 * "ešte nepostavené" — čakajú na tréningový builder a nutričný modul.
 */
/** DEV: `next dev` bez session (lokál bez platných Supabase kľúčov) — nechá prejsť,
    nech sa dajú pozerať povrchy cez `?preview=`. V produkcii guard nepodmienený.
    Symetrické s app/portal/layout.tsx. */
const DEV_OPEN = process.env.NODE_ENV === "development";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const styles = await dashStyles();
  const {
    data: { user },
  } = await getUser();

  let unreadCount = 0;
  if (!user) {
    if (!DEV_OPEN) redirect("/prihlasenie");
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

  const shell = (
    <div className={styles.shell}>
      <DashboardNav unreadCount={unreadCount} />
      <main className={styles.content}>
        <div className={styles.wrap}>{children}</div>
      </main>
    </div>
  );
  if (!(await isV6Dashboard())) return shell;

  // Dizajnový experiment v6 (cookie z /v6design/dashboard) — ten istý dashboard,
  // koreň s tokenmi/témou a štýly v6 pre klientske komponenty (SkinProvider).
  return (
    <div className={tokens.root} data-theme={await v6Theme()} data-v6-root="">
      <V6DashSkin>{shell}</V6DashSkin>
    </div>
  );
}
