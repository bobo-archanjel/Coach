// i18n-ignore-file: kľúčové slová (SK aj CZ) na výber modelu AI Kouča, nie text pre používateľa
// FitPilot — AI Kouč: deterministický výber modelu podľa správy klienta.
// Bežný chat ide na najlacnejší model (Haiku); drahší (Sonnet) len pri úlohách, kde
// sa kvalita naozaj prejaví a ktoré sú zriedkavé:
//  (a) návrh tréningu / tréningovej rutiny ("navrhni mi tréning na nohy"),
//  (b) zostavenie jedálnička na celý deň ("čo mám zjesť do konca dňa").
// Žiadne volanie modelu na rozhodnutie (to by stálo viac než ušetrí) — čisté regexy nad
// normalizovaným textom (bez diakritiky), pokrývajú SK aj CZ skloňovanie. Radšej
// pomalšie vyhodnotenie ako falošne drahé: pri pochybnosti vyhráva Haiku.

import { normalizeForMatching } from "./healthFilter";

export type ChatComplexReason = "workout" | "meal_plan";

// "navrhni / zostav / sestav / vytvor / pripravi / napis / vymysli / poskladaj / daj mi …"
const DESIGN_VERB =
  /\b(navrh\w*|zostav\w*|sestav\w*|vytvor\w*|vytvar\w*|priprav\w*|napis\w*|napln\w*|vymysl\w*|vymys\w*|poskladaj\w*|poskladej\w*|nachystaj\w*|rozpis\w*|naplan\w*|naplanuj\w*|daj mi|dej mi|dajte mi|chcem|chci|potrebuj\w*|mozes mi|muzes mi|vies mi|umis mi|urob mi|udelej mi)\b/;

// Podstatné mená pre tréning ako CELOK (nie jediný cvik: "cvik" sem zámerne nepatrí).
const WORKOUT_NOUN =
  /\b(trening\w*|trenink\w*|cvicebn\w*|cviceni\w*|workout\w*|rutin\w*|fbw|split\w*|push pull legs|ppl|upper lower)\b/;
// "chcem/potrebujem …" samo osebe nestačí (chcem trénovať doma) — treba výraz pre PLÁN/rutinu.
const WORKOUT_PLAN_NOUN = /\b(plan\w*|rutin\w*|workout\w*|fbw|split\w*|program\w*|rozpis\w*)\b/;
const STRONG_VERB =
  /\b(navrh\w*|zostav\w*|sestav\w*|vytvor\w*|vytvar\w*|priprav\w*|napis\w*|napln\w*|vymysl\w*|vymys\w*|poskladaj\w*|poskladej\w*|nachystaj\w*|rozpis\w*|naplan\w*|urob mi|udelej mi)\b/;
// Výmena cviku nie je návrh tréningu — rieši ju bežný (lacný) model s nástrojmi.
const SWAP_WORDS = /\b(namiesto|misto|nahrad\w*|vymen\w*|vymenit|zamen\w*|zamenit|alternat\w*)\b/;

const MEAL_NOUN = /\b(jedalnic\w*|jidelnic\w*|menu|stravovac\w*|rozpis (jedal|stravy|jidel)\w*)\b/;
// rozsah "na celý deň"
const DAY_SCOPE =
  /\b(na (cely|cele|cel[ey]) (den|dnes)|na cely den|na den|na dnes|na dnesek|na dnesni den|na dnesny den|na zajtra|na zitra|do konca dna|do konce dne|do vecera|zvysok dna|zbytek dne|zbytek dnes|zvysok dnes|cely den|celeho dna|celeho dne|na dnes a zajtra)\b/;
const EAT_WORD = /\b(jest|jist|zjest|zjist\w*|zjem|zjedz\w*|jedl\w*|jidl\w*|jedal\w*|stravu|stravy|stravov\w*|najest|najist|dat si|davat si|mam jest|mam zjest)\b/;
// "čo mám zjesť do konca dňa" — bez slovesa na návrh
const REST_OF_DAY = /\b(do konca dna|do konce dne|zvysok dna|zbytek dne|zbytek dnes|zvysok dnes|do vecera)\b/;

export interface ChatRoute {
  /** true = použiť drahší model (AI_MODEL.CHAT_COMPLEX) */
  complex: boolean;
  reason: ChatComplexReason | null;
}

/** Rozhodne, či správa žiada návrh tréningu alebo jedálnička na celý deň (→ drahší model). */
export function classifyChatRoute(text: string): ChatRoute {
  const n = normalizeForMatching(text).slice(0, 1500);

  // --- jedálniček na deň ---
  if (MEAL_NOUN.test(n) && (DESIGN_VERB.test(n) || DAY_SCOPE.test(n))) {
    return { complex: true, reason: "meal_plan" };
  }
  // "čo mám zjesť do konca dňa", "navrhni mi jedlá na celý deň"
  if (REST_OF_DAY.test(n) && EAT_WORD.test(n)) return { complex: true, reason: "meal_plan" };
  if (DESIGN_VERB.test(n) && DAY_SCOPE.test(n) && EAT_WORD.test(n)) return { complex: true, reason: "meal_plan" };

  // --- návrh tréningu ---
  if (!SWAP_WORDS.test(n) && WORKOUT_NOUN.test(n) && DESIGN_VERB.test(n)) {
    // slabé slovesá ("chcem", "daj mi") berieme len s výrazom pre plán/rutinu; silné
    // ("navrhni", "zostav") stačia samy ("navrhni mi tréning na nohy")
    if (STRONG_VERB.test(n) || WORKOUT_PLAN_NOUN.test(n)) return { complex: true, reason: "workout" };
  }
  return { complex: false, reason: null };
}
