import { test, expect } from "@playwright/test";

/**
 * Tréning aj Jedálniček klienta: „Moje šablóny“ nie sú zbalená karta nad plánmi, ale
 * záložka vedľa plánov (app/portal/PlansTabs). DEV náhľady.
 */
test.describe("prepínač plány / moje šablóny", () => {
  test.skip(process.env.NODE_ENV === "production", "DEV náhľady len v next dev");

  test("Tréning: plány a šablóny v záložkách", async ({ page }) => {
    await page.goto("/portal/trening?preview=ok");
    const plansTab = page.getByRole("radio", { name: /Tréningové plány/ });
    const tplTab = page.getByRole("radio", { name: /Moje šablóny/ });
    await expect(plansTab).toHaveAttribute("aria-checked", "true");
    await expect(plansTab).toContainText("2");
    await expect(tplTab).toContainText("1");
    await expect(page.getByText("Silový plán — 3× týždenne").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Použiť" })).toHaveCount(0);

    await tplTab.click();
    await expect(tplTab).toHaveAttribute("aria-checked", "true");
    await expect(page.locator("#moje-sablony").getByText("Moje kardio + core")).toBeVisible();
    await expect(page.getByText("Silový plán — 3× týždenne")).toHaveCount(0);
    await page.getByRole("button", { name: "Použiť" }).click();
    await expect(page.getByLabel("Názov tréningového plánu")).toHaveValue("Moje kardio + core");
  });

  test("Jedálniček: jedálničky a šablóny v záložkách", async ({ page }) => {
    await page.goto("/portal/strava?preview=ok");
    const plansTab = page.getByRole("radio", { name: /Jedálničky/ });
    const tplTab = page.getByRole("radio", { name: /Moje šablóny/ });
    await expect(plansTab).toHaveAttribute("aria-checked", "true");
    await expect(page.locator("#moje-sablony-jedalnicka")).toHaveCount(0);
    await tplTab.click();
    await expect(page.locator("#moje-sablony-jedalnicka")).toBeVisible();
    await expect(page.getByRole("button", { name: "Použiť" })).toBeVisible();
    await plansTab.click();
    await expect(page.locator("#moje-sablony-jedalnicka")).toHaveCount(0);
  });
});
