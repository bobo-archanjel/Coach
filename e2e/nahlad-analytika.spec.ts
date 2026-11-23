import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Náhľad odcvičeného vlastného tréningu + Analytika tréningu (feature/nahlad-analytika):
 *  - celý odcvičený vlastný plán má „Náhľad“ namiesto „Upraviť“ (rozpracovaný ostáva „Upraviť“),
 *  - náhľad: bez „Uložiť“ / „Uložiť zmeny“, poľa názvu, „+ tréning“ a knižnice cvikov,
 *  - „Analytika tréningu“ hore: karty cvikov vybraného tréningu pod sebou s grafom objemu v čase.
 * DEV náhľad (?preview=ok) + reálna DB na QA klientovi (plán a zápisy po sebe zmaže).
 *   E2E_CLIENT_EMAIL, E2E_CLIENT_PASSWORD
 */

const planCard = (page: Page, id: string) => page.locator(`#plan-${id}`);

test.describe("náhľad a analytika — náhľady", () => {
  test.skip(process.env.NODE_ENV === "production", "DEV náhľady len v next dev");

  test("hotový vlastný plán: Náhľad bez úprav, rozpracovaný ostáva Upraviť", async ({ page }) => {
    await page.goto("/portal/trening?preview=ok");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.getByRole("button", { name: /Moje kardio \+ core/ }).click();
    await expect(planCard(page, "plan-own").getByRole("button", { name: "Upraviť" })).toBeVisible();
    await expect(planCard(page, "plan-own").getByRole("button", { name: "Náhľad" })).toHaveCount(0);

    await page.getByRole("button", { name: /Moja jesenná sila/ }).click();
    const card = planCard(page, "plan-own-done");
    await expect(card.getByRole("button", { name: "Upraviť" })).toHaveCount(0);
    await card.getByRole("button", { name: "Náhľad" }).click();

    const view = page.getByRole("region", { name: "Náhľad tréningu" });
    await expect(view).toBeVisible();
    await expect(view.getByRole("heading", { name: "Moja jesenná sila" })).toBeVisible();
    await expect(view.getByRole("button", { name: "Uložiť", exact: true })).toHaveCount(0);
    await expect(view.getByRole("button", { name: /Uložiť zmeny|Uložiť tréning/ })).toHaveCount(0);
    await expect(view.getByLabel("Názov tréningového plánu")).toHaveCount(0);
    await expect(view.getByRole("button", { name: "+ tréning" })).toHaveCount(0);
    await expect(view.getByLabel("Názov vlastného cviku")).toHaveCount(0);
    // odcvičené hodnoty ako doteraz, prepínanie tréningov funguje
    await expect(view.getByTestId("completed-exercise").first()).toContainText("Bench press");
    await view.getByRole("button", { name: /Tréning 2/ }).click();
    await expect(view.getByTestId("completed-exercise").first()).toContainText("Mŕtvy ťah");

    // zatvorenie (späť) — z náhľadu nevznikne rozpracovaný koncept („Pokračovať“)
    await page.goBack();
    await expect(view).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Pokračovať" })).toHaveCount(0);
  });

  test("Analytika tréningu: karty cvikov pod sebou s grafom objemu, späť na Náhľad", async ({ page }) => {
    await page.goto("/portal/trening?preview=ok");
    await page.getByRole("button", { name: /Moja jesenná sila/ }).click();
    await planCard(page, "plan-own-done").getByRole("button", { name: "Náhľad" }).click();
    const view = page.getByRole("region", { name: "Náhľad tréningu" });

    await view.getByRole("button", { name: "Analytika tréningu" }).click();
    const cards = view.getByTestId("volume-card");
    await expect(cards).toHaveCount(2);
    await expect(cards.nth(0)).toContainText("Bench press");
    await expect(cards.nth(0)).toContainText(/1\s375\s*kg/);
    await expect(cards.nth(0).getByRole("slider", { name: /Graf objemu: Bench press, 3 tréningy/ })).toBeVisible();
    // jeden tréning → hodnota bez grafu
    await expect(cards.nth(1)).toContainText("Tlaky nad hlavu");
    await expect(cards.nth(1)).toContainText("Zatiaľ jeden tréning s týmto cvikom");
    await expect(view.getByTestId("completed-exercise")).toHaveCount(0);

    // iný tréning: cvik bez kg nemá objem
    await view.getByRole("button", { name: /Tréning 2/ }).click();
    await expect(cards.nth(0)).toContainText("Mŕtvy ťah");
    await expect(cards.nth(1)).toContainText("Objem sa počíta z kg");

    await view.getByRole("button", { name: "Náhľad", exact: true }).click();
    await expect(view.getByTestId("volume-card")).toHaveCount(0);
    await expect(view.getByTestId("completed-exercise").first()).toBeVisible();
    await expect(view.getByRole("button", { name: "Analytika tréningu" })).toBeVisible();
  });
});

