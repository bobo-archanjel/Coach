import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { needsTermsConsent, TERMS_VERSION } from "../lib/legal/terms";

/**
 * Súhlas s obchodnými podmienkami (feature/obchodne-podmienky, migrácia 0063):
 *  - účet bez súhlasu (ako po registrácii / prihlásení cez Google) pred vstupom do appky
 *    uvidí /prihlasenie/suhlas, po „Súhlasím a pokračovať“ sa súhlas zapíše a pustí ho,
 *  - účet so staršou verziou vidí „Aktualizovali sme obchodné podmienky“, môže sa odhlásiť,
 *  - existujúce účty (QA) sú po migrácii súhlasiace — bránu nevidia.
 * Dočasné účty (admin API) sa na konci zmažú. Bez migrácie 0063 sa DB testy preskočia.
 */

try {
  process.loadEnvFile(".env.local");
} catch {
  /* bez .env.local sa DB testy preskočia */
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
const AUTH = { auth: { persistSession: false, autoRefreshToken: false } };
const PASSWORD = "E2e#Suhlas2026!";

test.describe("súhlas — logika verzie", () => {
  test("brána len pri chýbajúcej alebo staršej verzii; neznáma (pred migráciou) appku nezamkne", () => {
    expect(needsTermsConsent(TERMS_VERSION)).toBe(false);
    expect(needsTermsConsent(null)).toBe(true);
    expect(needsTermsConsent("2020-01-01")).toBe(true);
    expect(needsTermsConsent(undefined)).toBe(false);
  });
});

test.describe("súhlas s obchodnými podmienkami (reálna DB)", () => {
  test.skip(!url || !anon || !serviceRole, "chýbajú Supabase env premenné");

  let admin: SupabaseClient;
  let migrated = false;
  const created: string[] = [];
  const stamp = Date.now().toString().slice(-7);

  test.beforeAll(async () => {
    admin = createClient(url!, serviceRole!, AUTH);
    const probe = await admin.from("profiles").select("terms_version").limit(1);
    migrated = !probe.error;
  });

  test.afterAll(async () => {
    for (const id of created) {
      await admin.from("clients").delete().eq("user_id", id);
      await admin.auth.admin.deleteUser(id).catch(() => {});
    }
  });

  /** Dočasný účet bez súhlasu — ako nový účet z Google (metadáta bez terms_version). */
  async function tempUser(role: "trainer" | "client") {
    const email = `e2e.suhlas.${role}.${stamp}@fitpilot-testaccount.com`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: `E2E Súhlas ${role}`, role },
    });
    if (error) throw new Error(error.message);
    created.push(data.user!.id);
    return { email, id: data.user!.id };
  }

  async function login(page: Page, email: string) {
    await page.goto("/prihlasenie");
    await page.locator("#login-email").fill(email);
    await page.locator("#login-password").fill(PASSWORD);
    await page.getByRole("button", { name: "Prihlásiť sa" }).click();
  }

  const termsOf = async (id: string) =>
    (await admin.from("profiles").select("terms_version, terms_accepted_at").eq("id", id).single()).data;

  test("nový účet bez súhlasu: brána → súhlas → appka, súhlas zapísaný s verziou", async ({ page }, testInfo) => {
    test.skip(!migrated, "migrácia 0063 (súhlas s podmienkami) na tejto DB ešte nebežala");
    test.skip(testInfo.project.name !== "desktop", "zápis do DB len raz (desktop)");
    const trainer = await tempUser("trainer");
    expect((await termsOf(trainer.id))?.terms_version).toBeNull();

    await login(page, trainer.email);
    await page.waitForURL(/\/prihlasenie\/suhlas/, { timeout: 30_000 });
    const card = page.getByTestId("terms-consent");
    await expect(card.getByRole("heading", { name: "Ešte jeden krok" })).toBeVisible();
    await expect(card.getByRole("link", { name: "obchodné podmienky" })).toHaveAttribute("href", "/obchodne-podmienky");
    // bez súhlasu sa do appky nedostane ani priamou adresou
    await page.goto("/dashboard/treningy");
    await expect(page).toHaveURL(/\/prihlasenie\/suhlas/);

    await card.getByRole("button", { name: "Súhlasím a pokračovať" }).click();
    await page.waitForURL(/\/dashboard$/, { timeout: 30_000 });
    const terms = await termsOf(trainer.id);
    expect(terms?.terms_version).toBe(TERMS_VERSION);
    expect(terms?.terms_accepted_at).not.toBeNull();
    // ďalšia návšteva — už bez brány
    await page.goto("/dashboard/treningy");
    await expect(page).toHaveURL(/\/dashboard\/treningy/);
  });

  test("klient bez súhlasu: po súhlase ide do portálu", async ({ page }, testInfo) => {
    test.skip(!migrated, "migrácia 0063 (súhlas s podmienkami) na tejto DB ešte nebežala");
    test.skip(testInfo.project.name !== "desktop", "zápis do DB len raz (desktop)");
    const client = await tempUser("client");
    await login(page, client.email);
    await page.waitForURL(/\/prihlasenie\/suhlas/, { timeout: 30_000 });
    await page.getByRole("button", { name: "Súhlasím a pokračovať" }).click();
    await page.waitForURL(/\/portal$/, { timeout: 30_000 });
    expect((await termsOf(client.id))?.terms_version).toBe(TERMS_VERSION);
  });

  test("staršia verzia: „Aktualizovali sme obchodné podmienky“, dá sa odhlásiť", async ({ page }, testInfo) => {
    test.skip(!migrated, "migrácia 0063 (súhlas s podmienkami) na tejto DB ešte nebežala");
    test.skip(testInfo.project.name !== "desktop", "zápis do DB len raz (desktop)");
    const trainer = await tempUser("trainer");
    await admin.from("profiles").update({ terms_version: "2020-01-01", terms_accepted_at: "2020-01-01T10:00:00Z" }).eq("id", trainer.id);

    await login(page, trainer.email);
    await page.waitForURL(/\/prihlasenie\/suhlas/, { timeout: 30_000 });
    const card = page.getByTestId("terms-consent");
    await expect(card.getByRole("heading", { name: "Aktualizovali sme obchodné podmienky" })).toBeVisible();
    await expect(card.getByText("Čo sa zmenilo")).toBeVisible();
    await card.getByRole("button", { name: "Odhlásiť sa" }).click();
    await page.waitForURL(/\/prihlasenie$/, { timeout: 30_000 });
    expect((await termsOf(trainer.id))?.terms_version).toBe("2020-01-01"); // bez súhlasu nič nezapísané
  });

  test("existujúce účty sú po migrácii súhlasiace (QA tréner a klient)", async () => {
    test.skip(!migrated, "migrácia 0063 (súhlas s podmienkami) na tejto DB ešte nebežala");
    const { data } = await admin
      .from("profiles")
      .select("terms_version, terms_accepted_at")
      .in("email", ["qa.trener.agent@fitpilot-testaccount.com", "qa.klient.agent@fitpilot-testaccount.com"]);
    expect(data).toHaveLength(2);
    for (const p of data ?? []) {
      expect(p.terms_version).toBe(TERMS_VERSION);
      expect(p.terms_accepted_at).not.toBeNull();
    }
  });
});
