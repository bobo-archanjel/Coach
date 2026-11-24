import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Odcvičený deň plánu je zamknutý (lib/dashboard/planCompletion — getDayForEdit.dayDone,
 * app/portal/trening/actions — saveClientPlanAction): tréner ani klient (vlastný tréning)
 * v ňom nemenia cviky, nepremenujú, nezmažú ani nezduplikujú; builder namiesto úprav ukáže
 * plán vs. skutočnosť. Server to vynúti aj pri zastaranom builderi (záznam pribudol po otvorení).
 */

try {
  process.loadEnvFile(".env.local");
} catch {
  /* bez .env.local sa testy s DB preskočia */
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

const ex = (id: string, name: string) => ({ entry_id: id, exercise_id: null, exercise_name: name, sets: 3, reps: "10", load_kg: 20, tempo: null, rest_seconds: 60 });

test.describe("zámok odcvičeného dňa — náhľad trénera", () => {
  test.skip(process.env.NODE_ENV === "production", "DEV náhľady len v next dev");

  test("odcvičený deň: bez úprav, plán vs. skutočnosť, knižnica nepridáva", async ({ page }) => {
    await page.goto("/dashboard/treningy/x?preview=builder");
    await page.getByRole("button", { name: /Deň 3 — Ťah/ }).click();
    const bar = page.getByTestId("day-done");
    await expect(bar).toContainText("Odcvičené");
    // detail tréningu netreba — RPE, poznámka aj dodatočná úprava sú priamo pri dni
    await expect(page.getByRole("link", { name: "Detail tréningu" })).toHaveCount(0);
    await expect(page.getByText("8/10")).toBeVisible();
    await expect(page.getByText("„Zhyby v poslednej sérii už s gumou.“")).toBeVisible();
    await expect(page.getByTestId("day-done-edited")).toContainText("Klient hodnoty dodatočne upravil");
    for (const name of ["Premenovať", "Duplikovať", "Zmazať deň"]) {
      await expect(page.getByRole("button", { name, exact: true })).toHaveCount(0);
    }
    const row = page.getByTestId("completed-exercise").filter({ hasText: "Veslovanie v predklone" });
    await expect(row.getByTestId("set-row").nth(2)).toContainText("neodcvičené");
    await expect(page.getByTestId("completed-exercise").filter({ hasText: "Bicepsový zdvih" })).toContainText("Nezapísané");
    // pridávanie cvikov pri odcvičenom dni netreba
    await expect(page.getByText("Pridať nový cvik")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Knižnica cvikov/ })).toHaveCount(0);

    // neodcvičený deň má akcie ako doteraz
    await page.getByRole("button", { name: /Deň 2 — Nohy/ }).click();
    await expect(page.getByTestId("day-done")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Premenovať", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /Knižnica cvikov/ })).toBeVisible();
  });
});

