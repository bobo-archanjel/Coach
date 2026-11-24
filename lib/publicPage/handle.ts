// FitPilot — handle verejnej stránky trénera (/t/<handle>). Čistý modul bez I/O (testy: e2e/public-page.spec.ts).
// Pravidlá zrkadlí CHECK v migrácii 0083 (tvar + zoznam rezervovaných slov) — pri zmene upraviť OBE miesta.

export const HANDLE_MIN = 3;
export const HANDLE_MAX = 30;

/** Malé písmená a číslice, pomlčky len vnútri (nie na kraji, nie dve za sebou). */
const HANDLE_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Slová, ktoré by sa zhodovali s trasami appky alebo klamali o pôvode stránky (zhodné s CHECK v 0083). */
export const RESERVED_HANDLES = [
  "admin", "administrator", "api", "app", "assets", "auth", "billing", "coach", "contact", "cookies", "dashboard",
  "demo", "email", "faq", "favicon", "fitcoach", "fitpilot", "help", "info", "kontakt", "login", "logout", "mail",
  "manifest", "myfitpilot", "nahlad", "nastavenia", "official", "ochrana-sukromia", "obchodne-podmienky", "portal",
  "pomoc", "pozvanka", "predplatne", "preview", "prihlasenie", "public", "register", "registracia", "robots",
  "root", "security", "settings", "sitemap", "static", "stripe", "support", "t", "test", "trainer", "trener", "www",
] as const;

export type HandleErrorCode = "handleTooShort" | "handleTooLong" | "handleInvalid" | "handleReserved";

export type HandleValidation = { ok: true; value: string } | { ok: false; code: HandleErrorCode };

/** Zjednotí zadanie (orezanie, malé písmená). Diakritiku NEodstraňuje — nech používateľ vidí, čo je neplatné. */
export function normalizeHandle(input: unknown): string {
  return typeof input === "string" ? input.trim().toLowerCase() : "";
}

export function isReservedHandle(handle: string): boolean {
  // „fitpilot“ kdekoľvek v názve = vydávanie sa za produkt
  return (RESERVED_HANDLES as readonly string[]).includes(handle) || handle.includes("fitpilot");
}

export function validateHandle(input: unknown): HandleValidation {
  const value = normalizeHandle(input);
  if (value.length < HANDLE_MIN) return { ok: false, code: "handleTooShort" };
  if (value.length > HANDLE_MAX) return { ok: false, code: "handleTooLong" };
  if (!HANDLE_RE.test(value)) return { ok: false, code: "handleInvalid" };
  if (isReservedHandle(value)) return { ok: false, code: "handleReserved" };
  return { ok: true, value };
}

/** Rýchla kontrola tvaru z URL (bez rezervovaných) — pred dopytom do DB, aby náhodné cesty DB nezaťažovali. */
export function isHandleShape(input: string): boolean {
  return input.length >= HANDLE_MIN && input.length <= HANDLE_MAX && HANDLE_RE.test(input);
}
