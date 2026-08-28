import { test, expect, type Page } from "@playwright/test";

/** Zbiera console.error a pageerror — manuálny tester si všimne "červené" v konzole. */
function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text()}`);
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
}

// Známy šum, ktorý nie je bug v našom kóde.
const IGNORED = [
  /favicon/i,
  /Failed to load resource.*404/i,
  /supabase/i, // placeholder kľúč → očakávané sieťové chyby
  /Failed to fetch/i,
  /net::ERR/i,
];
const realErrors = (errs: string[]) => errs.filter((e) => !IGNORED.some((re) => re.test(e)));

test.describe("Landing page /", () => {
  test("načíta sa, hlavička viditeľná, žiadne console chyby", async ({ page }) => {
    const errs = collectErrors(page);
    await page.goto("/");
    await expect(page).toHaveTitle(/FitPilot/i);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(realErrors(errs), realErrors(errs).join("\n")).toEqual([]);
  });

  test("nejaká cesta k prihláseniu je vždy dostupná (nav alebo hero CTA)", async ({ page, isMobile }) => {
    await page.goto("/");
    // na mobile je nav zbalená — ostáva len tlačidlo "Vyskúšať zadarmo"
    const entry = isMobile
      ? page.getByRole("link", { name: /Vyskúšať zadarmo/i })
      : page.getByRole("link", { name: /Prihlásiť sa/i }).first();
    await entry.click();
    await expect(page).toHaveURL(/\/prihlasenie/);
  });

  // FINDING: hero primárne CTA "Začať 14-dňové skúšobné obdobie" má href="#cennik"
  // (app/page.tsx:71) — skroluje na cenník namiesto /prihlasenie#register, na rozdiel
  // od všetkých ostatných "Začať..." CTA. Test drží správne očakávanie.
  test("hero primárne CTA vedie na registráciu", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /Začať 14-dňové skúšobné obdobie/i }).click();
    await expect(page).toHaveURL(/\/prihlasenie/);
  });
});

test.describe("Prihlásenie /prihlasenie", () => {
  test("taby, validácia, password toggle", async ({ page }) => {
    const errs = collectErrors(page);
    await page.goto("/prihlasenie");

    await expect(page.getByRole("tab", { name: "Prihlásenie" })).toHaveAttribute("aria-selected", "true");

    // prázdny submit → validačná chyba
    await page.getByRole("button", { name: "Prihlásiť sa" }).click();
    await expect(page.getByText(/Zadaj platnú e-mailovú adresu/i)).toBeVisible();

    // password toggle
    const pw = page.locator("#login-password");
    await pw.fill("tajneheslo1");
    await expect(pw).toHaveAttribute("type", "password");
    await page.getByRole("button", { name: /Zobraziť heslo/i }).click();
    await expect(pw).toHaveAttribute("type", "text");

    expect(realErrors(errs), realErrors(errs).join("\n")).toEqual([]);
  });

  test("registrácia: prepínač tréner / klient + pozývací kód", async ({ page }) => {
    await page.goto("/prihlasenie");
    await page.getByRole("tab", { name: "Registrácia" }).click();

    // default = tréner
    await expect(page.getByRole("heading", { name: /Začni skúšobné/i })).toBeVisible();
    await expect(page.getByLabel(/Pozývací kód/i)).toHaveCount(0);

    // prepni na klienta → objaví sa pole na kód
    await page.getByRole("button", { name: /Som klient — mám kód/i }).click();
    await expect(page.getByRole("heading", { name: /Pripoj sa/i })).toBeVisible();
    await expect(page.getByLabel(/Pozývací kód/i)).toBeVisible();

    // prázdny submit klienta → validačná chyba na kóde
    await page.getByRole("button", { name: /Pripojiť sa k trénerovi/i }).click();
    await expect(page.getByText(/Vlož kód, ktorý si dostal/i)).toBeVisible();
  });

  test("neúspešné prihlásenie ukáže chybu, nie crash", async ({ page }) => {
    await page.goto("/prihlasenie");
    await page.locator("#login-email").fill("neexistuje@test.sk");
    await page.locator("#login-password").fill("nespravneheslo");
    await page.getByRole("button", { name: "Prihlásiť sa" }).click();
    // buď chybová hláška, alebo sa nič nestane — v žiadnom prípade nesmie spadnúť stránka
    await page.waitForTimeout(2500);
    await expect(page.getByRole("tab", { name: "Prihlásenie" })).toBeVisible();
    await expect(page).toHaveURL(/\/prihlasenie/);
  });
});

test.describe("Auth guardy", () => {
  for (const path of ["/dashboard", "/dashboard/treningy", "/dashboard/vyziva", "/dashboard/klienti/x"]) {
    test(`${path} bez session → /prihlasenie`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/prihlasenie/);
    });
  }
});

test.describe("Klientsky portál /portal (?preview=)", () => {
  test("preview=ok — dnešný tréning kompletný", async ({ page }) => {
    const errs = collectErrors(page);
    await page.goto("/portal?preview=ok");

    await expect(page.getByRole("heading", { name: /Dobré ráno, Ján|Dobrý deň, Ján|Dobrý večer, Ján/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Deň C — Nohy/ })).toBeVisible();

    // 6 cvikov v zozname
    await expect(page.locator("ol li")).toHaveCount(6);
    await expect(page.getByText("Drep s veľkou činkou")).toBeVisible();

    // odklikávanie tréningu (Fáza A) — lokálny prepínač, potom "Ukončiť tréning"
    const start = page.getByRole("button", { name: /Začať tréning/i });
    await expect(start).toBeVisible();
    await start.click();
    await expect(page.getByRole("button", { name: /Ukončiť tréning/i })).toBeVisible();

    // dozvuk + týždeň
    await expect(page.getByText("Odcvičené spolu")).toBeVisible();
    await expect(page.getByText("Tento týždeň")).toBeVisible();

    // spodná navigácia — 6 položiek
    await expect(page.getByRole("navigation", { name: /Klientsky portál/i }).getByRole("link")).toHaveCount(6);

    // ring SVG
    await expect(page.locator("svg text", { hasText: "0/6" })).toBeVisible();

    expect(realErrors(errs), realErrors(errs).join("\n")).toEqual([]);
  });

  test("preview=unlinked — neprepojený klient, bez CTA", async ({ page }) => {
    await page.goto("/portal?preview=unlinked");
    await expect(page.getByText(/nie je prepojený s trénerom/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /Začať tréning/i })).toHaveCount(0);
  });

  test("preview=no_plan — plán je na ceste", async ({ page }) => {
    await page.goto("/portal?preview=no_plan");
    await expect(page.getByText(/nepriradil aktívny tréningový plán/i)).toBeVisible();
  });

  test("preview=error — chyba + retry", async ({ page }) => {
    await page.goto("/portal?preview=error");
    await expect(page.getByRole("heading", { name: /Nepodarilo sa načítať/i })).toBeVisible();
    const retry = page.getByRole("button", { name: /Skúsiť znova/i });
    await expect(retry).toBeVisible();
    await retry.click(); // reload — nesmie spadnúť
    await expect(page.getByRole("heading", { name: /Nepodarilo sa načítať/i })).toBeVisible();
  });

  test("spodná navigácia vedie na všetky taby bez pádu", async ({ page }) => {
    // Tréning + Strava sú dostavané (getPortalTraining/getPortalNutrition) — lokálne
    // bez DB ukážu Notice (error/no_plan), ale nesmú spadnúť. Chat + Profil sú ComingSoon.
    for (const [label, url] of [
      ["Tréning", /\/portal\/trening/],
      ["Strava", /\/portal\/strava/],
      ["Denník", /\/portal\/dennik/],
      ["Chat", /\/portal\/chat/],
      ["Profil", /\/portal\/profil/],
    ] as const) {
      await page.goto("/portal?preview=ok");
      await page.getByRole("navigation", { name: /Klientsky portál/i }).getByRole("link", { name: label }).click();
      await expect(page).toHaveURL(url);
      await expect(page.getByRole("heading").first()).toBeVisible(); // niečo sa vykreslilo
    }
  });

  test("Chat a Profil sú stále coming-soon", async ({ page }) => {
    for (const path of ["/portal/chat", "/portal/profil"]) {
      await page.goto(path);
      await expect(page.getByText(/Pripravujeme/i)).toBeVisible();
    }
  });

  test("Denník: príjem vs cieľ, jedlá dňa, pridávanie jedla", async ({ page }) => {
    const errs: string[] = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.goto("/portal/dennik?preview=ok");

    // hero: dnešný príjem + makro bary
    await expect(page.getByText("DNEŠNÝ PRÍJEM")).toBeVisible();
    await expect(page.getByText("Bielkoviny")).toBeVisible();
    await expect(page.getByText(/\/ 2350 kcal/)).toBeVisible();

    // zapísané jedlá dňa
    await expect(page.getByText("RAŇAJKY")).toBeVisible();
    await expect(page.getByText("Ovsené vločky")).toBeVisible();

    // pridávanie jedla — rozbalí sa panel, dá sa vybrať jedlo dňa aj potravina
    await page.getByRole("button", { name: /Pridať jedlo/i }).click();
    await expect(page.getByRole("button", { name: "Obed", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("tab", { name: "Knižnica" }).click();
    await page.getByLabel("Hľadať potravinu").fill("vaj");
    await expect(page.getByRole("button", { name: /Vajcia \(celé\)/ })).toBeVisible();
    await page.getByRole("button", { name: /Vajcia \(celé\)/ }).click();
    // po výbere je gramáž a "Pridať"
    await expect(page.getByRole("button", { name: "Pridať", exact: true })).toBeVisible();

    expect(errs, errs.join("\n")).toEqual([]);
  });

  test("Denník: chyba a neprepojený stav", async ({ page }) => {
    await page.goto("/portal/dennik?preview=error");
    await expect(page.getByRole("heading", { name: /Nepodarilo sa načítať denník/i })).toBeVisible();
    await page.goto("/portal/dennik?preview=unlinked");
    await expect(page.getByText(/nie je prepojený s trénerom/i)).toBeVisible();
  });
});

test.describe("Portál — shell", () => {
  test("bez horizontálneho scrollu; nav fixná na mobile / sidebar na desktope", async ({ page, viewport }) => {
    await page.goto("/portal?preview=ok");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);

    const navPosition = await page
      .getByRole("navigation", { name: /Klientsky portál/i })
      .evaluate((el) => getComputedStyle(el).position);
    // f29fa92: pod 880px fixná bottom bar, nad ňou statický sidebar
    expect(navPosition).toBe((viewport?.width ?? 0) >= 880 ? "static" : "fixed");
  });
});
