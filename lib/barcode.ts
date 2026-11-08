// Čiarové kódy potravín (skener v denníku) — čisté funkcie bez next/supabase importov,
// použiteľné na serveri (route /api/potraviny/kod/[ean]), v prehliadači (skener, ručné
// zadanie) aj v unit testoch (e2e/barcode.spec.ts).
//
// Podporované formáty: EAN-13, EAN-8, UPC-A, UPC-E. Kód sa ukladá a hľadá v jednotnom
// tvare (GTIN): EAN-13 a EAN-8 ostávajú, UPC-A dostane úvodnú nulu (13 číslic, rovnako
// ho vedie Open Food Facts), UPC-E sa najprv rozvinie na UPC-A.

export type BarcodeFormat = "ean_13" | "ean_8" | "upc_a" | "upc_e";

export const BARCODE_FORMATS: readonly BarcodeFormat[] = ["ean_13", "ean_8", "upc_a", "upc_e"];

export interface ParsedBarcode {
  format: BarcodeFormat;
  /** jednotný tvar na uloženie/vyhľadanie — 13 alebo 8 číslic */
  code: string;
}

/** Kontrolná číslica GS1 (EAN/UPC) pre číslice BEZ nej — váhy 3,1,3,… sprava. */
export function gs1CheckDigit(body: string): number {
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    const digit = body.charCodeAt(body.length - 1 - i) - 48;
    sum += digit * (i % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10;
}

/** Platný kód s kontrolnou číslicou na konci (EAN-8, UPC-A, EAN-13). */
function hasValidCheckDigit(code: string): boolean {
  return /^\d+$/.test(code) && gs1CheckDigit(code.slice(0, -1)) === Number(code[code.length - 1]);
}

/**
 * UPC-E (8 číslic: číselný systém 0/1, 6 číslic, kontrolná) → UPC-A (12 číslic).
 * Kontrolná číslica UPC-E je kontrolná číslica rozvinutého UPC-A. Null pri neplatnom vstupe.
 */
export function expandUpcE(upcE: string): string | null {
  if (!/^[01]\d{7}$/.test(upcE)) return null;
  const ns = upcE[0];
  const [a, b, c, d, e, f] = upcE.slice(1, 7);
  const check = upcE[7];
  let body: string;
  if (f === "0" || f === "1" || f === "2") body = `${ns}${a}${b}${f}0000${c}${d}${e}`;
  else if (f === "3") body = `${ns}${a}${b}${c}00000${d}${e}`;
  else if (f === "4") body = `${ns}${a}${b}${c}${d}00000${e}`;
  else body = `${ns}${a}${b}${c}${d}${e}0000${f}`;
  const upcA = `${body}${check}`;
  return hasValidCheckDigit(upcA) ? upcA : null;
}

/**
 * Overí a zjednotí kód. `hint` = formát hlásený skenerom — pri 8 číslach rozhoduje
 * medzi EAN-8 a UPC-E (ten istý reťazec môže byť platný ako oboje). Bez hintu
 * (ručné zadanie) má prednosť EAN-8, bežnejší na európskom trhu.
 * Medzery a pomlčky sa ignorujú. Null = neplatný kód.
 */
export function parseBarcode(input: string, hint?: BarcodeFormat | null): ParsedBarcode | null {
  const digits = input.replace(/[\s-]/g, "");
  if (!/^\d+$/.test(digits)) return null;

  if (digits.length === 13) {
    return hasValidCheckDigit(digits) ? { format: "ean_13", code: digits } : null;
  }
  if (digits.length === 12) {
    return hasValidCheckDigit(digits) ? { format: "upc_a", code: `0${digits}` } : null;
  }
  if (digits.length === 8) {
    const asUpcE = () => {
      const upcA = expandUpcE(digits);
      return upcA ? ({ format: "upc_e", code: `0${upcA}` } as const) : null;
    };
    if (hint === "upc_e") return asUpcE();
    if (hasValidCheckDigit(digits)) return { format: "ean_8", code: digits };
    return hint === "ean_8" ? null : asUpcE();
  }
  return null;
}
