import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Vlastný jedálniček klienta (0067, app/portal/strava/*):
 *  - DEV náhľady (?preview=ok|own|empty): prepínač aktívneho jedálnička so štítkami
 *    Od trénera / Vlastný, „Upraviť“ len pri vlastnom, builder cez ?tvorba=1 (späť ho zavrie),
 *    pridanie dňa a potraviny cez panel, súčet dňa oproti makro cieľu, šablóna „Použiť“;
 *  - reálna DB (QA klient, len desktop, až po migrácii 0067): uloženie (trainer_id null,
 *    aktívny), úprava, šablóna, zmazanie. Po sebe všetko uprace a vráti pôvodnú voľbu.
 */

try {
  process.loadEnvFile(".env.local");
} catch {
  /* bez .env.local sa test s DB preskočí */
}
const env = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  anon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  serviceRole: process.env.SUPABASE_SERVICE_ROLE_KEY,
  clientEmail: process.env.E2E_CLIENT_EMAIL,
  clientPassword: process.env.E2E_CLIENT_PASSWORD,
};
const hasEnv = Object.values(env).every(Boolean);
const AUTH = { auth: { persistSession: false, autoRefreshToken: false } };

async function addFood(page: Page, slot: string, query: string, pick: RegExp, qty: string) {
  await page.getByRole("button", { name: `Pridať jedlo: ${slot}` }).click();
  const sheet = page.getByRole("dialog", { name: new RegExp(`· ${slot}`) });
  await expect(sheet).toBeVisible();
  await sheet.getByLabel("Hľadať potravinu alebo značkový produkt").fill(query);
  await sheet.getByRole("button", { name: pick }).first().click();
  await sheet.getByLabel("Množstvo", { exact: true }).fill(qty);
  await sheet.getByRole("button", { name: "Pridať", exact: true }).click();
  await expect(sheet.getByText(/pridané\./)).toBeVisible();
  await sheet.getByRole("button", { name: "Zavrieť" }).click();
  await expect(sheet).toBeHidden();
}

