import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { TERMS_VERSION } from "../lib/legal/terms";
import { PENDING_VERIFY_KEY, SIGNUP_CODE_LENGTH } from "../lib/auth/signupCode";

/**
 * Overenie e-mailu kódom (feature/overenie-kodom):
 *  - DEV náhľad /prihlasenie?preview=code — maska 6 číslic, automatické odoslanie, zlý kód,
 *    odpočet „Poslať kód znova“, „Zmeniť e-mail“, variant pre prihlásenie neovereného účtu,
 *  - reálna DB: neoverený účet z admin `generateLink` (kód bez odoslania e-mailu) → kód
 *    v appke → prihlásený na /portal; 5 zlých kódov → lockout aj pre správny kód.
 * Pozor: Supabase „Email OTP Length“ musí byť 6 — inak sa testy s DB preskočia.
 */
try {
  process.loadEnvFile(".env.local");
} catch {
  /* bez .env.local sa testy s DB preskočia */
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
const AUTH = { auth: { persistSession: false, autoRefreshToken: false } };
const code = (page: Page) => page.locator("#verify-code");
const step = (page: Page) => page.getByTestId("verify-step");

test.describe("overenie kódom — náhľad", () => {
  test.skip(process.env.NODE_ENV === "production", "DEV náhľady len v next dev");

  test("po registrácii: maska, zlý kód, správny kód, odpočet a zmena e-mailu", async ({ page }) => {
    await page.goto("/prihlasenie?preview=code");
    await expect(step(page)).toContainText("Over svoj e-mail");
    await expect(step(page)).toContainText("Poslali sme 6-miestny kód na jana.novakova@example.com");
    // namiesto tabov je len krok s kódom
    await expect(page.getByRole("tab")).toHaveCount(0);
    await expect(code(page)).toBeFocused();
    await expect(code(page)).toHaveAttribute("autocomplete", "one-time-code");
    await expect(code(page)).toHaveAttribute("inputmode", "numeric");

    // len číslice, najviac 6; neúplný kód sa neodošle
    await code(page).fill("12a 3-4");
    await expect(code(page)).toHaveValue("1234");
    await expect(page.getByRole("button", { name: "Overiť" })).toBeDisabled();

    // zlý kód sa odošle sám po 6. číslici
    await code(page).fill("111111");
    await expect(page.locator("#verify-error")).toContainText("Kód je neplatný alebo vypršal");
    await expect(code(page)).toHaveAttribute("aria-invalid", "true");

    // „Poslať kód znova“ až po odpočte
    const resend = step(page).getByRole("button", { name: /Nový kód o \d+ s/ });
    await expect(resend).toBeDisabled();

    // vložený kód s medzerou (z e-mailu) → overené
    await code(page).fill("123 456");
    await expect(page.getByRole("button", { name: "Overené — prihlasujem…" })).toBeVisible();
  });

  test("Zmeniť e-mail vráti na registráciu", async ({ page }) => {
    await page.goto("/prihlasenie?preview=code");
    await step(page).getByRole("button", { name: "Zmeniť e-mail" }).click();
    await expect(step(page)).toHaveCount(0);
    await expect(page.getByRole("tab", { name: "Registrácia" })).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("#reg-email")).toBeVisible();
  });

  test("prihlásenie neovereného účtu: iný úvod, späť na prihlásenie", async ({ page }) => {
    await page.goto("/prihlasenie?preview=code&mode=login");
    await expect(step(page)).toContainText("Tvoj e-mail jana.novakova@example.com ešte nie je overený");
    await step(page).getByRole("button", { name: "Zmeniť e-mail" }).click();
    await expect(page.getByRole("tab", { name: "Prihlásenie" })).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("#login-email")).toBeVisible();
  });

  test("?overenie=1 bez rozpracovaného overenia ukáže bežné prihlásenie", async ({ page }) => {
    await page.goto("/prihlasenie?overenie=1");
    await expect(page.locator("#login-email")).toBeVisible();
    await expect(step(page)).toHaveCount(0);
    await expect(page).toHaveURL(/\/prihlasenie$/);
  });
});

