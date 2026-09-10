// FitPilot — AI blok: deterministický klasifikátor témy pre agregované AI Kouč
// insighty trénera (feature/AI). AI Kouč je súkromná konverzácia (0017) — tréner
// nikdy nevidí obsah správy, len tému z tohto PEVNÉHO zoznamu (nikdy voľný text,
// nikdy časť správy) a len agregovane cez get_ai_topic_insights (migrácia 0033,
// k-anonymita ≥3 klienti). Rovnaký "hrubý" keyword-match štýl ako healthFilter.ts.

/** Zdravotné témy sa klasifikujú len keď healthFilter.ts už zachytil zmienku o
    bolesti/nepohodlí (isHealthConcern) — inak by bežná otázka na cvik danej
    partie ("cviky na ramená") falošne vyzerala ako zdravotný signál. */
const BODY_PART_TOPICS: readonly [string, readonly string[]][] = [
  ["koleno", ["koleno", "kolena", "kolene", "kolien", "kolenom"]],
  ["chrbát", ["chrbát", "chrbat", "chrbtic", "krížoch", "krizoch", "driek"]],
  ["rameno", ["rameno", "ramena", "ramene", "plece", "pleca", "plecom"]],
  ["členok/členky", ["členok", "clenok", "členky", "clenky", "členku", "clenku"]],
  ["zápästie", ["zápästie", "zapastie", "zápästí", "zapasti"]],
  ["bedro/bok", ["bedro", "bedrá", "bedra", "bok", "boky"]],
  ["lakeť", ["lakeť", "laket", "lakte"]],
] as const;

/** Nezdravotné, ale stále užitočné skoré signály (motivácia, spánok, stres, hlad). */
const OTHER_TOPICS: readonly [string, readonly string[]][] = [
  ["motivácia", ["nechce sa mi", "chýba mi motivác", "chyba mi motivac", "vzdávam", "vzdavam", "nemám chuť cvičiť", "nemam chut cvicit"]],
  ["spánok/únava", ["nespavosť", "nespavost", "zle spím", "zle spim", "unaven", "únaven", "vyčerpan", "vycerpan"]],
  ["stres/úzkosť", ["stres", "úzkosť", "uzkost", "nervozn", "prepracovan"]],
  ["hlad/chute", ["strašný hlad", "strasny hlad", "chuť na sladk", "chut na sladk", "stále hladný", "stale hladny", "prejedám sa", "prejedam sa"]],
];

/**
 * Vráti pevnú kategóriu témy (nikdy voľný text) alebo null, ak správa
 * nezodpovedá žiadnej sledovanej téme. `isHealthConcern` = výsledok
 * `needsHealthEscalation()` (lib/ai/healthFilter.ts) na tej istej správe —
 * telesné partie sa klasifikujú len v tomto kontexte.
 */
export function classifyTopic(text: string, isHealthConcern: boolean): string | null {
  const lower = text.toLowerCase();

  if (isHealthConcern) {
    for (const [topic, keywords] of BODY_PART_TOPICS) {
      if (keywords.some((kw) => lower.includes(kw))) return topic;
    }
    return "iné zdravotné";
  }

  for (const [topic, keywords] of OTHER_TOPICS) {
    if (keywords.some((kw) => lower.includes(kw))) return topic;
  }
  return null;
}

/** Používateľsky čitateľná nálepka pre widget na /dashboard/analytika. */
export const TOPIC_LABELS: Record<string, string> = {
  koleno: "bolesť/nepohodlie v kolene",
  "chrbát": "bolesť chrbta",
  rameno: "bolesť/nepohodlie v ramene",
  "členok/členky": "bolesť v členku",
  "zápästie": "bolesť zápästia",
  "bedro/bok": "bolesť bedra/boku",
  "lakeť": "bolesť lakťa",
  "iné zdravotné": "iná zdravotná téma",
  "motivácia": "pokles motivácie",
  "spánok/únava": "spánok/únava",
  "stres/úzkosť": "stres/úzkosť",
  "hlad/chute": "hlad/chute",
};
