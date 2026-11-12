import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Jazyk appky (feature/cestina): prepínač SK/CZ na úvodnej stránke, jazyk podľa
 * prehliadača, právne stránky, Nastavenia trénera a Profil klienta s reálnymi QA
 * účtami (jazyk sa uloží do cookie aj do účtu — profiles.locale, migrácia 0059).
 * Na konci sa oba účty vrátia na slovenčinu.
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

async function setLocaleCookie(context: BrowserContext, value: "sk" | "cs") {
  const baseURL = test.info().project.use.baseURL ?? "http://localhost:3000";
  await context.addCookies([{ name: "fp-locale", value, url: baseURL }]);
}

const htmlLang = (page: Page) => page.locator("html");

async function login(page: Page, email: string, password: string, submit: string, to: RegExp) {
  await page.goto("/prihlasenie");
  await page.locator("#login-email").fill(email);
  await page.locator("#login-password").fill(password);
  await page.getByRole("button", { name: submit, exact: true }).click();
  await page.waitForURL(to, { timeout: 30_000 });
}

test.describe("Jazyk — verejné stránky", () => {
  test("úvodná stránka: SK/CZ vedľa témy → čeština ostane po obnovení aj na prihlásení", async ({ page, context }) => {
    await setLocaleCookie(context, "sk");
    await page.goto("/");
    await expect(htmlLang(page)).toHaveAttribute("lang", "sk");

    const toggle = page.getByRole("button", { name: /^Zmeniť jazyk/ });
    await expect(toggle).toHaveText("SK");
    await toggle.click();
    await page.getByRole("menuitemradio", { name: /Čeština/ }).click();

    await expect(htmlLang(page)).toHaveAttribute("lang", "cs");
    await expect(page.getByRole("button", { name: /^Změnit jazyk/ })).toHaveText("CZ");
    expect((await context.cookies()).find((c) => c.name === "fp-locale")?.value).toBe("cs");

    await page.reload();
    await expect(htmlLang(page)).toHaveAttribute("lang", "cs");

    await page.goto("/prihlasenie");
    await expect(htmlLang(page)).toHaveAttribute("lang", "cs");
    await expect(page.getByRole("button", { name: "Přihlásit se", exact: true })).toBeVisible();
    // (zlé heslo sa tu zámerne neskúša — každý pokus zvyšuje počítadlo zámku prihlásenia pre IP)
    await expect(page.getByRole("button", { name: "Zapomenuté heslo?" })).toBeVisible();

    // späť na slovenčinu tým istým prepínačom
    await page.goto("/");
    await page.getByRole("button", { name: /^Změnit jazyk/ }).click();
    await page.getByRole("menuitemradio", { name: /Slovenčina/ }).click();
    await expect(htmlLang(page)).toHaveAttribute("lang", "sk");
  });

  test("právne stránky v zvolenom jazyku", async ({ page, context }) => {
    await setLocaleCookie(context, "cs");
    await page.goto("/ochrana-sukromia");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Zásady ochrany osobních údajů");
    await page.goto("/cookies");
    await expect(page.getByRole("cell", { name: "fp-locale" })).toBeVisible();
    await expect(page).toHaveTitle(/Zásady cookies/);
    await setLocaleCookie(context, "sk");
    await page.goto("/obchodne-podmienky");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Obchodné podmienky");
  });

  test.describe("prehliadač s češtinou bez voľby jazyka", () => {
    test.use({ locale: "cs-CZ" });

    test("dostane češtinu (Accept-Language)", async ({ page, context }) => {
      expect((await context.cookies()).some((c) => c.name === "fp-locale")).toBe(false);
      await page.goto("/prihlasenie");
      await expect(htmlLang(page)).toHaveAttribute("lang", "cs");
      await expect(page.getByRole("button", { name: "Přihlásit se", exact: true })).toBeVisible();
    });
  });
});

