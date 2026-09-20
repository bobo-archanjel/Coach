import { test, expect } from "@playwright/test";
import {
  applyDismissals,
  attentionTotal,
  buildAttentionItems,
  digestDismissKey,
  isValidDismissKey,
  lateDismissKey,
  DISMISS_LATE_DAYS,
  ONBOARDING_DISMISS_KEY,
  type AttentionData,
} from "../lib/dashboard/attention";

/**
 * Zvonček upozornení trénera (feature/funkcionalita) — čistá logika bez DB/prehliadača.
 * Kľúčové: poradie naliehavosti, slovenské skloňovanie, orezanie zoznamu klientov,
 * prázdny stav a skrývanie upozornení (kľúče, filtrovanie, validácia).
 */

const EMPTY: AttentionData = { unread: 0, late: [], digest: null };

const late = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `c${i}`,
    name: `Klient ${i}`,
    days: 5 + i,
    key: lateDismissKey(`c${i}`, "2026-09-10"),
  }));

const digest = (count: number, from: "ok" | "watch" = "watch", to: "watch" | "risk" = "risk") => ({
  from,
  to,
  count,
  key: digestDismissKey("2026-09-14"),
});

test("nič nečaká = žiadne položky a odznak 0", () => {
  expect(buildAttentionItems(EMPTY)).toEqual([]);
  expect(attentionTotal(EMPTY)).toBe(0);
});

test("poradie: správy, potom meškanie, potom digest", () => {
  const items = buildAttentionItems({ unread: 2, late: late(1), digest: digest(3) });
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
  const key = lateDismissKey("abc", "2026-09-10");
  const [item] = buildAttentionItems({ ...EMPTY, late: [{ id: "abc", name: "Lucia K.", days: 9, key }] });
  expect(item.links).toEqual([
    { label: "Lucia K.", meta: "9 dní bez tréningu", href: "/dashboard/klienti/abc", dismissKey: key },
  ]);
  const days = (d: number) => buildAttentionItems({ ...EMPTY, late: [{ id: "x", name: "A", days: d, key: "k" }] })[0].links[0].meta;
  expect(days(1)).toBe("1 deň bez tréningu");
  expect(days(3)).toBe("3 dni bez tréningu");
});

test("zoznam klientov sa orezá na 4 a zvyšok je 'a ďalší N'", () => {
  const [item] = buildAttentionItems({ ...EMPTY, late: late(7) });
  expect(item.links).toHaveLength(5);
  expect(item.links.slice(0, 4).map((l) => l.label)).toEqual(["Klient 0", "Klient 1", "Klient 2", "Klient 3"]);
  expect(item.links[4]).toEqual({ label: "a ďalší 3", meta: "", href: "/dashboard" });
});

test("digest: text s názvami koší a skloňovaním", () => {
  const t = (count: number) => buildAttentionItems({ ...EMPTY, digest: digest(count) })[0].title;
  expect(t(1)).toBe("1 klient klesol zo „Sleduj“ do „Riziko“ tento týždeň");
  expect(t(3)).toBe("3 klienti klesli zo „Sleduj“ do „Riziko“ tento týždeň");
  expect(t(5)).toBe("5 klientov kleslo zo „Sleduj“ do „Riziko“ tento týždeň");
});

test("odznak = neprečítané + meškajúci + klienti so zhoršením", () => {
  expect(attentionTotal({ unread: 3, late: late(2), digest: digest(4, "ok", "watch") })).toBe(9);
  expect(attentionTotal(EMPTY)).toBe(0);
});

test.describe("skrývanie", () => {
  test("kľúče nesú identitu situácie", () => {
    expect(lateDismissKey("c1", "2026-09-10")).toBe("late:c1:2026-09-10");
    expect(digestDismissKey("2026-09-14")).toBe("digest:2026-09-14");
    // po novom tréningu sa `since` zmení = iný kľúč = skrytie sa na novú situáciu nevzťahuje
    expect(lateDismissKey("c1", "2026-09-10")).not.toBe(lateDismissKey("c1", "2026-09-18"));
  });

  test("skrytý klient zmizne zo zoznamu aj z odznaku, ostatní ostanú", () => {
    const data: AttentionData = { unread: 0, late: late(3), digest: null };
    const filtered = applyDismissals(data, new Set([data.late[1].key]));
    expect(filtered.late.map((c) => c.id)).toEqual(["c0", "c2"]);
    expect(attentionTotal(filtered)).toBe(2);
  });

  test("skrytý digest zmizne, digest z iného týždňa nie", () => {
    const data: AttentionData = { ...EMPTY, digest: digest(2) };
    expect(applyDismissals(data, new Set([digestDismissKey("2026-09-14")])).digest).toBeNull();
    expect(applyDismissals(data, new Set([digestDismissKey("2026-09-07")])).digest).not.toBeNull();
  });

  test("neprečítané správy sa neskrývajú (len 'označiť ako prečítané')", () => {
    const filtered = applyDismissals({ unread: 4, late: [], digest: null }, new Set(["late:x:2026-01-01"]));
    expect(filtered.unread).toBe(4);
    const [msg] = buildAttentionItems(filtered);
    expect(msg.markRead).toBe(true);
    expect(msg.dismiss).toBeNull();
  });

  test("položka meškania skrýva všetkých na 7 dní, digest kým sa nezmení týždeň", () => {
    const items = buildAttentionItems({ unread: 0, late: late(3), digest: digest(2) });
    const lateItem = items.find((i) => i.id === "late")!;
    expect(lateItem.dismiss).toEqual({ keys: late(3).map((c) => c.key), days: DISMISS_LATE_DAYS });
    expect(DISMISS_LATE_DAYS).toBe(7);
    const digestItem = items.find((i) => i.id === "digest")!;
    expect(digestItem.dismiss).toEqual({ keys: [digestDismissKey("2026-09-14")], days: null });
  });

  test("skrytie zahŕňa aj klientov za orezaným zoznamom (nie len tých 4 zobrazených)", () => {
    const [item] = buildAttentionItems({ ...EMPTY, late: late(7) });
    expect(item.dismiss?.keys).toHaveLength(7);
  });

  test("validácia kľúčov: len tvary, ktoré vyrába appka", () => {
    expect(isValidDismissKey(lateDismissKey("3f2b8c1e-0000-4000-8000-123456789abc", "2026-09-10"))).toBe(true);
    expect(isValidDismissKey(digestDismissKey("2026-09-14"))).toBe(true);
    expect(isValidDismissKey(ONBOARDING_DISMISS_KEY)).toBe(true);
    expect(isValidDismissKey("late:x:not-a-date")).toBe(false);
    expect(isValidDismissKey("digest:")).toBe(false);
    expect(isValidDismissKey("; drop table clients")).toBe(false);
    expect(isValidDismissKey("late:" + "a".repeat(200) + ":2026-09-10")).toBe(false);
    expect(isValidDismissKey(42)).toBe(false);
    expect(isValidDismissKey(null)).toBe(false);
  });
});
