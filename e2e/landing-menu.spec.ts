import { test, expect } from "@playwright/test";

/**
 * Úvodná stránka na mobile — burger v hlavičke (SiteMenu) s tlačidlami, ktoré sa do
 * hlavičky nezmestia: Funkcie, AI, Cenník, Prihlásiť sa, jazyk a svetlý/tmavý režim.
 * Na počítači je hlavička celá (odkazy, jazyk, téma) a burger sa nezobrazuje.
 */

test.describe("úvodná stránka — mobilné menu", () => {
  test("mobil: hlavička bez pretekania, burger s odkazmi, jazykom a témou; Esc a ťuk mimo ho zavrú", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "burger je len na mobile");
    await page.goto("/");
    // jazyk a téma nie sú priamo v hlavičke — sú v burgeri, hlavička sa zmestí
    const header = page.locator("header").first();
    await expect(header.getByRole("button", { name: "Prepnúť svetlý / tmavý režim" })).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);

    const burger = page.getByRole("button", { name: "Otvoriť menu" });
    await expect(burger).toHaveAttribute("aria-expanded", "false");
    const menu = page.getByRole("navigation", { name: "Menu" });
    // klik ešte pred hydratáciou nič neotvorí — opakovať, kým sa menu neukáže
    await expect(async () => {
      if (await burger.isVisible()) await burger.click();
      await expect(menu).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 15_000 });
    for (const [name, href] of [
      ["Funkcie", "#funkcie"],
      ["AI", "#ai"],
      ["Cenník", "#cennik"],
      ["Prihlásiť sa", "/prihlasenie"],
    ]) {
      await expect(menu.getByRole("link", { name, exact: true })).toHaveAttribute("href", href);
    }
    await expect(menu.getByRole("button", { name: "Prepnúť svetlý / tmavý režim" })).toBeVisible();
    await expect(menu.getByRole("button", { name: /Zmeniť jazyk/ })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await expect(burger).toBeFocused();

    await burger.click();
    await expect(menu).toBeVisible();
    await page.mouse.click(20, 600);
    await expect(menu).toHaveCount(0);

    // odkaz na sekciu menu zavrie a posunie stránku
    await burger.click();
    await menu.getByRole("link", { name: "Cenník", exact: true }).click();
    await expect(menu).toHaveCount(0);
    await expect(page).toHaveURL(/#cennik$/);
  });

  test("počítač: odkazy, jazyk a téma v hlavičke, bez burgera", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "len počítač");
    await page.goto("/");
    const header = page.locator("header").first();
    await expect(header.getByRole("link", { name: "Cenník" })).toBeVisible();
    await expect(header.getByRole("button", { name: "Prepnúť svetlý / tmavý režim" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Otvoriť menu" })).toBeHidden();
  });
});
