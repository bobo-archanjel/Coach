import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "./SignOutButton";

/**
 * Placeholder trénerského dashboardu — potvrdzuje, že auth flow funguje end-to-end.
 * Skutočný dashboard (klienti, tréningy, AI) je samostatná dizajnová aj implementačná úloha
 * (viď DESIGN.md "Open decisions").
 */
export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/prihlasenie");
  }

  const name = (user.user_metadata?.full_name as string | undefined) ?? user.email;

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        padding: 24,
        textAlign: "center",
      }}
    >
      <h1 style={{ fontSize: "2rem" }}>Vitaj, {name}.</h1>
      <p style={{ color: "var(--paper-dim)", maxWidth: "48ch" }}>
        Toto je zatiaľ len placeholder — potvrdzuje, že prihlásenie a registrácia cez Supabase
        fungujú. Skutočný dashboard (klienti, tréningy, AI) je ďalšia úloha.
      </p>
      <SignOutButton />
    </main>
  );
}