test.describe("vlastný jedálniček — náhľady", () => {
  test.skip(process.env.NODE_ENV === "production", "DEV náhľady len v next dev");

  test("od trénera: štítok, prepínač s dvomi jedálničkami, bez „Upraviť“", async ({ page }) => {
    await page.goto("/portal/strava?preview=ok");
    const row = page.locator('[data-tour="nutrition-switch"]');
    await expect(row.getByText("Od trénera")).toBeVisible();
    await expect(row.getByText("Rekompozícia — jeseň")).toBeVisible();
    await expect(page.getByRole("button", { name: "Upraviť", exact: true })).toHaveCount(0);

    await row.getByRole("button", { name: "Zmeniť" }).click();
    const sheet = page.getByRole("dialog", { name: "Aktívny jedálniček" });
    await expect(sheet.getByRole("button")).toHaveCount(3); // 2 jedálničky + zavrieť
    await expect(sheet.getByRole("button", { name: /Rekompozícia — jeseň/ })).toHaveAttribute("aria-current", "true");
    await expect(sheet.getByRole("button", { name: /Môj týždeň/ })).toContainText("Vlastný");
    await expect(sheet.getByRole("button", { name: /Môj týždeň/ })).toContainText("2 dni");
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
  });

  test("vlastný: Upraviť otvorí builder (?tvorba=1), súčet oproti cieľu, späť ho zavrie", async ({ page }) => {
    await page.goto("/portal/strava?preview=own");
    await expect(page.locator('[data-tour="nutrition-switch"]').getByText("Vlastný")).toBeVisible();
    await page.getByRole("button", { name: "Upraviť", exact: true }).click();
    await expect(page).toHaveURL(/tvorba=1/);
    await expect(page.getByLabel("Názov jedálnička")).toHaveValue("Môj týždeň");
    const days = page.getByRole("group", { name: "Dni jedálnička" });
    await expect(days.getByRole("button", { name: /Pracovný deň/ })).toHaveAttribute("aria-current", "true");
    await expect(days.getByRole("button", { name: /Víkend/ })).toBeVisible();
    // 80 g vločiek + 150 g jogurtu + 180 g kuracieho + 200 g ryže + 120 g banánu
    await expect(page.getByText("973 / 2300 kcal")).toBeVisible();
    await expect(page.getByText("Cieľ: B 150 g · S 260 g · T 70 g")).toBeVisible();
    await expect(page.getByRole("button", { name: "Uložiť zmeny" })).toBeVisible();

    await page.goBack();
    await expect(page).not.toHaveURL(/tvorba=1/);
    await expect(page.getByRole("button", { name: "Upraviť", exact: true })).toBeVisible();
  });

  test("nový: kontrola názvu a dňa, pridanie dňa a potraviny cez panel", async ({ page }) => {
    await page.goto("/portal/strava?preview=empty");
    await expect(page.getByText(/Zatiaľ nemáš jedálniček/)).toBeVisible();
    await page.getByRole("button", { name: "Vlastný jedálniček" }).click();

    await page.getByRole("button", { name: "Uložiť", exact: true }).click();
    await expect(page.locator("p[role=alert]")).toHaveText("Zadaj názov jedálnička.");
    await page.getByLabel("Názov jedálnička").fill("Test týždeň");
    await page.getByRole("button", { name: "Uložiť", exact: true }).click();
    await expect(page.locator("p[role=alert]")).toHaveText("Pridaj aspoň jeden deň.");

    await page.getByRole("button", { name: "+ deň" }).click();
    const dayDialog = page.getByRole("dialog", { name: "Nový deň" });
    await dayDialog.getByLabel("Názov dňa").fill("Pondelok");
    await dayDialog.getByRole("button", { name: "Pridať", exact: true }).click();
    await expect(page.getByRole("group", { name: "Dni jedálnička" }).getByRole("button", { name: /Pondelok/ })).toBeVisible();

    await addFood(page, "Raňajky", "ovsen", /Ovsené vločky/, "80");
    // bez makro cieľa: súčet dňa bez porovnania (372 kcal/100 g × 80 g)
    await expect(page.getByText("298 kcal / deň")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Raňajky/ })).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByText("Ovsené vločky", { exact: true })).toBeVisible();
  });

  test("šablóna: Použiť otvorí nový jedálniček s jej obsahom", async ({ page }) => {
    await page.goto("/portal/strava?preview=ok");
    await page.getByRole("button", { name: /Moje šablóny/ }).click();
    await page.getByRole("button", { name: "Použiť" }).click();
    await expect(page.getByLabel("Názov jedálnička")).toHaveValue("Rýchle raňajky");
    await expect(page.getByRole("group", { name: "Dni jedálnička" }).getByRole("button", { name: /Deň 1/ })).toContainText("2");
    await expect(page.getByRole("button", { name: "Uložiť jedálniček" })).toBeVisible();
  });
});

