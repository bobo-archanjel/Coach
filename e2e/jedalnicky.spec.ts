import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { mealPlanAvgDayKcal } from "../lib/meals";

/**
 * Sekcia „Jedálničky“ trénera (predtým „Výživa“ na /dashboard/vyziva): trvalý redirect
 * starých adries vrátane podstránok a nový názov v navigácii. Bez session — redirect
 * rieši next.config.ts ešte pred stránkou, navigácia sa v deve vykreslí aj pri DEV
 * náhľade detailu klienta (?preview=progress, DEV_OPEN v app/dashboard/layout.tsx).
 */

test.describe("premenovanie Výživa → Jedálničky", () => {
  test("staré /dashboard/vyziva adresy trvalo presmerujú na /dashboard/jedalnicky", async ({ request, baseURL }) => {
    const cases: [string, string][] = [
      ["/dashboard/vyziva", "/dashboard/jedalnicky"],
      ["/dashboard/vyziva/0b6a3c1e-0000-4000-8000-000000000001", "/dashboard/jedalnicky/0b6a3c1e-0000-4000-8000-000000000001"],
      ["/dashboard/vyziva/jedalnicek/0b6a3c1e-0000-4000-8000-000000000002", "/dashboard/jedalnicky/jedalnicek/0b6a3c1e-0000-4000-8000-000000000002"],
    ];
    for (const [from, to] of cases) {
      const res = await request.get(from, { maxRedirects: 0 });
      expect(res.status(), from).toBe(308);
      expect(new URL(res.headers().location, baseURL).pathname, from).toBe(to);
    }
  });

  test("navigácia dashboardu má „Jedálničky“, nie „Výživa“", async ({ page }) => {
    test.skip(process.env.NODE_ENV === "production", "DEV náhľad len v next dev");
    await page.goto("/dashboard/klienti/x?preview=progress");
    const nav = page.getByRole("navigation", { name: "Trénerský dashboard" });
    await expect(nav.getByRole("link", { name: "Jedálničky" })).toHaveAttribute("href", "/dashboard/jedalnicky");
    await expect(nav.getByRole("link", { name: "Výživa" })).toHaveCount(0);
  });
});

test.describe("výpočty pre zoznam jedálničkov", () => {
  test("mealPlanAvgDayKcal — priemer len cez dni s jedlom, neplatné položky preskočí", () => {
    expect(mealPlanAvgDayKcal([])).toBeNull();
    expect(mealPlanAvgDayKcal([{ meals: [] }, { meals: null }])).toBeNull();
    expect(
      mealPlanAvgDayKcal([
        { meals: [{ grams: 200, kcal_100g: 250 }, { grams: "x", kcal_100g: 100 }] },
        { meals: [{ grams: 100, kcal_100g: 300 }] },
        { meals: [] },
      ]),
    ).toBe(400);
  });
});

/**
 * Detail klienta → sekcia „Jedálničky“ (nový dizajn v6) proti reálnej DB: tabuľka vstupných
 * údajov, zoznam jedálničkov od najnovšieho so stavom a kcal, odkaz na detail, prázdny stav
 * s „Vytvoriť jedálniček“. Testovacie jedálničky a dočasného klienta po sebe zmaže.
 *   E2E_TRAINER_EMAIL, E2E_TRAINER_PASSWORD, E2E_CLIENT_EMAIL, E2E_CLIENT_PASSWORD
 */
try {
  process.loadEnvFile(".env.local");
} catch {
  /* bez .env.local sa test preskočí */
}
const env = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  anon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  serviceRole: process.env.SUPABASE_SERVICE_ROLE_KEY,
  trainerEmail: process.env.E2E_TRAINER_EMAIL,
  trainerPassword: process.env.E2E_TRAINER_PASSWORD,
  clientEmail: process.env.E2E_CLIENT_EMAIL,
  clientPassword: process.env.E2E_CLIENT_PASSWORD,
};
const hasEnv = Object.values(env).every(Boolean);
const AUTH = { auth: { persistSession: false, autoRefreshToken: false } };

