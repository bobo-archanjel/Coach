// FitPilot — AI blok, Krok 4: deterministický zdravotný pre-filter (Product
// Principle #5 — "zdravotné hranice sú tvrdé pravidlo"). Beží PRED každým
// volaním Claude, nie je to len systémový prompt — kľúčové slová sa kontrolujú
// v kóde, takže eskalácia funguje aj keby model niekedy zlyhal/ignoroval pokyn.
// Systémový prompt v lib/ai/chat.ts je len druhá, záložná vrstva pre opisné/
// preparafrázované zmienky, ktoré tento zoznam nezachytí.
//
// feature/security: pôvodný zoznam poznal len slová s diakritikou v jednom tvare —
// pri teste zachytil 1 z 14 bežných formulácií ("bolest", "zavrat", angličtina,
// "tlak v hrudi", príznaky infarktu, sebapoškodenie prešli). Teraz:
//  - text sa normalizuje (bez diakritiky, malé písmená, opakované písmená zlúčené,
//    slovenčina/čeština/angličtina) a porovnáva sa cez vzory, nie zoznam podreťazcov,
//  - osobitná KRÍZOVÁ vetva (sebapoškodenie/suicidálne myšlienky): pevná odpoveď s
//    číslom tiesňovej linky a okamžité upozornenie trénera, NIKDY cesta cez model,
//  - "squeezed" kontrola chytá písanie s medzerami/bodkami ("b o l í m a"),
//  - radšej falošný poplach než premeškaná eskalácia (rovnaký princíp ako predtým).
// Regresný súbor testov: e2e/healthFilter.spec.ts (pozitívne aj negatívne vety).

import { promptSafe } from "./promptSafety";

