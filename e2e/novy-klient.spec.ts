import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * Úplne nový klient bez plánu (reálna DB): karta Dnes ukáže prázdnu kartu plánu
 * s „Vytvoriť plán“, pod ňou Môj prehľad, týždeň aj meranie — nie len oznam.
 * Dočasný účet vytvorí service role a po teste ho zmaže.
 */
try {
  process.loadEnvFile(".env.local");
} catch {
  /* bez .env.local sa test preskočí */
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

test("nový klient bez plánu — Dnes s prázdnym plánom, prehľadom a týždňom", async ({ page }, info) => {
  test.skip(!url || !serviceRole, "Chýba Supabase service role.");
  test.skip(info.project.name !== "desktop", "Zápis do DB len raz (desktop); mobil pokrýva ?preview=no_plan.");
  test.setTimeout(120_000);
  const admin = createClient(url!, serviceRole!, { auth: { persistSession: false, autoRefreshToken: false } });
  const email = `e2e-novy-klient-${Date.now()}@fitpilot-testaccount.com`;
  const password = "E2eNovy#2026!Klient";
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: "Nový Klient", role: "client" },
  });
  if (error || !data.user) throw new Error(`Dočasný klient sa nevytvoril: ${error?.message}`);
  const uid = data.user.id;
  try {
    await page.goto("/prihlasenie");
    await page.locator("#login-email").fill(email);
    await page.locator("#login-password").fill(password);
    await page.getByRole("button", { name: "Prihlásiť sa" }).click();
    await page.waitForURL(/\/portal$/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "Zatiaľ nemáš tréningový plán" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Vytvoriť plán" })).toHaveAttribute("href", "/portal/trening");
    await expect(page.getByRole("heading", { name: "Môj prehľad" })).toBeVisible();
    await expect(page.getByText("Odcvičené spolu")).toBeVisible();
    await expect(page.getByText(/Tento týždeň/).first()).toBeVisible();
    await expect(page.getByText("Meranie", { exact: true })).toBeVisible();
  } finally {
    await admin.from("clients").delete().eq("user_id", uid);
    await admin.auth.admin.deleteUser(uid);
  }
});
