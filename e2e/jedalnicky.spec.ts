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
 * Detail klienta → sekcia „Jedálničky“ (nový dizajn v6) proti reálnej DB: vstupné údaje
 * a výsledok makier (NutritionForm, predtým /dashboard/jedalnicky/[clientId] — teraz tam
 * presmerovanie), zoznam jedálničkov od najnovšieho so stavom a kcal, prázdny stav
 * s „Vytvoriť jedálniček“; stránka /dashboard/jedalnicky ako Tréningy (Nový jedálniček aj
 * pre viacerých klientov + všetky jedálničky). Testovacie dáta a dočasného klienta zmaže.
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

/** Záložky sekcií detailu klienta — rad hore, rovnaký na počítači aj na mobile. */
async function openSection(page: Page, name: string) {
  const tab = page.getByRole("tablist", { name: "Sekcie klienta" }).getByRole("tab", { name, exact: true });
  await tab.click();
  await expect(tab).toHaveAttribute("aria-selected", "true");
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

  test("vstupné údaje a výsledok makier + zoznam jedálničkov od najnovšieho so stavom, kcal a odkazom", async ({ page, context, baseURL }) => {
    test.setTimeout(90_000);
    await login(page, context, baseURL!);
    await page.goto(`/dashboard/klienti/${qaClientId}`);

    // záložky hore v poradí: Jedálničky hneď za Tréningami, prvá otvorená sú Tréningy;
    // obsah sekcie je pod radom záložiek
    const tablist = page.getByRole("tablist", { name: "Sekcie klienta" });
    expect(await tablist.getByRole("tab").allTextContents()).toEqual(["Tréningy", "Jedálničky", "Analytika", "Info"]);
    await expect(tablist.getByRole("tab", { name: "Tréningy" })).toHaveAttribute("aria-selected", "true");
    const tabsBox = await tablist.boundingBox();
    const panelBox = await page.getByRole("tabpanel").boundingBox();
    expect(panelBox!.y).toBeGreaterThanOrEqual(tabsBox!.y + tabsBox!.height);
    await openSection(page, "Jedálničky");
    await expect(page.getByRole("tabpanel", { name: "Jedálničky" })).toBeVisible();

    // vstupné údaje (editovateľné) a výsledok s uloženým kalorickým cieľom QA klienta
    const panel = page.getByRole("tabpanel", { name: "Jedálničky" });
    await expect(panel.getByRole("heading", { name: "Vstupné údaje" })).toBeVisible();
    for (const label of ["Pohlavie", "Vek (roky)", "Váha (kg)", "Výška (cm)", "Aktivita", "Cieľ", "Poznámka (vidíš len ty)"]) {
      await expect(panel.getByLabel(label)).toBeVisible();
    }
    await expect(panel.getByRole("heading", { name: /^Výsledok/ })).toBeVisible();
    const { data: profile } = await trainer.api.from("nutrition_profiles").select("calories_target").eq("client_id", qaClientId).maybeSingle();
    if (profile) await expect(panel.getByText(`${profile.calories_target} kcal/deň`, { exact: true })).toBeVisible();
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

  test("nový klient: makro cieľ priamo v detaile klienta, prázdny stav a Vytvoriť jedálniček", async ({ page, context, baseURL }, testInfo) => {
    test.setTimeout(90_000);
    await login(page, context, baseURL!);
    // stará adresa jedálničkov klienta → detail klienta s otvorenou záložkou Jedálničky
    await page.goto(`/dashboard/jedalnicky/${tempClientId}`);
    await page.waitForURL(new RegExp(`/dashboard/klienti/${tempClientId}\\?sekcia=jedalnicky$`), { timeout: 30_000 });
    const panel = page.getByRole("tabpanel", { name: "Jedálničky" });
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("button", { name: "Uložiť makro cieľ" })).toBeVisible();
    await expect(panel.getByText("Klient zatiaľ nemá žiadny jedálniček.")).toBeVisible();

    // zápis do DB len raz (desktop)
    if (testInfo.project.name !== "desktop") return;
    await panel.getByLabel("Vek (roky)").fill("30");
    await panel.getByLabel("Váha (kg)").fill("80");
    await panel.getByLabel("Výška (cm)").fill("180");
    await expect(panel.getByRole("heading", { name: /^Výsledok/ })).toContainText("náhľad");
    await panel.getByRole("button", { name: "Uložiť makro cieľ" }).click();
    await expect(panel.getByRole("button", { name: "Aktualizovať makro cieľ" })).toBeVisible({ timeout: 15_000 });
    const { data: saved } = await trainer.api.from("nutrition_profiles").select("age, weight_kg, calories_target").eq("client_id", tempClientId).single();
    expect(saved).toMatchObject({ age: 30, weight_kg: 80 });
    expect(saved!.calories_target).toBeGreaterThan(1000);
    // obnovenie stránky ostane na záložke Jedálničky
    await page.reload();
    await expect(page.getByRole("tab", { name: "Jedálničky" })).toHaveAttribute("aria-selected", "true");

    await page.getByRole("button", { name: "Vytvoriť jedálniček" }).click();
    await page.waitForURL(/\/dashboard\/jedalnicky\/jedalnicek\/[0-9a-f-]{36}$/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: /^Jedálniček \d/ })).toBeVisible();
    const { data } = await trainer.api.from("meal_plans").select("published").eq("client_id", tempClientId);
    expect(data).toEqual([{ published: false }]);
  });

  test("Analytika → „Upraviť →“ pri makro cieli otvorí záložku Jedálničky", async ({ page, context, baseURL }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Stačí raz (desktop).");
    test.setTimeout(90_000);
    const { data: profile } = await trainer.api.from("nutrition_profiles").select("id").eq("client_id", qaClientId).maybeSingle();
    test.skip(!profile, "QA klient nemá makro cieľ.");
    await login(page, context, baseURL!);
    await page.goto(`/dashboard/klienti/${qaClientId}`);
    await openSection(page, "Analytika");
    await page.getByRole("tabpanel").getByRole("link", { name: "Upraviť →" }).click();
    await expect(page.getByRole("tab", { name: "Jedálničky" })).toHaveAttribute("aria-selected", "true", { timeout: 15_000 });
    await expect(page.getByRole("tabpanel", { name: "Jedálničky" }).getByRole("heading", { name: "Vstupné údaje" })).toBeVisible();
  });

  test("stránka Jedálničky: všetky jedálničky + Nový jedálniček pre viacerých klientov", async ({ page, context, baseURL }, testInfo) => {
    test.setTimeout(90_000);
    await login(page, context, baseURL!);
    await page.goto("/dashboard/jedalnicky");
    await expect(page.getByRole("heading", { name: "Jedálničky", level: 1 })).toBeVisible();

    // zoznam všetkých jedálničkov (nie klientov) — s menom klienta a stavom
    const rows = page.getByRole("link", { name: new RegExp(prefix) });
    await expect(rows.filter({ hasText: `${prefix} koncept` })).toContainText("Koncept");
    await expect(rows.filter({ hasText: `${prefix} aktívny` })).toContainText("Aktívny");
    await expect(rows.filter({ hasText: `${prefix} aktívny` })).toContainText("≈ 400 kcal/deň");
    await expect(rows.filter({ hasText: `${prefix} archív` })).not.toContainText("Aktívny");

    // zápis do DB len raz (desktop)
    if (testInfo.project.name !== "desktop") return;
    const form = page.getByRole("form", { name: "Nový jedálniček" });
    await form.getByRole("button", { name: "Vyber klientov" }).click();
    const group = form.getByRole("group", { name: "Klienti" });
    await group.getByRole("checkbox", { name: "QA Klient Agent" }).click();
    await group.getByRole("checkbox", { name: `${prefix} klient` }).click();
    await form.getByPlaceholder(/Názov jedálničku/).fill(`${prefix} pre dvoch`);
    await form.getByRole("button", { name: "Vytvoriť jedálniček pre 2 klientov" }).click();
    await page.waitForURL(/\/dashboard\/jedalnicky\/jedalnicek\/[0-9a-f-]{36}$/, { timeout: 30_000 });
    await expect(page.getByText("Pošle sa aj:")).toBeVisible();
    const planId = page.url().split("/").pop()!;
    const { data: recipients } = await trainer.api.from("plan_recipients").select("client_id").eq("meal_plan_id", planId);
    expect(recipients).toHaveLength(1);
    // späť na zoznam všetkých jedálničkov
    await page.getByRole("link", { name: "Späť na jedálničky" }).click();
    await page.waitForURL(/\/dashboard\/jedalnicky$/);
    await expect(page.getByRole("link", { name: new RegExp(`${prefix} pre dvoch`) })).toBeVisible();
    await trainer.api.from("meal_plans").delete().eq("id", planId);
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