test.describe("vlastný jedálniček — reálna DB (QA klient)", () => {
  test.skip(!hasEnv, "Chýbajú E2E_CLIENT_* údaje alebo Supabase env (aj service role).");
  test.describe.configure({ mode: "serial" });

  const stamp = Date.now().toString().slice(-6);
  const planName = `E2E jedálniček ${stamp}`;
  let admin: SupabaseClient;
  let clientRowId = "";
  let userId = "";
  let originalActive: string | null = null;
  let migrated = false;

  test.beforeAll(async () => {
    admin = createClient(env.url!, env.serviceRole!, AUTH);
    const probe = await createClient(env.url!, env.anon!, AUTH).rpc("set_active_meal_plan", {
      p_plan_id: "00000000-0000-0000-0000-000000000000",
    });
    migrated = !(probe.error && /Could not find|does not exist|PGRST202/i.test(`${probe.error.message} ${probe.error.code}`));
    if (!migrated) return;
    const api = createClient(env.url!, env.anon!, AUTH);
    const { data } = await api.auth.signInWithPassword({ email: env.clientEmail!, password: env.clientPassword! });
    userId = data.user!.id;
    const { data: row } = await admin
      .from("clients")
      .select("id, active_meal_plan_id")
      .eq("user_id", userId)
      .order("created_at")
      .limit(1)
      .single();
    clientRowId = row!.id;
    originalActive = row!.active_meal_plan_id;
  });

  test.afterAll(async () => {
    if (!migrated || !clientRowId) return;
    await admin.from("meal_plans").delete().eq("client_id", clientRowId).like("name", `E2E jedálniček ${stamp}%`);
    await admin.from("meal_templates").delete().eq("trainer_id", userId).like("name", `E2E jedálniček ${stamp}%`);
    await admin.from("clients").update({ active_meal_plan_id: originalActive }).eq("id", clientRowId);
  });

  test("uloženie, úprava, šablóna a zmazanie vlastného jedálnička", async ({ page }, testInfo) => {
    test.skip(!migrated, "migrácia 0067 na tejto DB ešte nebežala");
    test.skip(testInfo.project.name !== "desktop", "zápis do DB len raz (desktop)");
    test.setTimeout(180_000);

    await page.goto("/prihlasenie");
    await page.locator("#login-email").fill(env.clientEmail!);
    await page.locator("#login-password").fill(env.clientPassword!);
    await page.getByRole("button", { name: "Prihlásiť sa" }).click();
    await page.waitForURL(/\/portal/, { timeout: 30_000 });
    await page.goto("/portal/strava");

    // nový
    await page.getByRole("button", { name: "Vlastný jedálniček" }).click();
    await page.getByLabel("Názov jedálnička").fill(planName);
    await page.getByRole("button", { name: "+ deň" }).click();
    await page.getByRole("dialog", { name: "Nový deň" }).getByLabel("Názov dňa").fill("E2E deň 1");
    await page.getByRole("dialog", { name: "Nový deň" }).getByRole("button", { name: "Pridať", exact: true }).click();
    await addFood(page, "Obed", "ryža", /Ryža/i, "200");
    await page.getByRole("button", { name: "Uložiť jedálniček" }).click();

    const row = page.locator('[data-tour="nutrition-switch"]');
    await expect(row.getByText(planName)).toBeVisible({ timeout: 30_000 });
    await expect(row.getByText("Vlastný")).toBeVisible();

    const { data: plan } = await admin.from("meal_plans").select("id, trainer_id, published").eq("client_id", clientRowId).eq("name", planName).single();
    expect(plan?.trainer_id).toBeNull();
    expect(plan?.published).toBe(true);
    const { data: client } = await admin.from("clients").select("active_meal_plan_id").eq("id", clientRowId).single();
    expect(client?.active_meal_plan_id).toBe(plan!.id);
    const { data: days1 } = await admin.from("meal_days").select("id, name, meals").eq("plan_id", plan!.id);
    expect(days1).toHaveLength(1);
    const meal = (days1![0].meals as { grams: number; meal_slot: string; food_name: string }[])[0];
    expect(meal.meal_slot).toBe("obed");
    expect(meal.grams).toBe(200);

    // úprava: druhý deň (prvý ostane s rovnakým id)
    await page.getByRole("button", { name: "Upraviť", exact: true }).click();
    await page.getByRole("button", { name: "+ deň" }).click();
    await page.getByRole("dialog", { name: "Nový deň" }).getByLabel("Názov dňa").fill("E2E deň 2");
    await page.getByRole("dialog", { name: "Nový deň" }).getByRole("button", { name: "Pridať", exact: true }).click();
    await page.getByRole("button", { name: "Uložiť zmeny" }).click();
    await expect(row.getByText(planName)).toBeVisible({ timeout: 30_000 });
    const { data: days2 } = await admin.from("meal_days").select("id, name, day_number").eq("plan_id", plan!.id).order("day_number");
    expect(days2?.map((d) => d.name)).toEqual(["E2E deň 1", "E2E deň 2"]);
    expect(days2?.[0].id).toBe(days1![0].id);

    // šablóna
    await page.getByRole("button", { name: "Uložiť ako šablónu" }).click();
    await expect(page.getByText("Uložené do Mojich šablón.")).toBeVisible();
    const { data: tpl } = await admin.from("meal_templates").select("id").eq("trainer_id", userId).eq("name", planName);
    expect(tpl).toHaveLength(1);

    // zmazanie
    const actions = page.locator('[data-tour="nutrition-own-actions"]');
    await actions.getByRole("button", { name: "Zmazať", exact: true }).click();
    await expect(actions.getByText("Zmazať tento jedálniček?")).toBeVisible();
    await actions.getByRole("button", { name: "Zmazať", exact: true }).click();
    // názov ostáva len pri šablóne v „Moje šablóny“ — aktívny jedálniček už nie je on
    await expect(row.getByText(planName)).toHaveCount(0, { timeout: 30_000 });
    await expect(page.locator("#moje-sablony-jedalnicka").getByText(planName)).toBeVisible();
    const { data: gone } = await admin.from("meal_plans").select("id").eq("id", plan!.id);
    expect(gone).toEqual([]);
  });
});
