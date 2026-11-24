import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { apiSession, sessionLogin } from "./helpers/sessionLogin";

/**
 * Voľba aktívneho tréningového plánu (feature/active-training, migrácia 0056):
 * klient ho prepína v Tréningu („Nastaviť ako aktívny“) aj na karte Dnes („Zmeniť plán“),
 * tréner v detaile klienta; nový zverejnený plán zvolený aktívny neprebije.
 * Náhľady bez session (DEV, ?preview=) + reálny tok na QA účtoch (plány po sebe zmaže
 * a klientovi vráti pôvodný aktívny plán).
 *   E2E_TRAINER_EMAIL, E2E_TRAINER_PASSWORD, E2E_CLIENT_EMAIL, E2E_CLIENT_PASSWORD
 */

test.describe("aktívny plán — náhľady", () => {
  test.skip(process.env.NODE_ENV === "production", "DEV náhľady len v next dev");

  test("Dnes: názov aktívneho plánu a „Zmeniť plán“ otvorí zoznam plánov", async ({ page }) => {
    await page.goto("/portal?preview=ok");
    await expect(page.getByText("Silový 3× týždenne", { exact: true }).first()).toBeVisible();
    // názov plánu aj v oranžovom poli ďalšieho tréningu
    await expect(page.getByTestId("hero-plan")).toHaveText("Silový 3× týždenne");
    const change = page.getByRole("button", { name: "Zmeniť plán", exact: true });
    await change.click();
    const sheet = page.getByRole("dialog", { name: "Aktívny tréningový plán" });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole("button")).toHaveCount(5); // zavrieť + 4 plány
    await expect(sheet.getByRole("button", { name: /Silový 3× týždenne/ })).toHaveAttribute("aria-current", "true");
    await expect(sheet.getByRole("button", { name: /Môj ranný tréning/ })).not.toHaveAttribute("aria-current", "true");
    await expect(sheet.getByText("Vlastný")).toBeVisible();
    // fokus na aktívnom pláne; plán bez cvikov sa zvoliť nedá (ako v Tréningu)
    await expect(sheet.getByRole("button", { name: /Silový 3× týždenne/ })).toBeFocused();
    await expect(sheet.getByRole("button", { name: /Rozpracovaný plán/ })).toBeDisabled();
    // celý odcvičený plán: „Hotovo“, zvoliť sa nedá
    await expect(sheet.getByRole("button", { name: /Letný plán/ })).toBeDisabled();
    await expect(sheet.getByRole("button", { name: /Letný plán/ })).toContainText("Hotovo");
    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0);
    await expect(change).toBeFocused();
  });

  test("Dnes: aktívny plán bez cvikov ponúkne zmenu plánu", async ({ page }) => {
    await page.goto("/portal?preview=no_plan_choice");
    await expect(page.getByText("Plán „Rozpracovaný plán“ je zatiaľ prázdny")).toBeVisible();
    await expect(page.getByRole("button", { name: "Zmeniť", exact: true })).toBeVisible();
  });

  test("Tréning: „Nastaviť ako aktívny“ len pri neaktívnom pláne", async ({ page }) => {
    await page.goto("/portal/trening?preview=ok");
    // všetky plány sú rozbalené — aktívny bez tlačidla, neaktívny (nedokončený) s ním
    await expect(page.locator("#plan-plan-trainer").getByRole("button", { name: "Nastaviť ako aktívny" })).toHaveCount(0);
    await expect(page.locator("#plan-plan-own").getByRole("button", { name: "Nastaviť ako aktívny" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Nastaviť ako aktívny" })).toHaveCount(1);
  });

  test("Tréning: celý odcvičený plán má „Hotovo“ a nedá sa nastaviť ako aktívny", async ({ page }) => {
    await page.goto("/portal/trening?preview=ok");
    const head = page.locator("#plan-plan-done header");
    await expect(head).toContainText("Letný plán — celé telo");
    await expect(head).toContainText("Hotovo");
    // celý odcvičený: postup 1 z 1 (zelený), bez „Nastaviť ako aktívny“
    await expect(page.locator("#plan-plan-done")).toContainText("Odcvičené 1 z 1");
    await expect(page.locator("#plan-plan-done").getByRole("button", { name: "Nastaviť ako aktívny" })).toHaveCount(0);
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
  trainerEmail: process.env.E2E_TRAINER_EMAIL,
  clientEmail: process.env.E2E_CLIENT_EMAIL,
};
const hasEnv = Object.values(env).every(Boolean);
const AUTH = { auth: { persistSession: false, autoRefreshToken: false } };

// Prihlásenie bez formulára (CAPTCHA v Supabase) — e2e/helpers/sessionLogin.ts; heslo sa nepoužije.
async function apiSignIn(email: string): Promise<{ api: SupabaseClient; userId: string }> {
  return apiSession(email);
}

async function loginV6(page: Page, email: string) {
  await sessionLogin(page, email, test.info().project.use.baseURL!);
}

test.describe("aktívny plán — reálna DB (klient aj tréner)", () => {
  test.skip(!hasEnv, "Chýbajú E2E_* údaje QA účtov alebo Supabase env (aj service role).");

  const stamp = Date.now().toString().slice(-6);
  const names = { a: `E2E Aktívny A ${stamp}`, b: `E2E Aktívny B ${stamp}`, c: `E2E Aktívny C ${stamp}` };
  const admin = hasEnv ? createClient(env.url!, env.serviceRole!, AUTH) : null;
  let clientRowId: string | null = null;
  let original: { active_plan_id: string | null; active_day_id: string | null } | null = null;

  test.afterAll(async () => {
    if (!admin) return;
    await admin.from("workout_plans").delete().in("name", Object.values(names));
    if (clientRowId && original) await admin.from("clients").update(original).eq("id", clientRowId);
  });

  test("klient prepne v Tréningu aj na Dnes, tréner v detaile klienta, nový plán aktívny neprebije", async ({
    page,
    baseURL,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Zápis do DB len raz (desktop).");
    test.setTimeout(150_000);
    const trainer = await apiSignIn(env.trainerEmail!);
    const client = await apiSignIn(env.clientEmail!);
    const { data: row } = await client.api.from("clients").select("id").eq("user_id", client.userId).limit(1).single();
    clientRowId = row!.id;
    const { data: before } = await admin!.from("clients").select("active_plan_id, active_day_id").eq("id", clientRowId).single();
    original = before!;

    // bez migrácie 0056 (RPC trénera) nemá zmysel pokračovať
    const probe = await trainer.api.rpc("set_client_active_plan", { p_client_id: clientRowId, p_plan_id: clientRowId });
    test.skip(/Could not find the function|does not exist/i.test(probe.error?.message ?? ""), "Migrácia 0056 nie je spustená.");

    const makePlan = async (name: string, dayName: string) => {
      const { data: plan } = await trainer.api
        .from("workout_plans")
        .insert({ client_id: clientRowId, trainer_id: trainer.userId, name, published: false })
        .select("id")
        .single();
      await trainer.api.from("workout_days").insert({
        plan_id: plan!.id,
        day_number: 1,
        name: dayName,
        exercises: [{ entry_id: crypto.randomUUID(), exercise_id: null, exercise_name: "E2E Drep", sets: 3, reps: "8" }],
      });
      await trainer.api.from("workout_plans").update({ published: true }).eq("id", plan!.id);
      return plan!.id as string;
    };
    const activeId = async () =>
      (await admin!.from("clients").select("active_plan_id").eq("id", clientRowId!).single()).data!.active_plan_id;

    const planA = await makePlan(names.a, "E2E Deň A");
    const planB = await makePlan(names.b, "E2E Deň B");
    // ak klient aktívny plán mal, nové plány ho neprebijú
    if (original.active_plan_id) expect(await activeId()).toBe(original.active_plan_id);

    // ---------- klient: Tréning → Nastaviť ako aktívny ----------
    await loginV6(page, env.clientEmail!);
    await page.goto("/portal/trening");
    await page.locator(`#plan-${planA}`).getByRole("button", { name: "Nastaviť ako aktívny" }).click();
    await expect(page.getByText(`Na karte Dnes je teraz „${names.a}“.`)).toBeVisible({ timeout: 15_000 });
    expect(await activeId()).toBe(planA);
    await page.goto("/portal");
    await expect(page.getByTestId("hero-plan")).toHaveText(names.a);
    await expect(page.getByRole("heading", { name: "E2E Deň A" })).toBeVisible();

    // ---------- klient: Dnes → Zmeniť ----------
    await page.getByRole("button", { name: "Zmeniť plán", exact: true }).click();
    const sheet = page.getByRole("dialog", { name: "Aktívny tréningový plán" });
    await sheet.getByRole("button", { name: new RegExp(names.b) }).click();
    await expect(sheet).toHaveCount(0, { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "E2E Deň B" })).toBeVisible();
    expect(await activeId()).toBe(planB);

    // ---------- tréner: detail klienta → Nastaviť ako aktívny ----------
    await page.context().clearCookies();
    await page.context().addCookies([{ name: "fitpilot_tour_seen", value: "1", url: baseURL! }]);
    await loginV6(page, env.trainerEmail!);
    await page.goto(`/dashboard/klienti/${clientRowId}`);
    await page.getByRole("button", { name: `Nastaviť „${names.a}“ ako aktívny plán klienta` }).click();
    await expect(page.getByRole("button", { name: `Nastaviť „${names.b}“ ako aktívny plán klienta` })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("button", { name: `Nastaviť „${names.a}“ ako aktívny plán klienta` })).toHaveCount(0);
    expect(await activeId()).toBe(planA);

    // ---------- nový zverejnený plán aktívny neprebije ----------
    await makePlan(names.c, "E2E Deň C");
    expect(await activeId()).toBe(planA);
    await page.reload();
    await expect(page.getByRole("button", { name: `Nastaviť „${names.c}“ ako aktívny plán klienta` })).toBeVisible();
  });
});
