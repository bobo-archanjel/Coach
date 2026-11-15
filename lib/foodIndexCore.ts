// Čistá logika offline hľadania v balíku Open Food Facts (/food-data/*.json.gz) — bez
// IndexedDB a prehliadačových API, aby sa dala testovať v Node (lib/foodIndex.ts rieši
// sťahovanie a ukladanie). ~100 000 riadkov sa prehľadáva obyčajným cyklom nad
// predpočítanými reťazcami: pri jednom-dvoch dotazoch za sekundu to na telefóne stačí
// a netreba Web Worker.

import { FOOD_SYNONYMS } from "@/lib/foodSynonyms";

/** Stĺpce balíka v poradí z `cols`; riadok = pole hodnôt v tom poradí. */
export interface FoodBundle {
  v: string;
  cols: string[];
  rows: (string | number | null)[][];
}

/** Potravina z balíka — hodnoty na 100 g. */
export interface IndexedFood {
  code: string;
  name: string;
  brand: string | null;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number | null;
  sugars: number | null;
  salt: number | null;
  servingGrams: number | null;
}

/** Hodnoty na 100 g v `nums` po 8 na riadok, v tomto poradí; chýbajúca = NaN. */
const NUM_COLS = ["kcal", "protein", "carbs", "fat", "fiber", "sugars", "salt", "serving_g"] as const;

/**
 * Index držíme ako paralelné polia (reťazce + jeden Float64Array), nie pole objektov ani
 * pôvodné polia z JSON — 100 000 objektov by zjedlo desiatky MB na iPhone. IndexedFood
 * vzniká až pre vrátené výsledky (foodAt).
 */
export interface FoodSearchIndex {
  codes: string[];
  names: string[];
  brands: (string | null)[];
  nums: Float64Array;
  /** " názov značka" po normalizácii — jeden reťazec na riadok (indexOf je rýchly) */
  full: string[];
  /** kde v `full` končí názov (zvyšok je značka) */
  nameEnd: Int32Array;
}

/** Malé písmená, bez diakritiky, len [a-z0-9] oddelené medzerou („Hähnchen-Brust“ → „hahnchen brust“). */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/ł/g, "l")
    .replace(/đ/g, "d")
    .replace(/ø/g, "o")
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Z balíka postaví index; riadky bez názvu, kódu alebo kcal preskočí (nedá sa z nich logovať). */
export function buildIndex(bundle: FoodBundle): FoodSearchIndex {
  const col = (name: string) => bundle.cols.indexOf(name);
  const iCode = col("code");
  const iName = col("name");
  const iBrand = col("brand");
  const iNums = NUM_COLS.map(col);
  const iKcal = iNums[0];

  const n = bundle.rows.length;
  const codes: string[] = [];
  const names: string[] = [];
  const brands: (string | null)[] = [];
  const full: string[] = [];
  const ends: number[] = [];
  const nums = new Float64Array(n * NUM_COLS.length);
  let k = 0;

  for (const r of bundle.rows) {
    const code = str(r[iCode]);
    const name = str(r[iName]);
    if (!code || !name || num(r[iKcal]) === null) continue;
    const nName = normalize(name);
    if (!nName) continue;
    const brand = iBrand >= 0 ? str(r[iBrand]) : null;
    const head = ` ${nName}`;
    codes.push(code);
    names.push(name);
    brands.push(brand);
    full.push(brand ? `${head} ${normalize(brand)}` : head);
    ends.push(head.length);
    for (let j = 0; j < iNums.length; j++) nums[k * NUM_COLS.length + j] = iNums[j] >= 0 ? (num(r[iNums[j]]) ?? NaN) : NaN;
    k++;
  }
  return { codes, names, brands, nums: nums.slice(0, k * NUM_COLS.length), full, nameEnd: Int32Array.from(ends) };
}

/** Riadok indexu → potravina (objekt vzniká až pre výsledky, nie pre všetkých ~100 000). */
export function foodAt(index: FoodSearchIndex, i: number): IndexedFood {
  const v = (j: number): number | null => {
    const x = index.nums[i * NUM_COLS.length + j];
    return Number.isNaN(x) ? null : x;
  };
  return {
    code: index.codes[i],
    name: index.names[i],
    brand: index.brands[i],
    kcal: v(0) ?? 0,
    protein: v(1) ?? 0,
    carbs: v(2) ?? 0,
    fat: v(3) ?? 0,
    fiber: v(4),
    sugars: v(5),
    salt: v(6),
    servingGrams: v(7),
  };
}

// ---------------------------------------------------------------- dotaz

/** Jedna alternatíva slova: `s` je normalizovaný text, `infix` = hľadá sa aj uprostred slova. */
interface Alt {
  s: string;
  infix: boolean;
}
/** Jedno slovo dotazu so všetkými alternatívami (originál + synonymá) — stačí sedieť jedna. */
type Group = Alt[];

const SINGLE_KEYS = Object.keys(FOOD_SYNONYMS).filter((k) => !k.includes(" "));
const PHRASE_KEYS = Object.keys(FOOD_SYNONYMS)
  .filter((k) => k.includes(" "))
  .map((k) => ({ key: k, words: k.split(" ") }));

const toAlts = (list: string[]): Alt[] =>
  list.map((s) => (s.startsWith("*") ? { s: s.slice(1), infix: true } : { s, infix: false }));

/** Slovo dotazu sedí na kľúč slovníka: presne, ako štep (kľúč ≥ 4 znaky), alebo rozpísaný začiatok kľúča. */
function keyMatches(tok: string, key: string): boolean {
  if (tok === key) return true;
  if (key.length >= 4 && tok.startsWith(key)) return true;
  return tok.length >= 3 && key.length >= 4 && key.startsWith(tok);
}