/** Malé písmená, bez diakritiky, zlúčené 3+ opakované znaky ("boliiii" → "boli"), jednoduché medzery. */
export function normalizeForMatching(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .replace(/(.)\1{2,}/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/** Len písmená, bez medzier a interpunkcie — na chytanie "b o l í m", "z.a.b.i.t". */
function squeezed(normalized: string): string {
  return normalized.replace(/[^a-z]/g, "");
}

// ---------------------------------------------------------------- zdravotné vzory
// Porovnávajú sa nad normalizovaným (ASCII) textom. `\b` = hranica slova.
const HEALTH_PATTERNS: RegExp[] = [
  // bolesť (SK/CZ) — "bol"/"boli" samotné NIE (bol = bol som; boli = boli sme) — rieši accentBoli nižšie
  /\bbolest/, /\bbolav/, /\bbolel/, /\bboliev/, /\bbolim\b/, /\bboli (ma|me|mi|nas|ho|ju|to)\b/, /\bboli me\b/, /\bbolelo\b/,
  /\bpiche v\b/, /\bpichanie\b/, /\bpichlo\b/,
  // zranenie
  /\bzraneni/, /\bzranen/, /\bzranil/, /\bporanen/, /\buraz/, /\bnatiah/, /\bnatrhn/, /\bnatrh/, /\bvyvrkn/, /\bvykl(b|ub)/, /\bvyron/,
  /\bzlomen/, /\bpraskl/, /\bprask/, /\bopuch/, /\bopuchn/, /\bmodrin/, /\bkrvac/, /\bkrvaw/, /\bkrv(i|ou) (mi|z)\b/,
  // kĺby a chrbtica
  /\bklb\b/, /\bklby\b/, /\bklbov?\b/, /\bchrbtic/, /\bv krizoch\b/, /\bprietrz/,
  // srdce, dýchanie, vedomie
  /\bzavrat/, /\bzavraty\b/, /\bmdlob/, /\bomdlel/, /\bomdliev/, /\bomdlie/, /\bstrat\w*( som| sa)? vedom/, /\bbez vedomia\b/, /\bkolaps/,
  /\bdychavic/, /\bnemozem dychat/, /\bnedokazem dychat/, /\btazk\w* dychat/, /\bdusim sa\b/, /\bdusenie\b/, /\bnedostatok vzduchu\b/,
  /\btlak (na|v|pri|za) hrud/, /\bbolest (na|v|pri|za) hrud/, /\bhrud\w* (ma )?(tlac|pali|boli|zviera)/, /\bpichanie (na|v) hrud/,
  /\bpalpitac/, /\bbuchanie srdca\b/, /\bsrdce (mi )?(busi|tlka|preskakuje|rychlo|divne)/, /\bnepravidelny tep\b/, /\bvyzarov\w* (do|na) (ruk|cel|cesl|krk)/,
  /\bnecitliv/, /\bmravcen/, /\bzdreven/, /\bochrnut/, /\bochabnut/, /\bzachvat/, /\bepilep/, /\bkrc\b/,
  // horúčka, nevoľnosť, ostatné príznaky
  /\bhoruck/, /\bteplot/, /\bzimnic/, /\bnevoln/, /\bzvracal/, /\bzvracan/, /\bzvracam\b/, /\bhnack/, /\bslabo mi\b/, /\bje mi zle\b/, /\bzle mi (je|z)\b/, /\btocit sa mi\b/, /\btocenie hlavy\b/, /\bmigren/, /\bhlava (ma )?boli\b/,
  // lekár, diagnózy, lieky, tehotenstvo, poruchy príjmu potravy
  /\blekar/, /\blekarsk/, /\bnemocnic/, /\bambulanc/, /\bpohotovost/, /\boperaci/, /\bchirurg/, /\bdiagnoz/, /\blieky\b/, /\bliek na\b/, /\bpredpis\w* liek/,
  /\btehotn/, /\btehotenstv/, /\bpo porode\b/, /\bdojc/, /\bcukrovk/, /\bdiabet/, /\bvysok\w* tlak\b/, /\bkrvn\w* tlak\b/, /\bcholesterol/, /\bastm/,
  /\banorexi/, /\bbulimi/, /\bporuch\w* prijmu potravy\b/, /\bvyvracam\b/, /\bvyvolavam zvracanie\b/, /\bzvracam po jedle\b/,
  // angličtina
  /\bpain(ful)?\b/, /\bhurts?\b/, /\bhurting\b/, /\binjur/, /\bsprain/, /\bstrained (my|a)\b/, /\bpulled (a )?muscle\b/, /\btorn\b/, /\bfractur/, /\bbroken (bone|arm|leg|rib|wrist|ankle|finger)/,
  /\bswollen\b/, /\bswelling\b/, /\bdizz/, /\bfaint/, /\bnumb(ness)?\b/, /\btingl/, /\bchest (pain|tight|pressure|hurts)/, /\bpressure in (my )?chest\b/,
  /\bshort(ness)? of breath\b/, /\bcan.?t breathe\b/, /\bhard to breathe\b/, /\bheart (racing|pounding|skipping|attack)\b/, /\bbleed/, /\bfever\b/, /\bnausea/, /\bvomit/,
  /\bsurgery\b/, /\bpregnan/, /\bdiagnos/, /\bmedicat/, /\bdoctor\b/, /\bhospital\b/, /\beating disorder\b/, /\banorexi/, /\bbulimi/,
];

// "koleno boli" / "boli ma v kolene": "boli" bez diakritiky je nejednoznačné (boli sme), preto sa
// berie ako "bolí" len v blízkosti časti tela.
const BODY_PARTS =
  "koleno|kolena|kolene|kolien|kolenom|chrbat|chrbta|chrbtu|rameno|ramena|ramene|zapastie|zapastia|zapasti|clenok|clenky|clenku|lakel|lakte|lakti|bedro|bedra|bedre|kycel|kycle|krk|krku|hlava|hlavu|hlave|brucho|bruchu|zub|zuby|noha|nohy|noge|ruka|ruky|ruke|sval|svaly|svale|lytko|lytka|lytku|stehno|stehna|stehne|pata|pate|palec|prst|prsty|rebro|rebra|hrud|hrudnik|sija|sije|zadok|zadku";
const BODY_BOLI = [
  new RegExp("\\b(?:" + BODY_PARTS + ")\\b(?:\\s+\\w+){0,2}\\s+boli\\b"),
  new RegExp("\\bboli\\b(?:\\s+\\w+){0,2}\\s+(?:v|na|pod|za|pri)?\\s*(?:" + BODY_PARTS + ")\\b"),
];

// "bolí" (hurts) sa po odstránení diakritiky zhoduje s "boli" (were) — preto sa tento
// jediný prípad kontroluje nad pôvodným textom s diakritikou.
function accentBoli(rawLower: string): boolean {
  return /\bbolí/.test(rawLower.normalize("NFC"));
}

// Málo, ale jednoznačné kmene, ktoré sa kontrolujú aj v "squeezed" tvare (medzery/bodky).
const SQUEEZED_HEALTH = ["bolest", "bolima", "bolimi", "bolime", "zranen", "zavrat", "mdlob", "dychavic", "bolelo"];

// ---------------------------------------------------------------- krízové vzory
const CRISIS_PATTERNS: RegExp[] = [
  /\bsamovraz/, /\bsebavraz/, /\bsebevraz/, /\bsuicid/, /\bsebaposkod/,
  /\bzabit sa\b/, /\bzabijem sa\b/, /\bzabit se\b/, /\bzabiju se\b/, /\bchcem (sa )?zabit\b/,
  /\bchcem zomriet\b/, /\bchcem umriet\b/, /\bnechcem (uz )?zit\b/, /\bnechcem byt\b/, /\bnechcem sa (uz )?zobudit\b/,
  /\bskoncit (so zivotom|to cele|so vsetkym|s tym vsetkym)\b/, /\bskoncim (so zivotom|to)\b/, /\bmam dost zivota\b/, /\bzivot nema zmysel\b/, /\bnema zmysel zit\b/,
  /\bublizit si\b/, /\bublizim si\b/, /\bublizovat si\b/, /\bporezat sa\b/, /\brezem sa\b/, /\brezat sa\b/, /\bvziat si zivot\b/, /\bvezmem si zivot\b/,
  /\bkill (myself|me)\b/, /\bend my life\b/, /\bwant to die\b/, /\bwanna die\b/, /\bdon.?t want to (live|be alive)\b/, /\bself.?harm/, /\bhurt myself\b/, /\bsuicid/, /\bcut myself\b/,
];
const SQUEEZED_CRISIS = ["sebavraz", "sebevraz", "samovraz", "suicid", "zabitsa", "zabijemsa", "chcemzomriet", "killmyself", "endmylife", "wanttodie", "selfharm", "ublizitsi", "sebaposkod"];

/** True, ak text obsahuje náznak SEBAPOŠKODENIA / suicidálnych myšlienok — osobitná, prísnejšia vetva. */
export function isCrisisText(text: string): boolean {
  const n = normalizeForMatching(text);
  if (CRISIS_PATTERNS.some((re) => re.test(n))) return true;
  const sq = squeezed(n);
  return SQUEEZED_CRISIS.some((s) => sq.includes(s));
}

/**
 * True, ak text (otázka klienta) obsahuje náznak bolesti/zranenia/akútneho
 * zdravotného problému (aj krízy — kríza je vždy aj zdravotná téma). Zámerne "hrubé"
 * porovnanie nad normalizovaným textom — radšej falošný poplach navyše než
 * premeškaná eskalácia.
 */
export function needsHealthEscalation(text: string): boolean {
  if (isCrisisText(text)) return true;
  const rawLower = text.toLowerCase();
  if (accentBoli(rawLower)) return true;
  const n = normalizeForMatching(text);
  if (HEALTH_PATTERNS.some((re) => re.test(n))) return true;
  if (BODY_BOLI.some((re) => re.test(n))) return true;
  const sq = squeezed(n);
  return SQUEEZED_HEALTH.some((s) => sq.includes(s));
}

/** Pevný text poslaný klientovi pri eskalácii — nikdy negenerovaný modelom. */
export const HEALTH_ESCALATION_REPLY =
  "Pri bolesti, zranení alebo inom zdravotnom probléme ti nedokážem poradiť — to patrí do rúk tvojho trénera, nie AI. " +
  "Dal/a som mu o tom hneď vedieť v správach, ozve sa ti. Ak ide o akútny stav, neváhaj a vyhľadaj lekársku pomoc.";

/**
 * Pevná odpoveď pri krízovej správe (sebapoškodenie/suicidálne myšlienky). Nikdy nejde
 * cez model. 112 je jednotné európske tiesňové číslo (funguje v SR aj ČR), 155 je
 * záchranná zdravotná služba v SR.
 */
export const CRISIS_REPLY =
  "Ďakujem, že si mi to napísal/a. Toto je vážne a nechcem, aby si v tom bol/a sám/sama. " +
  "Ak si v bezprostrednom nebezpečenstve alebo myslíš na to, že si ublížiš, zavolaj hneď na 112 (v SR aj 155). " +
  "Ozvi sa aj niekomu blízkemu alebo svojmu lekárovi. Dal/a som o tom vedieť aj tvojmu trénerovi, ozve sa ti osobne. " +
  "AI asistent ti v tejto situácii nedokáže pomôcť.";

/** Text vložený ako systémová správa do reálneho tréner↔klient vlákna (akútna téma — hard block). */
export function buildEscalationNoticeForTrainer(clientMessage: string): string {
  const trimmed = promptSafe(clientMessage, 300);
  return `⚠️ AI asistent upozorňuje: klient v AI chate spomenul možnú bolesť/zranenie: „${trimmed}“ — odporúčame ozvať sa mu čo najskôr.`;
}

/**
 * Upozornenie trénerovi pri kríze. Text správy klienta sa NECITUJE — je mimoriadne
 * citlivý a tréner ho nepotrebuje na to, aby sa ozval osobne.
 */
export function buildCrisisNoticeForTrainer(): string {
  return "⚠️ AI asistent upozorňuje: klient v AI chate naznačil možnú krízu (myšlienky na sebapoškodenie). Ozvi sa mu prosím čo najskôr osobne a citlivo — obsah správy z dôvodu súkromia neuvádzame.";
}

// ---------------------------------------------------------------- výmena cviku
const EXERCISE_SWAP_PATTERNS: RegExp[] = [
  /\biny cvik\b/, /\bakyc? cvik\b/, /\bnamiesto\b/, /\bnahrad/, /\bzamen/, /\bvymen/, /\balternat/, /\bnavrhni cvik\b/, /\bnavrhnes\b/, /\bcvik namiesto\b/,
  /\bsubstitut/, /\binstead of\b/, /\breplace\b/, /\balternative\b/,
];

/**
 * True, ak klient popri zdravotnej zmienke (bolesť/nepohodlie) žiada rovno o
 * náhradu konkrétneho cviku — legitímna, bežná požiadavka (Product rozhodnutie:
 * "klient sa môže spýtať na výmenu cviku kvôli bolesti, len nechceme aby rieši
 * bežné veci s AI ako bolesti/prečo to bolí"). V tomto prípade AI SMIE odpovedať
 * (viď lib/ai/exerciseAlternatives.ts), len z reálnej knižnice cvikov a bez
 * komentovania samotnej bolesti/diagnózy — tréner dostane tiché FYI, nie alarm.
 * Pri KRÍZE sa táto výnimka nikdy neuplatní (rieši to lib/ai/chat.ts).
 */
export function hasExerciseSwapIntent(text: string): boolean {
  const n = normalizeForMatching(text);
  return EXERCISE_SWAP_PATTERNS.some((re) => re.test(n));
}

/** Tiché FYI pre trénera (nie alarm) — bežná výmena cviku kvôli nepohodliu, nie akútna téma. */
export function buildSoftExerciseNoticeForTrainer(clientMessage: string): string {
  const trimmed = promptSafe(clientMessage, 300);
  return `ℹ️ AI Kouč: klient spomenul nepohodlie a poprosil o náhradu cviku: „${trimmed}“ — AI mu navrhla alternatívu z knižnice cvikov, over prosím že mu sedí.`;
}
