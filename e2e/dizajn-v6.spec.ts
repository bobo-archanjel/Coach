import { test, expect } from "@playwright/test";

/**
 * Po prihlásení existuje len nový dizajn (v6) na /dashboard a /portal — bývalý portál
 * /v6design/portal/* trvalo presmeruje (next.config.ts), bývalý prepínač dizajnu
 * dashboardu (/v6design/dashboard, …/off) už neexistuje a prihlasovacie stránky
 * ostávajú v oboch vzhľadoch.
 * Bez session: redirecty rieši next.config, dashboard a portál sa v deve vykreslia cez
 * DEV náhľady (?preview=, DEV_OPEN v layoutoch).
 */

test.describe("jeden dizajn po prihlásení", () => {
  test("bývalý portál /v6design/portal trvalo presmeruje na /portal", async ({ request, baseURL }) => {
    const cases: [string, string][] = [
      ["/v6design", "/portal"],
      ["/v6design/portal", "/portal"],
      ["/v6design/portal/trening", "/portal/trening"],
      ["/v6design/portal/dennik", "/portal/dennik"],
    ];
    for (const [from, to] of cases) {
      const res = await request.get(from, { maxRedirects: 0 });
      expect(res.status(), from).toBe(308);
      expect(new URL(res.headers().location, baseURL).pathname, from).toBe(to);
    }
  });

  test("bývalý prepínač dizajnu dashboardu už neexistuje", async ({ request }) => {
    for (const path of ["/v6design/dashboard", "/v6design/dashboard/off"]) {
      const res = await request.get(path, { maxRedirects: 0 });
      expect(res.status(), path).toBe(404);
    }
  });

  test("dashboard aj portál sú v novom dizajne bez akejkoľvek cookie", async ({ page }) => {
    test.skip(process.env.NODE_ENV === "production", "DEV náhľady len v next dev");
    for (const path of ["/dashboard/klienti/x?preview=progress", "/portal?preview=ok"]) {
      await page.goto(path);
      await expect(page.locator("[data-v6-root]"), path).toHaveCount(1);
    }
    // Nastavenia už neponúkajú návrat na pôvodný dizajn
    await page.goto("/dashboard/klienti/x?preview=progress");
    await expect(page.getByText("Prepnúť na pôvodný dizajn")).toHaveCount(0);
  });

  test("prihlasovacie stránky ostávajú: /prihlasenie pôvodný vzhľad, /v6design/prihlasenie nový", async ({ page }) => {
    await page.goto("/prihlasenie");
    await expect(page.getByRole("button", { name: "Prihlásiť sa" })).toBeVisible();
    await expect(page.locator("[data-v6-root]")).toHaveCount(0);
    await page.goto("/v6design/prihlasenie");
    await expect(page.getByRole("button", { name: "Prihlásiť sa" })).toBeVisible();
    await expect(page.locator("[data-v6-root]")).toHaveCount(1);
  });
});

try {
  process.loadEnvFile(".env.local");
} catch {
  /* bez .env.local sa reálna časť preskočí */
}
const accounts = {
  trainer: [process.env.E2E_TRAINER_EMAIL, process.env.E2E_TRAINER_PASSWORD],
  client: [process.env.E2E_CLIENT_EMAIL, process.env.E2E_CLIENT_PASSWORD],
} as const;

test.describe("prihlásenie a odhlásenie (QA účty)", () => {
  test.skip(!Object.values(accounts).flat().every(Boolean), "Chýbajú E2E_* údaje QA účtov.");

  for (const [role, [email, password], home, themePage, signOutFrom] of [
    ["tréner", accounts.trainer, /\/dashboard$/, "/dashboard/nastavenia", "/dashboard"],
    ["klient", accounts.client, /\/portal$/, "/portal/profil", "/portal/profil"],
  ] as const) {
    test(`${role}: pôvodné /prihlasenie → nový dizajn, prepínač témy, odhlásenie → /v6design/prihlasenie`, async ({ page }) => {
      test.setTimeout(90_000);
      await page.goto("/prihlasenie");
      await page.locator("#login-email").fill(email!);
      await page.locator("#login-password").fill(password!);
      await page.getByRole("button", { name: "Prihlásiť sa" }).click();
      await page.waitForURL(home, { timeout: 30_000 });
      await expect(page.locator("[data-v6-root]")).toHaveCount(1);

      // téma Auto/Svetlá/Tmavá — prepne koreň hneď a drží sa aj po obnovení (cookie)
      await page.goto(themePage);
      const themes = page.getByRole("radiogroup", { name: "Téma" });
      await themes.getByRole("radio", { name: /Tmavá/ }).click();
      await expect(page.locator("[data-v6-root]")).toHaveAttribute("data-theme", "dark");
      await page.reload();
      await expect(page.locator("[data-v6-root]")).toHaveAttribute("data-theme", "dark");
      await page.getByRole("radiogroup", { name: "Téma" }).getByRole("radio", { name: /Svetlá/ }).click();
      await expect(page.locator("[data-v6-root]")).toHaveAttribute("data-theme", "light");

      await page.goto(signOutFrom);
      await page.getByRole("button", { name: "Odhlásiť sa" }).first().click();
      await page.waitForURL(/\/v6design\/prihlasenie$/, { timeout: 30_000 });
    });
  }
});