/** Dotaz → skupiny alternatív. Viacslovné kľúče („ovsene vlocky“) pohltia viac slov naraz. */
export function buildQuery(query: string): Group[] {
  const tokens = normalize(query).split(" ").filter(Boolean);
  const groups: Group[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const phrase = PHRASE_KEYS.find(
      (p) =>
        i + p.words.length <= tokens.length &&
        p.words.every((w, j) => {
          const t = tokens[i + j];
          return t.length >= 3 && (t.startsWith(w) || w.startsWith(t));
        }),
    );
    if (phrase) {
      const alts: Alt[] = [{ s: tokens.slice(i, i + phrase.words.length).join(" "), infix: false }];
      alts.push(...toAlts(FOOD_SYNONYMS[phrase.key]));
      groups.push(alts);
      i += phrase.words.length - 1;
      continue;
    }
    const tok = tokens[i];
    const alts: Alt[] = [{ s: tok, infix: false }];
    for (const key of SINGLE_KEYS) if (keyMatches(tok, key)) alts.push(...toAlts(FOOD_SYNONYMS[key]));
    groups.push(alts);
  }
  return groups;
}

/** Najskoršia pozícia niektorej alternatívy v `hay` (slovo musí začínať, ak nie je infix); -1 = nesedí. */
function firstPos(hay: string, group: Group): number {
  let best = -1;
  for (const a of group) {
    const p = hay.indexOf(a.infix ? a.s : ` ${a.s}`);
    if (p < 0) continue;
    const pos = a.infix ? p : p + 1; // pozícia znaku, nie medzery pred ním
    if (best < 0 || pos < best) best = pos;
  }
  return best;
}

/**
 * Hľadá v balíku: každé slovo dotazu (alebo jeho synonymum) musí byť začiatkom slova v názve
 * či značke. Poradie (od najlepšieho): zhoda na PÔVODNÝCH slovách používateľa pred zhodou len
 * cez synonymá („rožok“ → najprv produkt „Rožok“, až potom „Brötchen“); v každej z týchto dvoch
 * skupín názov začína dotazom > všetky slová v názve > niečo len v značke; vnútri toho podľa
 * poradia v balíku (= obľúbenosť). Vráti indexy riadkov (foodAt).
 */
export function searchIndex(index: FoodSearchIndex, query: string, limit = 30): number[] {
  const groups = buildQuery(query);
  if (groups.length === 0) return [];
  const originals = groups.map((g) => g.slice(0, 1)); // prvá alternatíva = slovo z dotazu
  const buckets: number[][] = [[], [], [], [], [], []]; // [synonymá: značka, názov, od začiatku, potom to isté pre pôvodné slová]
  const seen = new Set<string>();
  const { full, nameEnd } = index;

  for (let i = 0; i < full.length; i++) {
    const hay = full[i];
    let ok = true;
    for (let g = 0; g < groups.length; g++) {
      if (firstPos(hay, groups[g]) < 0) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    // sedia aj pôvodné slová samotné? (lacné: dotazuje sa len na to, čo už vieme, že sedí)
    let literal = true;
    for (let g = 0; g < originals.length && literal; g++) if (firstPos(hay, originals[g]) < 0) literal = false;
    const used = literal ? originals : groups;
    let inName = true;
    let first = -1;
    for (let g = 0; g < used.length; g++) {
      const pos = firstPos(hay, used[g]);
      if (pos >= nameEnd[i]) inName = false;
      if (g === 0) first = pos;
    }
    const bucket = (literal ? 3 : 0) + (inName ? (first === 1 ? 2 : 1) : 0);
    if (buckets[bucket].length >= limit) continue;
    if (seen.has(hay)) continue; // ten istý produkt dvakrát (iná veľkosť balenia) nepotrebujeme
    seen.add(hay);
    buckets[bucket].push(i);
    if (buckets[5].length >= limit) break; // lepšie už nič nepríde
  }
  return [5, 4, 3, 2, 1, 0].flatMap((k) => buckets[k]).slice(0, limit);
}

/** Rovnaké pravidlá pre malé zoznamy (staples, knižnica); názov začínajúci dotazom ide dopredu. */
export function filterByQuery<T>(items: T[], query: string, nameOf: (item: T) => string): T[] {
  const groups = buildQuery(query);
  if (groups.length === 0) return items;
  const hits: { item: T; starts: boolean }[] = [];
  for (const item of items) {
    const hay = ` ${normalize(nameOf(item))}`;
    let ok = true;
    let first = -1;
    for (let g = 0; g < groups.length; g++) {
      const pos = firstPos(hay, groups[g]);
      if (pos < 0) {
        ok = false;
        break;
      }
      if (g === 0) first = pos;
    }
    if (ok) hits.push({ item, starts: first === 1 });
  }
  // sort je stabilný — zvyšok ostáva v pôvodnom poradí
  return hits.sort((a, b) => Number(b.starts) - Number(a.starts)).map((h) => h.item);
}

/**
 * Čiarový kód → produkt. EAN-13 s úvodnou nulou a UPC-A (12) sú ten istý kód, skúsime obe podoby.
 * Lineárne hľadanie (~1 ms na 100 000 kódov) — Map by držala ďalšie MB pamäte kvôli zriedkavej akcii.
 */
export function lookupCodeIn(index: FoodSearchIndex, code: string): IndexedFood | null {
  const variants = [code];
  if (code.length === 12) variants.push(`0${code}`);
  if (code.length === 13 && code.startsWith("0")) variants.push(code.slice(1));
  for (const v of variants) {
    const i = index.codes.indexOf(v);
    if (i >= 0) return foodAt(index, i);
  }
  return null;
}
