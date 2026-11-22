import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Pridať cvik a vyplniť ho v jednom kroku (lib/workouts/nextEntryDefaults,
 * app/components/pendingEntryEdit):
 *  - pridaný cvik sa hneď otvorí na úpravu s kurzorom v poli Série,
 *  - hodnoty sa prevezmú z posledného cviku dňa (série, opakovania, pauza),
 *  - po uložení sa (s myšou) fokus vráti na pridávanie ďalšieho cviku.
 * Klient: DEV náhľad vlastného tréningu. Tréner: reálna DB (QA tréner, dočasný plán).
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
  trainerEmail: process.env.E2E_TRAINER_EMAIL,
  trainerPassword: process.env.E2E_TRAINER_PASSWORD,
};
const hasEnv = Object.values(env).every(Boolean);
const AUTH = { auth: { persistSession: false, autoRefreshToken: false } };

async function openClientBuilder(page: Page) {
  await page.goto("/portal/trening?preview=ok");
  await page.getByRole("button", { name: "Vlastný tréning" }).click();
  await page.getByRole("button", { name: "+ tréning" }).click();
  const dayDialog = page.getByRole("dialog", { name: "Nový deň" });
  await dayDialog.locator("#client-day-name").fill("Ruky");
  await dayDialog.getByRole("button", { name: "Pridať", exact: true }).click();
}

test.describe("pridať cvik a vyplniť v jednom kroku — klient (náhľad)", () => {
  test.skip(process.env.NODE_ENV === "production", "DEV náhľady len v next dev");

  test("vlastný cvik sa otvorí na úpravu, ďalší preberie hodnoty predošlého", async ({ page }, testInfo) => {
    await openClientBuilder(page);
    await page.getByLabel("Názov vlastného cviku").fill("Bicepsový zdvih");
    await page.getByRole("button", { name: "+ Pridať do tréningu" }).click();

    // formulár rovno otvorený, kurzor v Série (bez ťuku na ceruzku)
    const sets = page.locator('input[name="sets"]');
    await expect(sets).toBeFocused();
    await expect(sets).toHaveValue("3");
    await sets.fill("4");
    await page.getByLabel("Opakovania", { exact: true }).fill("12");
    await page.locator('input[name="rest_seconds"]').fill("60");
    await page.getByRole("button", { name: "Hotovo", exact: true }).click();
    await expect(page.getByText("4× 12")).toBeVisible();
    if (testInfo.project.name === "desktop") {
      // s myšou sa fokus vráti na pridávanie ďalšieho cviku
      await expect(page.getByLabel("Názov vlastného cviku")).toBeFocused();
    }

    // druhý cvik: hodnoty z predošlého (4 × 12, pauza 60 s)
    await page.getByLabel("Názov vlastného cviku").fill("Francúzsky tlak");
    await page.getByRole("button", { name: "+ Pridať do tréningu" }).click();
    await expect(page.locator('input[name="sets"]')).toHaveValue("4");
    await expect(page.getByLabel("Opakovania", { exact: true })).toHaveValue("12");
    await expect(page.locator('input[name="rest_seconds"]')).toHaveValue("60");
  });
});

test.describe("pridať cvik a vyplniť v jednom kroku — tréner (reálna DB)", () => {
  test.skip(!hasEnv, "Chýbajú E2E_TRAINER_* údaje alebo Supabase env (aj service role).");

  let admin: SupabaseClient;
  let planId = "";

  test.afterAll(async () => {
    if (admin && planId) await admin.from("workout_plans").delete().eq("id", planId);
  });

  test("klik v knižnici → cvik na úpravu s hodnotami predošlého, uloženie", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "zápis do DB len raz (desktop)");
    test.setTimeout(120_000);
    admin = createClient(env.url!, env.serviceRole!, AUTH);
    const api = createClient(env.url!, env.anon!, AUTH);
    const { data: auth } = await api.auth.signInWithPassword({ email: env.trainerEmail!, password: env.trainerPassword! });
    const trainerId = auth.user!.id;
    const { data: client } = await admin.from("clients").select("id").eq("trainer_id", trainerId).limit(1).single();
    const { data: plan } = await admin
      .from("workout_plans")
      .insert({ client_id: client!.id, trainer_id: trainerId, name: `E2E jeden krok ${Date.now()}`, published: false })
      .select("id")
      .single();
    planId = plan!.id;
    const first = { entry_id: "e2e-first", exercise_id: null, exercise_name: "E2E prvý cvik", sets: 4, reps: "8", load_kg: null, tempo: null, rest_seconds: 120 };
    const { data: day } = await admin.from("workout_days").insert({ plan_id: planId, day_number: 1, name: "Deň 1", exercises: [first] }).select("id").single();

    await page.goto("/prihlasenie");
    await page.locator("#login-email").fill(env.trainerEmail!);
    await page.locator("#login-password").fill(env.trainerPassword!);
    await page.getByRole("button", { name: "Prihlásiť sa" }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
    await page.goto(`/dashboard/treningy/${planId}`);

    await page.getByRole("button", { name: /Knižnica cvikov/ }).click();
    await page.getByPlaceholder("Hľadať cvik…").fill("drep");
    await page.getByRole("button", { name: /Pridať .*Drep|Drep/ }).first().click();

    const sets = page.locator('input[name="sets"]');
    await expect(sets).toBeFocused({ timeout: 15_000 });
    await expect(sets).toHaveValue("4");
    await expect(page.getByLabel("Opakovania", { exact: true })).toHaveValue("8");
    await expect(page.locator('input[name="rest_seconds"]')).toHaveValue("120");
    await page.locator('input[name="load_kg"]').fill("60");
    await page.getByRole("button", { name: "Uložiť", exact: true }).click();
    await expect(page.getByText("4× 8 @ 60 kg")).toBeVisible({ timeout: 15_000 });
    // fokus späť na hľadanie v otvorenej knižnici
    await expect(page.getByPlaceholder("Hľadať cvik…")).toBeFocused();

    const { data: saved } = await admin.from("workout_days").select("exercises").eq("id", day!.id).single();
    const list = saved!.exercises as { sets: number; reps: string; load_kg: number | null; rest_seconds: number }[];
    expect(list).toHaveLength(2);
    expect(list[1]).toMatchObject({ sets: 4, reps: "8", load_kg: 60, rest_seconds: 120 });
  });
});