test.describe("Jazyk — účty (reálna DB)", () => {
  test.skip(!hasEnv, "chýbajú E2E_* / Supabase env premenné");
  test.describe.configure({ mode: "serial" });

  let admin: SupabaseClient;
  let trainerId = "";
  let clientUserId = "";
  /** false = migrácia 0059 ešte nebola spustená (jazyk sa uloží len do cookie) */
  let hasLocaleColumn = false;

  const profileLocale = async (id: string) =>
    (await admin.from("profiles").select("locale").eq("id", id).maybeSingle()).data?.locale as string | undefined;

  test.beforeAll(async () => {
    admin = createClient(env.url!, env.serviceRole!, AUTH);
    const anon = createClient(env.url!, env.anon!, AUTH);
    const t = await anon.auth.signInWithPassword({ email: env.trainerEmail!, password: env.trainerPassword! });
    const c = await anon.auth.signInWithPassword({ email: env.clientEmail!, password: env.clientPassword! });
    trainerId = t.data.user!.id;
    clientUserId = c.data.user!.id;
    const probe = await admin.from("profiles").select("locale").eq("id", trainerId).maybeSingle();
    hasLocaleColumn = !probe.error;
  });

  test.afterAll(async () => {
    // poistka: oba QA účty späť na slovenčinu (aj keď test spadol uprostred)
    for (const id of [trainerId, clientUserId].filter(Boolean)) {
      if (hasLocaleColumn) await admin.from("profiles").update({ locale: "sk" }).eq("id", id);
      await admin.auth.admin.updateUserById(id, { user_metadata: { locale: "sk" } });
    }
  });

  test("tréner: Nastavenia → Jazyk → Čeština (menu, zvonček, CSV, nové prihlásenie)", async ({ page, context, browser }) => {
    test.setTimeout(120_000);
    await setLocaleCookie(context, "sk");
    await login(page, env.trainerEmail!, env.trainerPassword!, "Prihlásiť sa", /\/dashboard/);
    await page.goto("/dashboard/nastavenia");
    await page.getByRole("combobox", { name: "Jazyk appky" }).selectOption("cs");

    await expect(htmlLang(page)).toHaveAttribute("lang", "cs");
    await expect(page.getByRole("combobox", { name: "Jazyk aplikace" })).toHaveValue("cs");
    await expect(page.getByRole("heading", { name: "Nastavení", exact: true })).toBeVisible();
    // bez migrácie 0059 sa jazyk uloží len do cookie — ticho, bez chybovej hlášky
    await expect(page.getByText("Jazyk se nepodařilo uložit do účtu")).toHaveCount(0);
    await expect(page.getByText("Vzhled", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /^Upozornění/ }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /Tréninky/ }).first()).toBeAttached();
    expect((await context.cookies()).find((c) => c.name === "fp-locale")?.value).toBe("cs");

    // CSV export meraní: hlavička a názov súboru v jazyku trénera
    const { data: client } = await admin.from("clients").select("id").eq("trainer_id", trainerId).limit(1).maybeSingle();
    if (client) {
      const res = await page.request.get(`/api/export/progress/${client.id}/csv`);
      expect(res.status()).toBe(200);
      expect(res.headers()["content-disposition"]).toContain('filename="mereni-');
      expect((await res.text()).split("\r\n")[0]).toContain("Datum");
    }

    if (hasLocaleColumn) {
      await expect.poll(() => profileLocale(trainerId)).toBe("cs");
      // nové zariadenie (bez cookie): po prihlásení appka prevezme jazyk z účtu
      const fresh = await browser.newContext({ storageState: { cookies: [], origins: [] }, baseURL: test.info().project.use.baseURL });
      await setLocaleCookie(fresh, "sk");
      const p2 = await fresh.newPage();
      await login(p2, env.trainerEmail!, env.trainerPassword!, "Prihlásiť sa", /\/dashboard/);
      await p2.goto("/dashboard/nastavenia");
      await expect(htmlLang(p2)).toHaveAttribute("lang", "cs");
      await fresh.close();
    } else {
      test.info().annotations.push({ type: "info", description: "migrácia 0059 nie je spustená — jazyk len v cookie" });
    }

    // späť na slovenčinu
    await page.getByRole("combobox", { name: "Jazyk aplikace" }).selectOption("sk");
    await expect(htmlLang(page)).toHaveAttribute("lang", "sk");
    await expect(page.getByRole("heading", { name: "Nastavenia", exact: true })).toBeVisible();
    if (hasLocaleColumn) await expect.poll(() => profileLocale(trainerId)).toBe("sk");
  });

  test("klient: Profil → Jazyk → Čeština", async ({ page, context }) => {
    test.setTimeout(90_000);
    await setLocaleCookie(context, "sk");
    await login(page, env.clientEmail!, env.clientPassword!, "Prihlásiť sa", /\/portal/);
    await page.goto("/portal/profil");
    await page.getByRole("combobox", { name: "Jazyk appky" }).selectOption("cs");

    await expect(htmlLang(page)).toHaveAttribute("lang", "cs");
    await expect(page.getByText("Vzhled", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Kód pro trenéra, stav propojení a nastavení účtu.")).toBeVisible();
    if (hasLocaleColumn) await expect.poll(() => profileLocale(clientUserId)).toBe("cs");

    await page.goto("/portal");
    await expect(htmlLang(page)).toHaveAttribute("lang", "cs");
    await expect(page.getByRole("link", { name: /Deník/ }).first()).toBeAttached();

    await page.goto("/portal/profil");
    await page.getByRole("combobox", { name: "Jazyk aplikace" }).selectOption("sk");
    await expect(htmlLang(page)).toHaveAttribute("lang", "sk");
    if (hasLocaleColumn) await expect.poll(() => profileLocale(clientUserId)).toBe("sk");
  });
});
