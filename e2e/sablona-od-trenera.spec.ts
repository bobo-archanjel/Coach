import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * „Uložiť ako šablónu“ aj pri tréningu a jedálničku OD TRÉNERA (klient si zaň platí —
 * môže si ho odložiť a použiť neskôr). Šablóna je kópia v šablónach klienta
 * (plan_templates / meal_templates, vlastník = klient), tréner ju nevidí.
 *  - náhľady: tlačidlo pri trénerovom pláne aj jedálničku (bez Upraviť / Zmazať),
 *  - reálna DB (QA klient, desktop): dočasný trénerov tréning aj jedálniček → šablóna
 *    s rovnakými dňami; po teste všetko zmazané.
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

test.describe("šablóna z plánu od trénera — náhľady", () => {
  test.skip(process.env.NODE_ENV === "production", "DEV náhľady len v next dev");

  test("tréning od trénera: Uložiť ako šablónu, bez Upraviť / Zmazať", async ({ page }) => {
    await page.goto("/portal/trening?preview=ok");
    const plan = page.locator("#plan-plan-trainer");
    await expect(plan.getByText("Od trénera")).toBeVisible();
    await expect(plan.getByRole("button", { name: "Uložiť ako šablónu" })).toBeVisible();
    await expect(plan.getByRole("button", { name: "Upraviť", exact: true })).toHaveCount(0);
    await expect(plan.getByRole("button", { name: "Zmazať", exact: true })).toHaveCount(0);
  });

  test("jedálniček od trénera: Uložiť ako šablónu, bez Upraviť / Zmazať", async ({ page }) => {
    await page.goto("/portal/strava?preview=ok");
    const actions = page.locator('[data-tour="nutrition-plan-actions"]');
    await expect(actions.getByRole("button", { name: "Uložiť ako šablónu" })).toBeVisible();
    await expect(actions.getByRole("button", { name: "Upraviť", exact: true })).toHaveCount(0);
    await expect(actions.getByRole("button", { name: "Zmazať", exact: true })).toHaveCount(0);
    // vlastný jedálniček má naďalej všetky tri
    await page.goto("/portal/strava?preview=own");
    const own = page.locator('[data-tour="nutrition-own-actions"]');
    await expect(own.getByRole("button")).toHaveCount(3);
  });
});

