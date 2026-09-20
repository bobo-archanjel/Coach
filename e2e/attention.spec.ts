import { test, expect } from "@playwright/test";
import { attentionTotal, buildAttentionItems, type AttentionData } from "../lib/dashboard/attention";

/**
 * Zvonček upozornení trénera (feature/funkcionalita) — čistý builder položiek bez
 * DB/prehliadača. Kľúčové: poradie naliehavosti, slovenské skloňovanie,
 * orezanie zoznamu klientov a prázdny stav.
 */

const EMPTY: AttentionData = { unread: 0, late: [], digest: null };

const late = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `c${i}`, name: `Klient ${i}`, days: 5 + i }));

test("nič nečaká = žiadne položky a odznak 0", () => {
  expect(buildAttentionItems(EMPTY)).toEqual([]);
  expect(attentionTotal(EMPTY)).toBe(0);
});

test("poradie: správy, potom meškanie, potom digest", () => {
  const items = buildAttentionItems({
    unread: 2,
    late: late(1),
    digest: { from: "watch", to: "risk", count: 3 },
  });
  expect(items.map((i) => i.id)).toEqual(["messages", "late", "digest"]);
  expect(items[0].href).toBe("/dashboard/spravy");
  expect(items[2].href).toBe("/dashboard/analytika");
});

test("skloňovanie neprečítaných správ", () => {
  const title = (n: number) => buildAttentionItems({ ...EMPTY, unread: n })[0].title;
  expect(title(1)).toBe("1 neprečítaná správa od klientov");
  expect(title(3)).toBe("3 neprečítané správy od klientov");
  expect(title(5)).toBe("5 neprečítaných správ od klientov");
});

test("skloňovanie meškajúcich klientov (1 mešká / 2–4 meškajú / 5+ mešká)", () => {
  const title = (n: number) => buildAttentionItems({ ...EMPTY, late: late(n) })[0].title;
  expect(title(1)).toBe("1 klient mešká s tréningom");
  expect(title(3)).toBe("3 klienti meškajú s tréningom");
  expect(title(6)).toBe("6 klientov mešká s tréningom");
});

test("meškajúci klienti odkazujú na detail, dni sa skloňujú", () => {
  const [item] = buildAttentionItems({ ...EMPTY, late: [{ id: "abc", name: "Lucia K.", days: 9 }] });
  expect(item.links).toEqual([{ label: "Lucia K.", meta: "9 dní bez tréningu", href: "/dashboard/klienti/abc" }]);
  const [one] = buildAttentionItems({ ...EMPTY, late: [{ id: "x", name: "A", days: 1 }] });
  expect(one.links[0].meta).toBe("1 deň bez tréningu");
  const [few] = buildAttentionItems({ ...EMPTY, late: [{ id: "x", name: "A", days: 3 }] });
  expect(few.links[0].meta).toBe("3 dni bez tréningu");
});

test("zoznam klientov sa orezá na 4 a zvyšok je 'a ďalší N'", () => {
  const [item] = buildAttentionItems({ ...EMPTY, late: late(7) });
  expect(item.links).toHaveLength(5);
  expect(item.links.slice(0, 4).map((l) => l.label)).toEqual(["Klient 0", "Klient 1", "Klient 2", "Klient 3"]);
  expect(item.links[4]).toEqual({ label: "a ďalší 3", meta: "", href: "/dashboard" });
});

test("digest: text s názvami koší a skloňovaním", () => {
  const t = (count: number) =>
    buildAttentionItems({ ...EMPTY, digest: { from: "watch", to: "risk", count } })[0].title;
  expect(t(1)).toBe("1 klient klesol zo „Sleduj“ do „Riziko“ tento týždeň");
  expect(t(3)).toBe("3 klienti klesli zo „Sleduj“ do „Riziko“ tento týždeň");
  expect(t(5)).toBe("5 klientov kleslo zo „Sleduj“ do „Riziko“ tento týždeň");
});

test("odznak = neprečítané + meškajúci + klienti so zhoršením", () => {
  expect(attentionTotal({ unread: 3, late: late(2), digest: { from: "ok", to: "watch", count: 4 } })).toBe(9);
  expect(attentionTotal({ unread: 0, late: [], digest: null })).toBe(0);
});
