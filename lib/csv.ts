// FitPilot — export dát (feature/export-dat): minimálny CSV builder. Žiadna
// knižnica potrebná pre tak jednoduchý tvar (jedna plochá tabuľka) — RFC 4180
// escaping (úvodzovky pri čiarke/úvodzovke/newline v hodnote).

export function csvCell(value: string | number | null): string {
  if (value == null) return "";
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: (string | number | null)[][]): string {
  const lines = [headers.map(csvCell).join(","), ...rows.map((r) => r.map(csvCell).join(","))];
  // \r\n a BOM — Excel na Windows (bežný cieľ tohto exportu) inak vie zle
  // rozoznať oddeľovač/kódovanie diakritiky.
  return `﻿${lines.join("\r\n")}`;
}
