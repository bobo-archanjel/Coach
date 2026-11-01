import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { gs1CheckDigit } from "../lib/barcode";

/**
 * Skener čiarových kódov v denníku (feature/barcode-scanner, migrácia 0050).
 *
 * 1. UI cez DEV `?preview=` (bez session) s namockovanou odpoveďou našej route
 *    /api/potraviny/kod — ručné zadanie kódu, karta produktu, formulár nenájdeného
 *    produktu s upozornením na kcal, hláška pri nedostupnej kamere.
 * 2. Celý tok proti reálnej Supabase DB (QA klient): ručný kód → produkt z Open Food
 *    Facts → zápis do denníka → ďalší sken toho istého kódu ide z DB. OFF sa volá zo
 *    servera, preto ho mockuje DEV hlavička `x-e2e-off-fixture` (route ju mimo
 *    `next dev` ignoruje). Beží len s QA účtom v env, service role kľúčom (upratanie
 *    globálneho 'off' záznamu) a so spustenou 0050:
 *      E2E_CLIENT_EMAIL, E2E_CLIENT_PASSWORD, SUPABASE_SERVICE_ROLE_KEY (.env.local)
 *    Kód je z rozsahu 200–299 (GS1 interné použitie — žiadny skutočný produkt).
 */

const VALID_CODE = "4006381333931";

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

async function openScanner(page: Page) {
  await page.getByRole("button", { name: "Pridať jedlo: Obed" }).click();
  await page.getByRole("dialog", { name: /Pridať jedlo · Obed/ }).getByRole("button", { name: "Skenovať" }).click();
  const dialog = page.getByRole("dialog", { name: "Skenovanie čiarového kódu" });
  await expect(dialog).toBeVisible();
  return dialog;
}

