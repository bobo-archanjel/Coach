import { test, expect } from "@playwright/test";

/**
 * Builder vlastného tréningu klienta (ClientPlanBuilder, DEV náhľad):
 * 1. chyba „Zadaj názov…“ je hore pod názvom (nie pod knižnicou), pole zvýraznené s kurzorom,
 * 2. rozpracovaný tréning prežije odchod na iný tab — v Tréningu karta „Pokračovať“ / „Zahodiť“
 *    (app/portal/trening/builderDraft.ts, localStorage).
 */
test.describe("builder vlastného tréningu — chyba hore a rozpracovaný koncept", () => {
  test.skip(process.env.NODE_ENV === "production", "DEV náhľady len v next dev");

  test("bez názvu: chyba hore pod názvom, pole zvýraznené a s kurzorom", async ({ page }) => {
    await page.goto("/portal/trening?preview=ok");
    await page.getByRole("button", { name: "Vlastný tréning" }).click();
    await page.getByLabel("Názov vlastného cviku").fill("Kliky");
    await page.getByRole("button", { name: "+ Pridať do tréningu" }).click();
    await page.getByRole("button", { name: "Hotovo", exact: true }).click();

    // uloženie tlačidlom dole
    await page.getByRole("button", { name: "Uložiť tréning" }).click();
    const alert = page.getByRole("alert").filter({ hasText: "Zadaj názov tréningového plánu." });
    await expect(alert).toBeVisible();
    await expect(alert).toBeInViewport();
    const nameInput = page.getByLabel("Názov tréningového plánu");
    await expect(nameInput).toBeFocused();
    await expect(nameInput).toHaveAttribute("aria-invalid", "true");
    // chyba je nad dráhou dní (hore), nie pod knižnicou
    const alertBox = await alert.boundingBox();
    const daysBox = await page.getByRole("group", { name: "Tréningové dni" }).boundingBox();
    expect(alertBox!.y).toBeLessThan(daysBox!.y);

    await nameInput.fill("Ranný tréning");
    await expect(alert).toHaveCount(0);
    await expect(nameInput).not.toHaveAttribute("aria-invalid", "true");
  });

  test("odchod na iný tab a späť: Pokračovať obnoví rozpracovaný tréning, Zahodiť ho zmaže", async ({ page }) => {
    await page.goto("/portal/trening?preview=ok");
    // otvorenie a odchod bez zmeny koncept nevytvorí
    await page.getByRole("button", { name: "Vlastný tréning" }).click();
    await page.goto("/portal?preview=ok");
    await page.goto("/portal/trening?preview=ok");
    await expect(page.getByTestId("builder-draft")).toHaveCount(0);

    await page.getByRole("button", { name: "Vlastný tréning" }).click();
    await page.getByLabel("Názov tréningového plánu").fill("Môj rozpracovaný");
    await page.getByLabel("Názov vlastného cviku").fill("Výpady");
    await page.getByRole("button", { name: "+ Pridať do tréningu" }).click();
    await page.getByRole("button", { name: "Hotovo", exact: true }).click();

    // iný tab (Dnes) a späť na Tréning
    await page.goto("/portal?preview=ok");
    await page.goto("/portal/trening?preview=ok");
    const card = page.getByTestId("builder-draft");
    await expect(card).toContainText("Rozpracovaný tréning");
    await expect(card).toContainText("Môj rozpracovaný");

    await card.getByRole("button", { name: "Pokračovať" }).click();
    await expect(page.getByLabel("Názov tréningového plánu")).toHaveValue("Môj rozpracovaný");
    await expect(page.getByText("Výpady", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("group", { name: "Tréningové dni" }).getByRole("button", { name: /Tréning 1/ })).toContainText("1");

    // ďalší odchod, tentoraz Zahodiť
    await page.goto("/portal?preview=ok");
    await page.goto("/portal/trening?preview=ok");
    await page.getByTestId("builder-draft").getByRole("button", { name: "Zahodiť" }).click();
    await expect(page.getByTestId("builder-draft")).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId("builder-draft")).toHaveCount(0);
  });

  test("úprava existujúceho tréningu: rozpracovaná úprava sa po návrate obnoví", async ({ page }) => {
    await page.goto("/portal/trening?preview=ok");
    await page.getByRole("button", { name: /Moje kardio \+ core/ }).first().click();
    await page.getByRole("button", { name: "Upraviť", exact: true }).click();
    await page.getByLabel("Názov tréningového plánu").fill("Kardio upravené");

    await page.goto("/portal?preview=ok");
    await page.goto("/portal/trening?preview=ok");
    const card = page.getByTestId("builder-draft");
    await expect(card).toContainText("Rozpracovaná úprava tréningu");
    await expect(card).toContainText("Kardio upravené");
    await card.getByRole("button", { name: "Pokračovať" }).click();
    await expect(page.getByRole("region", { name: /Upraviť|úprav/i })).toBeVisible();
    await expect(page.getByLabel("Názov tréningového plánu")).toHaveValue("Kardio upravené");
    await expect(page.getByRole("group", { name: "Tréningové dni" }).getByRole("button", { name: /Rozcvička/ })).toBeVisible();
  });
});
