import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supersérie (lib/workouts/superset.ts): spojenie cvikov reťazou medzi kartami v builderi
 * trénera aj klienta, štítky A1 / A2, pauza až po kole, zobrazenie v portáli, spojenie
 * počas tréningu (len pre tento tréning, ide do zápisu). DEV náhľady + reálna DB.
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
const tag = (page: Page, name: string) => page.locator("[data-superset]").filter({ hasText: name });

test.describe("superséria — náhľady", () => {
  test.skip(process.env.NODE_ENV === "production", "DEV náhľady len v next dev");

  test("tréner: A1/A2 v pláne, spojenie a rozdelenie reťazou", async ({ page }) => {
    await page.goto("/dashboard/treningy/x?preview=builder");
    await expect(tag(page, "Rozpažky s jednoručkami")).toHaveAttribute("data-superset", "A1");
    await expect(tag(page, "Francúzsky tlak")).toHaveAttribute("data-superset", "A2");
    await expect(tag(page, "Rozpažky s jednoručkami")).toContainText("bez pauzy → A2");
    await expect(tag(page, "Francúzsky tlak")).toContainText("pauza po kole 90 s");

    // Bench + Tlaky nad hlavu → nová superséria A, pôvodná sa posunie na B
    await page.getByRole("button", { name: "Spojiť cviky Bench press a Tlaky nad hlavu do supersérie" }).click();
    await expect(tag(page, "Bench press")).toHaveAttribute("data-superset", "A1");
    await expect(tag(page, "Tlaky nad hlavu")).toHaveAttribute("data-superset", "A2");
    await expect(tag(page, "Rozpažky s jednoručkami")).toHaveAttribute("data-superset", "B1");

    // rozdelenie
    await page.getByRole("button", { name: "Rozdeliť supersériu medzi cvikmi Rozpažky s jednoručkami a Francúzsky tlak" }).click();
    await expect(tag(page, "Rozpažky s jednoručkami")).toHaveCount(0);
    await expect(tag(page, "Francúzsky tlak")).toHaveCount(0);
  });

  test("klient: vlastný tréning — spojenie, štítky, presun cviku supersériu zruší", async ({ page }) => {
    await page.goto("/portal/trening?preview=ok");
    await page.getByRole("button", { name: "Vlastný tréning" }).click();
    await page.getByRole("button", { name: "+ deň" }).click();
    const dayDialog = page.getByRole("dialog", { name: "Nový deň" });
    await dayDialog.locator("#client-day-name").fill("Ruky");
    await dayDialog.getByRole("button", { name: "Pridať", exact: true }).click();
    for (const name of ["Bicepsový zdvih", "Francúzsky tlak"]) {
      await page.getByLabel("Názov vlastného cviku").fill(name);
      await page.getByRole("button", { name: "+ Pridať do tréningu" }).click();
      await page.getByRole("button", { name: "Hotovo", exact: true }).click();
    }
    await page.getByRole("button", { name: "Spojiť cviky Bicepsový zdvih a Francúzsky tlak do supersérie" }).click();
    await expect(tag(page, "Bicepsový zdvih")).toHaveAttribute("data-superset", "A1");
    await expect(tag(page, "Francúzsky tlak")).toHaveAttribute("data-superset", "A2");
    await expect(tag(page, "Bicepsový zdvih")).toContainText("bez pauzy → A2");

    // presun šípkou → cvik vypadne zo supersérie, ostane jeden → zanikne
    await tag(page, "Bicepsový zdvih").getByRole("button", { name: "Posunúť cvik nižšie" }).click();
    await expect(page.locator("[data-superset]")).toHaveCount(0);
  });

  test("portál: náhľad dňa ukáže supersériu s pauzou po kole", async ({ page }) => {
    await page.goto("/portal/trening?preview=ok");
    await page.getByRole("button", { name: /Deň B/ }).first().click();
    await expect(page.getByText(/Superséria A · cvič striedavo/)).toBeVisible();
    await expect(tag(page, "Mŕtvy ťah")).toContainText("bez pauzy → A2");
    await expect(tag(page, "Zhyby")).toContainText("pauza po kole 90 s");
  });

  test("počas tréningu: superséria z plánu, spojenie ďalších cvikov ide do zápisu a prežije refresh", async ({ page }) => {
    await page.goto("/portal?preview=ok");
    await page.getByRole("button", { name: /Začať tréning/ }).click();
    await expect(page.getByText(/Superséria A · A1 → A2, potom pauza/)).toBeVisible();
    await expect(tag(page, "Predkopávanie na stroji")).toHaveAttribute("data-superset", "A1");

    await page.getByRole("button", { name: "Spojiť cviky Drep s veľkou činkou a Rumunský mŕtvy ťah do supersérie" }).click();
    await expect(tag(page, "Drep s veľkou činkou")).toHaveAttribute("data-superset", "A1");
    await expect(tag(page, "Predkopávanie na stroji")).toHaveAttribute("data-superset", "B1");

    const entries = async () =>
      JSON.parse(await page.locator('input[name="entries"]').inputValue()) as { name: string; superset?: string }[];
    const byName = (list: { name: string; superset?: string }[], n: string) => list.find((e) => e.name === n)?.superset;
    let list = await entries();
    expect(byName(list, "Drep s veľkou činkou")).toBeTruthy();
    expect(byName(list, "Drep s veľkou činkou")).toBe(byName(list, "Rumunský mŕtvy ťah"));
    expect(byName(list, "Predkopávanie na stroji")).toBe(byName(list, "Zakopávanie v ľahu"));
    expect(byName(list, "Výpony na lýtka v stoji")).toBeUndefined();

    // spojenie je v koncepte — prežije refresh
    await page.reload();
    await expect(tag(page, "Drep s veľkou činkou")).toHaveAttribute("data-superset", "A1");
    list = await entries();
    expect(byName(list, "Drep s veľkou činkou")).toBe(byName(list, "Rumunský mŕtvy ťah"));
  });
});

