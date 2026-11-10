import { test, expect, type Page } from "@playwright/test";

/**
 * Zabudnuté heslo — odpoveď Supabase (/auth/v1/recover) je podvrhnutá, žiadny e-mail sa
 * nepošle. Po odoslaní sa dá poslať znova až po odpočte (druhý klik predtým prepísal
 * „poslali sme“ na „Odoslanie zlyhalo“ — Supabase pošle na e-mail max. 1 odkaz za minútu).
 */

async function openForgot(page: Page, recover: { status: number; body: object }) {
  await page.route("**/auth/v1/recover**", (route) =>
    route.fulfill({ status: recover.status, contentType: "application/json", body: JSON.stringify(recover.body) }),
  );
  await page.goto("/prihlasenie");
  await page.getByRole("button", { name: "Zabudnuté heslo?" }).click();
  await page.locator("#forgot-email").fill("niekto@example.com");
}

test.describe("zabudnuté heslo", () => {
  test("po odoslaní neutrálna správa a odpočet do ďalšieho pokusu", async ({ page }) => {
    await openForgot(page, { status: 200, body: {} });
    await page.getByRole("button", { name: "Poslať odkaz na reset" }).click();
    await expect(page.getByRole("status").filter({ hasText: /poslali sme naň odkaz/ })).toBeVisible();
    const again = page.getByRole("button", { name: /Poslať znova o \d+ s/ });
    await expect(again).toBeDisabled();
  });

  test("limit jedného e-mailu (429 „after N seconds“) = rovnaká správa, nie chyba", async ({ page }) => {
    await openForgot(page, {
      status: 429,
      body: {
        code: 429,
        error_code: "over_email_send_rate_limit",
        msg: "For security purposes, you can only request this after 42 seconds.",
      },
    });
    await page.getByRole("button", { name: "Poslať odkaz na reset" }).click();
    await expect(page.getByRole("status").filter({ hasText: /poslali sme naň odkaz/ })).toBeVisible();
    await expect(page.getByText("Odoslanie zlyhalo")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Poslať znova o (4[0-2]) s/ })).toBeDisabled();
  });

  test("celkový limit e-mailov projektu ukáže zrozumiteľnú hlášku", async ({ page }) => {
    await openForgot(page, {
      status: 429,
      body: { code: 429, error_code: "over_email_send_rate_limit", msg: "email rate limit exceeded" },
    });
    await page.getByRole("button", { name: "Poslať odkaz na reset" }).click();
    await expect(page.getByText("Práve sa posiela priveľa e-mailov")).toBeVisible();
    await expect(page.getByRole("button", { name: "Poslať odkaz na reset" })).toBeEnabled();
  });
});
