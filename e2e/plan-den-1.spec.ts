import { test, expect } from "@playwright/test";

/**
 * Nový plán začína s jedným dňom „Deň 1“ — cviky sa dajú pridávať hneď, bez „+ deň“.
 * Klient (vlastný tréning, DEV náhľad); tréner: e2e/treningy-multi-klient.spec.ts (reálna DB).
 */
test.describe("nový plán má „Deň 1“", () => {
  test.skip(process.env.NODE_ENV === "production", "DEV náhľady len v next dev");

  test("klient: vlastný tréning začína dňom „Deň 1“, cvik sa pridá hneď", async ({ page }) => {
    await page.goto("/portal/trening?preview=ok");
    await page.getByRole("button", { name: "Vlastný tréning" }).click();
    const days = page.getByRole("group", { name: "Tréningové dni" });
    await expect(days.getByRole("button")).toHaveCount(2); // Deň 1 + „+ deň“
    await expect(days.getByRole("button", { name: /Deň 1/ })).toHaveAttribute("aria-current", "true");

    await page.getByLabel("Názov vlastného cviku").fill("Kliky");
    await page.getByRole("button", { name: "+ Pridať do tréningu" }).click();
    await page.getByRole("button", { name: "Hotovo", exact: true }).click();
    await expect(days.getByRole("button", { name: /Deň 1/ })).toContainText("1");
    await expect(page.getByText("Kliky", { exact: true }).first()).toBeVisible();
  });

  test("klient: šablóna ani úprava „Deň 1“ nepridajú", async ({ page }) => {
    await page.goto("/portal/trening?preview=ok");
    await page.getByRole("radio", { name: /Moje šablóny/ }).click();
    await page.getByRole("button", { name: "Použiť" }).click();
    const days = page.getByRole("group", { name: "Tréningové dni" });
    await expect(days.getByRole("button", { name: /Deň 1/ })).toHaveCount(0);
    await expect(days.getByRole("button", { name: /Rozcvička/ })).toBeVisible();
  });
});
