// FitPilot — prezývka klienta v celoappkovom rebríčku (gamifikácia v2). Čisté funkcie
// (testy: e2e/gamification-v2.spec.ts).
//
// Súkromie: v rebríčku sa nikdy nezobrazí priezvisko, tréner, fotka ani nič iné než prezývka.
// Predvolená prezývka je „krstné meno + iniciála priezviska“ (maskName); klient si môže zadať
// vlastnú: 2–20 znakov, písmená/čísla/medzera/bodka/podčiarkovník/pomlčka, bez vulgarizmov
// (jednoduchý zoznam SK/CZ/EN — nie je dokonalý, preto je tu aj hlásenie na podporu a opt-out).
// Jedinečnosť sa nevyžaduje.

import { maskName } from "./leaderboard";

export const NICKNAME_MIN = 2;
export const NICKNAME_MAX = 20;

export type NicknameError = "length" | "chars" | "blocked";
export type NicknameResult = { ok: true; value: string } | { ok: false; error: NicknameError };

/** Orezanie a zlúčenie opakovaných medzier. */
export function normalizeNickname(raw: string): string {
  return raw.normalize("NFC").replace(/\s+/g, " ").trim();
}

const ALLOWED = /^[\p{L}\p{N} ._-]+$/u;

/** Dlhé jednoznačné kmene — hľadajú sa kdekoľvek v zlúčenom texte (po odstránení oddeľovačov a diakritiky). */
const BLOCK_STEMS = [
  "kurva", "kurvy", "kokot", "kokoti", "jebat", "jebn", "pojeb", "zajeb", "chuj", "curak", "hovno", "hovna", "sracka", "pojeb",
  "mrdat", "mrdka", "prdel", "buzer", "zidak", "cigan", "negr", "nigg", "fuck", "shit", "bitch", "cunt", "whore", "slut", "nazi",
  "hitler", "rapist", "pedofil", "pedo", "porno",
];
/** Krátke slová — len ako samostatné slovo (inak by blokovali bežné mená: „Dickinson“, „Spica“…). */
const BLOCK_WORDS = ["pica", "pico", "pice", "pic", "dick", "cock", "sex", "porn", "fag", "idiot", "debil", "retard", "kreten", "hajzel", "tlsta"];

const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "$": "s", "@": "a" };

function fold(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[0134579$@]/g, (c) => LEET[c] ?? c);
}

/** Obsahuje text vulgarizmus z jednoduchého zoznamu? */
export function isBlockedNickname(text: string): boolean {
  const folded = fold(text);
  const words = folded.split(/[^a-z]+/).filter(Boolean);
  if (words.some((w) => BLOCK_WORDS.includes(w))) return true;
  const squashed = folded.replace(/[^a-z]/g, "");
  return BLOCK_STEMS.some((s) => squashed.includes(s));
}

/** Podobné webovej adrese, e-mailu alebo telefónu — prezývka nesmie slúžiť na šírenie kontaktov. */
function looksLikeContact(text: string): boolean {
  if (/(https?|www\.)/i.test(text) || /\.(sk|cz|com|eu|net|org|info)\b/i.test(text)) return true;
  return (text.match(/\d/g) ?? []).length >= 7;
}

export function validateNickname(raw: unknown): NicknameResult {
  if (typeof raw !== "string") return { ok: false, error: "chars" };
  const value = normalizeNickname(raw);
  const length = [...value].length;
  if (length < NICKNAME_MIN || length > NICKNAME_MAX) return { ok: false, error: "length" };
  if (!ALLOWED.test(value) || !/[\p{L}\p{N}]{2}/u.test(value)) return { ok: false, error: "chars" };
  if (isBlockedNickname(value) || looksLikeContact(value)) return { ok: false, error: "blocked" };
  return { ok: true, value };
}

/** Predvolená prezývka: „Jana N.“ z celého mena; prázdne meno → null (volajúci použije náhradu). */
export function defaultNickname(fullName: string | null | undefined): string | null {
  return maskName(fullName);
}

/** Zobrazená prezývka: vlastná (ak platná), inak predvolená, inak náhrada. */
export function displayNickname(nickname: string | null | undefined, fullName: string | null | undefined, fallback = "—"): string {
  if (nickname) {
    const v = validateNickname(nickname);
    if (v.ok) return v.value;
  }
  return defaultNickname(fullName) ?? fallback;
}
