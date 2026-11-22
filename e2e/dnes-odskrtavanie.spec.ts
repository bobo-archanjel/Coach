import { test, expect, type Page } from "@playwright/test";

/**
 * Tréning na karte Dnes (DEV náhľad ?preview=ok — 6 cvikov, Predkopávanie + Zakopávanie v supersérii):
 *  - odškrtnutie sérií (číslo série = tlačidlo), krúžok „x/y cvikov“ sa mení počas cvičenia,
 *  - malé „+ cvik“ medzi cvikmi vloží cvik na to miesto a krúžok zvýši počet cvikov,
 *  - veľké „Pridať cvik“ dole už nie je, odškrtnutia prežijú refresh.
 */
const ring = (page: Page) => page.getByTestId("progress-ring");
const check = (page: Page, name: string, n: number) => page.getByRole("button", { name: `${name}, séria ${n} odcvičená` });

test.describe("karta Dnes — odškrtávanie sérií a krúžok počas tréningu", () => {
  test.skip(process.env.NODE_ENV === "production", "DEV náhľady len v next dev");

  test.beforeEach(async ({ page }) => {
    await page.goto("/portal?preview=ok");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.getByRole("button", { name: "Začať tréning" }).click();
  });

  test("odškrtnuté série posúvajú krúžok, cvik je hotový až so všetkými sériami", async ({ page }) => {
    await expect(ring(page)).toHaveAttribute("data-done", "0");
    await expect(ring(page)).toHaveAttribute("data-total", "6");

    const drep = "Drep s veľkou činkou"; // 4 série
    for (const n of [1, 2, 3]) await check(page, drep, n).click();
    await expect(check(page, drep, 1)).toHaveAttribute("aria-pressed", "true");
    await expect(ring(page)).toHaveAttribute("data-done", "0");
    await check(page, drep, 4).click();
    await expect(ring(page)).toHaveAttribute("data-done", "1");
    await expect(ring(page)).toContainText("1/6");

    // odškrtnutie späť
    await check(page, drep, 2).click();
    await expect(check(page, drep, 2)).toHaveAttribute("aria-pressed", "false");
    await expect(ring(page)).toHaveAttribute("data-done", "0");
    await check(page, drep, 2).click();

    // prežije refresh (koncept tréningu)
    await page.reload();
    await expect(check(page, drep, 4)).toHaveAttribute("aria-pressed", "true");
    await expect(ring(page)).toHaveAttribute("data-done", "1");
  });

  test("„+ cvik“ medzi cvikmi vloží cvik na to miesto, krúžok zráta aj pridaný cvik", async ({ page }) => {
    // veľké „Pridať cvik“ dole zrušené — len malé „+ cvik“ medzi cvikmi / za posledným
    await expect(page.getByRole("button", { name: "Pridať cvik", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Pridať cvik na koniec tréningu" })).toBeVisible();

    await page.getByRole("button", { name: "Pridať cvik medzi Drep s veľkou činkou a Rumunský mŕtvy ťah" }).click();
    // okno „Pridať cvik“ povie, kam sa cvik vloží; Esc ho zavrie bez pridania
    const dialog = page.getByRole("dialog", { name: "Pridať cvik" });
    await expect(dialog).toContainText("Vloží sa za cvik Drep s veľkou činkou.");
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(ring(page)).toHaveAttribute("data-total", "6");
    await page.getByRole("button", { name: "Pridať cvik medzi Drep s veľkou činkou a Rumunský mŕtvy ťah" }).click();
    await page.getByLabel("Názov pridaného cviku").fill("Výpady");
    await dialog.getByRole("button", { name: "Pridať", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(ring(page)).toHaveAttribute("data-total", "7");

    // v poradí hneď za drepom — na stránke aj v zápise
    const names = await page.locator("[data-ex-idx]").evaluateAll((els) =>
      els.map((el) => el.querySelector("p")?.textContent?.replace(/Pridaný$/, "").trim() ?? ""),
    );
    expect(names.slice(0, 3)).toEqual(["Drep s veľkou činkou", "Výpady", "Rumunský mŕtvy ťah"]);
    await page.getByLabel("Výpady, séria 1, opakovania").fill("12");
    const entries = JSON.parse(await page.locator('input[name="entries"]').inputValue()) as { name: string }[];
    expect(entries.map((e) => e.name).slice(0, 3)).toEqual(["Drep s veľkou činkou", "Výpady", "Rumunský mŕtvy ťah"]);

    // hotový pridaný cvik → 1/7; poradie prežije refresh
    for (const n of [1, 2, 3]) await check(page, "Výpady", n).click();
    await expect(ring(page)).toContainText("1/7");
    await page.reload();
    await expect(ring(page)).toHaveAttribute("data-total", "7");
    await expect(ring(page)).toHaveAttribute("data-done", "1");
    await expect(page.locator("[data-ex-idx]").nth(1)).toContainText("Výpady");
  });

  test("vložený cvik medzi členov supersérie supersériu rozdelí", async ({ page }) => {
    await expect(page.locator('[data-superset="A1"]')).toContainText("Predkopávanie na stroji");
    await page.getByRole("button", { name: "Pridať cvik medzi Predkopávanie na stroji a Zakopávanie v ľahu" }).click();
    await page.getByLabel("Názov pridaného cviku").fill("Kliky");
    await page.getByRole("button", { name: "Pridať", exact: true }).click();
    await expect(page.locator("[data-superset]")).toHaveCount(0);
  });

  test("šípka nadol zbalí cvik (súhrn sérií), zbalenie prežije refresh", async ({ page }) => {
    const drep = "Drep s veľkou činkou";
    for (const n of [1, 2, 3, 4]) await check(page, drep, n).click();
    await page.getByRole("button", { name: `Zbaliť ${drep}` }).click();
    const block = page.locator("[data-ex-idx]").first();
    await expect(block.getByTestId("collapsed-summary")).toHaveText("Série 4/4");
    await expect(page.getByLabel(`${drep}, séria 1, opakovania`)).toHaveCount(0);
    await expect(page.getByRole("button", { name: `Rozbaliť ${drep}` })).toHaveAttribute("aria-expanded", "false");
    // ostatné cviky ostávajú rozbalené
    await expect(page.getByLabel("Rumunský mŕtvy ťah, séria 1, opakovania")).toBeVisible();

    await page.reload();
    await expect(page.locator("[data-ex-idx]").first().getByTestId("collapsed-summary")).toHaveText("Série 4/4");
    await page.getByRole("button", { name: `Rozbaliť ${drep}` }).click();
    await expect(page.getByLabel(`${drep}, séria 1, opakovania`)).toBeVisible();
    await expect(page.getByRole("button", { name: `Zbaliť ${drep}` })).toHaveAttribute("aria-expanded", "true");
  });

  test("stopky: panel sa zbalí šípkou nadol", async ({ page }) => {
    await page.getByRole("button", { name: /Otvoriť stopky|Otvoriť panel/ }).click();
    const panel = page.getByRole("dialog", { name: /Stopky/ });
    await expect(panel).toBeVisible();
    await panel.getByRole("button", { name: "Zavrieť", exact: true }).click();
    await expect(panel).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Otvoriť stopky|Otvoriť panel/ })).toBeVisible();
  });
});

test.describe("karta Dnes — odcvičený tréning: súhrn a zbalenie cvikov", () => {
  test.skip(process.env.NODE_ENV === "production", "DEV náhľady len v next dev");

  test("súhrn (cviky, série, objem, RPE) a cviky sa dajú zbaliť, voľba prežije refresh", async ({ page }) => {
    await page.goto("/portal?preview=done");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    // náhľad: 4 zapísané cviky z 8 (6 plánu + 2 pridané), 9 sérií, objem 4 594 kg, RPE 8
    const stats = page.getByTestId("done-stats");
    await expect(stats).toContainText("4/8");
    await expect(stats).toContainText(/série\s*9/);
    await expect(stats).toContainText(/4\s?594 kg/);
    await expect(stats).toContainText("8/10");

    const toggle = page.getByTestId("done-toggle");
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByTestId("completed-exercise").first()).toBeVisible();
    await expect(page.getByText("„Dobrý tréning, koleno OK.“")).toBeVisible();
    await expect(page.getByRole("button", { name: /Upraviť hodnoty/ })).toBeVisible();
    await toggle.click();
    await expect(toggle).toHaveText(/Zobraziť cviky/);
    await expect(page.getByTestId("completed-exercise")).toHaveCount(0);
    await expect(stats).toBeVisible();
    // zbalené: bez poznámky k tréningu a bez „Upraviť hodnoty“
    await expect(page.getByText("„Dobrý tréning, koleno OK.“")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Upraviť hodnoty/ })).toHaveCount(0);
    await expect(page.getByText("Tento tréning máš hotový — upraviť hodnoty môžeš kedykoľvek počas dnešného dňa")).toBeVisible();

    await page.reload();
    await expect(page.getByTestId("done-toggle")).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByTestId("completed-exercise")).toHaveCount(0);
    await page.getByTestId("done-toggle").click();
    await expect(page.getByTestId("completed-exercise").first()).toBeVisible();
  });
});
