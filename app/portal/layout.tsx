import type { Metadata } from "next";
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

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.viewport}>
      <div className={styles.column}>
        <div hidden aria-hidden="true" dangerouslySetInnerHTML={{ __html: `<!--\n${DIRECTION_CONTRACT}\n-->` }} />
        <main className={styles.main}>{children}</main>
        <PortalNav />
      </div>
    </div>
  );
}
