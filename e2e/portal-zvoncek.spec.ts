import { test, expect } from "@playwright/test";

/**
 * Zvonček upozornení klienta (portál) — vykreslený len raz (hlavička na mobile, bočný panel
 * na počítači), panel celý v obrazovke: na mobile na celú šírku pod hlavičkou, na počítači
 * nad položkami menu. Reálne prihlásenie QA klienta (E2E_CLIENT_EMAIL, E2E_CLIENT_PASSWORD).
 */

try {
  process.loadEnvFile(".env.local");
} catch {
  /* bez .env.local sa test preskočí */
}
const email = process.env.E2E_CLIENT_EMAIL;
const password = process.env.E2E_CLIENT_PASSWORD;

test.describe("zvonček upozornení klienta", () => {
  test.skip(!email || !password, "Chýbajú E2E_CLIENT_* údaje QA klienta.");

  test("jeden zvonček, panel v obrazovke", async ({ page }, info) => {
    test.setTimeout(90_000);
    await page.goto("/prihlasenie");
    await page.locator("#login-email").fill(email!);
    await page.locator("#login-password").fill(password!);
    await page.getByRole("button", { name: "Prihlásiť sa" }).click();
    await page.waitForURL(/\/portal$/, { timeout: 30_000 });

    const bell = page.getByRole("button", { name: /^Upozornenia/ });
    await expect(bell).toHaveCount(1);
    await bell.click();
    const panel = page.getByRole("region", { name: "Upozornenia" });
    await expect(panel).toBeVisible();

    const widths = info.project.name === "mobile" ? [412, 375, 320] : [page.viewportSize()!.width];
    for (const w of widths) {
      if (info.project.name === "mobile") await page.setViewportSize({ width: w, height: 740 });
      const box = (await panel.boundingBox())!;
      expect(box.x, `@${w}`).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, `@${w}`).toBeLessThanOrEqual(w);
    }

    // panel je navrchu (na počítači ho neprekrývajú položky bočného menu)
    const box = (await panel.boundingBox())!;
    const onTop = await page.evaluate(
      ([x, y]) => !!document.elementFromPoint(x, y)?.closest("#portal-attention-panel"),
      [box.x + 20, box.y + box.height / 2],
    );
    expect(onTop).toBe(true);
  });
});
