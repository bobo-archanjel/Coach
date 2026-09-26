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

  test("vlastný cvik: 'Pridať do tréningu' aj 'Pridať do knižnice' vedľa seba", async ({ page }) => {
    const errs = collectErrors(page);
    await page.goto("/dashboard/treningy/x?preview=builder");

    // Knižnica je na mobile defaultne zbalená — rozbaľ ju.
    const libToggle = page.getByRole("button", { name: /Knižnica cvikov/ });
    if ((await libToggle.getAttribute("aria-expanded")) === "false") await libToggle.click();

    const addToTraining = page.getByRole("button", { name: "+ Pridať do tréningu" });
    const addToLibrary = page.getByRole("button", { name: "+ Pridať do knižnice" });
    await expect(addToTraining).toBeVisible();
    await expect(addToLibrary).toBeVisible();
    // preview má dni → je aktívny deň, takže "do tréningu" je povolené
    await expect(addToTraining).toBeEnabled();

    await page.getByPlaceholder("Nový vlastný cvik").fill("Testovací cvik");
    await addToTraining.click(); // server action v preview nezapíše, ale nesmie spadnúť

    expect(real(errs), real(errs).join("\n")).toEqual([]);
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

  test("zmazanie dňa: potvrdenie s názvom dňa, Zrušiť aj Esc nič nezmažú", async ({ page }) => {
    await page.goto("/dashboard/treningy/x?preview=builder");

    const delDay = page.getByRole("button", { name: "Zmazať deň", exact: true });
    await delDay.click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText("Naozaj zmazať deň „Deň 1 — Tlak (hrudník, ramená, triceps)“ aj s 6 cvikmi?");
    await expect(dialog).not.toContainText("ostanú uložené"); // deň 1 v preview nikto neodcvičil
    await dialog.getByRole("button", { name: "Zrušiť" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Deň 1 — Tlak/ })).toBeVisible();

    // Esc zruší; prepnutie dňa ukáže potvrdenie pre nový deň (odcvičený → info o záznamoch)
    await delDay.click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await page.getByRole("button", { name: /Deň 2 — Nohy/ }).click();
    await page.getByRole("button", { name: "Zmazať deň", exact: true }).click();
    await expect(page.getByRole("alertdialog")).toContainText("„Deň 2 — Nohy a spodný chrbát“ aj s 3 cvikmi");
    await expect(page.getByRole("alertdialog")).toContainText("ostanú uložené");
    await expect(page.getByRole("button", { name: "Áno, zmazať deň" })).toBeVisible();
  });
});

test.describe("názov plánu — ceruzka (?preview=builder)", () => {
  test("ceruzka otvorí pole s názvom, Esc aj Zrušiť vrátia pôvodný nadpis", async ({ page }) => {
    await page.goto("/dashboard/treningy/x?preview=builder");

    await expect(page.getByRole("button", { name: "Iný názov" })).toHaveCount(0);
    await page.getByRole("button", { name: "Upraviť názov plánu" }).click();
    const input = page.getByLabel("Názov plánu");
    await expect(input).toHaveValue("AI plán — hypertrofia");
    await input.fill("Nový názov");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("heading", { name: "AI plán — hypertrofia" })).toBeVisible();

    await page.getByRole("button", { name: "Upraviť názov plánu" }).click();
    await page.getByLabel("Názov plánu").fill("   ");
    await page.getByRole("button", { name: "Uložiť", exact: true }).click();
    await expect(page.getByText("Zadaj názov plánu.")).toBeVisible();
    await page.getByRole("button", { name: "Zrušiť" }).click();
    await expect(page.getByRole("heading", { name: "AI plán — hypertrofia" })).toBeVisible();
  });
});

test.describe("PlanBuilder bez dní (?preview=builder_empty)", () => {
  test("klik na cvik v knižnici bez dňa ukáže hlášku namiesto mŕtveho tlačidla", async ({ page }) => {
    const errs = collectErrors(page);
    await page.goto("/dashboard/treningy/x?preview=builder_empty");

    const libToggle = page.getByRole("button", { name: /Knižnica cvikov/ });
    if ((await libToggle.getAttribute("aria-expanded")) === "false") await libToggle.click();

    await expect(page.getByRole("button", { name: "Zmazať deň", exact: true })).toHaveCount(0);
    const item = page.getByRole("button", { name: /^Hip thrust s činkou/ });
    await expect(item).toBeEnabled();
    await item.click();
    await expect(page.getByText("Najprv pridaj tréningový deň.")).toBeVisible();
    await expect(page.getByText("Vytvor prvý deň vyššie.")).toBeVisible();

    expect(real(errs), real(errs).join("\n")).toEqual([]);
  });
});
