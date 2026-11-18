import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Odcvičený tréning u klienta: plán vs. skutočnosť po sériách (app/components/CompletedExercises,
 * lib/workouts/completed — compareLog). Tréning → deň Hotovo má prepínač Odcvičené / Plán,
 * karta Dnes po odcvičení a náhľad dňa v Tento týždeň ukazujú tú istú tabuľku s farbami
 * ako detail trénera. DEV náhľady + reálna DB (vlastný plán, vymazaná séria).
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

const exercise = (page: Page, name: string) => page.getByTestId("completed-exercise").filter({ hasText: name });
const tone = (page: Page, name: string, row: number, text: string) =>
  exercise(page, name).getByTestId("set-row").nth(row).locator("[data-tone]").filter({ hasText: text });

test.describe("odcvičený tréning u klienta — náhľady", () => {
  test.skip(process.env.NODE_ENV === "production", "DEV náhľady len v next dev");

  test("Tréning: deň Hotovo otvorí Odcvičené (vymazaná séria = neodcvičené), prepnutie na Plán", async ({ page }) => {
    await page.goto("/portal/trening?preview=ok");
    await page.getByRole("button", { name: /Deň B/ }).first().click();
    await expect(page.getByRole("radio", { name: "Odcvičené" })).toHaveAttribute("aria-checked", "true");

    const rows = exercise(page, "Mŕtvy ťah").getByTestId("set-row");
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(2)).toContainText("neodcvičené");
    await expect(tone(page, "Mŕtvy ťah", 0, "5 op.")).toHaveAttribute("data-tone", "met");
    await expect(tone(page, "Mŕtvy ťah", 1, "4 op.")).toHaveAttribute("data-tone", "below");
    await expect(tone(page, "Zhyby", 1, "10 op.")).toHaveAttribute("data-tone", "above");
    await expect(exercise(page, "Zhyby").getByTestId("set-row").nth(3)).toContainText("neodcvičené");
    // farby ako u trénera: tri rôzne
    const color = (n: string, r: number, t: string) => tone(page, n, r, t).evaluate((el) => getComputedStyle(el).color);
    const colors = [await color("Mŕtvy ťah", 0, "5 op."), await color("Mŕtvy ťah", 1, "4 op."), await color("Zhyby", 1, "10 op.")];
    expect(new Set(colors).size).toBe(3);

    await page.getByRole("radio", { name: "Plán" }).click();
    await expect(page.getByTestId("completed-exercise")).toHaveCount(0);
    await expect(page.getByText("Mŕtvy ťah").first()).toBeVisible();

    // iný deň → znova Odcvičené
    await page.getByRole("button", { name: "Všetky dni" }).click();
    await page.getByRole("button", { name: /Deň A/ }).first().click();
    await expect(page.getByRole("radio", { name: "Odcvičené" })).toHaveAttribute("aria-checked", "true");
    await expect(exercise(page, "Tlaky nad hlavu")).toContainText("Nezapísané");
  });

  test("Dnes po odcvičení: porovnanie s plánom", async ({ page }) => {
    await page.goto("/portal?preview=done");
    await expect(tone(page, "Drep s veľkou činkou", 0, "92 kg")).toHaveAttribute("data-tone", "above");
    await expect(tone(page, "Drep s veľkou činkou", 3, "5 op.")).toHaveAttribute("data-tone", "below");
    await expect(exercise(page, "Tlaky s jednoručkami")).toContainText("Mimo plánu");
  });

  test("Tento týždeň: náhľad dňa s porovnaním", async ({ page }) => {
    await page.goto("/portal?preview=ok");
    await page.getByRole("button", { name: /Pondelok 24/ }).click();
    const dialog = page.getByRole("dialog", { name: /Pondelok 24/ });
    await expect(dialog.getByTestId("completed-exercise")).toHaveCount(3);
    await expect(exercise(page, "Bicepsový zdvih").getByTestId("set-row").nth(2)).toContainText("neodcvičené");
    await expect(tone(page, "Tlak na lavičke", 2, "75 kg")).toHaveAttribute("data-tone", "above");
  });
});

