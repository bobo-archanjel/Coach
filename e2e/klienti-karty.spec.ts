import { test, expect } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { sessionLogin, userIdByEmail } from "./helpers/sessionLogin";

/**
 * Klienti u trénera — karty (feature/klienti-karty): avatar s iniciálami, stav, počty
 * tréningových plánov a jedálničkov, posledný tréning, postup aktívneho plánu, „Klient od“,
 * filtre stavov. DEV náhľad (?preview=deletion) + reálna DB (QA tréner a klient).
 */
const card = (page: import("@playwright/test").Page, name: string) =>
  page.locator('[data-tour="clients-card"]').filter({ hasText: name });

test.describe("klienti — karty (náhľad)", () => {
  test.skip(process.env.NODE_ENV === "production", "DEV náhľady len v next dev");

  test("karta: iniciály, stav, štatistiky, postup plánu a „Klient od“", async ({ page }) => {
    await page.goto("/dashboard?preview=deletion");
    const adam = card(page, "Aktívny Adam");
    await expect(adam).toContainText("AA");
    await expect(adam).toContainText("aktívny");
    await expect(adam).toContainText(/tréningové plány\s*3/);
    await expect(adam).toContainText(/jedálničky\s*2/);
    await expect(adam).toContainText("včera");
    await expect(adam.getByRole("progressbar", { name: "Postup plánu Silový 3× týždenne" })).toHaveAttribute("aria-valuenow", "5");
    await expect(adam).toContainText("5 / 8 tréningov");
    await expect(adam).toContainText("Klient od 1. 6. 2026");

    await expect(card(page, "Meškajúca Mária")).toContainText("9 dní bez tréningu");
    const nina = card(page, "Nová Nina");
    await expect(nina).toContainText("bez plánu");
    await expect(nina).toContainText("zatiaľ nie");
    await expect(nina).toContainText("Zatiaľ bez tréningového plánu");
    await expect(nina).toContainText("nový");
    await expect(card(page, "Hotový Hugo")).toContainText("Hotovo — čas na nový plán");
    // ukončený / na zmazanie: bez postupu plánu
    await expect(card(page, "Odídený Ivan").getByTestId("client-plan-progress")).toHaveCount(0);
    await expect(card(page, "Zmazaná Zuzana")).toContainText(/Zmaže sa/);
  });

  test("filtre stavov s počtami", async ({ page }) => {
    await page.goto("/dashboard?preview=deletion");
    const filters = page.getByRole("radiogroup", { name: "Filtrovať klientov podľa stavu" });
    await expect(filters.getByRole("radio", { name: /Všetci/ })).toHaveAttribute("aria-checked", "true");
    await expect(page.locator('[data-tour="clients-card"]')).toHaveCount(6);

    await filters.getByRole("radio", { name: /Bez tréningu/ }).click();
    await expect(page.locator('[data-tour="clients-card"]')).toHaveCount(1);
    await expect(card(page, "Meškajúca Mária")).toBeVisible();

    await filters.getByRole("radio", { name: /Ukončení/ }).click();
    await expect(page.locator('[data-tour="clients-card"]')).toHaveCount(2);
    await filters.getByRole("radio", { name: /Aktívni/ }).click();
    await expect(page.locator('[data-tour="clients-card"]')).toHaveCount(2);
    await filters.getByRole("radio", { name: /Všetci/ }).click();
    await expect(page.locator('[data-tour="clients-card"]')).toHaveCount(6);
  });
});

try {
  process.loadEnvFile(".env.local");
} catch {
  /* bez .env.local sa reálna časť preskočí */
}
const env = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  serviceRole: process.env.SUPABASE_SERVICE_ROLE_KEY,
  trainerEmail: process.env.E2E_TRAINER_EMAIL,
  clientEmail: process.env.E2E_CLIENT_EMAIL,
};
const hasEnv = Object.values(env).every(Boolean);

test.describe("klienti — karty (reálna DB)", () => {
  test.skip(!hasEnv, "Chýbajú E2E_* údaje alebo Supabase env (aj service role).");

  test("počty plánov a jedálničkov sedia s DB, kópia úprav sa nerátá", async ({ page, baseURL }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "zápis do DB len raz (desktop)");
    test.setTimeout(90_000);
    const admin: SupabaseClient = createClient(env.url!, env.serviceRole!, { auth: { persistSession: false } });
    const trainerId = await userIdByEmail(env.trainerEmail!);
    const clientUserId = await userIdByEmail(env.clientEmail!);
    const { data: client } = await admin.from("clients").select("id, full_name").eq("user_id", clientUserId).eq("trainer_id", trainerId).limit(1).single();
    test.skip(!client, "QA klient nie je klientom QA trénera.");

    // skrytá kópia úprav (0071) k jednému plánu — nesmie sa rátať
    const { data: live } = await admin
      .from("workout_plans")
      .insert({ client_id: client!.id, trainer_id: trainerId, name: `E2E Karty ${Date.now()}`, published: false })
      .select("id")
      .single();
    await admin.from("workout_plans").insert({ client_id: client!.id, trainer_id: trainerId, name: "E2E Karty kópia", published: false, edit_of: live!.id });
    try {
      const [{ count: plans }, { count: meals }] = await Promise.all([
        admin.from("workout_plans").select("id", { count: "exact", head: true }).eq("client_id", client!.id).is("edit_of", null),
        admin.from("meal_plans").select("id", { count: "exact", head: true }).eq("client_id", client!.id),
      ]);

      await sessionLogin(page, env.trainerEmail!, baseURL!);
      await page.goto("/dashboard");
      const qa = card(page, client!.full_name as string);
      await expect(qa).toBeVisible({ timeout: 20_000 });
      const stats = qa.locator("dl dd");
      await expect(stats.nth(0)).toHaveText(String(plans));
      await expect(stats.nth(1)).toHaveText(String(meals));
    } finally {
      await admin.from("workout_plans").delete().eq("id", live!.id); // kópia ide kaskádou
    }
  });
});
