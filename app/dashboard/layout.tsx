import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DashboardNav } from "./DashboardNav";
import styles from "./dashboard.module.css";

export const metadata: Metadata = {
  title: "FitPilot — Dashboard",
};

/**
 * Auth guard + shell pre celý /dashboard. Sekcie (Klienti/Tréningy/Výživa/Nastavenia)
 * bežia na mock dátach (lib/mock/dashboard.ts) — len prihlásenie/odhlásenie je skutočný
 * Supabase call, zvyšný obsah je frontend-only, kým nebude postavené pridávanie klientov.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/prihlasenie");
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
