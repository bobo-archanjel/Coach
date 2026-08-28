import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/prihlasenie");
  }

  // Symetrický guard k app/portal/layout.tsx (ten posiela trénera na /dashboard) —
  // klient sa sem doteraz vedel dostať priamou URL bez presmerovania na svoj portál.
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role === "client") {
    redirect("/portal");
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