test.describe("overenie kódom — reálna DB", () => {
  test.skip(!url || !serviceRole, "Chýba Supabase service role.");
  test.describe.configure({ timeout: 120_000 });

  // vlastná „IP“ pre lockout počítadlá — po teste sa vyčistia, nezamknú iné testy
  const ip = `203.0.113.${Math.floor(Math.random() * 250) + 1}`;
  const hash = (v: string) => createHash("sha256").update(v).digest("hex").slice(0, 24);
  let admin: SupabaseClient;
  const users: { id: string; email: string }[] = [];

  test.beforeEach(async ({ page }) => {
    admin = createClient(url!, serviceRole!, AUTH);
    await page.setExtraHTTPHeaders({ "x-forwarded-for": ip });
  });
  test.afterAll(async () => {
    if (!admin) return;
    for (const u of users) {
      const { data: client } = await admin.from("clients").select("id").eq("user_id", u.id).maybeSingle();
      if (client) await admin.from("clients").delete().eq("id", client.id);
      await admin.auth.admin.deleteUser(u.id).catch(() => {});
      await admin.rpc("clear_login_attempts", { p_identifier: `otp:${hash(u.email)}` });
    }
    for (const id of [ip, "unknown"]) await admin.rpc("clear_login_attempts", { p_identifier: `otp-ip:${hash(id)}` });
  });

  /** neoverený klient + jeho kód — generateLink e-mail neodošle */
  async function unconfirmedClient(label: string) {
    const email = `e2e-overenie-${label}-${Date.now()}@fitpilot-testaccount.com`;
    const { data, error } = await admin.auth.admin.generateLink({
      type: "signup",
      email,
      password: "E2eOverenie#2026!Kod",
      options: { data: { full_name: "E2E Overenie", role: "client", terms_version: TERMS_VERSION, locale: "sk" } },
    });
    if (error || !data.user) throw new Error(`generateLink: ${error?.message}`);
    users.push({ id: data.user.id, email });
    const otp = data.properties.email_otp;
    test.skip(otp.length !== SIGNUP_CODE_LENGTH, `Supabase „Email OTP Length“ je ${otp.length}, appka čaká ${SIGNUP_CODE_LENGTH}.`);
    return { id: data.user.id, email, otp };
  }

  /** krok s kódom ako po registrácii — rozpracované overenie v sessionStorage + ?overenie=1 */
  async function openStep(page: Page, email: string) {
    await page.goto("/prihlasenie");
    await page.evaluate(
      ([key, value]) => sessionStorage.setItem(key, value),
      [PENDING_VERIFY_KEY, JSON.stringify({ email, mode: "register", sentAt: Date.now() })] as const,
    );
    await page.goto("/prihlasenie?overenie=1");
    await expect(step(page)).toContainText(email);
  }
  const wrong = (otp: string, n: number) => otp.slice(0, -1) + String((Number(otp.at(-1)) + n) % 10);

  test("správny kód overí e-mail a rovno prihlási (klient → portál)", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "zápis do DB len raz (desktop)");
    const u = await unconfirmedClient("ok");
    await openStep(page, u.email);

    await code(page).fill(wrong(u.otp, 1));
    await expect(page.locator("#verify-error")).toContainText("Kód je neplatný alebo vypršal");

    await code(page).fill(u.otp);
    await page.waitForURL(/\/portal/, { timeout: 30_000 });
    const { data } = await admin.auth.admin.getUserById(u.id);
    expect(data.user?.email_confirmed_at).toBeTruthy();
    // po overení sa rozpracované overenie zmaže
    expect(await page.evaluate((k) => sessionStorage.getItem(k), PENDING_VERIFY_KEY)).toBeNull();
  });

  test("5 zlých kódov zamkne overenie aj pre správny kód", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "zápis do DB len raz (desktop)");
    const u = await unconfirmedClient("lock");
    await openStep(page, u.email);

    for (let n = 1; n <= 5; n++) {
      await code(page).fill(wrong(u.otp, n));
      // počas overovania je pole zamknuté — čakáme na odpoveď, nie na hlášku z minulého pokusu
      await expect(code(page)).toBeDisabled();
      await expect(code(page)).toBeEnabled();
      await expect(page.locator("#verify-error")).toContainText("Kód je neplatný alebo vypršal");
    }
    await code(page).fill(u.otp);
    await expect(page.locator("#verify-error")).toContainText("Príliš veľa nesprávnych kódov");
    await expect(page).toHaveURL(/\/prihlasenie/);
    const { data } = await admin.auth.admin.getUserById(u.id);
    expect(data.user?.email_confirmed_at).toBeFalsy();
  });
});
