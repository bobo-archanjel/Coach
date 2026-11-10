import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * Úpravy prihlásenia/registrácie (feature/login-adjustment), reálna DB:
 *  - registrácia už použitého e-mailu → jasná hláška „Tento e-mail sa už používa“
 *    (Supabase s potvrdzovaním e-mailu chybu nevráti — appka predtým tvrdila „skontroluj e-mail“),
 *  - klient bez trénera so systémovou správou (GDPR) nevidí vo zvončeku
 *    „neprečítané správy od trénera“ ani bodku pri Chate (chat bez trénera nemá).
 * Dočasný klient vznikne cez service role a po teste sa zmaže.
 */
try {
  process.loadEnvFile(".env.local");
} catch {
  /* bez .env.local sa testy preskočia */
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
const existingEmail = process.env.E2E_CLIENT_EMAIL;
const AUTH = { auth: { persistSession: false, autoRefreshToken: false } };

test("registrácia už použitého e-mailu ukáže, že e-mail sa používa", async ({ page }, info) => {
  test.skip(!existingEmail, "Chýba E2E_CLIENT_EMAIL (existujúci QA účet).");
  test.skip(info.project.name !== "desktop", "Volanie registrácie len raz (desktop).");
  await page.goto("/prihlasenie#register");
  await page.locator("#reg-name").fill("Test Duplicita");
  await page.locator("#reg-email").fill(existingEmail!);
  await page.locator("#reg-password").fill("Duplicita#2026!Test");
  await page.locator('input[name="terms"]').check();
  await page.getByRole("button", { name: /Vytvoriť účet/ }).click();
  await expect(page.locator("form").getByRole("alert")).toContainText("Tento e-mail sa už používa", { timeout: 20_000 });
  await expect(page.getByText(/Skontroluj si e-mail/)).toHaveCount(0);
});

test("klient bez trénera: systémová správa nie je „od trénera“ vo zvončeku ani bodka pri Chate", async ({ page }, info) => {
  test.skip(!url || !serviceRole, "Chýba Supabase service role.");
  test.skip(info.project.name !== "desktop", "Zápis do DB len raz (desktop).");
  test.setTimeout(120_000);
  const admin = createClient(url!, serviceRole!, AUTH);
  const email = `e2e-bez-trenera-${Date.now()}@fitpilot-testaccount.com`;
  const password = "E2eBez#2026!Trenera";
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: "Bez Trénera", role: "client" },
  });
  if (error || !data.user) throw new Error(`Dočasný klient sa nevytvoril: ${error?.message}`);
  const uid = data.user.id;
  try {
    const { data: client } = await admin.from("clients").select("id").eq("user_id", uid).single();
    await admin.from("messages").insert({ client_id: client!.id, sender: "system", body: "E2E systémová správa" });

    await page.goto("/prihlasenie");
    await page.locator("#login-email").fill(email);
    await page.locator("#login-password").fill(password);
    await page.getByRole("button", { name: "Prihlásiť sa" }).click();
    await page.waitForURL(/\/portal$/, { timeout: 30_000 });

    const bell = page.getByRole("button", { name: /^Upozornenia/ });
    await expect(bell).toHaveAccessibleName("Upozornenia");
    await bell.click();
    const panel = page.getByRole("region", { name: "Upozornenia" });
    await expect(panel).toContainText(/Nič nové/);
    await expect(panel).not.toContainText(/od trénera/);
    await expect(page.getByText("(nová správa)")).toHaveCount(0);
  } finally {
    const { data: client } = await admin.from("clients").select("id").eq("user_id", uid).maybeSingle();
    if (client) {
      await admin.from("messages").delete().eq("client_id", client.id);
      await admin.from("clients").delete().eq("id", client.id);
    }
    await admin.auth.admin.deleteUser(uid);
  }
});