test.describe("šablóna z plánu od trénera — reálna DB (QA klient)", () => {
  test.skip(!hasEnv, "Chýbajú E2E_CLIENT_* údaje alebo Supabase env (aj service role).");
  test.describe.configure({ mode: "serial" });

  const stamp = Date.now().toString().slice(-6);
  const workoutName = `E2E šablóna tréning ${stamp}`;
  const mealName = `E2E šablóna jedálniček ${stamp}`;
  let admin: SupabaseClient;
  let clientRowId = "";
  let userId = "";
  let trainerId: string | null = null;
  let originalActiveMeal: string | null = null;
  let originalActivePlan: string | null = null;

  test.beforeAll(async () => {
    admin = createClient(env.url!, env.serviceRole!, AUTH);
    const api = createClient(env.url!, env.anon!, AUTH);
    const { data } = await api.auth.signInWithPassword({ email: env.clientEmail!, password: env.clientPassword! });
    userId = data.user!.id;
    const { data: row } = await admin
      .from("clients")
      .select("id, trainer_id, active_plan_id, active_meal_plan_id")
      .eq("user_id", userId)
      .order("created_at")
      .limit(1)
      .single();
    clientRowId = row!.id;
    trainerId = row!.trainer_id;
    originalActivePlan = row!.active_plan_id;
    originalActiveMeal = row!.active_meal_plan_id;
  });

  test.afterAll(async () => {
    if (!clientRowId) return;
    await admin.from("workout_plans").delete().eq("client_id", clientRowId).eq("name", workoutName);
    await admin.from("meal_plans").delete().eq("client_id", clientRowId).eq("name", mealName);
    await admin.from("plan_templates").delete().eq("trainer_id", userId).eq("name", workoutName);
    await admin.from("meal_templates").delete().eq("trainer_id", userId).eq("name", mealName);
    await admin.from("clients").update({ active_plan_id: originalActivePlan, active_meal_plan_id: originalActiveMeal }).eq("id", clientRowId);
  });

  async function login(page: Page) {
    await page.goto("/prihlasenie");
    await page.locator("#login-email").fill(env.clientEmail!);
    await page.locator("#login-password").fill(env.clientPassword!);
    await page.getByRole("button", { name: "Prihlásiť sa" }).click();
    await page.waitForURL(/\/portal/, { timeout: 30_000 });
  }

  test("tréning aj jedálniček od trénera → šablóny klienta s rovnakými dňami", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "zápis do DB len raz (desktop)");
    test.skip(!trainerId, "QA klient nemá trénera");
    test.setTimeout(120_000);

    const exercise = { entry_id: "x1", exercise_id: null, exercise_name: "Drep", sets: 3, reps: "8", load_kg: 60, rest_seconds: 120, tempo: null };
    const { data: wp } = await admin
      .from("workout_plans")
      .insert({ client_id: clientRowId, trainer_id: trainerId, name: workoutName, published: true })
      .select("id")
      .single();
    await admin.from("workout_days").insert([
      { plan_id: wp!.id, day_number: 1, name: "Deň A", exercises: [exercise] },
      { plan_id: wp!.id, day_number: 2, name: "Deň B", exercises: [exercise] },
    ]);
    const meal = { entry_id: "m1", food_id: null, food_name: "Ryža", meal_slot: "obed", grams: 200, kcal_100g: 130, protein_100g: 2.7, carbs_100g: 28, fat_100g: 0.3 };
    const { data: mp } = await admin
      .from("meal_plans")
      .insert({ client_id: clientRowId, trainer_id: trainerId, name: mealName, published: true })
      .select("id")
      .single();
    await admin.from("meal_days").insert({ plan_id: mp!.id, day_number: 1, name: "Pondelok", meals: [meal] });
    await admin.from("clients").update({ active_meal_plan_id: mp!.id }).eq("id", clientRowId);

    await login(page);

    // tréning: odkaz ?plan= rozbalí presne tento plán
    await page.goto(`/portal/trening?plan=${wp!.id}`);
    const plan = page.locator(`#plan-${wp!.id}`);
    await plan.getByRole("button", { name: "Uložiť ako šablónu" }).click();
    await expect(plan.getByRole("status")).toBeVisible({ timeout: 30_000 });
    const { data: wt } = await admin
      .from("plan_templates")
      .select("id, plan_template_days(name, exercises)")
      .eq("trainer_id", userId)
      .eq("name", workoutName);
    expect(wt).toHaveLength(1);
    const wDays = (wt![0].plan_template_days as { name: string; exercises: { exercise_name: string }[] }[]).map((d) => d.name).sort();
    expect(wDays).toEqual(["Deň A", "Deň B"]);

    // jedálniček (aktívny od trénera)
    await page.goto("/portal/strava");
    const actions = page.locator('[data-tour="nutrition-plan-actions"]');
    await actions.getByRole("button", { name: "Uložiť ako šablónu" }).click();
    await expect(actions.getByText("Uložené do Mojich šablón.")).toBeVisible({ timeout: 30_000 });
    const { data: mt } = await admin
      .from("meal_templates")
      .select("id, meal_template_days(name, meals)")
      .eq("trainer_id", userId)
      .eq("name", mealName);
    expect(mt).toHaveLength(1);
    const mDay = (mt![0].meal_template_days as { name: string; meals: { food_name: string; grams: number }[] }[])[0];
    expect(mDay.name).toBe("Pondelok");
    expect(mDay.meals[0]).toMatchObject({ food_name: "Ryža", grams: 200 });
    // šablóna je hneď v záložke „Moje šablóny“
    await page.getByRole("radio", { name: /Moje šablóny/ }).click();
    await expect(page.locator("#moje-sablony-jedalnicka").getByText(mealName)).toBeVisible();
  });
});