try {
  process.loadEnvFile(".env.local");
} catch {
  /* bez .env.local sa reálna časť preskočí */
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

test.describe("náhľad a analytika — reálna DB", () => {
  test.skip(!hasEnv, "Chýbajú E2E_CLIENT_* údaje alebo Supabase env (aj service role).");

  let admin: SupabaseClient;
  const planIds: string[] = [];
  test.afterAll(async () => {
    if (!admin || planIds.length === 0) return;
    const { data: days } = await admin.from("workout_days").select("id").in("plan_id", planIds);
    const ids = (days ?? []).map((d) => d.id as string);
    if (ids.length) await admin.from("workout_logs").delete().in("workout_day_id", ids);
    await admin.from("workout_plans").delete().in("id", planIds);
  });

  test("objem cviku v čase zo všetkých tréningov klienta", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "zápis do DB len raz (desktop)");
    test.setTimeout(120_000);
    admin = createClient(env.url!, env.serviceRole!, AUTH);
    const anon = createClient(env.url!, env.anon!, AUTH);
    const { data: auth } = await anon.auth.signInWithPassword({ email: env.clientEmail!, password: env.clientPassword! });
    const { data: client } = await admin.from("clients").select("id").eq("user_id", auth.user!.id).limit(1).single();
    const stamp = Date.now();
    const exName = `E2E Objem ${stamp}`;
    const ex = (id: string, name: string) => ({ entry_id: id, exercise_id: null, exercise_name: name, sets: 3, reps: "10", load_kg: 50, tempo: null, rest_seconds: 60 });

    const mkPlan = async (name: string, entryId: string) => {
      const { data: plan } = await admin.from("workout_plans").insert({ client_id: client!.id, trainer_id: null, name }).select("id").single();
      planIds.push(plan!.id);
      const { data: day } = await admin
        .from("workout_days")
        .insert({ plan_id: plan!.id, day_number: 1, name: "Tréning 1", exercises: [ex(entryId, exName), ex(`${entryId}b`, `E2E Plank ${stamp}`)] })
        .select("id")
        .single();
      return { planId: plan!.id as string, dayId: day!.id as string };
    };
    const log = (dayId: string, entryId: string, performedOn: string, sets: { reps: number; weight: number | null }[]) =>
      admin.from("workout_logs").insert({
        client_id: client!.id,
        workout_day_id: dayId,
        status: "completed",
        performed_on: performedOn,
        entries: [
          { entryId, name: exName, sets },
          { entryId: `${entryId}b`, name: `E2E Plank ${stamp}`, sets: [{ reps: 60, weight: null }] },
        ],
      });

    // starší plán s tým istým cvikom (iný entry_id) — história z iného plánu sa zráta
    const older = await mkPlan(`E2E Starší plán ${stamp}`, `old${stamp}`);
    await log(older.dayId, `old${stamp}`, "2026-01-05", [{ reps: 10, weight: 40 }, { reps: 10, weight: 40 }]); // 800
    const done = await mkPlan(`E2E Hotový vlastný ${stamp}`, `new${stamp}`);
    await log(done.dayId, `new${stamp}`, "2026-01-12", [{ reps: 10, weight: 50 }, { reps: 8, weight: 50 }]); // 900

    await page.goto("/prihlasenie");
    await page.locator("#login-email").fill(env.clientEmail!);
    await page.locator("#login-password").fill(env.clientPassword!);
    await page.getByRole("button", { name: "Prihlásiť sa" }).click();
    await page.waitForURL(/\/portal/, { timeout: 30_000 });
    await page.goto("/portal/trening");

    await page.getByRole("button", { name: new RegExp(`E2E Hotový vlastný ${stamp}`) }).click();
    await planCard(page, done.planId).getByRole("button", { name: "Náhľad" }).click();
    const view = page.getByRole("region", { name: "Náhľad tréningu" });
    await expect(view.getByRole("button", { name: "Uložiť", exact: true })).toHaveCount(0);
    await view.getByRole("button", { name: "Analytika tréningu" }).click();

    const cards = view.getByTestId("volume-card");
    await expect(cards).toHaveCount(2, { timeout: 15_000 });
    await expect(cards.nth(0)).toContainText(exName);
    await expect(cards.nth(0)).toContainText(/900\s*kg/);
    await expect(cards.nth(0).getByRole("slider", { name: new RegExp(`Graf objemu: ${exName}, 2 tréningy`) })).toBeVisible();
    await expect(cards.nth(0)).toContainText(/100\s*kg/); // ↑ 100 kg oproti 5. 1.
    await expect(cards.nth(1)).toContainText("Objem sa počíta z kg");
  });
});