async function apiSignIn(email: string, password: string): Promise<{ api: SupabaseClient; userId: string }> {
  const api = createClient(env.url!, env.anon!, AUTH);
  const { data, error } = await api.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw new Error(`Prihlásenie ${email} zlyhalo: ${error?.message}`);
  return { api, userId: data.user.id };
}

async function openSection(page: Page, isMobile: boolean, name: string) {
  if (isMobile) {
    // mobil: menu sekcií sa rozbalí pod spúšťačom s názvom aktuálnej sekcie
    await page.locator("button[aria-expanded]", { hasText: "Tréningy" }).first().click();
    await page.getByRole("button", { name, exact: true }).last().click();
  } else {
    await page.getByRole("navigation", { name: "Sekcie klienta" }).getByRole("button", { name, exact: true }).click();
  }
}

const meal = (grams: number, kcal100: number) => ({
  entry_id: crypto.randomUUID(),
  food_id: crypto.randomUUID(),
  food_name: "E2E potravina",
  meal_slot: "obed",
  grams,
  kcal_100g: kcal100,
  protein_100g: 10,
  carbs_100g: 10,
  fat_100g: 5,
});

test.describe("detail klienta: sekcia Jedálničky (reálna DB, dizajn v6)", () => {
  test.skip(!hasEnv, "Chýbajú E2E_* údaje QA účtov alebo Supabase env (aj service role).");

  let trainer: { api: SupabaseClient; userId: string };
  let qaClientId = "";
  let tempClientId = "";
  let prefix = "";
  const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

  test.beforeAll(async () => {
    prefix = `E2E Jedálniček ${test.info().project.name} ${Date.now().toString().slice(-6)}`;
    trainer = await apiSignIn(env.trainerEmail!, env.trainerPassword!);
    const client = await apiSignIn(env.clientEmail!, env.clientPassword!);
    const { data: row } = await client.api.from("clients").select("id").eq("user_id", client.userId).limit(1).single();
    qaClientId = row!.id;

    // staršie zverejnené (archív), novšie zverejnené (aktívne), koncept (najnovší)
    const plans = [
      { name: `${prefix} archív`, published: true, created_at: daysAgo(10), days: [[meal(100, 200)]] },
      { name: `${prefix} aktívny`, published: true, created_at: daysAgo(5), days: [[meal(200, 250)], [meal(100, 300)], []] },
      { name: `${prefix} koncept`, published: false, created_at: daysAgo(0), days: [] },
    ];
    for (const p of plans) {
      const { data, error } = await trainer.api
        .from("meal_plans")
        .insert({ client_id: qaClientId, trainer_id: trainer.userId, name: p.name, published: p.published, created_at: p.created_at })
        .select("id")
        .single();
      expect(error).toBeNull();
      if (p.days.length > 0) {
        await trainer.api
          .from("meal_days")
          .insert(p.days.map((meals, i) => ({ plan_id: data!.id, day_number: i + 1, name: `Deň ${i + 1}`, meals })));
      }
    }
    const { data: temp } = await trainer.api
      .from("clients")
      .insert({ trainer_id: trainer.userId, full_name: `${prefix} klient` })
      .select("id")
      .single();
    tempClientId = temp!.id;
  });

  test.afterAll(async () => {
    if (!trainer) return;
    await trainer.api.from("meal_plans").delete().eq("client_id", qaClientId).like("name", `${prefix}%`);
    if (tempClientId) {
      const admin = createClient(env.url!, env.serviceRole!, AUTH);
      await admin.from("clients").delete().eq("id", tempClientId);
    }
  });

  async function login(page: Page, context: BrowserContext, baseURL: string) {
    await context.addCookies([{ name: "fp-dash-skin", value: "v6", url: baseURL }]);
    await page.goto("/prihlasenie");
    await page.locator("#login-email").fill(env.trainerEmail!);
    await page.locator("#login-password").fill(env.trainerPassword!);
    await page.getByRole("button", { name: "Prihlásiť sa" }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
  }

  test("vstupné údaje + zoznam jedálničkov od najnovšieho so stavom, kcal a odkazom", async ({ page, context, baseURL, isMobile }) => {
    test.setTimeout(90_000);
    await login(page, context, baseURL!);
    await page.goto(`/dashboard/klienti/${qaClientId}`);

    // sekcie v poradí: Jedálničky hneď pod Tréningami
    if (!isMobile) {
      const order = await page.getByRole("navigation", { name: "Sekcie klienta" }).getByRole("button").allTextContents();
      expect(order).toEqual(["Tréningy", "Jedálničky", "Analytika", "Info"]);
    }
    await openSection(page, isMobile, "Jedálničky");

    const facts = page.getByLabel("Vstupné údaje pre jedálniček");
    for (const label of ["Váha", "Výška", "Vek", "Pohlavie", "Úroveň aktivity", "Cieľ", "Kalorický cieľ", "Makrá (B · S · T)", "Alergie, intolerancie a preferencie"]) {
      await expect(facts.getByText(label, { exact: true })).toBeVisible();
    }
    // mobil: kľúč a hodnota v jednom riadku (2 stĺpce), nič nepreteká do strany
    if (isMobile) {
      const dt = await facts.getByText("Kalorický cieľ", { exact: true }).boundingBox();
      const dd = await facts.locator("dd").nth(6).boundingBox();
      expect(Math.abs(dt!.y - dd!.y)).toBeLessThan(12);
      expect(dd!.x).toBeGreaterThan(dt!.x + dt!.width);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);

    const rows = page.getByRole("link", { name: new RegExp(prefix) });
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText(`${prefix} koncept`);
    await expect(rows.nth(0)).toContainText("Koncept");
    await expect(rows.nth(0)).toContainText("bez jedál");
    await expect(rows.nth(1)).toContainText(`${prefix} aktívny`);
    await expect(rows.nth(1)).toContainText("Aktívny");
    await expect(rows.nth(1)).toContainText("≈ 400 kcal/deň");
    await expect(rows.nth(1)).toContainText("3 dni");
    await expect(rows.nth(2)).toContainText(`${prefix} archív`);
    await expect(rows.nth(2)).toContainText("Archivovaný");

    await rows.nth(1).click();
    await page.waitForURL(/\/dashboard\/jedalnicky\/jedalnicek\/[0-9a-f-]{36}$/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: `${prefix} aktívny` })).toBeVisible();
  });

  test("bez jedálničkov: prázdny stav, chýbajúce údaje „—“ a Vytvoriť jedálniček", async ({ page, context, baseURL, isMobile }, testInfo) => {
    test.setTimeout(90_000);
    await login(page, context, baseURL!);
    await page.goto(`/dashboard/klienti/${tempClientId}`);
    await openSection(page, isMobile, "Jedálničky");

    const facts = page.getByLabel("Vstupné údaje pre jedálniček");
    await expect(facts.locator("dd", { hasText: /^—$/ })).toHaveCount(9);
    await expect(page.getByRole("link", { name: "Nastaviť makrá →" })).toHaveAttribute("href", `/dashboard/jedalnicky/${tempClientId}`);
    await expect(page.getByText("Klient zatiaľ nemá žiadny jedálniček.")).toBeVisible();

    // zápis do DB len raz (desktop)
    if (testInfo.project.name !== "desktop") return;
    await page.getByRole("button", { name: "Vytvoriť jedálniček" }).click();
    await page.waitForURL(/\/dashboard\/jedalnicky\/jedalnicek\/[0-9a-f-]{36}$/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: /^Jedálniček \d/ })).toBeVisible();
    const { data } = await trainer.api.from("meal_plans").select("published").eq("client_id", tempClientId);
    expect(data).toEqual([{ published: false }]);
  });

  test("RLS: klient jedálničky iného klienta toho istého trénera nevidí", async () => {
    const client = await apiSignIn(env.clientEmail!, env.clientPassword!);
    await trainer.api.from("meal_plans").insert({ client_id: tempClientId, trainer_id: trainer.userId, name: `${prefix} cudzí`, published: true });
    const { data: asTrainer } = await trainer.api.from("meal_plans").select("id").eq("client_id", tempClientId);
    expect((asTrainer ?? []).length).toBeGreaterThan(0);
    const { data: asOtherClient } = await client.api.from("meal_plans").select("id").eq("client_id", tempClientId);
    expect(asOtherClient ?? []).toEqual([]);
  });
});
