import { test, expect } from "@playwright/test";

/**
 * Karta Dnes — sekcia „Môj pokrok“ (nahradila „Môj prehľad“ s panelom „Odcvičené spolu“):
 *  - Sila: posledné osobné maximá (lib/dashboard/bodyMetrics.ts → recentStrengthRecords),
 *  - Meranie: aktuálna váha, zmena od merania spred ~30 dní a graf (BodyMetricForm),
 *  - Tento týždeň: pod ním počet všetkých tréningov a série.
 * DEV náhľady bez session (app/portal/preview.ts).
 */

test.describe("Môj pokrok na karte Dnes", () => {
  test.skip(process.env.NODE_ENV === "production", "DEV náhľady len v next dev");

  test("preview=ok — maximá, váha s grafom, počet tréningov pod týždňom", async ({ page }) => {
    await page.goto("/portal?preview=ok");
    const section = page.getByRole("region", { name: "Pokrok" });
    await expect(section.getByRole("heading", { name: "Môj pokrok" })).toBeVisible();
    await expect(page.getByText("Môj prehľad")).toHaveCount(0);
    await expect(page.getByText("Odcvičené spolu")).toHaveCount(0);

    // Sila — 3 maximá, najnovšie prvé, s prírastkom
    const strength = section.locator('[data-tour="today-strength"]');
    await expect(strength.getByRole("heading", { name: "Nové osobné maximá" })).toBeVisible();
    const records = strength.getByRole("listitem");
    await expect(records).toHaveCount(3);
    await expect(records.nth(0)).toContainText("Drep s veľkou činkou");
    await expect(records.nth(0)).toContainText("85 kg × 5");
    await expect(records.nth(0)).toContainText("+5 kg");
    await expect(records.nth(1)).toContainText("62,5 kg × 6");
    await expect(records.nth(1)).toContainText("+2,5 kg");

    // Meranie — 81,4 kg; zmena od merania spred 48 dní (posledné staršie ako 30 dní): 84,7 → 81,4
    const measure = section.locator('[data-tour="today-measure"]');
    await expect(measure.getByText("81,4", { exact: true })).toBeVisible();
    await expect(measure.getByText("↓ 3,3 kg")).toBeVisible();
    await expect(measure.getByText(/^od \d{1,2}\. \d{1,2}\.$/)).toBeVisible();
    await expect(measure.getByRole("img", { name: "Vývoj váhy: 88 kg → 81,4 kg" })).toBeVisible();
    // história meraní s desatinnou čiarkou
    await expect(measure.getByText("81,4 kg")).toBeVisible();

    // Tento týždeň — počet všetkých tréningov a série
    const week = section.locator('[data-tour="today-week"]');
    await expect(week.getByText("42 tréningov spolu")).toBeVisible();
    await expect(week.getByText("Tréning: 5 týždňov v rade")).toBeVisible();

    // poradie panelov: Sila, Meranie, Týždeň
    const order = await section.locator("[data-tour]").evaluateAll((els) => els.map((e) => e.getAttribute("data-tour")));
    expect(order).toEqual(["today-strength", "today-measure", "today-week"]);
  });

  test("preview=no_plan — nový klient: prázdna Sila, bez grafu váhy a bez počtu", async ({ page }) => {
    await page.goto("/portal?preview=no_plan");
    const section = page.getByRole("region", { name: "Pokrok" });
    await expect(section.getByText(/Keď prekonáš svoje maximum na cviku, uvidíš ho tu/)).toBeVisible();
    await expect(section.getByRole("listitem")).toHaveCount(0);
    await expect(section.getByRole("img", { name: /Vývoj váhy/ })).toHaveCount(0);
    await expect(section.getByText(/tréningov spolu/)).toHaveCount(0);
    await expect(section.getByRole("button", { name: "+ Zapísať meranie" })).toBeVisible();
  });

  test("graf na počítači aj mobile: bod zostáva kruh, graf neprekročí kartu", async ({ page }) => {
    await page.goto("/portal?preview=ok");
    const chart = page.getByRole("img", { name: /Vývoj váhy/ });
    const card = page.locator('[data-tour="today-measure"]');
    const [c, k] = [await chart.boundingBox(), await card.boundingBox()];
    expect(c && k).toBeTruthy();
    expect(c!.x).toBeGreaterThanOrEqual(k!.x);
    expect(c!.x + c!.width).toBeLessThanOrEqual(k!.x + k!.width);
    expect(c!.height).toBe(64);
    const dot = await chart.locator("span").boundingBox();
    expect(Math.abs(dot!.width - dot!.height)).toBeLessThan(0.5);
  });
});
