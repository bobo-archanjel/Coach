import { test, expect, type Page } from "@playwright/test";

/**
 * iOS Safari pri kliknutí do poľa s písmom < 16px priblíži stránku a po odchode
 * z poľa ju nechá priblíženú/posunutú (používateľ: „aplikácia sa zoomne a ostane
 * necentrovaná"). Zoom neblokujeme cez viewport (maximum-scale by na Androide
 * zakázal aj pinch-zoom), preto každé pole na mobile musí mať ≥ 16px.
 * Beží len v projekte "mobile" (mobilné CSS pod 760px), cez DEV ?preview=.
 */

async function smallInputs(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll("input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, textarea")]
      .filter((e) => e.getBoundingClientRect().width > 0 && parseFloat(getComputedStyle(e).fontSize) < 16)
      .map(
        (e) =>
          `${e.getAttribute("aria-label") || (e as HTMLInputElement).name || (e as HTMLInputElement).placeholder || e.tagName}=${getComputedStyle(e).fontSize}`,
      ),
  );
}

async function clickIf(page: Page, name: string | RegExp) {
  const b = page.getByRole("button", { name });
  if (await b.count()) await b.first().click();
}

async function noHorizontalScroll(page: Page) {
  const { scroll, client } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(scroll, "stránka je širšia ako displej").toBeLessThanOrEqual(client);
}

test.describe("mobil: polia ≥ 16px (iOS nezoomuje) a bez horizontálneho scrollu", () => {
  test.skip(({ isMobile }) => !isMobile, "len mobilné CSS");

  test("portál — Dnes: zápis tréningu, poznámky, RPE, meranie", async ({ page }) => {
    await page.goto("/portal?preview=ok");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.getByRole("button", { name: "Začať tréning" }).click();
    await clickIf(page, "Poznámka");
    await clickIf(page, /Zapísať meranie/);
    await clickIf(page, /obvody/);
    expect(await smallInputs(page)).toEqual([]);
    await noHorizontalScroll(page);
  });

  test("portál — Upraviť hodnoty a vlastný tréning", async ({ page }) => {
    await page.goto("/portal?preview=done");
    await page.getByRole("button", { name: /Upraviť hodnoty/ }).click();
    expect(await smallInputs(page)).toEqual([]);
    await noHorizontalScroll(page);

    await page.goto("/portal/trening?preview=ok");
    await page.getByRole("button", { name: "Vlastný tréning" }).click();
    await page.getByLabel("Názov dňa").first().waitFor();
    expect(await smallInputs(page)).toEqual([]);
    await noHorizontalScroll(page);
  });

  test("tréner — builder plánu (knižnica, úprava cviku, deň, názov)", async ({ page }) => {
    await page.goto("/dashboard/treningy/x?preview=builder");
    await clickIf(page, /Knižnica cvikov/);
    await page.getByRole("button", { name: "Upraviť cvik" }).first().click();
    await page.getByRole("button", { name: "+ deň" }).click();
    await page.getByRole("button", { name: "Upraviť názov plánu" }).click();
    expect(await smallInputs(page)).toEqual([]);
    await noHorizontalScroll(page);
  });
});
