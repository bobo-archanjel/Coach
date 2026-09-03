import { test, expect } from "@playwright/test";

/**
 * Reálne prihlásenie (nie ?preview=) — na rozdiel od smoke.spec.ts, ktorý beží
 * len proti preview stavom kvôli placeholder Supabase kľúču v CI. Tento súbor
 * beží len lokálne, kde .env.local má reálny dev Supabase projekt a tieto
 * dva seedované test účty (tréner s viacerými klientmi vrátane existujúceho
 * chat vlákna). Ak CI/iný stroj nemá tieto účty, tento súbor pred spustením
 * treba preskočiť (`--grep-invert`) alebo doplniť vlastné test dáta.
 */
const TRAINER = { email: "ahoj@gmail.com", password: "test12345" };

async function loginAsTrainer(page: import("@playwright/test").Page) {
  await page.goto("/prihlasenie");
  await page.locator("#login-email").fill(TRAINER.email);
  await page.locator("#login-password").fill(TRAINER.password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/dashboard/, { timeout: 20000 });
}

test.describe("Centrálna schránka správ /dashboard/spravy", () => {
  test("nav položka 'Správy' vedie na inbox", async ({ page }) => {
    await loginAsTrainer(page);
    await page.locator("a[href='/dashboard/spravy']").click();
    await expect(page).toHaveURL(/\/dashboard\/spravy/);
    await expect(page.getByRole("heading", { name: "Správy" })).toBeVisible();
  });

  test("zoznam konverzácií sa načíta, zoradený podľa aktivity", async ({ page }) => {
    await loginAsTrainer(page);
    await page.goto("/dashboard/spravy");
    const rows = page.locator("a[href^='/dashboard/spravy?client=']");
    await expect(rows.first()).toBeVisible({ timeout: 10000 });
    expect(await rows.count()).toBeGreaterThan(0);
  });

  test("výber konverzácie otvorí vlákno a dá sa v ňom písať", async ({ page, isMobile }) => {
    await loginAsTrainer(page);
    await page.goto("/dashboard/spravy");
    const firstRow = page.locator("a[href^='/dashboard/spravy?client=']").first();
    await firstRow.waitFor({ timeout: 10000 });
    const clientName = (await firstRow.locator("[class*='clientName']").innerText()).trim();
    await firstRow.click();
    await expect(page).toHaveURL(/client=/);

    // vlákno vpravo (desktop) alebo namiesto zoznamu (mobile) — v oboch
    // prípadoch composer musí byť viditeľný a nadpis sedí na vybraného klienta.
    await expect(page.locator("textarea[aria-label='Napísať správu']")).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("heading", { name: clientName })).toBeVisible();

    if (isMobile) {
      // na mobile sa po výbere zoznam skryje, zostáva len vlákno + späť
      await expect(page.locator("a[href^='/dashboard/spravy?client=']").first()).toBeHidden();
      await expect(page.getByText("Späť na zoznam")).toBeVisible();
    } else {
      // na desktope zoznam ostáva viditeľný vedľa vlákna
      await expect(page.locator("a[href^='/dashboard/spravy?client=']").first()).toBeVisible();
    }

    const before = await page.locator("[class*='bubble']").count();
    const text = `e2e test spravy-inbox ${Date.now()}`;
    await page.locator("textarea[aria-label='Napísať správu']").fill(text);
    await page.locator("button[aria-label='Odoslať']").click();
    await expect
      .poll(async () => page.locator("[class*='bubble']").count(), { timeout: 15000 })
      .toBeGreaterThan(before);
    await expect(page.getByText(text)).toBeVisible();
  });

  test("odkaz 'Späť na zoznam' na mobile vráti na plný zoznam", async ({ page, isMobile }) => {
    test.skip(!isMobile, "back-link je relevantný len na mobile layoute");
    await loginAsTrainer(page);
    await page.goto("/dashboard/spravy");
    await page.locator("a[href^='/dashboard/spravy?client=']").first().click();
    await expect(page).toHaveURL(/client=/);
    await page.getByText("Späť na zoznam").click();
    await expect(page).toHaveURL(/\/dashboard\/spravy$/);
    await expect(page.locator("a[href^='/dashboard/spravy?client=']").first()).toBeVisible();
  });
});
