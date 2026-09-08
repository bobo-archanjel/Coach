import { test, expect, type Page } from "@playwright/test";

/**
 * Onboarding bez trénera + kód klienta (feature/registracia-update). Beží proti
 * DEV `?preview=` fixtures (bez session; server actions v preview nič nezapíšu).
 * Plný flow s DB (registrácia → kód → tréner zadá kód → notifikácia → odpojenie)
 * sa overuje manuálne — viď zhrnutie.
 */

function collectErrors(page: Page): string[] {
  const e: string[] = [];
  page.on("pageerror", (x) => e.push(x.message));
  page.on("console", (m) => {
    if (m.type() === "error") e.push(`console: ${m.text()}`);
  });
  return e;
}
const IGNORED = [/favicon/i, /supabase/i, /Failed to fetch/i, /net::ERR/i, /Failed to load resource.*40[34]/i, /clipboard/i];
const real = (e: string[]) => e.filter((x) => !IGNORED.some((re) => re.test(x)));

test.describe("Registrácia klienta bez kódu", () => {
  test("klient path = žiadne pole na pozývací kód", async ({ page }) => {
    await page.goto("/prihlasenie");
    await page.getByRole("tab", { name: "Registrácia" }).click();
    await page.getByRole("button", { name: "Som klient", exact: true }).click();

    await expect(page.getByRole("heading", { name: /Vytvor si/i })).toBeVisible();
    await expect(page.getByLabel(/Pozývací kód/i)).toHaveCount(0);
    await expect(page.getByText(/Po registrácii dostaneš vlastný kód/i)).toBeVisible();
    await expect(page.getByRole("button", { name: "Vytvoriť účet" })).toBeVisible();
  });
});

test.describe("Portál — Profil (kód + prepojenie)", () => {
  test("bez trénera: kód, kopírovanie, prázdny stav trénera", async ({ page }) => {
    const errs = collectErrors(page);
    await page.goto("/portal/profil?preview=no_trainer");

    await expect(page.getByRole("heading", { name: "Profil" })).toBeVisible();
    await expect(page.getByText("Tvoj kód pre trénera", { exact: true })).toBeVisible();
    await expect(page.getByText(/^FP-[A-F0-9]{20}$/)).toBeVisible();
    await expect(page.getByRole("button", { name: /Kopírovať/i })).toBeVisible();
    await expect(page.getByText(/Zatiaľ nemáš trénera/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /Odpojiť sa/i })).toHaveCount(0);

    expect(real(errs), real(errs).join("\n")).toEqual([]);
  });

  test("s trénerom: meno + dvojkrokové odpojenie", async ({ page }) => {
    await page.goto("/portal/profil?preview=has_trainer");

    await expect(page.getByText(/Prepojený\/á s trénerom/i)).toContainText("Marek Novák");
    const disconnect = page.getByRole("button", { name: "Odpojiť sa od trénera" });
    await disconnect.click();

    await expect(page.getByText(/Odpojiť sa od trénera Marek Novák\?/i)).toBeVisible();
    await expect(page.getByRole("button", { name: "Áno, odpojiť" })).toBeVisible();
    await page.getByRole("button", { name: "Zrušiť" }).click();
    await expect(page.getByRole("button", { name: "Odpojiť sa od trénera" })).toBeVisible();
  });
});

test.describe("Dashboard — Pridať klienta kódom", () => {
  test("prepínač ciest + validácia kódu", async ({ page }) => {
    await page.goto("/dashboard?preview=addclient");
    await page.getByRole("button", { name: "+ Nový klient" }).click();

    // default = "Má FitPilot účet" → pole na kód
    await expect(page.getByRole("tab", { name: "Má FitPilot účet" })).toHaveAttribute("aria-selected", "true");
    const codeInput = page.getByLabel("Kód klienta");
    await expect(codeInput).toBeVisible();

    // krátky kód → validácia (klientská, bez server round-tripu)
    await codeInput.fill("FP-1");
    await page.getByRole("button", { name: "Pridať klienta" }).click();
    await expect(page.getByText(/príliš krátky/i)).toBeVisible();

    // prepni na manuálnu cestu
    await page.getByRole("tab", { name: "Ešte nemá účet" }).click();
    await expect(page.getByPlaceholder("Meno a priezvisko")).toBeVisible();
    await expect(page.getByLabel("Kód klienta")).toHaveCount(0);
  });
});

test.describe("Portál — stavy pre klienta bez trénera", () => {
  test("Chat: „Zatiaľ bez trénera“ namiesto prázdneho vlákna", async ({ page }) => {
    await page.goto("/portal/chat?preview=no_trainer");
    await expect(page.getByRole("heading", { name: /Zatiaľ bez trénera/i })).toBeVisible();
  });

  test("Dnes: bez plánu → CTA „Vytvoriť plán“ (nie „tréner ti nepriradil“)", async ({ page }) => {
    await page.goto("/portal?preview=no_plan_solo");
    await expect(page.getByText(/Vytvor si\s+vlastný v sekcii Tréning/i)).toBeVisible();
    await expect(page.getByRole("link", { name: "Vytvoriť plán" })).toBeVisible();
  });
});
