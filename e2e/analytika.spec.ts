import { test, expect, type Page } from "@playwright/test";

/**
 * Analytika trénera (feature/analytika-v2) — beží proti DEV `?preview=` fixtures
 * (rovnaký dôvod ako smoke.spec.ts: bez reálnej session sa prihlásený tok inak
 * neoverí). Pokrýva: agregované počty portfólia, widget "Posledné PR", kombinovaný
 * súhrn na detaile klienta, PR badge, a tlačidlo AI zhrnutia portfólia.
 */

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text()}`);
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
}
const IGNORED = [/favicon/i, /Failed to load resource.*404/i, /supabase/i, /Failed to fetch/i, /net::ERR/i];
const realErrors = (errs: string[]) => errs.filter((e) => !IGNORED.some((re) => re.test(e)));

test.describe("/dashboard/analytika?preview=ok", () => {
  test("zdravie portfólia: počty podľa zdravotného koša", async ({ page }) => {
    const errs = collectErrors(page);
    await page.goto("/dashboard/analytika?preview=ok");

    // fixture: p1 Oto = riziko, p2 Petra = sleduj, p3 Viktor + p4 Braňo = v poriadku, p5 Nina = bez dát
    const stat = (label: string) => page.getByText(label, { exact: true }).locator("xpath=..");
    await expect(stat("V poriadku")).toContainText("2");
    await expect(stat("Sleduj")).toContainText("1");
    await expect(stat("Riziko")).toContainText("1");
    await expect(stat("Bez dát")).toContainText("1");

    expect(realErrors(errs), realErrors(errs).join("\n")).toEqual([]);
  });

  test("widget Posledné PR: naprieč klientmi, najnovšie prvé", async ({ page }) => {
    await page.goto("/dashboard/analytika?preview=ok");

    await expect(page.getByText(/Posledné osobné maximá/i)).toBeVisible();
    const prPanel = page.locator("ul").filter({ hasText: "Vzorový Viktor" });
    const items = prPanel.locator("li");
    await expect(items).toHaveCount(2);

    // Viktor (pred 2 dňami) pred Petrou (pred 5 dňami)
    await expect(items.nth(0)).toContainText("Vzorový Viktor");
    await expect(items.nth(0)).toContainText("Drep s veľkou činkou");
    await expect(items.nth(0)).toContainText("105 kg");
    await expect(items.nth(1)).toContainText("Priemerná Petra");
    await expect(items.nth(1)).toContainText("Mŕtvy ťah");

    await items.nth(0).getByRole("link").click();
    await expect(page).toHaveURL(/\/dashboard\/klienti\/p3/);
  });

  test("AI zhrnutie portfólia: ukážkový text v preview, bez tlačidla", async ({ page }) => {
    await page.goto("/dashboard/analytika?preview=ok");

    await expect(page.getByRole("heading", { name: /AI zhrnutie portfólia/i })).toBeVisible();
    await expect(page.getByText(/Zameraj sa na Ota/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /Zhrnúť týždeň/i })).toHaveCount(0);
  });

  test("roster: chip splnenia plánu len keď je hodnota", async ({ page }) => {
    await page.goto("/dashboard/analytika?preview=ok");

    await expect(page.getByRole("link", { name: /Ohrozený Oto/ })).toContainText(/Plán\s*41/);
    await expect(page.getByRole("link", { name: /Nováčik Nina/ })).not.toContainText("Plán");
  });
});

test.describe("/dashboard/klienti/[id]?preview=progress", () => {
  // Preview má len sekciu "Analytika" — obsah je vyrenderovaný priamo, netreba klikať.
  test.beforeEach(async ({ page }) => {
    await page.goto("/dashboard/klienti/x?preview=progress");
  });

  test("kombinovaný súhrn: tréning, plán, strava, váha naraz", async ({ page }) => {
    const summary = page.locator("div").filter({ hasText: /^Tréning/ }).filter({ hasText: "(90 dní)" }).last();
    await expect(summary).toContainText("Tréning");
    await expect(summary).toContainText("73 %");
    await expect(summary).toContainText("Plán");
    await expect(summary).toContainText("81 %");
    await expect(summary).toContainText("Strava");
    await expect(summary).toContainText("76 %");
    await expect(summary).toContainText("kg (90 dní)");
  });

  test("splnenie plánu vedľa binárnej adherencie", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Splnenie plánu" })).toBeVisible();
    await expect(page.getByText(/30 dní:\s*81 %\s*\(11 tréningov\)/)).toBeVisible();
    await expect(page.getByText(/90 dní:\s*77 %\s*\(34 tréningov\)/)).toBeVisible();

    // pôvodná binárna adherencia ostáva
    await expect(page.getByRole("heading", { name: "Adherencia tréningu" })).toBeVisible();
    await expect(page.getByText(/22\/\s*30 dní/)).toBeVisible();
  });

  test("PR badge: len pri cviku, kde padlo maximum", async ({ page }) => {
    const select = page.getByLabel("Vyber cvik");

    await expect(select).toHaveValue("Bench press");
    await expect(page.getByText("Nové osobné maximum")).toHaveCount(0);

    await select.selectOption("Drep s veľkou činkou");
    await expect(page.getByText("Nové osobné maximum")).toBeVisible();

    await select.selectOption("Mŕtvy ťah");
    await expect(page.getByText("Nové osobné maximum")).toBeVisible();

    await select.selectOption("Bench press");
    await expect(page.getByText("Nové osobné maximum")).toHaveCount(0);
  });
});

test.describe("/dashboard/klienti/[id]?preview=progress_empty", () => {
  test("splnenie plánu ukáže vysvetľujúci prázdny stav", async ({ page }) => {
    await page.goto("/dashboard/klienti/x?preview=progress_empty");
    await expect(page.getByText(/nedá sa porovnať s predpisom/i)).toBeVisible();
  });
});
