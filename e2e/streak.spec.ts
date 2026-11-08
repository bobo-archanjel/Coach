import { test, expect } from "@playwright/test";
import { runLength, computeTrainingStreak, computeFoodStreak, pluralSk } from "../lib/portal/streak";

/**
 * Série klienta (feature/funkcionalita) — čistá logika bez DB/prehliadača.
 * Kľúčové pravidlá: tolerancia jedného vynechania, otvorená aktuálna jednotka,
 * týždne pre tréning vs. dni pre jedlo.
 */

// 2026-09-16 je streda; jej týždeň je pondelok 2026-09-14 – nedeľa 2026-09-20.
const TODAY = "2026-09-16";

function daysBack(from: string, n: number): string {
  return new Date(new Date(`${from}T12:00:00Z`).getTime() - n * 86_400_000).toISOString().slice(0, 10);
}

test.describe("runLength", () => {
  test("prázdne / všetko nesplnené = 0", () => {
    expect(runLength([]).count).toBe(0);
    expect(runLength([false, false, false]).count).toBe(0);
  });

  test("súvislá séria vrátane aktuálnej jednotky", () => {
    expect(runLength([true, true, true, false, false])).toEqual({ count: 3, atRisk: false });
  });

  test("otvorená aktuálna jednotka sériu nepreruší ani nezapočíta", () => {
    expect(runLength([false, true, true, true])).toEqual({ count: 3, atRisk: false });
  });

  test("jedno vynechanie sa toleruje a nezapočíta", () => {
    expect(runLength([true, false, true, true])).toEqual({ count: 3, atRisk: false });
  });

  test("druhé vynechanie v rade sériu preruší", () => {
    expect(runLength([true, false, false, true, true, true]).count).toBe(1);
    expect(runLength([false, true, false, false, true, true]).count).toBe(1);
  });

  test("atRisk: aktuálna aj predošlá nesplnená, séria ešte žije", () => {
    expect(runLength([false, false, true, true, true])).toEqual({ count: 3, atRisk: true });
  });

  test("atRisk nie je pri mŕtvej sérii (2 vynechania pred dneškom)", () => {
    expect(runLength([false, false, false, true, true])).toEqual({ count: 0, atRisk: false });
  });
});

test.describe("tréning po týždňoch", () => {
  test("2 dni v každom z 3 týždňov = séria 3", () => {
    const dates = [
      "2026-09-14", "2026-09-15", // tento týždeň
      "2026-09-07", "2026-09-09", // minulý
      "2026-08-31", "2026-09-02", // predminulý
    ];
    const s = computeTrainingStreak(dates, TODAY);
    expect(s.count).toBe(3);
    expect(s.needThisWeek).toBe(0);
    expect(s.thisWeekDays).toBe(2);
  });

  test("rozpracovaný týždeň (1 z 2) nepreruší, ukáže koľko chýba", () => {
    const dates = ["2026-09-15", "2026-09-07", "2026-09-09", "2026-08-31", "2026-09-02"];
    const s = computeTrainingStreak(dates, TODAY);
    expect(s.count).toBe(2);
    expect(s.needThisWeek).toBe(1);
    expect(s.atRisk).toBe(false);
  });

  test("dva tréningy v ten istý deň sa počítajú ako jeden deň", () => {
    const s = computeTrainingStreak(["2026-09-15", "2026-09-15", "2026-09-15"], TODAY);
    expect(s.thisWeekDays).toBe(1);
    expect(s.count).toBe(0);
  });

  test("jeden vynechaný týždeň sa toleruje", () => {
    const dates = ["2026-09-14", "2026-09-15", "2026-08-31", "2026-09-02", "2026-08-24", "2026-08-26"];
    expect(computeTrainingStreak(dates, TODAY).count).toBe(3);
  });

  test("nedeľa patrí do týždňa, ktorý začal v pondelok pred ňou", () => {
    // 2026-09-20 je nedeľa týždňa 14.–20.9.; 2026-09-21 je už ďalší týždeň
    const s = computeTrainingStreak(["2026-09-19", "2026-09-20"], "2026-09-20");
    expect(s.count).toBe(1);
    expect(s.thisWeekDays).toBe(2);
    const next = computeTrainingStreak(["2026-09-19", "2026-09-20"], "2026-09-21");
    expect(next.thisWeekDays).toBe(0);
    expect(next.count).toBe(1); // minulý týždeň splnený, nový je otvorený
  });

  test("bez logov = 0 a chýbajú 2 dni", () => {
    const s = computeTrainingStreak([], TODAY);
    expect(s).toMatchObject({ count: 0, atRisk: false, thisWeekDays: 0, needThisWeek: 2 });
  });
});

test.describe("jedlo po dňoch", () => {
  test("7 dní v rade vrátane dneška", () => {
    const dates = Array.from({ length: 7 }, (_, i) => daysBack(TODAY, i));
    expect(computeFoodStreak(dates, TODAY).count).toBe(7);
  });

  test("dnes ešte nezapísané nepreruší sériu z predošlých dní", () => {
    const dates = Array.from({ length: 5 }, (_, i) => daysBack(TODAY, i + 1));
    expect(computeFoodStreak(dates, TODAY)).toEqual({ count: 5, atRisk: false });
  });

  test("včera aj dnes bez zápisu = séria žije, ale je v ohrození", () => {
    const dates = Array.from({ length: 5 }, (_, i) => daysBack(TODAY, i + 2));
    expect(computeFoodStreak(dates, TODAY)).toEqual({ count: 5, atRisk: true });
  });

  test("jeden vynechaný deň v strede série sa toleruje", () => {
    const dates = [0, 1, 3, 4, 5].map((i) => daysBack(TODAY, i));
    expect(computeFoodStreak(dates, TODAY).count).toBe(5);
  });

  test("dva vynechané dni v rade ju prerušia", () => {
    const dates = [0, 1, 4, 5, 6].map((i) => daysBack(TODAY, i));
    expect(computeFoodStreak(dates, TODAY).count).toBe(2);
  });
});

test("pluralSk", () => {
  expect(pluralSk(1, "týždeň", "týždne", "týždňov")).toBe("týždeň");
  expect(pluralSk(3, "týždeň", "týždne", "týždňov")).toBe("týždne");
  expect(pluralSk(5, "týždeň", "týždne", "týždňov")).toBe("týždňov");
  expect(pluralSk(12, "dní", "dni", "dní")).toBe("dní");
});
