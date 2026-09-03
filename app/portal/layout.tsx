import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient, getUser } from "@/lib/supabase/server";
import { PortalNav } from "./PortalNav";
import styles from "./portal.module.css";

export const metadata: Metadata = {
  title: "FitPilot — Portál",
  description: "Tvoj dnešný tréning a plán týždňa na jednom mieste.",
};

/* Direction contract — kompozícia "Oblúk tréningového dňa", seed 7c5000e8.
   Emitované ako HTML komentár do buildu (greppateľné, prežije produkčný build). */
const DIRECTION_CONTRACT = `impeccable direction contract · seed 7c5000e8 · surface /portal
THESIS: Home je oblúk tréningového dňa — príprava, práca, dozvuk — čítaný zhora nadol
  ako priebeh jednej tréningovej jednotky; odmieta mriežku status-dlaždíc trénerskeho dashboardu.
OWN-WORLD: FitPilot grafit (--ink) s vrstvenými ember panelmi (--ink-2/-3), Signal Coral (--iron-red)
  nesie postup a primárnu akciu, Amber (--plate-yellow) kontext trénera a "dnes", Inter, zaoblenie 9/12px,
  pilulkové chipy. Podpisový prvok: coral prstenec postupu obopínajúci dnešný blok cvikov.
STORY: Klient otvorí portál v šatni, prečíta odkaz trénera, vidí presne čo cvičiť dnes a koľko
  z toho ostáva, spustí tréning. Séria a týždeň dávajú kontinuitu bez rozptýlenia.
FIRST VIEWPORT: hore dátum + pozdrav menom + odkaz trénera v amber páse; pod tým panel dňa —
  prstenec postupu (0/6, 0 %) vľavo, názov a fokus dňa vpravo, zoznam cvikov, coral CTA
  "Začať tréning →" na spodku panela v dosahu palca; séria a týždenný pás až pod foldom.
FORM: "Oblúk tréningového dňa" — kandidát 6 z môjho zoznamu (vedúci roll), seed 7c5000e8.
SIGNATURE: prstenec postupu sa pri načítaní poskladá — obkreslí sa ghost dráha, dosadne štartový bod
  a dokreslí coral hodnota (exponential ease-out); jediný autorský moment, funguje aj pri stave 0/6;
  žiadne opakované entrance animácie po sekciách.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict,
  DESIGN.md, and every shipping raster carrying its provenance`;

/**
 * Auth guard + mobilný shell pre celý /portal. Portál je klientsky povrch:
 * bez session → /prihlasenie, tréner → /dashboard. Prázdne stavy (neprepojený
 * klient, chýbajúci plán) rieši samotná obrazovka cez lib/portal/data.ts.
 *
 * DEV výnimka: keď beží `next dev` a nie je session (napr. lokálne bez platných
 * Supabase kľúčov), guard neredirectuje — nech sa dá pozerať povrch cez
 * `/portal?preview=ok|unlinked|no_plan|error`. V produkcii je guard nepodmienený.
 */
const DEV_OPEN = process.env.NODE_ENV !== "production";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await getUser();

  let chatUnread = false;
  let aiKoucVisible = false;
  if (!user) {
    if (!DEV_OPEN) redirect("/prihlasenie");
  } else {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.role === "trainer") {
      redirect("/dashboard");
    }

    // Nezávislé dopyty — paralelne namiesto sekvenčne (dva samostatné round-tripy
    // na Supabase navyše na KAŽDÚ navigáciu v portáli, predtým čakali jeden na druhý).
    const [{ count }, { data: clientRow }] = await Promise.all([
      // neprečítaná správa od trénera ALEBO systémová (napr. GDPR zmazanie, 0019) → bodka na tabe Chat
      supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .in("sender", ["trainer", "system"])
        .is("read_at", null),
      // AI Kouč len pre klientov s prideleným trénerom (dohodnuté v Kroku 4b).
      supabase
        .from("clients")
        .select("trainer_id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
    ]);
    chatUnread = (count ?? 0) > 0;
    aiKoucVisible = Boolean(clientRow?.trainer_id);
  }

  return (
    <div className={styles.viewport}>
      {/* Sibling ku .column (nie vnorená) — nad 880px sa stáva ľavým sidebarom
          v CSS grid .viewport, presne ako app/dashboard/layout.tsx. Pod 880px
          ostáva position:fixed bottom nav, DOM poradie tam nehrá rolu. */}
      <PortalNav chatUnread={chatUnread} aiKoucVisible={aiKoucVisible} />
      <div className={styles.column}>
        <div hidden aria-hidden="true" dangerouslySetInnerHTML={{ __html: `<!--\n${DIRECTION_CONTRACT}\n-->` }} />
        <main className={styles.main}>{children}</main>
      </div>
    </div>
  );
}
