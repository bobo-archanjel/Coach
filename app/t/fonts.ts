// Písma šablón verejnej stránky — samostatne hostované cez next/font (žiadne externé požiadavky v prehliadači).
// (subsets sa musia zadať doslova — next/font ich číta pri preklade.) Latin + latin-ext kvôli slovenskej a českej diakritike. Premenné sa nasadzujú LEN na koreň šablóny
// (TrainerPublicPage), takže ostatné časti appky ich nenačítavajú do štýlov. Každá šablóna má najviac 2 rodiny
// (Inter pre telo športu a minimalu je to isté písmo ako v appke, preto sa berie jeho premenná z layoutu).
// `preload: false` pri šablónach, ktoré nie sú predvolené: prehliadač stiahne len písmo, ktoré sa naozaj použije.

import { Fraunces, Nunito, Oswald, Playfair_Display, Plus_Jakarta_Sans } from "next/font/google";
import type { TemplateId } from "@/lib/publicPage/templates";

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin", "latin-ext"], variable: "--tpl-font-body", display: "swap" });

const oswald = Oswald({ subsets: ["latin", "latin-ext"], variable: "--tpl-font-display", display: "swap", preload: false });

const fraunces = Fraunces({ subsets: ["latin", "latin-ext"], variable: "--tpl-font-display", display: "swap", preload: false, style: ["normal", "italic"], axes: ["opsz"] });

const nunito = Nunito({ subsets: ["latin", "latin-ext"], variable: "--tpl-font-body", display: "swap", preload: false });
const playfair = Playfair_Display({ subsets: ["latin", "latin-ext"], variable: "--tpl-font-display", style: ["normal", "italic"], display: "swap", preload: false });

/** Trieda(y) s premennými písma pre koreň danej šablóny. */
export const TEMPLATE_FONT_CLASS: Record<TemplateId, string> = {
  klasik: jakarta.variable,
  sport: oswald.variable,
  minimal: fraunces.variable,
  wellness: `${nunito.variable} ${playfair.variable}`,
};
