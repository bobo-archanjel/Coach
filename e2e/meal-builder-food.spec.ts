import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { gs1CheckDigit } from "../lib/barcode";

/**
 * Builder jedálnička trénera s riadkami jedál a panelom „Pridať jedlo“
 * (app/components/food/FoodPickerSheet, feature/barcode-scanner).
 *
 * Celý tok proti reálnej Supabase DB s QA trénerom a klientom: plán sa vytvorí cez
 * API → tréner cez „+“ pri jedle pridá potravinu z knižnice (Obed), produkt skenom
 * (Večera; Open Food Facts mockuje DEV hlavička x-e2e-off-fixture) a novú vlastnú
 * potravinu (Desiata) → „Uložiť zmeny“ → v meal_days sú položky so správnym jedlom
 * dňa, gramážou a food_id; „Duplikovať“ pridá kópiu dňa aj s potravinami. Tlačidlá
 * „Poslať klientovi“ / „Uložiť a poslať“ a „Premenovať“. Klient trénerovu novú
 * potravinu nevidí (RLS 0050/0051).
 * Beží len s QA účtami v env a service role kľúčom (upratanie globálneho 'off' záznamu):
 *   E2E_TRAINER_EMAIL, E2E_TRAINER_PASSWORD, E2E_CLIENT_EMAIL, E2E_CLIENT_PASSWORD
 * Po sebe zmaže plán, vytvorenú potravinu aj testovací produkt.
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

async function apiSignIn(email: string, password: string): Promise<{ api: SupabaseClient; userId: string }> {
  const api = createClient(env.url!, env.anon!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await api.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw new Error(`Prihlásenie ${email} zlyhalo: ${error?.message}`);
  return { api, userId: data.user.id };
}

const offFixture = (product: Record<string, unknown>) => encodeURIComponent(JSON.stringify({ status: 1, product }));

async function openSheet(page: Page, mealLabel: string, title: RegExp) {
  await page.getByRole("button", { name: `Pridať jedlo: ${mealLabel}` }).click();
  const sheet = page.getByRole("dialog", { name: title });
  await expect(sheet).toBeVisible();
  return sheet;
}

test.describe("builder jedálnička: riadky jedál a panel Pridať jedlo (reálna DB)", () => {
  test.skip(!hasEnv, "Chýbajú E2E_* údaje QA účtov alebo Supabase env (aj service role).");

  const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "");
  const body = `2${String(Math.floor(Math.random() * 1e11)).padStart(11, "0")}`;
  const code = `${body}${gs1CheckDigit(body)}`;
  const offName = `E2E Jogurt ${stamp.slice(-5)}`;
  const ownName = `E2E Tvaroh ${stamp.slice(-5)}`;
  const dayName = `E2E deň ${stamp.slice(-5)}`;
  let trainer: { api: SupabaseClient; userId: string } | null = null;
  let planId: string | null = null;
  const admin = hasEnv
    ? createClient(env.url!, env.serviceRole!, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;

  test.afterAll(async () => {
    if (trainer && planId) await trainer.api.from("meal_plans").delete().eq("id", planId);
    if (trainer) await trainer.api.from("foods").delete().eq("created_by", trainer.userId).like("name", `${ownName}%`);
    if (admin) await admin.from("foods").delete().eq("barcode", code).eq("source", "off");
  });

  test("knižnica, sken a nová potravina → uloženie plánu", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Zápis do DB len raz (desktop).");
    test.setTimeout(180_000);

    trainer = await apiSignIn(env.trainerEmail!, env.trainerPassword!);
    const client = await apiSignIn(env.clientEmail!, env.clientPassword!);
    const probe = await trainer.api.from("foods").select("barcode, source").limit(1);
    test.skip(probe.error?.code === "42703", "Migrácia 0050 ešte nie je spustená v Supabase.");

    const { data: clientRow } = await client.api
      .from("clients")
      .select("id, trainer_id")
      .eq("user_id", client.userId)
      .order("created_at")
      .limit(1)
      .single();
    expect(clientRow?.trainer_id, "QA klient musí byť spárovaný s QA trénerom").toBe(trainer.userId);

    const { data: plan, error: planErr } = await trainer.api
      .from("meal_plans")
      .insert({ client_id: clientRow!.id, trainer_id: trainer.userId, name: `E2E jedálniček ${stamp}`, published: false })
      .select("id")
      .single();
    expect(planErr).toBeNull();
    planId = plan!.id as string;
    const { error: dayErr } = await trainer.api.from("meal_days").insert({ plan_id: planId, day_number: 1, name: dayName, meals: [] });
    expect(dayErr).toBeNull();

    // sken: OFF odpoveď pre testovací kód — len do požiadavky na našu route
    await page.route("**/api/potraviny/kod/**", (route) =>
      route.continue({
        headers: {
          ...route.request().headers(),
          "x-e2e-off-fixture": offFixture({
            code,
            product_name: offName,
            brands: "FitPilot E2E",
            serving_quantity: 150,
            nutriments: { "energy-kcal_100g": 60, proteins_100g: 4, carbohydrates_100g: 6, fat_100g: 2 },
          }),
        },
      }),
    );

    await page.goto("/prihlasenie");
    await page.locator("#login-email").fill(env.trainerEmail!);
    await page.locator("#login-password").fill(env.trainerPassword!);
    await page.getByRole("button", { name: "Prihlásiť sa" }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
    await page.goto(`/dashboard/vyziva/jedalnicek/${planId}`);

    // riadky jedál sú zbalené; koncept sa posiela tlačidlom „Poslať klientovi“
    await expect(page.getByRole("button", { name: /^Obed/ })).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByRole("button", { name: "Poslať klientovi" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Premenovať", exact: true })).toBeVisible();

    // 1) Knižnica → Obed
    let sheet = await openSheet(page, "Obed", new RegExp(`${dayName} · Obed`));
    await expect(sheet.getByRole("tab", { name: "Knižnica" })).toHaveAttribute("aria-selected", "true");
    await sheet.getByLabel("Hľadať potravinu v knižnici").fill("vajcia");
    await sheet.getByRole("button", { name: /Vajcia \(celé/ }).click();
    await sheet.getByLabel("Gramáž v gramoch").fill("120");
    await sheet.getByRole("button", { name: "Pridať", exact: true }).click();
    await expect(sheet.getByText(/„Vajcia \(celé.*“ pridané\./)).toBeVisible();
    await sheet.getByRole("button", { name: "Zavrieť" }).click();
    await expect(page.getByRole("button", { name: /^Obed/ })).toHaveAttribute("aria-expanded", "true");

    // 2) Sken (ručné zadanie kódu) → Večera, porcia z produktu
    sheet = await openSheet(page, "Večera", /· Večera/);
    await sheet.getByRole("button", { name: "Skenovať" }).click();
    const scanner = page.getByRole("dialog", { name: "Skenovanie čiarového kódu" });
    await scanner.getByLabel("Číslo pod čiarovým kódom").fill(code);
    await scanner.getByRole("button", { name: "Hľadať" }).click();
    await expect(scanner).toBeHidden();
    await expect(sheet.getByText(`${offName} (FitPilot E2E)`)).toBeVisible();
    await expect(sheet.getByLabel("Gramáž v gramoch")).toHaveValue("150");
    await sheet.getByRole("button", { name: "Pridať", exact: true }).click();
    await sheet.getByRole("button", { name: "Zavrieť" }).click();

    // 3) Nová potravina → Desiata
    sheet = await openSheet(page, "Desiata", /· Desiata/);
    await sheet.getByRole("tab", { name: "Nová potravina" }).click();
    await sheet.getByLabel("Názov potraviny").fill(ownName);
    const field = (label: string) => sheet.locator("label", { hasText: label }).locator("input");
    await field("kcal").fill("100");
    await field("Bielkoviny g").fill("12");
    await field("Sacharidy g").fill("4");
    await field("Tuky g").fill("4");
    await sheet.getByRole("button", { name: "Uložiť potravinu" }).click();
    await expect(sheet.getByLabel("Gramáž v gramoch")).toHaveValue("100");
    await sheet.getByRole("button", { name: "Pridať", exact: true }).click();
    await sheet.getByRole("button", { name: "Zavrieť" }).click();

    // s neuloženými zmenami posiela „Uložiť a poslať“ (neklikáme — plán ostáva koncept)
    await expect(page.getByRole("button", { name: "Uložiť a poslať" })).toBeVisible();

    // Duplikovať: kópia dňa aj s potravinami na koniec, prepne sa na ňu
    await page.getByRole("button", { name: "Duplikovať", exact: true }).click();
    await expect(page.getByRole("button", { name: `${dayName} (kópia)` })).toHaveAttribute("aria-current", "true");
    await expect(page.getByRole("button", { name: /^Obed/ })).toContainText("kcal");

    // uloženie konceptu
    await page.getByRole("button", { name: "Uložiť zmeny" }).click();
    await expect(page.getByText("Zmeny uložené.")).toBeVisible({ timeout: 15_000 });

    const { data: days } = await trainer.api
      .from("meal_days")
      .select("name, meals")
      .eq("plan_id", planId)
      .order("day_number");
    expect(days?.map((d) => d.name)).toEqual([dayName, `${dayName} (kópia)`]);
    type Meal = { entry_id: string; food_name: string; meal_slot: string; grams: number; food_id: string };
    const meals = (days?.[0]?.meals ?? []) as Meal[];
    const copy = (days?.[1]?.meals ?? []) as Meal[];
    // kópia má rovnaké potraviny, ale vlastné entry_id
    expect(copy.map((m) => [m.food_id, m.meal_slot, m.grams])).toEqual(meals.map((m) => [m.food_id, m.meal_slot, m.grams]));
    expect(copy.some((m) => meals.some((o) => o.entry_id === m.entry_id))).toBe(false);
    const bySlot = Object.fromEntries(meals.map((m) => [m.meal_slot, m]));
    expect(bySlot.obed).toMatchObject({ grams: 120 });
    expect(bySlot.obed.food_name).toMatch(/^Vajcia \(celé/);
    expect(bySlot.vecera).toMatchObject({ food_name: `${offName} (FitPilot E2E)`, grams: 150 });
    expect(bySlot.desiata).toMatchObject({ food_name: ownName, grams: 100 });
    expect(meals.every((m) => typeof m.food_id === "string" && m.food_id.length > 0)).toBe(true);

    // trénerova nová potravina je len jeho (created_by, bez trainer_id) — klient ju nevidí
    const own = await trainer.api.from("foods").select("id, source, created_by").eq("name", ownName).single();
    expect(own.data).toMatchObject({ source: "user", created_by: trainer.userId });
    const asClient = await client.api.from("foods").select("id").eq("id", own.data!.id);
    expect(asClient.data ?? []).toEqual([]);
  });
});
