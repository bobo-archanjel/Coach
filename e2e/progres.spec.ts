import { test, expect } from "@playwright/test";

/**
 * Karta „Progres“ na Dnes (app/portal/ProgressCard.tsx) — graf zo záznamov meraní pod
 * „Tento týždeň“: predvolene váha, výber partie v spodnom paneli, výber merania ťukom
 * do grafu aj šípkami. DEV náhľady bez session (app/portal/preview.ts):
 * váha 88 → 83,9 kg (7 meraní), pás 7×, paža 34 → 35,5 cm (4×), hrudník 2×, boky 1×, stehno nič.
 */

test.describe("Progres na karte Dnes", () => {
  test.skip(process.env.NODE_ENV === "production", "DEV náhľady len v next dev");

  test("pod týždňom, váha s grafom, výber merania šípkami aj ťukom", async ({ page }) => {
    await page.goto("/portal?preview=ok");
    const order = await page
      .getByRole("region", { name: "Prehľad" })
      .locator("[data-tour]")
      .evaluateAll((els) => els.map((e) => e.getAttribute("data-tour")));
    expect(order).toEqual(["today-measure", "today-week", "today-progress"]);

    const card = page.locator('[data-tour="today-progress"]');
    // veľké číslo hore (os grafu má popisky s rovnakými hodnotami)
    const value = card.locator('[class*="pgNum"]');
    await expect(card.getByText("Progres", { exact: true })).toBeVisible();
    await expect(card.getByRole("button", { name: "Zobrazené: Váha. Vybrať inú hodnotu" })).toBeVisible();
    await expect(value).toHaveText("83,9");
    await expect(card.getByText("↓ 4,1 kg")).toBeVisible();

    const chart = card.getByRole("slider", { name: /Graf: Váha, 7 meraní/ });
    await expect(chart).toHaveAttribute("aria-valuetext", /: 83,9 kg$/);

    // šípka doľava = predošlé meranie, Home = prvé (bez zmeny oproti sebe)
    await chart.focus();
    await page.keyboard.press("ArrowLeft");
    await expect(value).toHaveText("85,1");
    await expect(card.getByText("↓ 2,9 kg")).toBeVisible();
    await page.keyboard.press("Home");
    await expect(value).toHaveText("88");
    await expect(card.getByText(/^od /)).toHaveCount(0);
    await page.keyboard.press("End");
    await expect(value).toHaveText("83,9");

    // ťuk do grafu pri ľavom okraji vyberie prvé meranie
    await chart.evaluate((el) => el.scrollIntoView({ block: "center", behavior: "instant" }));
    const box = (await chart.boundingBox())!;
    await page.mouse.click(box.x + 3, box.y + box.height / 2);
    await expect(chart).toHaveAttribute("aria-valuenow", "0");
    await expect(value).toHaveText("88");
  });

  test("výber partie v okne: paža, boky s jedným meraním, stehno bez merania", async ({ page }) => {
    await page.goto("/portal?preview=ok");
    const card = page.locator('[data-tour="today-progress"]');
    const value = card.locator('[class*="pgNum"]');
    await card.getByRole("button", { name: /Zobrazené: Váha/ }).click();

    const sheet = page.getByRole("dialog", { name: "Čo chceš sledovať" });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole("button", { name: /Váha/ })).toHaveAttribute("aria-current", "true");
    await expect(sheet.getByRole("button", { name: /Stehno/ })).toBeDisabled();
    await expect(sheet.getByRole("button", { name: /Stehno/ })).toContainText("zatiaľ bez merania");
    await expect(sheet.getByRole("button", { name: /Paža/ })).toContainText("35,5 cm");
    await expect(sheet.getByRole("button", { name: /Paža/ })).toContainText("4 merania");

    // Escape zavrie bez zmeny
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(card.getByRole("button", { name: /Zobrazené: Váha/ })).toBeFocused();

    await card.getByRole("button", { name: /Zobrazené: Váha/ }).click();
    await sheet.getByRole("button", { name: /Paža/ }).click();
    await expect(sheet).toBeHidden();
    await expect(card.getByRole("button", { name: /Zobrazené: Paža/ })).toBeVisible();
    await expect(value).toHaveText("35,5");
    await expect(card.getByText("↑ 1,5 cm")).toBeVisible();
    await expect(card.getByRole("slider", { name: /Graf: Paža, 4 merania/ })).toBeVisible();

    await card.getByRole("button", { name: /Zobrazené: Paža/ }).click();
    await sheet.getByRole("button", { name: /Boky/ }).click();
    await expect(value).toHaveText("98");
    await expect(card.getByText("Graf sa ukáže od druhého merania.")).toBeVisible();
    await expect(card.getByRole("slider")).toHaveCount(0);
  });

  test("bez meraní: krátka výzva, bez výberu partie", async ({ page }) => {
    await page.goto("/portal?preview=no_plan");
    const card = page.locator('[data-tour="today-progress"]');
    await expect(card.getByText(/Zatiaľ nemáš žiadne meranie/)).toBeVisible();
    await expect(card.getByRole("button")).toHaveCount(0);
  });

  test("graf sa zmestí do karty, bodky ostanú kruhy", async ({ page }) => {
    await page.goto("/portal?preview=ok");
    const card = page.locator('[data-tour="today-progress"]');
    const chart = card.getByRole("slider");
    const [c, k] = [(await chart.boundingBox())!, (await card.boundingBox())!];
    expect(c.x).toBeGreaterThanOrEqual(k.x);
    expect(c.x + c.width).toBeLessThanOrEqual(k.x + k.width);
    for (const dot of await chart.locator("span[aria-hidden]").all()) {
      const b = await dot.boundingBox();
      if (b && b.width > 1 && b.height > 1 && b.width < 20) expect(Math.abs(b.width - b.height)).toBeLessThan(0.5);
    }
  });
});
