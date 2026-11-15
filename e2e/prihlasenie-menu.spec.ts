import { test, expect } from "@playwright/test";

/**
 * Prihlásenie na mobile — burger s tlačidlami hlavičky úvodnej stránky (AuthMobileMenu):
 * Funkcie / AI / Cenník (odkazy na sekcie landingu), jazyk a svetlý/tmavý režim.
 * Na počítači sa nezobrazuje. Jazyk sa po teste vráti na slovenčinu (cookie kontextu).
 */

test.describe("prihlásenie — mobilné menu", () => {
  test("mobil: burger otvorí menu s odkazmi, jazykom a témou; Esc ho zavrie", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "burger je len na mobile");
    await page.goto("/prihlasenie");
    const burger = page.getByRole("button", { name: "Otvoriť menu" });
    await expect(burger).toBeVisible();
    await expect(burger).toHaveAttribute("aria-expanded", "false");

    await burger.click();
    const menu = page.getByRole("navigation", { name: "Menu" });
    await expect(menu).toBeVisible();
    await expect(page.getByRole("button", { name: "Zavrieť menu" })).toHaveAttribute("aria-expanded", "true");
    for (const [name, href] of [
      ["Funkcie", "/#funkcie"],
      ["AI", "/#ai"],
      ["Cenník", "/#cennik"],
    ]) {
      await expect(menu.getByRole("link", { name, exact: true })).toHaveAttribute("href", href);
    }
    await expect(menu.getByRole("button", { name: "Prepnúť svetlý / tmavý režim" })).toBeVisible();

    // Esc zavrie a fokus sa vráti na burger
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await expect(burger).toBeFocused();

    // ťuk mimo menu ho zavrie
    await burger.click();
    await expect(menu).toBeVisible();
    await page.mouse.click(20, 600);
    await expect(menu).toHaveCount(0);
  });

  test("mobil: jazyk sa dá prepnúť z menu", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "burger je len na mobile");
    await page.goto("/prihlasenie");
    await page.getByRole("button", { name: "Otvoriť menu" }).click();
    await page.getByRole("navigation", { name: "Menu" }).getByRole("button", { name: /Zmeniť jazyk/ }).click();
    await page.getByRole("menuitemradio", { name: /Čeština/ }).click();
    await expect(page.getByRole("heading", { name: "Vítej zpět" })).toBeVisible({ timeout: 15_000 });
    // menu ostáva otvorené (dá sa hneď prepnúť aj téma) — späť na slovenčinu
    await expect(page.getByRole("button", { name: "Zavřít menu" })).toBeVisible();
    await page.getByRole("navigation", { name: "Menu" }).getByRole("button", { name: /Změnit jazyk/ }).click();
    await page.getByRole("menuitemradio", { name: /Slovenčina/ }).click();
    await expect(page.getByRole("heading", { name: "Vitaj späť" })).toBeVisible({ timeout: 15_000 });
  });

  test("počítač: burger sa nezobrazuje", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "len počítač");
    await page.goto("/prihlasenie");
    await expect(page.getByRole("heading", { name: "Vitaj späť" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Otvoriť menu" })).toBeHidden();
  });
});
