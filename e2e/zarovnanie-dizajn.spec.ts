import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * feature/aligmant-design:
 *  - odznak neprečítaných správ v zozname klientov vedie rovno do chatu s klientom,
 *  - jedálniček: dráha dní ako pri tréningu, „+ deň“ aj „Premenovať“ v okne,
 *  - tréning: „Premenovať“ deň v okne,
 *  - zoznamy Tréningy / Jedálničky: štítky vpravo zarovnané pod sebou (Hotovo · Koncept/Aktívny · dni),
 *  - Strava u klienta: „Stiahnuť PDF“ pod jedálničkom,
 *  - detail klienta: záložka „Makro cieľ“ (overuje e2e/jedalnicky.spec.ts).
 * Dočasná správa a jedálničky QA trénera sa na konci zmažú (service role).
 *   E2E_TRAINER_EMAIL, E2E_TRAINER_PASSWORD, E2E_CLIENT_EMAIL, E2E_CLIENT_PASSWORD
 */

try {
  process.loadEnvFile(".env.local");
} catch {
  /* bez .env.local sa DB testy preskočia */
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

async function login(page: Page, email: string, password: string, to: RegExp) {
  await page.goto("/prihlasenie");
  await page.locator("#login-email").fill(email);
  await page.locator("#login-password").fill(password);
  await page.getByRole("button", { name: "Prihlásiť sa" }).click();
  await page.waitForURL(to, { timeout: 30_000 });
}

const meal = (grams: number) => ({
  entry_id: crypto.randomUUID(),
  food_id: crypto.randomUUID(),
  food_name: "E2E potravina",
  meal_slot: "obed",
  grams,
  kcal_100g: 150,
  protein_100g: 10,
  carbs_100g: 10,
  fat_100g: 5,
});

/** Pravé okraje posledného štítku pred počtom dní v riadkoch zoznamu (len riadky so štítkom). */
async function chipRightEdges(page: Page, rowName: RegExp): Promise<number[]> {
  const rows = page.getByRole("link", { name: rowName });
  return rows.evaluateAll((els) =>
    els
      .map((el) => {
        const meta = el.querySelector("[class*=planListMeta]");
        const since = meta?.querySelector("[class*=clientSince]");
        const chip = since?.previousElementSibling;
        return chip ? Math.round(chip.getBoundingClientRect().right) : null;
      })
      .filter((x): x is number => x !== null),
  );
}

test.describe("tréning: „Premenovať“ deň v okne (?preview=builder)", () => {
  test("okno s pôvodným názvom, Esc zavrie, akcie dňa ostávajú", async ({ page }) => {
    await page.goto("/dashboard/treningy/x?preview=builder");
    await page.getByRole("button", { name: "Premenovať", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Premenovať deň" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("Názov dňa")).toHaveValue("Deň 1 — Tlak (hrudník, ramená, triceps)");
    await expect(dialog.getByLabel("Názov dňa")).toBeFocused();
    // prázdny názov → chyba v okne, okno ostáva
    await dialog.getByLabel("Názov dňa").fill("");
    await dialog.getByRole("button", { name: "Hotovo", exact: true }).click();
    await expect(dialog.getByRole("alert")).toContainText("Zadaj názov dňa");
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Duplikovať", exact: true })).toBeVisible();
  });
});

test.describe("reálna DB (QA tréner a klient)", () => {
  test.skip(!hasEnv, "chýbajú E2E_* / Supabase env premenné");
  test.describe.configure({ mode: "serial" });

  let trainer: { api: SupabaseClient; userId: string };
  let admin: SupabaseClient;
  let qaClientId = "";
  const planIds: string[] = [];
  const messageIds: string[] = [];
  const stamp = Date.now().toString().slice(-6);

  test.beforeAll(async () => {
    admin = createClient(env.url!, env.serviceRole!, AUTH);
    trainer = await apiSignIn(env.trainerEmail!, env.trainerPassword!);
    const client = await apiSignIn(env.clientEmail!, env.clientPassword!);
    const { data: row } = await client.api.from("clients").select("id").eq("user_id", client.userId).limit(1).single();
    qaClientId = row!.id;
  });

  test.afterAll(async () => {
    if (planIds.length) await admin.from("meal_plans").delete().in("id", planIds);
    if (messageIds.length) await admin.from("messages").delete().in("id", messageIds);
  });

  test("odznak neprečítaných správ v zozname klientov otvorí chat s klientom", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "zápis do DB len raz (desktop)");
    const { data: msg, error } = await admin
      .from("messages")
      .insert({ client_id: qaClientId, sender: "client", body: `E2E odznak ${stamp}` })
      .select("id")
      .single();
    expect(error).toBeNull();
    messageIds.push(msg!.id);

    await login(page, env.trainerEmail!, env.trainerPassword!, /\/dashboard/);
    await page.goto("/dashboard");
    const pill = page.locator(`a[href="/dashboard/spravy?client=${qaClientId}"]`);
    await expect(pill).toBeVisible();
    await expect(pill).toHaveText(/správ/);
    // karta ostáva klikateľná na detail (meno klienta), odznak má vlastný cieľ
    await expect(page.getByRole("link", { name: "QA Klient Agent" })).toHaveAttribute("href", `/dashboard/klienti/${qaClientId}`);
    await pill.click();
    await page.waitForURL((url) => url.pathname === "/dashboard/spravy" && url.searchParams.get("client") === qaClientId);
    // správa je v otvorenom vlákne (aj v náhľade zoznamu vlákien — preto posledný výskyt)
    await expect(page.getByText(`E2E odznak ${stamp}`).last()).toBeVisible();
  });

  test("jedálniček: dráha dní, „+ deň“ a „Premenovať“ v okne", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "zápis do DB len raz (desktop)");
    const { data: plan, error } = await trainer.api
      .from("meal_plans")
      .insert({ client_id: qaClientId, trainer_id: trainer.userId, name: `E2E Dráha ${stamp}`, published: false })
      .select("id")
      .single();
    expect(error).toBeNull();
    planIds.push(plan!.id);
    await trainer.api.from("meal_days").insert({ plan_id: plan!.id, day_number: 1, name: "Pondelok", meals: [meal(100), meal(80)] });

    await login(page, env.trainerEmail!, env.trainerPassword!, /\/dashboard/);
    await page.goto(`/dashboard/jedalnicky/jedalnicek/${plan!.id}`);
    const track = page.getByRole("group", { name: "Dni jedálnička" });
    await expect(track.getByRole("button", { name: "Pondelok", exact: true })).toHaveAttribute("aria-current", "true");
    await expect(track.getByRole("button", { name: "Pondelok", exact: true })).toContainText("2"); // počet potravín

    // + deň → okno → nový deň vybraný
    await track.getByRole("button", { name: "+ deň" }).click();
    const add = page.getByRole("dialog", { name: "Nový deň" });
    await add.getByLabel("Názov dňa").fill("Utorok");
    await add.getByRole("button", { name: "Pridať", exact: true }).click();
    await expect(add).toHaveCount(0);
    await expect(track.getByRole("button", { name: "Utorok", exact: true })).toHaveAttribute("aria-current", "true");

    // Premenovať → okno s pôvodným názvom
    await page.getByRole("button", { name: "Premenovať", exact: true }).click();
    const rename = page.getByRole("dialog", { name: "Premenovať deň" });
    await expect(rename.getByLabel("Názov dňa")).toHaveValue("Utorok");
    await rename.getByLabel("Názov dňa").fill("Streda");
    await rename.getByRole("button", { name: "Hotovo", exact: true }).click();
    await expect(rename).toHaveCount(0);
    await expect(track.getByRole("button", { name: "Streda", exact: true })).toHaveAttribute("aria-current", "true");
    await expect(page.getByRole("button", { name: "Zmazať deň", exact: true })).toBeVisible();
  });

  test("zoznamy Tréningy a Jedálničky: štítky vpravo v jednej línii", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "zarovnanie stĺpca len na počítači");
    // dva jedálničky s rôznym počtom dní: zverejnený (aktívny) a koncept
    for (const p of [
      { name: `E2E Zoznam aktívny ${stamp}`, published: true, days: 12 },
      { name: `E2E Zoznam koncept ${stamp}`, published: false, days: 3 },
    ]) {
      const { data } = await trainer.api
        .from("meal_plans")
        .insert({ client_id: qaClientId, trainer_id: trainer.userId, name: p.name, published: p.published })
        .select("id")
        .single();
      planIds.push(data!.id);
      await trainer.api
        .from("meal_days")
        .insert(Array.from({ length: p.days }, (_, i) => ({ plan_id: data!.id, day_number: i + 1, name: `Deň ${i + 1}`, meals: [] })));
    }

    await login(page, env.trainerEmail!, env.trainerPassword!, /\/dashboard/);
    await page.goto("/dashboard/jedalnicky");
    const rows = page.getByRole("link", { name: new RegExp(`E2E Zoznam .* ${stamp}`) });
    await expect(rows).toHaveCount(2);
    // štítok už nie je v stĺpci názvu
    await expect(rows.filter({ hasText: "koncept" }).locator("[class*=clientName]")).not.toContainText("Koncept");
    await expect(rows.filter({ hasText: "koncept" })).toContainText("Koncept");
    const mealEdges = await chipRightEdges(page, new RegExp(`E2E Zoznam .* ${stamp}`));
    expect(mealEdges.length).toBeGreaterThanOrEqual(1);
    expect(new Set(mealEdges).size, `pravé okraje: ${mealEdges.join(", ")}`).toBe(1);

    await page.goto("/dashboard/treningy");
    const planEdges = await chipRightEdges(page, /.+/);
    expect(planEdges.length).toBeGreaterThanOrEqual(2);
    expect(new Set(planEdges).size, `pravé okraje: ${planEdges.join(", ")}`).toBe(1);
    await expect(page.locator("[class*=planListMeta]").getByText("Aktívny", { exact: true }).first()).toBeVisible();
  });

  test("Strava u klienta: „Stiahnuť PDF“ pod jedálničkom", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "zápis do DB len raz (desktop)");
    const { data: plan } = await trainer.api
      .from("meal_plans")
      .insert({ client_id: qaClientId, trainer_id: trainer.userId, name: `E2E Strava ${stamp}`, published: true })
      .select("id")
      .single();
    planIds.push(plan!.id);
    await trainer.api.from("meal_days").insert([
      { plan_id: plan!.id, day_number: 1, name: "Pondelok", meals: [meal(100)] },
      { plan_id: plan!.id, day_number: 2, name: "Utorok", meals: [meal(120)] },
    ]);

    await login(page, env.clientEmail!, env.clientPassword!, /\/portal/);
    await page.goto("/portal/strava");
    await expect(page.getByRole("heading", { name: `E2E Strava ${stamp}` })).toBeVisible();
    const pdf = page.getByRole("link", { name: "Stiahnuť PDF" });
    await expect(pdf).toHaveAttribute("href", `/api/export/meal-plan/${plan!.id}/pdf`);
    const pdfBox = await pdf.boundingBox();
    const lastDay = await page.getByText("Utorok", { exact: true }).boundingBox();
    expect(pdfBox!.y).toBeGreaterThan(lastDay!.y);
  });
});