test.describe("zámok odcvičeného dňa — reálna DB", () => {
  test.skip(!hasEnv, "Chýbajú E2E_* údaje alebo Supabase env (aj service role).");

  let admin: SupabaseClient;
  const plans: string[] = [];
  test.afterAll(async () => {
    if (!admin || plans.length === 0) return;
    const { data: days } = await admin.from("workout_days").select("id").in("plan_id", plans);
    const dayIds = (days ?? []).map((d) => d.id as string);
    if (dayIds.length) await admin.from("workout_logs").delete().in("workout_day_id", dayIds);
    await admin.from("workout_plans").delete().in("id", plans);
  });

  async function login(page: Page, email: string, password: string, to: RegExp) {
    await page.goto("/prihlasenie");
    await page.locator("#login-email").fill(email);
    await page.locator("#login-password").fill(password);
    await page.getByRole("button", { name: "Prihlásiť sa" }).click();
    await page.waitForURL(to, { timeout: 30_000 });
  }

  async function clientIdOf(userId: string) {
    const { data } = await admin.from("clients").select("id").eq("user_id", userId).limit(1).single();
    return data!.id as string;
  }

  const logDay = (clientId: string, dayId: string) =>
    admin.from("workout_logs").insert({
      client_id: clientId,
      workout_day_id: dayId,
      status: "completed",
      entries: [{ entryId: "a", name: "E2E Drep", sets: [{ reps: 10, weight: 20 }, { reps: 8, weight: 20 }] }],
    });

  test("tréner: odcvičený deň zamknutý, zastaraný builder → server odmietne premenovanie", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "zápis do DB len raz (desktop)");
    test.setTimeout(120_000);
    admin = createClient(env.url!, env.serviceRole!, AUTH);
    const anon = createClient(env.url!, env.anon!, AUTH);
    const { data: t } = await anon.auth.signInWithPassword({ email: env.trainerEmail!, password: env.trainerPassword! });
    const { data: c } = await anon.auth.signInWithPassword({ email: env.clientEmail!, password: env.clientPassword! });
    const clientId = await clientIdOf(c.user!.id);
    const { data: plan } = await admin
      .from("workout_plans")
      .insert({ client_id: clientId, trainer_id: t.user!.id, name: `E2E zámok tréner ${Date.now()}`, published: true })
      .select("id")
      .single();
    plans.push(plan!.id);
    const { data: days } = await admin
      .from("workout_days")
      .insert([
        { plan_id: plan!.id, day_number: 1, name: "E2E Deň A", exercises: [ex("a", "E2E Drep")] },
        { plan_id: plan!.id, day_number: 2, name: "E2E Deň B", exercises: [ex("b", "E2E Zhyby")] },
        // tretí deň neodcvičený — inak by bol po dni B celý plán hotový (zámok celého plánu)
        { plan_id: plan!.id, day_number: 3, name: "E2E Deň C", exercises: [ex("c", "E2E Kliky")] },
      ])
      .select("id, name");
    const dayA = days!.find((d) => d.name === "E2E Deň A")!.id as string;
    const dayB = days!.find((d) => d.name === "E2E Deň B")!.id as string;
    await logDay(clientId, dayA);

    await login(page, env.trainerEmail!, env.trainerPassword!, /\/dashboard/);
    await page.goto(`/dashboard/treningy/${plan!.id}`);
    // deň A odcvičený: zamknutý, plán vs. skutočnosť
    await page.getByRole("button", { name: /E2E Deň A/ }).click();
    await expect(page.getByTestId("day-done")).toBeVisible();
    await expect(page.getByRole("button", { name: "Premenovať", exact: true })).toHaveCount(0);
    const rows = page.getByTestId("completed-exercise").filter({ hasText: "E2E Drep" }).getByTestId("set-row");
    await expect(rows.nth(1).locator("[data-tone]").filter({ hasText: "8 op." })).toHaveAttribute("data-tone", "below");
    await expect(rows.nth(2)).toContainText("neodcvičené");

    // deň B: builder otvorený, klient ho medzitým odcvičí → premenovanie server odmietne
    await page.getByRole("button", { name: /E2E Deň B/ }).click();
    await expect(page.getByRole("button", { name: "Premenovať", exact: true })).toBeVisible();
    await logDay(clientId, dayB);
    await page.getByRole("button", { name: "Premenovať", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("textbox").fill("E2E Deň B zmenený");
    await dialog.getByRole("button", { name: "Hotovo", exact: true }).click();
    await expect(page.getByText("Tento deň je už odcvičený").first()).toBeVisible({ timeout: 15_000 });
    const { data: after } = await admin.from("workout_days").select("name").eq("id", dayB).single();
    expect(after!.name).toBe("E2E Deň B");
  });

  test("klient: vlastný tréning — odcvičený deň zamknutý, uloženie ho nezmení ani nezmaže", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "zápis do DB len raz (desktop)");
    test.setTimeout(120_000);
    admin = createClient(env.url!, env.serviceRole!, AUTH);
    const api = createClient(env.url!, env.anon!, AUTH);
    const { data: c } = await api.auth.signInWithPassword({ email: env.clientEmail!, password: env.clientPassword! });
    const clientId = await clientIdOf(c.user!.id);
    const name = `E2E zámok klient ${Date.now()}`;
    const { data: plan } = await admin
      .from("workout_plans")
      .insert({ client_id: clientId, trainer_id: null, name, published: true })
      .select("id")
      .single();
    plans.push(plan!.id);
    const { data: days } = await admin
      .from("workout_days")
      .insert([
        { plan_id: plan!.id, day_number: 1, name: "E2E Deň 1", exercises: [ex("a", "E2E Drep")] },
        { plan_id: plan!.id, day_number: 2, name: "E2E Deň 2", exercises: [ex("b", "E2E Zhyby")] },
        { plan_id: plan!.id, day_number: 3, name: "E2E Deň 3", exercises: [ex("c", "E2E Kliky")] },
      ])
      .select("id, name");
    const id = (n: string) => days!.find((d) => d.name === n)!.id as string;
    await logDay(clientId, id("E2E Deň 1"));
    const { error: activeErr } = await api.rpc("set_active_plan", { p_plan_id: plan!.id, p_day_id: id("E2E Deň 2") });
    expect(activeErr).toBeNull();

    await login(page, env.clientEmail!, env.clientPassword!, /\/portal/);
    await page.goto("/portal/trening");
    // všetky plány sú rozbalené — „Upraviť“ práve tohto plánu
    await page.locator(`#plan-${plan!.id}`).getByRole("button", { name: "Upraviť", exact: true }).click();
    // deň 1 odcvičený: zamknutý
    await page.getByRole("button", { name: /E2E Deň 1/ }).click();
    await expect(page.getByTestId("day-done")).toBeVisible();
    await expect(page.getByRole("button", { name: "Premenovať", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Zmazať deň", exact: true })).toHaveCount(0);
    await expect(page.getByTestId("completed-exercise").filter({ hasText: "E2E Drep" }).getByTestId("set-row").nth(2)).toContainText(
      "neodcvičené",
    );

    // zastaraný koncept: deň 3 odcvičí až po otvorení buildera — zmazanie server ignoruje
    await logDay(clientId, id("E2E Deň 3"));
    await page.getByRole("button", { name: /E2E Deň 3/ }).click();
    await page.getByRole("button", { name: "Zmazať deň", exact: true }).click();
    await page.getByRole("button", { name: "Áno, zmazať deň" }).click();
    // deň 2 (neodcvičený) sa premenovať dá
    await page.getByRole("button", { name: /E2E Deň 2/ }).click();
    await page.getByRole("button", { name: "Premenovať", exact: true }).click();
    await page.locator("#client-day-rename").fill("E2E Deň 2 nový");
    await page.getByRole("dialog").getByRole("button", { name: "Hotovo", exact: true }).click();
    await page.getByRole("button", { name: "Uložiť", exact: true }).click();
    await expect(page.getByText(name).first()).toBeVisible({ timeout: 30_000 });

    const { data: saved } = await admin.from("workout_days").select("id, name, exercises").eq("plan_id", plan!.id).order("day_number");
    const names = (saved ?? []).map((d) => d.name);
    expect(names).toContain("E2E Deň 1");
    expect(names).toContain("E2E Deň 2 nový");
    expect(names).toContain("E2E Deň 3"); // odcvičený deň zmazanie prežil
  });
});
