// FitPilot — CSV export reportov (čisté funkcie, testy: e2e/reports.spec.ts).
// - Oddeľovač `;` a desatinná čiarka: slovenský/český Excel inak všetko hodí do jedného stĺpca.
// - UTF-8 BOM, nech Excel rozpozná diakritiku.
// - Ochrana pred CSV/formula injection: bunka začínajúca = + - @ (alebo tab/CR) dostane
//   apostrof na začiatok. Čisté čísla sa píšu ako čísla (záporné číslo nie je vzorec).

export const CSV_BOM = "﻿";
export const CSV_DELIMITER = ";";

const FORMULA_START = /^[=+\-@\t\r]/;

/** Jedna bunka: text zbavený formula injection a v úvodzovkách, ak treba. */
export function csvCell(value: string | number | boolean | null | undefined): string {
  if (value == null) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value).replace(".", ",") : "";
  if (typeof value === "boolean") return value ? "1" : "0";
  let s = value;
  if (FORMULA_START.test(s)) s = `'${s}`;
  if (/[";\r\n]/.test(s) || s !== s.trim()) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function csvRow(cells: (string | number | boolean | null | undefined)[]): string {
  return cells.map(csvCell).join(CSV_DELIMITER);
}

/** Celý dokument: BOM + riadky oddelené CRLF (Excel). */
export function buildCsv(rows: (string | number | boolean | null | undefined)[][]): string {
  return CSV_BOM + rows.map(csvRow).join("\r\n") + "\r\n";
}

/** Bezpečný názov súboru z mena klienta (bez diakritiky a špeciálnych znakov). */
export function safeFileName(name: string, fallback: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9\-_ ]/g, "")
    .trim()
    .replace(/\s+/g, "-");
  return base || fallback;
}