test.describe("odcvičený tréning u klienta — reálna DB", () => {
  test.skip(!hasEnv, "Chýbajú E2E_CLIENT_* údaje alebo Supabase env (aj service role).");

  let admin: SupabaseClient;
  let planId = "";
  test.afterAll(async () => {
    if (!admin || !planId) return;
    // záznamy tréningu tohto plánu (dokončený záznam je nemenný — maže service role)
    const { data: days } = await admin.from("workout_days").select("id").eq("plan_id", planId);
    const dayIds = (days ?? []).map((d) => d.id as string);
    if (dayIds.length) await admin.from("workout_logs").delete().in("workout_day_id", dayIds);
    await admin.from("workout_plans").delete().eq("id", planId);
  });

  test("vlastný tréning: odobratá séria sa v Tréningu ukáže ako neodcvičená", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "zápis do DB len raz (desktop)");
    test.setTimeout(120_000);
    admin = createClient(env.url!, env.serviceRole!, AUTH);
    const api = createClient(env.url!, env.anon!, AUTH);
    const { data: auth } = await api.auth.signInWithPassword({ email: env.clientEmail!, password: env.clientPassword! });
    const { data: me } = await admin.from("clients").select("id").eq("user_id", auth.user!.id).limit(1).single();

    const name = `E2E odcvičené ${Date.now()}`;
    const { data: plan } = await admin
      .from("workout_plans")
      .insert({ client_id: me!.id, trainer_id: null, name, published: true })
      .select("id")
      .single();
    planId = plan!.id;
    const ex = { entry_id: "e2e-od", exercise_id: null, exercise_name: "E2E Výpady", sets: 3, reps: "10", load_kg: 20, tempo: null, rest_seconds: 60 };
    const { data: day } = await admin
      .from("workout_days")
      .insert({ plan_id: planId, day_number: 1, name: "E2E Nohy", exercises: [ex] })
      .select("id")
      .single();
    const { error: activeErr } = await api.rpc("set_active_plan", { p_plan_id: planId, p_day_id: day!.id });
    expect(activeErr).toBeNull();

    await page.goto("/prihlasenie");
    await page.locator("#login-email").fill(env.clientEmail!);
    await page.locator("#login-password").fill(env.clientPassword!);
    await page.getByRole("button", { name: "Prihlásiť sa" }).click();
    await page.waitForURL(/\/portal/, { timeout: 30_000 });
    await page.goto("/portal");
    await page.getByRole("button", { name: "Začať tréning" }).click();
    // 3. séria preč, 2. séria s menej opakovaniami
    await page.getByRole("button", { name: "Odobrať sériu" }).nth(2).click();
    await page.getByLabel("E2E Výpady, séria 2, opakovania").fill("8");
    await page.getByRole("button", { name: "Ukončiť tréning" }).click();
    await page.getByRole("button", { name: "Áno, ukončiť" }).click();
    await expect(page.getByRole("button", { name: /Upraviť hodnoty/ })).toBeVisible({ timeout: 20_000 });
    // karta Dnes: hneď porovnanie
    await expect(exercise(page, "E2E Výpady").getByTestId("set-row").nth(2)).toContainText("neodcvičené");

    // aktívny plán je v Tréningu rozbalený
    await page.goto("/portal/trening");
    await page.getByRole("button", { name: /E2E Nohy/ }).first().click();
    await expect(page.getByRole("radio", { name: "Odcvičené" })).toHaveAttribute("aria-checked", "true");
    const rows = exercise(page, "E2E Výpady").getByTestId("set-row");
    await expect(rows).toHaveCount(3);
    await expect(tone(page, "E2E Výpady", 0, "10 op.")).toHaveAttribute("data-tone", "met");
    await expect(tone(page, "E2E Výpady", 1, "8 op.")).toHaveAttribute("data-tone", "below");
    await expect(rows.nth(2)).toContainText("neodcvičené");
    await expect(rows.nth(2)).toContainText("10 op. × 20 kg");
  });
});
