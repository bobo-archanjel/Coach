import { redirect } from "next/navigation";
import { createClient, getMyClient, getProfile, getUser } from "@/lib/supabase/server";

/**
 * Auth guard + údaje navigácie portálu — zdieľané /portal a /v6design/portal
 * (dizajnový experiment), nech oba vzhľady strážia a rátajú presne rovnako.
 * Portál je klientsky povrch: bez session → /prihlasenie, tréner → /dashboard.
 * Prázdne stavy (neprepojený klient, chýbajúci plán) rieši samotná obrazovka
 * cez lib/portal/data.ts.
 *
 * DEV výnimka: keď beží `next dev` a nie je session (napr. lokálne bez platných
 * Supabase kľúčov), guard neredirectuje — nech sa dá pozerať povrch cez
 * `/portal?preview=ok|unlinked|no_plan|error`. V produkcii je guard nepodmienený.
 */
const DEV_OPEN = process.env.NODE_ENV === "development";

export type PortalShell = {
  chatUnread: boolean;
  aiKoucVisible: boolean;
  /** celé meno klienta (profil, inak záznam klienta) — iniciála v hlavičke /v6design */
  displayName: string | null;
};

export async function loadPortalShell(): Promise<PortalShell> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await getUser();

  if (!user) {
    if (!DEV_OPEN) redirect("/prihlasenie");
    return { chatUnread: false, aiKoucVisible: false, displayName: null };
  }

  // Nezávislé dopyty — všetky tri naraz (predtým počet a klient čakali na profil,
  // round-trip navyše na KAŽDÚ navigáciu v portáli); redirect trénera až po nich.
  // getMyClient je request-cache-ovaný — stránka pod layoutom ho dostane zadarmo.
  const [{ data: profile }, { count }, { data: clientRow }] = await Promise.all([
    getProfile(user.id),
    // neprečítaná správa od trénera ALEBO systémová (napr. GDPR zmazanie, 0019) → bodka na tabe Chat
    supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .in("sender", ["trainer", "system"])
      .is("read_at", null),
    // AI Kouč len pre klientov s prideleným trénerom (dohodnuté v Kroku 4b).
    getMyClient(user.id),
  ]);

  if (profile?.role === "trainer") {
    redirect("/dashboard");
  }
  return {
    chatUnread: (count ?? 0) > 0,
    aiKoucVisible: Boolean(clientRow?.trainer_id),
    displayName: profile?.full_name ?? clientRow?.full_name ?? null,
  };
}