test.describe("superséria — reálna DB", () => {
  test.skip(!hasEnv, "Chýbajú E2E_* údaje alebo Supabase env (aj service role).");

  let admin: SupabaseClient;
  const cleanup: { plans: string[] } = { plans: [] };
  test.afterAll(async () => {
    if (admin && cleanup.plans.length) await admin.from("workout_plans").delete().in("id", cleanup.plans);
  });

  async function login(page: Page, email: string, password: string, to: RegExp) {
    await page.goto("/prihlasenie");
    await page.locator("#login-email").fill(email);
    await page.locator("#login-password").fill(password);
    await page.getByRole("button", { name: "Prihlásiť sa" }).click();
    await page.waitForURL(to, { timeout: 30_000 });
  }

  test("tréner: spojenie reťazou sa uloží do plánu", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "zápis do DB len raz (desktop)");
    admin = createClient(env.url!, env.serviceRole!, AUTH);
    const api = createClient(env.url!, env.anon!, AUTH);
    const { data: auth } = await api.auth.signInWithPassword({ email: env.trainerEmail!, password: env.trainerPassword! });
    const trainerId = auth.user!.id;
    const { data: client } = await admin.from("clients").select("id").eq("trainer_id", trainerId).limit(1).single();
    const { data: plan } = await admin
      .from("workout_plans")
      .insert({ client_id: client!.id, trainer_id: trainerId, name: `E2E superséria ${Date.now()}`, published: false })
      .select("id")
      .single();
    cleanup.plans.push(plan!.id);
    const ex = (id: string, name: string) => ({ entry_id: id, exercise_id: null, exercise_name: name, sets: 3, reps: "10", load_kg: null, tempo: null, rest_seconds: 60 });
    const { data: day } = await admin
      .from("workout_days")
      .insert({ plan_id: plan!.id, day_number: 1, name: "Deň 1", exercises: [ex("a", "E2E Zhyby"), ex("b", "E2E Kliky"), ex("c", "E2E Plank")] })
      .select("id")
      .single();

    await login(page, env.trainerEmail!, env.trainerPassword!, /\/dashboard/);
    await page.goto(`/dashboard/treningy/${plan!.id}`);
    await page.getByRole("button", { name: "Spojiť cviky E2E Zhyby a E2E Kliky do supersérie" }).click();
    await expect(tag(page, "E2E Zhyby")).toHaveAttribute("data-superset", "A1");
    await expect
      .poll(async () => {
        const { data } = await admin.from("workout_days").select("exercises").eq("id", day!.id).single();
        const list = data!.exercises as { superset?: string | null }[];
        return Boolean(list[0].superset) && list[0].superset === list[1].superset && !list[2].superset;
      }, { timeout: 15_000 })
      .toBe(true);
  });

  test("klient: vlastný tréning so supersériou sa uloží", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "zápis do DB len raz (desktop)");
    admin = createClient(env.url!, env.serviceRole!, AUTH);
    const name = `E2E superséria klient ${Date.now()}`;
    await login(page, env.clientEmail!, env.clientPassword!, /\/portal/);
    await page.goto("/portal/trening");
    await page.getByRole("button", { name: "Vlastný tréning" }).click();
    await page.getByLabel("Názov tréningového plánu").fill(name);
    await page.getByRole("button", { name: "+ deň" }).click();
    const dayDialog = page.getByRole("dialog", { name: "Nový deň" });
    await dayDialog.locator("#client-day-name").fill("Deň 1");
    await dayDialog.getByRole("button", { name: "Pridať", exact: true }).click();
    for (const ex of ["E2E Výpady", "E2E Skoky"]) {
      await page.getByLabel("Názov vlastného cviku").fill(ex);
      await page.getByRole("button", { name: "+ Pridať do tréningu" }).click();
      await page.getByRole("button", { name: "Hotovo", exact: true }).click();
    }
    await page.getByRole("button", { name: "Spojiť cviky E2E Výpady a E2E Skoky do supersérie" }).click();
    await page.getByRole("button", { name: "Uložiť tréning" }).click();
    await expect(page.getByText(name)).toBeVisible({ timeout: 30_000 });

    const { data: plan } = await admin.from("workout_plans").select("id, workout_days(exercises)").eq("name", name).single();
    cleanup.plans.push(plan!.id);
    const list = (plan!.workout_days as { exercises: { exercise_name: string; superset?: string | null }[] }[])[0].exercises;
    expect(list.map((e) => e.exercise_name)).toEqual(["E2E Výpady", "E2E Skoky"]);
    expect(list[0].superset).toBeTruthy();
    expect(list[0].superset).toBe(list[1].superset);
  });
});
