import { test, expect } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Šablóny trénera (/dashboard/sablony, nový dizajn v6): záložky Tréningy / Jedálničky,
 * hľadanie podľa názvu, filter cieľa, náhľad obsahu, „Použiť“ (okno s výberom klienta →
 * koncept v builderi; pre viacerých klientov naraz → jeden koncept, ktorý po odoslaní
 * dostanú všetci — migrácia 0052) a zmazanie.
 *
 * Proti reálnej Supabase DB s QA trénerom a klientom — šablóny a dočasného druhého
 * klienta vytvorí cez API a po sebe zmaže ich aj vytvorené koncepty plánu:
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
  // tréner klienta zmazať nemôže (mazanie ide cez GDPR proces) — dočasného klienta zmaže service role
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

test.describe("šablóny trénera (reálna DB, dizajn v6)", () => {
  test.skip(!hasEnv, "Chýbajú E2E_* údaje QA účtov alebo Supabase env (aj service role).");

  const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "").slice(-6);
  const workoutName = `E2E Upper Lower ${stamp}`;
  const mealName = `E2E Chudnutie 2000 ${stamp}`;
  let trainer: { api: SupabaseClient; userId: string } | null = null;
  const templateIds: { workout?: string; meal?: string } = {};
  const secondName = `E2E Klient 2 ${stamp}`;
  let secondClientId: string | null = null;

  test.afterAll(async () => {
    if (!trainer) return;
    if (templateIds.workout) await trainer.api.from("plan_templates").delete().eq("id", templateIds.workout);
    if (templateIds.meal) await trainer.api.from("meal_templates").delete().eq("id", templateIds.meal);
    await trainer.api.from("workout_plans").delete().eq("trainer_id", trainer.userId).eq("name", workoutName);
    await trainer.api.from("meal_plans").delete().eq("trainer_id", trainer.userId).eq("name", mealName);
    if (secondClientId) {
      const admin = createClient(env.url!, env.serviceRole!, { auth: { persistSession: false, autoRefreshToken: false } });
      await admin.from("clients").delete().eq("id", secondClientId);
    }
  });

  test("záložky, hľadanie, náhľad, Použiť → koncept, zmazanie", async ({ page, context, baseURL }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Zápis do DB len raz (desktop).");
    test.setTimeout(150_000);

    trainer = await apiSignIn(env.trainerEmail!, env.trainerPassword!);
    const client = await apiSignIn(env.clientEmail!, env.clientPassword!);
    const { data: clientRow } = await client.api
      .from("clients")
      .select("id, full_name, trainer_id")
      .eq("user_id", client.userId)
      .order("created_at")
      .limit(1)
      .single();
    expect(clientRow?.trainer_id, "QA klient musí byť spárovaný s QA trénerom").toBe(trainer.userId);

    // dočasný druhý klient (bez účtu, ako „Ešte nemá“ v Pridať klienta)
    const { data: second, error: secondErr } = await trainer.api
      .from("clients")
      .insert({ trainer_id: trainer.userId, full_name: secondName })
      .select("id")
      .single();
    expect(secondErr).toBeNull();
    secondClientId = second!.id;

    // testovacie šablóny
    const { data: wt, error: wtErr } = await trainer.api
      .from("plan_templates")
      .insert({ trainer_id: trainer.userId, name: workoutName, goal: "sila" })
      .select("id")
      .single();
    expect(wtErr).toBeNull();
    templateIds.workout = wt!.id;
    await trainer.api.from("plan_template_days").insert([
      { template_id: wt!.id, day_number: 1, name: "Upper", exercises: [{ exercise_name: "Bench press" }, { exercise_name: "Príťahy" }] },
      { template_id: wt!.id, day_number: 2, name: "Lower", exercises: [{ exercise_name: "Drep" }] },
    ]);
    const { data: mt, error: mtErr } = await trainer.api
      .from("meal_templates")
      .insert({ trainer_id: trainer.userId, name: mealName })
      .select("id")
      .single();
    expect(mtErr).toBeNull();
    templateIds.meal = mt!.id;
    await trainer.api
      .from("meal_template_days")
      .insert({ template_id: mt!.id, day_number: 1, name: "Pondelok", meals: [{ food_name: "Ovsené vločky", grams: 80 }] });

    // nový dizajn dashboardu
    await context.addCookies([{ name: "fp-dash-skin", value: "v6", url: baseURL! }]);
    await page.goto("/prihlasenie");
    await page.locator("#login-email").fill(env.trainerEmail!);
    await page.locator("#login-password").fill(env.trainerPassword!);
    await page.getByRole("button", { name: "Prihlásiť sa" }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
    await page.goto("/dashboard/sablony");
    const tabs = page.getByRole("navigation", { name: "Druh šablón" });

    // záložka Tréningy, hľadanie (bez diakritiky), filter cieľa
    await expect(tabs.getByRole("link", { name: /^Tréningy/ })).toHaveAttribute("aria-current", "page");
    await page.getByLabel("Hľadať šablónu podľa názvu").fill(`upper lower ${stamp}`);
    const card = page.locator("article", { hasText: workoutName });
    await expect(card).toHaveCount(1);
    await expect(card).toContainText("2 dni");
    await expect(card).toContainText("Sila");
    await page.getByRole("link", { name: "Kondícia" }).click();
    await expect(page.locator("article", { hasText: workoutName })).toHaveCount(0);
    await page.getByRole("link", { name: "Sila" }).click();
    await expect(page.locator("article", { hasText: workoutName })).toHaveCount(1);

    // náhľad obsahu
    const sila = page.locator("article", { hasText: workoutName });
    await sila.getByRole("button", { name: "Náhľad" }).click();
    await expect(sila.getByText("Bench press · Príťahy")).toBeVisible();
    await expect(sila.getByText("1 cvik")).toBeVisible();

    // jedálničky
    await tabs.getByRole("link", { name: /^Jedálničky/ }).click();
    const meal = page.locator("article", { hasText: mealName });
    await expect(meal).toHaveCount(1);
    await meal.getByRole("button", { name: "Náhľad" }).click();
    await expect(meal.getByText("Ovsené vločky 80 g")).toBeVisible();

    // jedálniček pre 2 klientov → koncept → odobratie príjemcu pred odoslaním
    const recipientsReady = !(await trainer.api.from("plan_recipients").select("id").limit(1)).error;
    if (recipientsReady) {
      await meal.getByRole("button", { name: "Použiť" }).click();
      const mealDialog = page.getByRole("dialog", { name: "Použiť šablónu" });
      await mealDialog.getByRole("checkbox", { name: new RegExp(clientRow!.full_name) }).click();
      await mealDialog.getByRole("checkbox", { name: new RegExp(secondName) }).click();
      await mealDialog.getByRole("button", { name: "Vytvoriť koncept pre 2 klientov" }).click();
      await page.waitForURL(/\/dashboard\/jedalnicky\/jedalnicek\/[0-9a-f-]{36}/, { timeout: 30_000 });
      await expect(page.getByText("Pošle sa aj:")).toBeVisible();
      await expect(page.getByRole("button", { name: "Poslať 2 klientom" })).toBeVisible();
      await page.getByRole("button", { name: `Odobrať príjemcu ${secondName}` }).click();
      await expect(page.getByText("Pošle sa aj:")).toBeHidden();
      await expect(page.getByRole("button", { name: "Poslať klientovi" })).toBeVisible();
      await page.goto("/dashboard/sablony?typ=jedalnicky");
    }

    // zmazanie jedálničkovej šablóny (potvrdenie druhým klikom)
    await meal.getByRole("button", { name: "Zmazať" }).click();
    await meal.getByRole("button", { name: "Zmazať" }).click();
    await expect(page.locator("article", { hasText: mealName })).toHaveCount(0);
    const { data: mealLeft } = await trainer.api.from("meal_templates").select("id").eq("id", templateIds.meal);
    expect(mealLeft ?? []).toEqual([]);
    delete templateIds.meal;

    // Použiť pre viacerých klientov → jeden koncept → po odoslaní ho majú obaja
    await tabs.getByRole("link", { name: /^Tréningy/ }).click();
    const workout = page.locator("article", { hasText: workoutName });
    await workout.getByRole("button", { name: "Použiť" }).click();
    let dialog = page.getByRole("dialog", { name: "Použiť šablónu" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Vytvoriť koncept" })).toBeDisabled();
    // „Vybrať všetkých“ / „Zrušiť výber“ — bez odoslania (QA tréner môže mať aj iných klientov)
    await dialog.getByRole("button", { name: "Vybrať všetkých" }).click();
    await expect(dialog.getByRole("checkbox", { checked: false })).toHaveCount(0);
    await dialog.getByRole("button", { name: "Zrušiť výber" }).click();
    await expect(dialog.getByRole("checkbox", { checked: true })).toHaveCount(0);
    await dialog.getByRole("checkbox", { name: new RegExp(clientRow!.full_name) }).click();
    await dialog.getByRole("checkbox", { name: new RegExp(secondName) }).click();
    await dialog.getByRole("button", { name: "Vytvoriť koncept pre 2 klientov" }).click();
    if (recipientsReady) {
      await page.waitForURL(/\/dashboard\/treningy\/[0-9a-f-]{36}/, { timeout: 30_000 });
      await expect(page.getByText("Pošle sa aj:")).toBeVisible();
      await expect(page.getByText(secondName)).toBeVisible();
      await page.getByRole("button", { name: "Poslať 2 klientom" }).click();
      await expect(page.getByText("Poslané 2 klientom — tréning už vidia.")).toBeVisible({ timeout: 20_000 });
      const { data: sent } = await trainer.api
        .from("workout_plans")
        .select("id, published, client_id, workout_days(count)")
        .eq("trainer_id", trainer.userId)
        .eq("name", workoutName);
      expect(sent?.map((p) => p.client_id).sort()).toEqual([clientRow!.id, secondClientId].sort());
      expect(sent!.every((p) => p.published === true)).toBe(true);
      expect(sent!.map((p) => (p.workout_days as unknown as { count: number }[])[0].count)).toEqual([2, 2]);
      const { data: leftRecipients } = await trainer.api.from("plan_recipients").select("id").in("workout_plan_id", sent!.map((p) => p.id));
      expect(leftRecipients ?? []).toEqual([]);
      await page.goto("/dashboard/sablony");
    } else {
      // bez migrácie 0052 sa nič nevytvorí a okno povie prečo
      await expect(dialog.getByRole("alert")).toContainText("Ďalších klientov sa nepodarilo pridať");
      await dialog.getByRole("button", { name: "Zrušiť" }).click();
    }

    // jeden klient → rovno builder konceptu
    await workout.getByRole("button", { name: "Použiť" }).click();
    dialog = page.getByRole("dialog", { name: "Použiť šablónu" });
    await dialog.getByRole("checkbox", { name: new RegExp(secondName) }).click();
    await dialog.getByRole("button", { name: "Vytvoriť koncept" }).click();
    await page.waitForURL(/\/dashboard\/treningy\/[0-9a-f-]{36}/, { timeout: 30_000 });
    await expect(page.getByText(workoutName).first()).toBeVisible();
    const { data: plans } = await trainer.api
      .from("workout_plans")
      .select("id, published, client_id")
      .eq("trainer_id", trainer.userId)
      .eq("name", workoutName);
    expect(plans).toHaveLength(recipientsReady ? 3 : 1);
  });
});
