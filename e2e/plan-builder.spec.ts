import { test, expect, type Page } from "@playwright/test";

/**
 * PlanBuilder — presúvanie poradia cvikov, redizajn dňových piluliek, mazanie
 * konceptu (feature/ai-plan-zameranie, 2. commit). Beží proti DEV `?preview=builder`
 * (bez session; server actions v preview nič nezapíšu, ale optimistický presun
 * v PlanBuilderi sa dá overiť).
 */

function collectErrors(page: Page): string[] {
  const e: string[] = [];
  page.on("pageerror", (x) => e.push(x.message));
  page.on("console", (m) => {
    if (m.type() === "error") e.push(`console: ${m.text()}`);
  });
  return e;
}
const IGNORED = [/favicon/i, /supabase/i, /Failed to fetch/i, /net::ERR/i, /Failed to load resource.*40[34]/i];
const real = (e: string[]) => e.filter((x) => !IGNORED.some((re) => re.test(x)));

test.describe("PlanBuilder /dashboard/treningy/[id]?preview=builder", () => {
  test("dňové pilulky: 4 dni + pridať, prepínanie", async ({ page }) => {
    const errs = collectErrors(page);
    await page.goto("/dashboard/treningy/x?preview=builder");

    await expect(page.getByRole("button", { name: /Deň 1 — Tlak/ })).toHaveAttribute("aria-current", "true");
    await expect(page.getByRole("button", { name: /Deň 4 — Horná časť tela/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "+ deň" })).toBeVisible();

    // prepni na Deň 2 → panel ukáže jeho cviky (3)
    await page.getByRole("button", { name: /Deň 2 — Nohy/ }).click();
    await expect(page.getByRole("button", { name: /Deň 2 — Nohy/ })).toHaveAttribute("aria-current", "true");
    await expect(page.getByRole("button", { name: /Drep s veľkou činkou/ })).toBeVisible();
    await expect(page.getByText("Výpady")).toBeVisible();

    expect(real(errs), real(errs).join("\n")).toEqual([]);
  });

  test("šípky poradia: krajné sú disabled, presun preusporiada zoznam", async ({ page }) => {
    await page.goto("/dashboard/treningy/x?preview=builder");

    const rows = page.locator("[class*='exerciseRow']");
    await expect(rows.first()).toContainText("Bench press");
    await expect(rows.last()).toContainText("Kliky");

    // prvý cvik: „vyššie" disabled; posledný: „nižšie" disabled
    await expect(rows.first().getByRole("button", { name: "Posunúť cvik vyššie" })).toBeDisabled();
    await expect(rows.last().getByRole("button", { name: "Posunúť cvik nižšie" })).toBeDisabled();

    // posuň Bench press nižšie → Tlaky nad hlavu sú teraz prvé (optimisticky)
    await rows.first().getByRole("button", { name: "Posunúť cvik nižšie" }).click();
    await expect(page.locator("[class*='exerciseRow']").first()).toContainText("Tlaky nad hlavu");
    await expect(page.locator("[class*='exerciseRow']").nth(1)).toContainText("Bench press");
  });

  test("mazanie konceptu: dvojkrokové potvrdenie", async ({ page }) => {
    await page.goto("/dashboard/treningy/x?preview=builder");

    await expect(page.getByText("Koncept — klient ho ešte nevidí")).toBeVisible();
    const del = page.getByRole("button", { name: "Zmazať koncept" });
    await expect(del).toBeVisible();
    await del.click();

    await expect(page.getByText("Zmazať tento koncept?")).toBeVisible();
    await expect(page.getByRole("button", { name: "Áno, zmazať" })).toBeVisible();
    await page.getByRole("button", { name: "Zrušiť" }).click();
    await expect(page.getByRole("button", { name: "Zmazať koncept" })).toBeVisible();
  });
});
