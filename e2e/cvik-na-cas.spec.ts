import { test, expect } from "@playwright/test";

/**
 * Cvik na čas (statické holdy, plank): v úprave cviku prepínač „Opakovania / Čas“.
 * Čas sa uloží do `reps` ako „60 s“ (lib/workouts/timedReps.ts); zápis tréningu so
 * sekundami pokrýva e2e/training-done.spec.ts. DEV náhľady bez session.
 */

test.describe("cvik na čas v builderi", () => {
  test.skip(process.env.NODE_ENV === "production", "DEV náhľady len v next dev");

  test("tréner: Opakovania ↔ Čas, do formulára ide „60 s“", async ({ page }) => {
    await page.goto("/dashboard/treningy/x?preview=builder");
    await page.getByRole("button", { name: "Upraviť cvik" }).first().click();
    const form = page.locator("form").filter({ has: page.getByRole("radiogroup", { name: /opakovania alebo čas/ }) });
    const reps = form.locator('input[name="reps"]');

    await expect(form.getByRole("radio", { name: "Opakovania" })).toHaveAttribute("aria-checked", "true");
    await expect(form.getByLabel("Opakovania", { exact: true })).toHaveValue("8-10");
    await expect(reps).toHaveValue("8-10");

    await form.getByRole("radio", { name: "Čas" }).click();
    await expect(form.getByRole("radio", { name: "Čas" })).toHaveAttribute("aria-checked", "true");
    await form.getByLabel("Čas série v sekundách").fill("60");
    await expect(reps).toHaveValue("60 s");
    // pauza ostáva samostatné pole
    await expect(form.locator('input[name="rest_seconds"]')).toBeVisible();

    // späť na opakovania — pôvodná hodnota ostala
    await form.getByRole("radio", { name: "Opakovania" }).click();
    await expect(reps).toHaveValue("8-10");
  });

  test("klient: vlastný tréning — cvik na čas „3× 60 s“, úprava ho otvorí v režime Čas", async ({ page }) => {
    await page.goto("/portal/trening?preview=ok");
    await page.getByRole("button", { name: "Vlastný tréning" }).click();
    await page.getByRole("button", { name: "+ deň" }).click();
    const dayDialog = page.getByRole("dialog", { name: "Nový deň" });
    await dayDialog.locator("#client-day-name").fill("Core");
    await dayDialog.getByRole("button", { name: "Pridať", exact: true }).click();
    await page.getByLabel("Názov vlastného cviku").fill("Hollow hold");
    await page.getByRole("button", { name: "+ Pridať do tréningu" }).click();

    await page.getByRole("button", { name: "Upraviť cvik" }).first().click();
    await page.getByRole("radio", { name: "Čas" }).click();
    await page.getByLabel("Čas série v sekundách").fill("60");
    await page.getByRole("button", { name: "Hotovo", exact: true }).click();
    await expect(page.getByText("3× 60 s")).toBeVisible();

    await page.getByRole("button", { name: "Upraviť cvik" }).first().click();
    await expect(page.getByRole("radio", { name: "Čas" })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByLabel("Čas série v sekundách")).toHaveValue("60");
  });
});
