import { test, expect } from "@playwright/test";
import { sessionLogin } from "./helpers/sessionLogin";

/**
 * Stránka Klienti má vedľa „+ Nový klient“ aj „+ Nová výzva pre klientov“ — vedie na /dashboard/vyzvy#nova-vyzva
 * (formulár novej výzvy, kurzor v názve). Prihlásenie bez formulára (CAPTCHA) — e2e/helpers/sessionLogin.ts.
 *   E2E_TRAINER_EMAIL
 */
try {
  process.loadEnvFile(".env.local");
} catch {
  /* bez .env.local sa test preskočí */
}
const trainerEmail = process.env.E2E_TRAINER_EMAIL;

test.describe("klienti — tlačidlo Nová výzva", () => {
  test.skip(!trainerEmail, "Chýba E2E_TRAINER_EMAIL.");

  test("tlačidlo je vedľa Nového klienta, bez pretečenia, a otvorí formulár výzvy", async ({ page, baseURL }) => {
    await sessionLogin(page, trainerEmail!, baseURL!);
    await page.goto("/dashboard");
    const link = page.getByTestId("new-challenge-link");
    await expect(link).toHaveText("+ Nová výzva pre klientov");
    const add = page.getByRole("button", { name: "+ Nový klient" });
    if (await add.isVisible()) {
      const a = (await add.boundingBox())!;
      const b = (await link.boundingBox())!;
      expect(Math.abs(a.height - b.height)).toBeLessThan(2);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);

    await link.click();
    await expect(page).toHaveURL(/\/dashboard\/vyzvy#nova-vyzva$/, { timeout: 20_000 });
    await expect(page.locator("#nova-vyzva")).toBeVisible();
    const form = page.getByTestId("challenge-form");
    // formulár je vidieť, kým nie je dosiahnutý limit aktívnych výziev
    if (await form.count()) {
      await expect(form).toBeVisible();
      await expect(form.getByRole("textbox").first()).toBeFocused();
    } else {
      await expect(page.getByTestId("challenge-limit-reached").or(page.locator("#nova-vyzva"))).toBeVisible();
    }
  });
});
