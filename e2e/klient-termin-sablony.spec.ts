import { test, expect } from "@playwright/test";

/**
 * Klient (feature/klient-termin-sablony): × pri „Najbližší termín“ na karte Dnes upozornenie
 * skryje (termín ostáva v kalendári, skrytie prežije obnovenie stránky); „Náhľad“ pri
 * Mojich šablónach v Tréningu aj v Jedálničku. DEV náhľady.
 */
test.describe("klient — najbližší termín a náhľad šablón", () => {
  test.skip(process.env.NODE_ENV === "production", "DEV náhľady len v next dev");

  test("× skryje najbližší termín, ostáva skrytý aj po obnovení; v kalendári je ďalej", async ({ page, context }) => {
    await context.clearCookies();
    await page.goto("/portal?preview=ok");
    const notice = page.getByTestId("next-appointment");
    await expect(notice).toContainText("Najbližší termín");
    await notice.getByRole("button", { name: "Skryť termín (ostane v kalendári)" }).click();
    await expect(notice).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId("next-appointment")).toHaveCount(0);
    await expect(page.getByTestId("client-calendar")).toBeVisible();
  });

  test("Moje šablóny v Tréningu: Náhľad ukáže dni a cviky, Použiť šablónu otvorí builder", async ({ page }) => {
    await page.goto("/portal/trening?preview=ok");
    await page.getByRole("radio", { name: /Moje šablóny/ }).click();
    await page.getByRole("button", { name: "Náhľad" }).click();
    const dialog = page.getByRole("dialog", { name: "Moje kardio + core" });
    await expect(dialog.getByTestId("template-preview")).toContainText("Rozcvička");
    await expect(dialog).toContainText("Plank");
    await dialog.getByRole("button", { name: "Použiť šablónu" }).click();
    await expect(page.getByLabel("Názov tréningového plánu")).toHaveValue("Moje kardio + core");
  });

  test("Moje šablóny v Jedálničku: Náhľad ukáže dni, jedlá a kcal", async ({ page }) => {
    await page.goto("/portal/strava?preview=ok");
    await page.getByRole("radio", { name: /Moje šablóny/ }).click();
    await page.getByRole("button", { name: "Náhľad" }).click();
    const dialog = page.getByRole("dialog", { name: "Rýchle raňajky" });
    await expect(dialog).toContainText("Deň 1");
    await expect(dialog).toContainText("Ovsené vločky");
    await expect(dialog).toContainText("405 kcal");
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  });
});
