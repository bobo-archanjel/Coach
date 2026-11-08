// The five consolidated scenes of the "Posilňovňa" scroll-world — a single
// continuous forward camera walkthrough (scroll-world skill, Architecture A:
// no connectors, each leg's start frame is the previous leg's actual last
// rendered frame). Consolidated from the original nine-station product
// mapping down to five beats to fit the agreed credit budget, still covering
// every product domain: hero/brand, workout logging + plan builder (shared
// training-floor beat), nutrition, AI coach, pricing + final CTA.
export interface Scene {
  id: string;
  label: string;
  accent: string; // DESIGN.md token hex, single-accent-per-role rule
  eyebrow: string;
  title: string;
  body: string;
  tags: string[];
  cta?: { label: string; href: string };
}

export const SCENES: Scene[] = [
  {
    id: "reception",
    label: "Vitaj",
    accent: "#e0402a", // --iron-red
    eyebrow: "FitPilot",
    title: "Tvoja trénerská prax. Konečne pod kontrolou.",
    body: "Klienti, tréning, výživa a AI kouč — jedna appka namiesto Excelu, WhatsAppu a troch ďalších nástrojov.",
    tags: ["Klienti", "Tréning", "Výživa", "AI kouč"],
  },
  {
    id: "training",
    label: "Tréning",
    accent: "#e0402a",
    eyebrow: "Tréning",
    title: "Rovnaké dáta, iný pohľad.",
    body: "Tréner naplánuje deň v builderi, klient ho v posilňovni odcvičí a odklikne — presne to, čo má naplánované.",
    tags: ["Plán dňa", "Odklikávanie tréningu", "Progres"],
  },
  {
    id: "nutrition",
    label: "Výživa",
    accent: "#e6b23a", // --plate-yellow
    eyebrow: "Výživa",
    title: "Jedálniček tak isto podrobne ako tréning.",
    body: "Makrá, kalorický cieľ a food diary — výživa žije vedľa tréningu, nie v inej appke.",
    tags: ["Makrá", "Kalorický cieľ", "Food diary"],
  },
  {
    id: "ai",
    label: "AI kouč",
    accent: "#7f8a95", // --steel — calm neutral tone for the AI moment
    eyebrow: "AI kouč",
    title: "AI, ktorý si pamätá kontext.",
    body: "Súkromná konverzácia klient↔AI — tréner dostane len krátke FYI pri eskalácii.",
    tags: ["Súkromný chat", "Eskalácia", "Kontext"],
  },
  {
    id: "pricing",
    label: "Predplatné",
    accent: "#e0402a",
    eyebrow: "Predplatné",
    title: "Obaja idú spať s istotou na zajtra.",
    body: "Jeden pokojný cenník pre trénera, orientačne od 15 €/mes. Tréner vie, že plán sedí. Klient vie, čo ho zajtra čaká.",
    tags: ["Od 15 €/mes", "14 dní zdarma"],
    cta: { label: "Začať 14-dňovú skúšku", href: "/prihlasenie#register" },
  },
];
