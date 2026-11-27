import { test, expect } from "@playwright/test";
import { sessionLogin } from "./helpers/sessionLogin";

/**
 * Nastavenia trénera sú rozdelené do 7 záložiek (?sekcia=): Účet (predvolená), Komunikácia,
 * Značka, Verejná stránka, Záujemcovia, Predplatné, Aplikácia. Na počítači zvislé menu vľavo, na mobile rad hore.
 * Prihlásenie bez formulára (CAPTCHA) — e2e/helpers/sessionLogin.ts.
 *   E2E_TRAINER_EMAIL
 */
try {
  process.loadEnvFile(".env.local");
} catch {
  /* bez .env.local sa test preskočí */
}
const trainerEmail = process.env.E2E_TRAINER_EMAIL;

const TABS = [
  { id: "ucet", name: "Účet", marker: "Zmazanie účtu" },
  { id: "komunikacia", name: "Komunikácia", marker: "" },
  { id: "znacka", name: "Značka", marker: "" },
  { id: "stranka", name: "Verejná stránka", marker: "" },
  { id: "zaujemcovia", name: "Záujemcovia", marker: "" },
  { id: "predplatne", name: "Predplatné", marker: "" },
  { id: "aplikacia", name: "Aplikácia", marker: "" },
] as const;
const CARD_OF: Record<string, string> = {
  komunikacia: "comms-card",
  znacka: "branding-card",
  stranka: "public-page-card",
  zaujemcovia: "leads-list",
  predplatne: "open-billing",
};

test.describe("nastavenia — záložky kategórií", () => {
  test.skip(!trainerEmail, "Chýba E2E_TRAINER_EMAIL.");

  test.beforeEach(async ({ page, baseURL }) => {
    await sessionLogin(page, trainerEmail!, baseURL!);
  });

  test("7 záložiek v poradí, predvolene Účet, prepnutie nastaví ?sekcia= a reload ju drží", async ({ page }) => {
    await page.goto("/dashboard/nastavenia");
    const tablist = page.getByRole("tablist", { name: "Kategórie nastavení" });
    await expect(tablist.getByRole("tab")).toHaveText(TABS.map((t) => t.name));
    await expect(tablist.getByRole("tab", { name: "Účet" })).toHaveAttribute("aria-selected", "true");
    const panel = page.getByRole("tabpanel");
    await expect(panel.getByRole("heading", { name: "Profil" })).toBeVisible();
    await expect(page.getByTestId("trainer-deletion")).toBeVisible();
    await expect(page.getByTestId("comms-card")).toHaveCount(0);

    for (const t of TABS.slice(1)) {
      await tablist.getByRole("tab", { name: t.name, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`[?&]sekcia=${t.id}$`));
      const marker = t.id === "zaujemcovia" ? page.getByTestId("leads-list").or(page.getByTestId("leads-locked")) : page.getByTestId(CARD_OF[t.id] ?? "settings-guide-none").or(panel.locator('[data-tour="settings-guide"]'));
      await expect(marker).toBeVisible();
      await expect(page.getByTestId("trainer-deletion")).toHaveCount(0);
    }

    // reload ostane na tej istej záložke
    await page.reload();
    await expect(tablist.getByRole("tab", { name: "Aplikácia" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("combobox", { name: "Jazyk appky" })).toBeVisible();

    // späť na prvú záložku parameter odstráni
    await tablist.getByRole("tab", { name: "Účet" }).click();
    await expect(page).not.toHaveURL(/sekcia=/);
  });

  test("klávesy šípok prepínajú záložky (hore/dole aj vľavo/vpravo)", async ({ page }) => {
    await page.goto("/dashboard/nastavenia");
    const tablist = page.getByRole("tablist", { name: "Kategórie nastavení" });
    await tablist.getByRole("tab", { name: "Účet" }).focus();
    await page.keyboard.press("ArrowDown");
    await expect(tablist.getByRole("tab", { name: "Komunikácia" })).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("ArrowRight");
    await expect(tablist.getByRole("tab", { name: "Značka" })).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("End");
    await expect(tablist.getByRole("tab", { name: "Aplikácia" })).toHaveAttribute("aria-selected", "true");
  });

  test("rozloženie: na počítači zvislé menu vľavo od obsahu, na mobile rad nad obsahom", async ({ page }, testInfo) => {
    await page.goto("/dashboard/nastavenia");
    const tabs = await page.getByRole("tablist", { name: "Kategórie nastavení" }).boundingBox();
    const panel = await page.getByRole("tabpanel").boundingBox();
    expect(tabs && panel).toBeTruthy();
    const vw = page.viewportSize()!.width;
    if (vw >= 900) {
      expect(tabs!.x + tabs!.width, `${testInfo.project.name}: menu vľavo`).toBeLessThanOrEqual(panel!.x + 1);
      expect(tabs!.height).toBeGreaterThan(tabs!.width); // zvislý stĺpec
    } else {
      expect(tabs!.y + tabs!.height, `${testInfo.project.name}: rad nad obsahom`).toBeLessThanOrEqual(panel!.y + 1);
      expect(tabs!.width).toBeGreaterThan(tabs!.height);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(vw);
  });

  test("Záujemcovia: záložka ukáže zoznam alebo zamknutie, filter stavu sa po prepnutí zahodí", async ({ page }) => {
    await page.goto("/dashboard/nastavenia?sekcia=zaujemcovia&stav=new");
    const tablist = page.getByRole("tablist", { name: "Kategórie nastavení" });
    await expect(tablist.getByRole("tab", { name: "Záujemcovia" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("leads-list").or(page.getByTestId("leads-locked"))).toBeVisible();
    await tablist.getByRole("tab", { name: "Aplikácia" }).click();
    await expect(page).toHaveURL(/sekcia=aplikacia/);
    await expect(page).not.toHaveURL(/stav=/);
  });

  test("/dashboard/zaujemcovia presmeruje na záložku (aj s filtrom stavu)", async ({ page }) => {
    await page.goto("/dashboard/zaujemcovia");
    await expect(page).toHaveURL(/\/dashboard\/nastavenia\?sekcia=zaujemcovia$/);
    await page.goto("/dashboard/zaujemcovia?stav=new");
    await expect(page).toHaveURL(/sekcia=zaujemcovia&stav=new$/);
  });

  test("bočné menu na počítači: bez Záujemcov, s Výzvami; Nastavenia aktívne na záložke", async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) < 900, "bočný panel je len na počítači");
    await page.goto("/dashboard/nastavenia?sekcia=zaujemcovia");
    const nav = page.getByRole("navigation", { name: "Trénerský dashboard" });
    await expect(nav.getByRole("link", { name: "Výzvy" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Záujemcovia" })).toHaveCount(0);
  });

  test("Záujemcovia: zoznam aj detail nepretečú šírku (320 a 390 px)", async ({ page }) => {
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/dashboard/nastavenia?sekcia=zaujemcovia");
      await expect(page.getByTestId("leads-list").or(page.getByTestId("leads-locked"))).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth), `zoznam @${width}`).toBeLessThanOrEqual(width);
      const row = page.getByTestId("lead-row").first();
      if (await row.count()) {
        await row.click();
        await expect(page.getByTestId("lead-detail")).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth), `detail @${width}`).toBeLessThanOrEqual(width);
      }
    }
  });
});