// ---------------------------------------------------------------- 1. UI (preview)
test.describe("skener v denníku (preview, API namockované)", () => {
  test("ručný kód → karta produktu s porciou a zdrojom Open Food Facts", async ({ page }) => {
    const errors = collectErrors(page);
    const requested: string[] = [];
    await page.route("**/api/potraviny/kod/**", (route) => {
      requested.push(new URL(route.request().url()).pathname);
      return route.fulfill({
        json: {
          status: "found",
          food: {
            foodId: null,
            name: "Skyr vanilka (Rajo)",
            kcal100g: 78,
            protein100g: 10.2,
            carbs100g: 7.5,
            fat100g: 0.2,
            servingGrams: 140,
            source: "off",
            barcode: VALID_CODE,
          },
        },
      });
    });

    await page.goto("/portal/dennik?preview=ok");
    const dialog = await openScanner(page);

    // neplatný kód sa nepošle na server
    await dialog.getByLabel("Číslo pod čiarovým kódom").fill("12345");
    await dialog.getByRole("button", { name: "Hľadať" }).click();
    await expect(dialog.getByText(/Neplatný kód/)).toBeVisible();
    expect(requested).toEqual([]);

    await dialog.getByLabel("Číslo pod čiarovým kódom").fill(VALID_CODE);
    await dialog.getByRole("button", { name: "Hľadať" }).click();
    await expect(dialog).toBeHidden();
    expect(requested).toEqual([`/api/potraviny/kod/${VALID_CODE}`]);

    await expect(page.getByText("Skyr vanilka (Rajo)")).toBeVisible();
    await expect(page.getByLabel("Gramáž v gramoch")).toHaveValue("140");
    await expect(page.getByText(/porcia 140 g/)).toBeVisible();
    await expect(page.getByText("Zdroj: Open Food Facts")).toBeVisible();
    await expect(page.getByRole("button", { name: "Pridať", exact: true })).toBeVisible();
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("nenájdený kód → formulár s predvyplneným kódom a upozornením na kcal", async ({ page }) => {
    const errors = collectErrors(page);
    await page.route("**/api/potraviny/kod/**", (route) =>
      route.fulfill({
        json: {
          status: "not_found",
          food: {
            barcode: VALID_CODE,
            name: "Tatranka",
            brand: null,
            kcal100g: null,
            protein100g: null,
            carbs100g: null,
            fat100g: null,
          },
        },
      }),
    );

    await page.goto("/portal/dennik?preview=ok");
    const dialog = await openScanner(page);
    await dialog.getByLabel("Číslo pod čiarovým kódom").fill(VALID_CODE);
    await dialog.getByRole("button", { name: "Hľadať" }).click();

    await expect(page.getByText("Tento produkt zatiaľ nepoznáme")).toBeVisible();
    await expect(page.getByText(`Kód ${VALID_CODE}`)).toBeVisible();
    await expect(page.getByLabel("Názov potraviny")).toHaveValue("Tatranka");

    const field = (label: string) => page.locator("label", { hasText: label }).locator("input");
    await field("kcal").fill("300");
    await field("Bielkoviny g").fill("10");
    await field("Sacharidy g").fill("10");
    await field("Tuky g").fill("2");
    const warning = page.getByText(/Kalórie nesedia s makrami/);
    await expect(warning).toBeVisible();
    await expect(warning).toContainText("98 kcal");
    // opravené hodnoty → upozornenie zmizne (len upozorňuje, uloženie neblokuje)
    await field("kcal").fill("100");
    await expect(warning).toBeHidden();
    await expect(page.getByRole("button", { name: "Uložiť potravinu" })).toBeEnabled();

    // "zatvorí klávesnicu" — inak sa na mobile pri ťuknutí vráti spodná lišta (KeyboardState)
    // presne nad tlačidlo, ktoré emulácia bez klávesnice odrolovala úplne nadol
    await field("kcal").blur();
    await page.getByRole("button", { name: "Zrušiť", exact: true }).click();
    await expect(page.getByText("Tento produkt zatiaľ nepoznáme")).toBeHidden();
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("bez prístupu ku kamere: zrozumiteľná hláška, ručné zadanie ostáva, Escape zavrie", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto("/portal/dennik?preview=ok");
    const dialog = await openScanner(page);
    // headless prehliadač kameru nedá (zamietnutie / žiadne zariadenie)
    await expect(dialog.getByRole("alert")).toContainText(/kamer/i);
    await expect(dialog.getByLabel("Číslo pod čiarovým kódom")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    expect(errors, errors.join("\n")).toEqual([]);
  });
});

// ---------------------------------------------------------------- 2. celý tok (reálna DB)
try {
  process.loadEnvFile(".env.local");
} catch {
  /* bez .env.local sa celý tok preskočí */
}
const env = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  anon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  serviceRole: process.env.SUPABASE_SERVICE_ROLE_KEY,
  clientEmail: process.env.E2E_CLIENT_EMAIL,
  clientPassword: process.env.E2E_CLIENT_PASSWORD,
};
const hasEnv = Object.values(env).every(Boolean);

/** Náhodný platný EAN-13 z rozsahu 200–299 (GS1 interné použitie). */
function testBarcode(): string {
  const body = `2${String(Math.floor(Math.random() * 1e11)).padStart(11, "0")}`;
  return `${body}${gs1CheckDigit(body)}`;
}

const offFixture = (product: Record<string, unknown> | null) =>
  encodeURIComponent(JSON.stringify(product ? { status: 1, product } : { status: 0 }));

test.describe("celý tok: sken → Open Food Facts (mock) → denník (reálna DB)", () => {
  test.skip(!hasEnv, "Chýbajú E2E_CLIENT_* údaje QA klienta alebo Supabase env (aj service role).");

  const code = testBarcode();
  const productName = `E2E Skyr ${code.slice(-5)}`;
  const displayName = `${productName} (FitPilot E2E)`;
  let client: SupabaseClient | null = null;
  const admin = hasEnv
    ? createClient(env.url!, env.serviceRole!, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;

  test.afterAll(async () => {
    if (client) await client.from("food_logs").delete().eq("food_name", displayName);
    if (admin) await admin.from("foods").delete().eq("barcode", code).eq("source", "off");
  });

  test("ručný kód → produkt → pridanie do denníka → ďalší sken z DB", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Zápis do DB len raz (desktop), UI mobilu pokrýva preview.");
    test.setTimeout(120_000);

    client = createClient(env.url!, env.anon!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error: signInError } = await client.auth.signInWithPassword({
      email: env.clientEmail!,
      password: env.clientPassword!,
    });
    expect(signInError).toBeNull();
    const probe = await client.from("foods").select("barcode, source").limit(1);
    test.skip(probe.error?.code === "42703", "Migrácia 0050 ešte nie je spustená v Supabase.");

    // OFF odpoveď pre tento kód — pridá sa len do požiadavky na našu route
    await page.route("**/api/potraviny/kod/**", (route) =>
      route.continue({
        headers: {
          ...route.request().headers(),
          "x-e2e-off-fixture": offFixture({
            code,
            product_name: productName,
            brands: "FitPilot E2E",
            serving_quantity: 140,
            nutriments: { "energy-kcal_100g": 78, proteins_100g: 10, carbohydrates_100g: 7.5, fat_100g: 0.5 },
          }),
        },
      }),
    );

    await page.goto("/prihlasenie");
    await page.locator("#login-email").fill(env.clientEmail!);
    await page.locator("#login-password").fill(env.clientPassword!);
    await page.getByRole("button", { name: "Prihlásiť sa" }).click();
    await page.waitForURL(/\/portal/, { timeout: 30_000 });
    await page.goto("/portal/dennik");

    const dialog = await openScanner(page);
    await dialog.getByLabel("Číslo pod čiarovým kódom").fill(code);
    await dialog.getByRole("button", { name: "Hľadať" }).click();
    await expect(dialog).toBeHidden();

    await expect(page.getByText(displayName).first()).toBeVisible();
    await expect(page.getByLabel("Gramáž v gramoch")).toHaveValue("140");
    await expect(page.getByText("Zdroj: Open Food Facts")).toBeVisible();

    // produkt sa uložil ako globálny 'off' záznam
    const { data: food } = await admin!
      .from("foods")
      .select("id, source, serving_g, created_by, kcal_100g")
      .eq("barcode", code)
      .single();
    expect(food).toMatchObject({ source: "off", serving_g: 140, created_by: null, kcal_100g: 78 });

    // pridanie do denníka rovnakou cestou ako z vyhľadávania (jedlo dňa = riadok, cez ktorý sa otvoril panel)
    await page.getByRole("button", { name: "Pridať", exact: true }).click();
    await expect
      .poll(async () => {
        const { data } = await client!
          .from("food_logs")
          .select("food_id, grams, kcal_100g, meal_slot")
          .eq("food_name", displayName);
        return data;
      })
      .toEqual([{ food_id: food!.id, grams: 140, kcal_100g: 78, meal_slot: "obed" }]);
    // panel ostáva otvorený s potvrdením; po zatvorení je položka v rozbalenom riadku Obed
    await expect(page.getByText(`„${displayName}“ pridané.`)).toBeVisible();
    await page.getByRole("dialog", { name: /Pridať jedlo · Obed/ }).getByRole("button", { name: "Zavrieť" }).click();
    await expect(page.getByRole("button", { name: /^Obed/ })).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByText(displayName).first()).toBeVisible();

    // ďalší sken toho istého kódu ide z DB — OFF (mock) by teraz odpovedal "nepoznám"
    const again = await page.evaluate(
      ([c, fixture]) =>
        fetch(`/api/potraviny/kod/${c}`, { headers: { "x-e2e-off-fixture": fixture } }).then((r) => r.json()),
      [code, offFixture(null)] as const,
    );
    expect(again).toMatchObject({ status: "found", food: { foodId: food!.id, source: "off", servingGrams: 140 } });
  });
});
