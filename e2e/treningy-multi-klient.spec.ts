import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { defaultFocusForSex } from "../lib/ai/planClientContext";

/**
 * Tréningy → výber viacerých klientov (nový dizajn v6): Nový plán (jeden koncept, ostatní
 * ako „Pošle sa aj:“, 0052) a AI generátor (plán pre každého zvlášť, priebeh, zlyhanie
 * jedného nezastaví ostatných, súhrn, „Skúsiť znova“). Výber jedného klienta ako doteraz.
 *
 * Proti reálnej Supabase DB s QA trénerom a klientom + dvaja dočasní klienti (zmaže ich
 * service role, tréner klienta zmazať nemôže). AI sa nevolá — DEV hlavička
 * `x-e2e-ai-fixture` (app/dashboard/treningy/actions.ts) vráti deterministický návrh,
 * zvyšok toku (údaje klienta, zameranie, uloženie konceptu) beží naostro.
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
  serviceRole: process.env.SUPABASE_SERVICE_ROLE_KEY,
  trainerEmail: process.env.E2E_TRAINER_EMAIL,
  trainerPassword: process.env.E2E_TRAINER_PASSWORD,
  clientEmail: process.env.E2E_CLIENT_EMAIL,
  clientPassword: process.env.E2E_CLIENT_PASSWORD,
};
const hasEnv = Object.values(env).every(Boolean);
const AUTH = { auth: { persistSession: false, autoRefreshToken: false } };

async function apiSignIn(email: string, password: string): Promise<{ api: SupabaseClient; userId: string }> {
  const api = createClient(env.url!, env.anon!, AUTH);
  const { data, error } = await api.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw new Error(`Prihlásenie ${email} zlyhalo: ${error?.message}`);
  return { api, userId: data.user.id };
}

async function loginTrainerV6(page: Page, context: BrowserContext, baseURL: string) {
  await context.addCookies([{ name: "fp-dash-skin", value: "v6", url: baseURL }]);
  await page.goto("/prihlasenie");
  await page.locator("#login-email").fill(env.trainerEmail!);
  await page.locator("#login-password").fill(env.trainerPassword!);
  await page.getByRole("button", { name: "Prihlásiť sa" }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
}

test.describe("Tréningy: výber viacerých klientov (reálna DB, dizajn v6)", () => {
  test.skip(!hasEnv, "Chýbajú E2E_* údaje QA účtov alebo Supabase env (aj service role).");

  let trainer: { api: SupabaseClient; userId: string };
  let qaClient: { id: string; full_name: string; sex: "muz" | "zena" | null };
  const temp: { id: string; name: string }[] = [];
  let planName = "";

  test.beforeAll(async () => {
    const stamp = `${test.info().project.name} ${Date.now().toString().slice(-6)}`;
    planName = `E2E Multi plán ${stamp}`;
    trainer = await apiSignIn(env.trainerEmail!, env.trainerPassword!);
    const client = await apiSignIn(env.clientEmail!, env.clientPassword!);
    const { data: row } = await client.api
      .from("clients")
      .select("id, full_name, trainer_id")
      .eq("user_id", client.userId)
      .order("created_at")
      .limit(1)
      .single();
    expect(row?.trainer_id, "QA klient musí byť spárovaný s QA trénerom").toBe(trainer.userId);
    const { data: profile } = await trainer.api.from("nutrition_profiles").select("sex").eq("client_id", row!.id).maybeSingle();
    qaClient = { id: row!.id, full_name: row!.full_name, sex: (profile?.sex as "muz" | "zena" | undefined) ?? null };

    for (const name of [`E2E Múlti Ádam ${stamp}`, `E2E Multi Bea ${stamp}`]) {
      const { data, error } = await trainer.api.from("clients").insert({ trainer_id: trainer.userId, full_name: name }).select("id").single();
      expect(error).toBeNull();
      temp.push({ id: data!.id, name });
    }
  });

  test.afterAll(async () => {
    if (!trainer) return;
    await trainer.api.from("workout_plans").delete().eq("trainer_id", trainer.userId).like("name", `${planName}%`);
    if (qaClient) {
      await trainer.api.from("workout_plans").delete().eq("client_id", qaClient.id).like("name", "E2E AI · %");
    }
    if (temp.length > 0) {
      // plány a príjemcov dočasných klientov zmaže cascade
      const admin = createClient(env.url!, env.serviceRole!, AUTH);
      await admin.from("clients").delete().in("id", temp.map((t) => t.id));
    }
  });

  test("výber klientov: hľadanie bez diakritiky, Vybrať všetkých, čipy s odobratím", async ({ page, context, baseURL }) => {
    test.setTimeout(90_000);
    await loginTrainerV6(page, context, baseURL!);
    await page.goto("/dashboard/treningy");
    const form = page.getByRole("form", { name: "Nový plán" });

    await form.getByRole("button", { name: "Vyber klientov" }).click();
    const options = form.getByRole("group", { name: "Klienti" }).getByRole("checkbox");
    const total = await options.count();
    expect(total).toBeGreaterThanOrEqual(3);

    // hľadanie bez diakritiky a veľkých písmen
    await form.getByLabel("Hľadať klienta").fill("multi adam");
    await expect(options).toHaveCount(1);
    await options.first().click();
    await expect(options.first()).toHaveAttribute("aria-checked", "true");
    await expect(form.getByRole("button", { name: `Odobrať klienta ${temp[0].name}` })).toBeVisible();

    // Vybrať všetkých → všetci ako čipy, popis tlačidla s počtom
    await form.getByLabel("Hľadať klienta").fill("");
    await form.getByRole("button", { name: "Vybrať všetkých" }).click();
    await expect(form.getByRole("button", { name: /^Odobrať klienta / })).toHaveCount(total);
    await expect(form.getByRole("button", { name: `Vytvoriť plán pre ${total} klientov` })).toBeVisible();

    // odobratie čipu
    await form.getByRole("button", { name: `Odobrať klienta ${temp[1].name}` }).click();
    await expect(form.getByRole("button", { name: /^Odobrať klienta / })).toHaveCount(total - 1);
    await form.getByRole("button", { name: "Hotovo" }).click();
    await expect(form.getByRole("group", { name: "Klienti" })).toBeHidden();

    // mobil: nič nepreteká do strany
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("Nový plán: viacerí klienti → jeden koncept s príjemcami, jeden klient ako doteraz", async ({ page, context, baseURL }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Zápis do DB len raz (desktop).");
    test.setTimeout(120_000);
    await loginTrainerV6(page, context, baseURL!);
    await page.goto("/dashboard/treningy");
    let form = page.getByRole("form", { name: "Nový plán" });

    // bez klienta sa neodošle
    await form.getByPlaceholder(/Názov plánu/).fill(planName);
    await form.getByRole("button", { name: "Vytvoriť plán" }).click();
    await expect(form.getByText("Vyber aspoň jedného klienta.")).toBeVisible();

    await form.getByRole("button", { name: "Vyber klientov" }).click();
    const group = form.getByRole("group", { name: "Klienti" });
    await group.getByRole("checkbox", { name: qaClient.full_name }).click();
    await group.getByRole("checkbox", { name: temp[0].name }).click();
    await expect(form.getByText("Vyber aspoň jedného klienta.")).toBeHidden();
    await form.getByRole("button", { name: "Vytvoriť plán pre 2 klientov" }).click();

    await page.waitForURL(/\/dashboard\/treningy\/[0-9a-f-]{36}$/, { timeout: 30_000 });
    const planId = page.url().split("/").pop()!;
    await expect(page.getByText("Pošle sa aj:")).toBeVisible();
    await expect(page.getByRole("button", { name: "Poslať 2 klientom" })).toBeVisible();
    const { data: plan } = await trainer.api.from("workout_plans").select("client_id, name, published").eq("id", planId).single();
    expect(plan).toMatchObject({ name: planName, published: false });
    const { data: recipients } = await trainer.api.from("plan_recipients").select("client_id").eq("workout_plan_id", planId);
    const mainIsQa = plan!.client_id === qaClient.id;
    // hlavný klient je prvý vybraný v poradí zoznamu, druhý je príjemca
    expect([plan!.client_id, ...(recipients ?? []).map((r) => r.client_id)].sort()).toEqual([qaClient.id, temp[0].id].sort());
    await expect(page.getByText(mainIsQa ? temp[0].name : qaClient.full_name, { exact: true })).toBeVisible();

    // jeden klient → koncept bez ďalších príjemcov, ako doteraz
    await page.goto("/dashboard/treningy");
    form = page.getByRole("form", { name: "Nový plán" });
    await form.getByRole("button", { name: "Vyber klientov" }).click();
    await form.getByRole("group", { name: "Klienti" }).getByRole("checkbox", { name: temp[1].name }).click();
    await form.getByPlaceholder(/Názov plánu/).fill(`${planName} solo`);
    await form.getByRole("button", { name: "Vytvoriť plán", exact: true }).click();
    await page.waitForURL(/\/dashboard\/treningy\/[0-9a-f-]{36}$/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: `${planName} solo` })).toBeVisible();
    await expect(page.getByText("Pošle sa aj:")).toBeHidden();
  });

  test("AI generátor: plán pre každého klienta zvlášť, priebeh, zlyhanie jedného, súhrn, Skúsiť znova", async ({
    page,
    context,
    baseURL,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Zápis do DB len raz (desktop).");
    test.setTimeout(150_000);
    await loginTrainerV6(page, context, baseURL!);
    await context.setExtraHTTPHeaders({ "x-e2e-ai-fixture": `fail:${temp[1].id}` });
    // spomalí volania akcií, nech je priebeh „Generujem x/3…“ vidieť
    await page.route("**/dashboard/treningy", async (route) => {
      if (route.request().method() === "POST") await new Promise((r) => setTimeout(r, 700));
      await route.continue();
    });
    await page.goto("/dashboard/treningy");
    const form = page.getByRole("form", { name: "AI generátor plánu" });

    await form.getByRole("button", { name: "Vyber klientov" }).click();
    const group = form.getByRole("group", { name: "Klienti" });
    for (const name of [qaClient.full_name, temp[0].name, temp[1].name]) {
      await group.getByRole("checkbox", { name }).click();
    }
    await form.getByRole("button", { name: "Hotovo" }).click();
    // viacerí klienti → zameranie „podľa pohlavia klienta“ (každému zvlášť)
    await expect(form.getByLabel("Zameranie")).toHaveValue("auto");
    await form.locator('select[name="goal"]').selectOption("sila");
    await form.locator('select[name="experience"]').selectOption("zaciatocnik");
    await form.locator('select[name="equipment"]').selectOption("plna_posilnovna");
    await form.getByLabel("Počet tréningových dní v týždni").fill("3");
    await form.getByRole("button", { name: "Navrhnúť plány pre 3 klientov" }).click();

    await expect(form.getByRole("button", { name: /^Generujem \d\/3…$/ })).toBeVisible();
    await expect(form.getByRole("progressbar", { name: "Priebeh generovania" })).toBeVisible();
    await expect(form.getByText("Hotovo: 2 z 3 plánov vygenerovaných · 1 zlyhal.")).toBeVisible({ timeout: 60_000 });
    const items = form.getByRole("listitem");
    await expect(items).toHaveCount(3);
    await expect(items.filter({ hasText: temp[1].name })).toContainText("Simulované zlyhanie AI (e2e).");
    await expect(items.filter({ hasText: qaClient.full_name }).getByRole("link", { name: "Otvoriť koncept →" })).toBeVisible();

    // znova len neúspešný — úspešné ostanú v súhrne
    await context.setExtraHTTPHeaders({ "x-e2e-ai-fixture": "ok" });
    await form.getByRole("button", { name: "Skúsiť znova (1)" }).click();
    await expect(form.getByText("Hotovo: 3 z 3 plánov vygenerovaných.")).toBeVisible({ timeout: 60_000 });
    await expect(form.getByRole("link", { name: "Otvoriť koncept →" })).toHaveCount(3);

    // každý klient má vlastný koncept so zameraním podľa svojich údajov
    const { data: plans } = await trainer.api
      .from("workout_plans")
      .select("client_id, name, published, workout_days(exercises)")
      .in("client_id", [qaClient.id, temp[0].id, temp[1].id])
      .like("name", "E2E AI · %");
    expect(plans).toHaveLength(3);
    const byClient = new Map((plans ?? []).map((p) => [p.client_id, p]));
    expect(byClient.get(qaClient.id)?.name).toBe(`E2E AI · ${defaultFocusForSex(qaClient.sex)}`);
    expect(byClient.get(temp[0].id)?.name).toBe("E2E AI · vyvazene");
    for (const p of plans ?? []) {
      expect(p.published).toBe(false);
      const days = p.workout_days as unknown as { exercises: unknown[] }[];
      expect(days).toHaveLength(1);
      expect(days[0].exercises.length).toBeGreaterThan(0);
    }
  });

  test("AI generátor: jeden klient ako doteraz → rovno koncept v builderi", async ({ page, context, baseURL }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Zápis do DB len raz (desktop).");
    test.setTimeout(90_000);
    await loginTrainerV6(page, context, baseURL!);
    await context.setExtraHTTPHeaders({ "x-e2e-ai-fixture": "ok" });
    await page.goto("/dashboard/treningy");
    const form = page.getByRole("form", { name: "AI generátor plánu" });
    await form.getByRole("button", { name: "Vyber klientov" }).click();
    await form.getByRole("group", { name: "Klienti" }).getByRole("checkbox", { name: temp[0].name }).click();
    await form.getByRole("button", { name: "Hotovo" }).click();
    // jeden klient bez pohlavia → vyvážené, voľba „podľa pohlavia klienta“ sa neponúka
    await expect(form.getByLabel("Zameranie")).toHaveValue("vyvazene");
    await expect(form.locator('option[value="auto"]')).toHaveCount(0);
    await form.locator('select[name="goal"]').selectOption("kondicia");
    await form.locator('select[name="experience"]').selectOption("pokrocily");
    await form.locator('select[name="equipment"]').selectOption("len_telo");
    await form.getByLabel("Počet tréningových dní v týždni").fill("2");
    await form.getByRole("button", { name: "Navrhnúť plán s AI" }).click();
    await page.waitForURL(/\/dashboard\/treningy\/[0-9a-f-]{36}$/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "E2E AI · vyvazene" })).toBeVisible();
  });
});
