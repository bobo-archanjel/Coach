// FitPilot — verzia obchodných podmienok, s ktorou musí mať používateľ súhlas (0063).
//
// Ako zmeniť podmienky:
//  - DROBNÁ zmena (preklep, formulácia, kontakt): uprav text v app/obchodne-podmienky
//    a nič viac — súhlas ostáva platný.
//  - PODSTATNÁ zmena (práva a povinnosti, cena, spracovanie údajov): uprav text, zmeň
//    `TERMS_VERSION` na dátum účinnosti novej verzie a do messages/<jazyk>/auth.json →
//    consent.changes napíš krátky súhrn zmien. Každý používateľ so staršou verziou pri
//    najbližšom otvorení appky uvidí stránku „Aktualizovali sme obchodné podmienky“
//    (/prihlasenie/suhlas) a bez súhlasu ďalej nepokračuje (môže sa odhlásiť alebo si
//    nechať zmazať účet).
//  - Odporúčanie: o podstatnej zmene dať vedieť vopred (e-mail / správa v appke) a novú
//    verziu nasadiť k dátumu účinnosti.

/** Dátum účinnosti aktuálnej verzie obchodných podmienok (YYYY-MM-DD). */
export const TERMS_VERSION = "2026-11-15";

/**
 * Treba pred vstupom do appky súhlas? `undefined` = nevieme (stĺpec ešte neexistuje — pred
 * migráciou 0063, alebo DEV náhľad bez prihlásenia) → nie, appka sa nezamkne.
 */
export function needsTermsConsent(acceptedVersion: string | null | undefined): boolean {
  if (acceptedVersion === undefined) return false;
  return acceptedVersion !== TERMS_VERSION;
}
