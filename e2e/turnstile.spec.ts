import { test, expect, type Page } from "@playwright/test";

/**
 * Cloudflare Turnstile na prihlásení ostáva viditeľný pri prepínaní formulárov
 * (useTurnstile, app/components/Turnstile.tsx). Predtým sa widget vykreslil raz pri
 * načítaní — po „Registrácia“ → „Prihlásenie“ alebo návrate zo „Zabudnuté heslo?“ bolo
 * miesto prázdne a prihlásenie nešlo, kým používateľ neobnovil stránku.
 * Lokálne Cloudflare doménu odmietne (chyba 110200), widget (iframe) sa však vykreslí —
 * test kontroluje, že je v kontajneri práve raz, nie či prešla výzva.
 */

/** Počet widgetov vo viditeľnom kontajneri Turnstile (0 = prázdne miesto). */
async function widgets(page: Page): Promise<number> {
  return page.evaluate(() => {
    const box = [...document.querySelectorAll<HTMLElement>("[class*=turnstile]")].find((el) => el.offsetParent !== null);
    return box ? box.children.length : -1;
  });
}

async function expectWidget(page: Page, label: string) {
  await expect.poll(() => widgets(page), { message: label, timeout: 15_000 }).toBe(1);
}

test("Turnstile je vidieť po každom prepnutí formulára", async ({ page }) => {
  await page.goto("/prihlasenie");
  await expectWidget(page, "prihlásenie po načítaní");

  for (let round = 1; round <= 3; round++) {
    await page.getByRole("tab", { name: "Registrácia" }).click();
    await expectWidget(page, `registrácia (${round}.)`);
    await page.getByRole("tab", { name: "Prihlásenie" }).click();
    await expectWidget(page, `späť na prihlásenie (${round}.)`);
  }

  await page.getByRole("button", { name: "Zabudnuté heslo?" }).click();
  await page.getByRole("button", { name: /Späť/ }).first().click();
  await expectWidget(page, "po návrate zo zabudnutého hesla");
});
