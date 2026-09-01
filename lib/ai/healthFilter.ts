// FitPilot — AI blok, Krok 4: deterministický zdravotný pre-filter (Product
// Principle #5 — "zdravotné hranice sú tvrdé pravidlo"). Beží PRED každým
// volaním Claude, nie je to len systémový prompt — kľúčové slová sa kontrolujú
// v kóde, takže eskalácia funguje aj keby model niekedy zlyhal/ignoroval pokyn.
// Systémový prompt v lib/ai/chat.ts je len druhá, záložná vrstva pre opisné/
// preparafrázované zmienky, ktoré tento zoznam nezachytí.

const HEALTH_KEYWORDS = [
  "bolesť",
  "bolesti",
  "bolí",
  "boli ma",
  "bolí ma",
  "zranenie",
  "zranen",
  "praskl",
  "prask",
  "pichlo",
  "pichanie v",
  "opuch",
  "opuchnut",
  "kĺb",
  "kĺby",
  "vykĺben",
  "výron",
  "natiahnut",
  "natrhnut",
  "zlomenin",
  "zlomen",
  "závrat",
  "mdlob",
  "tlak na hrudi",
  "bolesť na hrudi",
  "dýchavičnosť",
  "necitlivosť",
  "mravčenie",
  "chrbtic",
  "krvác",
  "horúčk",
  "nevoľnosť",
] as const;

/**
 * True, ak text (otázka klienta) obsahuje náznak bolesti/zranenia/akútneho
 * zdravotného problému. Zámerne "hrubé" porovnanie podreťazcov (case-insensitive,
 * diakritika sa nezjednodušuje — vstup je slovenský chat) — radšej falošný
 * poplach navyše než premeškaná eskalácia.
 */
export function needsHealthEscalation(text: string): boolean {
  const lower = text.toLowerCase();
  return HEALTH_KEYWORDS.some((kw) => lower.includes(kw));
}

/** Pevný text poslaný klientovi pri eskalácii — nikdy negenerovaný modelom. */
export const HEALTH_ESCALATION_REPLY =
  "Pri bolesti, zranení alebo inom zdravotnom probléme ti nedokážem poradiť — to patrí do rúk tvojho trénera, nie AI. " +
  "Dal/a som mu o tom hneď vedieť v správach, ozve sa ti. Ak ide o akútny stav, neváhaj a vyhľadaj lekársku pomoc.";

/** Text vložený ako systémová správa do reálneho tréner↔klient vlákna. */
export function buildEscalationNoticeForTrainer(clientMessage: string): string {
  const trimmed = clientMessage.length > 300 ? `${clientMessage.slice(0, 300)}…` : clientMessage;
  return `⚠️ AI asistent upozorňuje: klient v AI chate spomenul možnú bolesť/zranenie: „${trimmed}“ — odporúčame ozvať sa mu čo najskôr.`;
}
