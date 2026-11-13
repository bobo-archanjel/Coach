import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Späť potiahnutím zľava doprava (SwipeBack) namiesto odkazov „Späť na …“ — prehľad
 * klienta a detail jedálnička (feature/buttons-fixes; detail tréningového plánu overuje
 * e2e/plan-builder.spec.ts). Gesto je len na dotykovom zariadení (projekt mobile).
 *   E2E_TRAINER_EMAIL, E2E_TRAINER_PASSWORD
 */

try {
  process.loadEnvFile(".env.local");
} catch {
  /* bez .env.local sa DB test preskočí */
}
const env = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  anon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  trainerEmail: process.env.E2E_TRAINER_EMAIL,
  trainerPassword: process.env.E2E_TRAINER_PASSWORD,
};
const hasEnv = Object.values(env).every(Boolean);
const AUTH = { auth: { persistSession: false, autoRefreshToken: false } };

/** Ťah prstom po prvku `selector` zo x=from do x=to (po krokoch, nech React stihne prekresliť). */
async function swipe(page: Page, selector: string, from: number, to: number) {
  const steps = [from, from + 20, from + (to - from) / 2, to];
  const fire = (type: string, x: number) =>
    page.evaluate(
      ({ selector, type, x }) => {
        const el = document.querySelector(selector)!;
        const r = el.getBoundingClientRect();
        const touch = new Touch({ identifier: 1, target: el, clientX: x, clientY: r.top + r.height / 2 });
        el.dispatchEvent(
          new TouchEvent(type, {
            bubbles: true,
            cancelable: true,
            touches: type === "touchend" ? [] : [touch],
            changedTouches: [touch],
          }),
        );
      },
      { selector, type, x },
    );
  await fire("touchstart", steps[0]);
  for (const x of steps.slice(1)) {
    await fire("touchmove", x);
    await page.waitForTimeout(40);
  }
  await fire("touchend", to);
}

test.describe("prehľad klienta (?preview=progress)", () => {
  test("bez „Späť na klientov“; potiahnutie späť na zoznam klientov, záložky ho nespustia", async ({ page }, testInfo) => {
    await page.goto("/dashboard/klienti/x?preview=progress");
    await expect(page.getByRole("heading", { name: "Ján Novák" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Späť na klientov/ })).toHaveCount(0);
    test.skip(testInfo.project.name !== "mobile", "gesto len na dotykovom zariadení");

    // záložky sekcií sa na mobile posúvajú do strany — ťah v nich nie je „späť“
    await swipe(page, "[role='tablist']", 40, 300);
    await page.waitForTimeout(400);
    expect(new URL(page.url()).pathname).toBe("/dashboard/klienti/x");

    // ťah cez meno klienta → zoznam klientov (náhľad bez session presmeruje na prihlásenie)
    await swipe(page, "h1", 30, 280);
    await page.waitForURL((url) => url.pathname === "/dashboard" || url.pathname.includes("prihlasenie"), {
      timeout: 15_000,
    });
  });
});

test.describe("detail jedálnička (reálna DB)", () => {
  test.skip(!hasEnv, "chýbajú E2E_* / Supabase env premenné");

  test("bez „Späť na jedálničky“; potiahnutie späť na zoznam jedálničkov", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "gesto len na dotykovom zariadení");
    test.setTimeout(90_000);
    const api: SupabaseClient = createClient(env.url!, env.anon!, AUTH);
    const { data: auth } = await api.auth.signInWithPassword({ email: env.trainerEmail!, password: env.trainerPassword! });
    const trainerId = auth.user!.id;
    const { data: client } = await api.from("clients").select("id").eq("trainer_id", trainerId).limit(1).single();
    const { data: plan, error } = await api
      .from("meal_plans")
      .insert({ client_id: client!.id, trainer_id: trainerId, name: `E2E Swipe ${Date.now()}`, published: false })
      .select("id")
      .single();
    expect(error).toBeNull();

    try {
      await page.goto("/prihlasenie");
      await page.locator("#login-email").fill(env.trainerEmail!);
      await page.locator("#login-password").fill(env.trainerPassword!);
      await page.getByRole("button", { name: "Prihlásiť sa" }).click();
      await page.waitForURL(/\/dashboard/, { timeout: 30_000 });

      await page.goto(`/dashboard/jedalnicky/jedalnicek/${plan!.id}`);
      await expect(page.getByRole("heading", { level: 1 })).toContainText("E2E Swipe");
      await expect(page.getByRole("link", { name: /Späť na jedálničky/ })).toHaveCount(0);

      await swipe(page, "h1", 30, 280);
      await page.waitForURL((url) => url.pathname === "/dashboard/jedalnicky", { timeout: 15_000 });
    } finally {
      await api.from("meal_plans").delete().eq("id", plan!.id);
    }
  });
});

test.describe("klient: vlastný tréning (?preview=ok)", () => {
  test("bez tlačidla „Späť“ — builder zavrie späť v prehliadači, potiahnutie (mobil) aj „Tréning“ v menu", async ({ page }, testInfo) => {
    await page.goto("/portal/trening?preview=ok");
    const open = page.getByRole("button", { name: "Vlastný tréning" });
    const builder = page.getByRole("region", { name: "Nový vlastný tréning" });

    // otvorenie = záznam v histórii (?tvorba=1), tlačidlo „Späť“ v builderi nie je
    await open.click();
    await expect(builder).toBeVisible();
    expect(new URL(page.url()).searchParams.get("tvorba")).toBe("1");
    await expect(builder.getByRole("button", { name: "Späť", exact: true })).toHaveCount(0);
    await expect(builder.getByRole("button", { name: "Uložiť", exact: true })).toBeVisible();

    // späť v prehliadači → zoznam tréningov
    await page.goBack();
    await expect(builder).toHaveCount(0);
    await expect(open).toBeVisible();
    expect(new URL(page.url()).searchParams.has("tvorba")).toBe(false);

    await open.click();
    await expect(builder).toBeVisible();
    if (testInfo.project.name === "mobile") {
      // potiahnutie zľava doprava cez builder → zoznam, ?tvorba zmizne
      await swipe(page, "[aria-label='Nový vlastný tréning']", 30, 300);
      await expect(builder).toHaveCount(0, { timeout: 15_000 });
      await expect(open).toBeVisible();
    } else {
      // počítač: „Tréning“ v bočnom menu (tá istá stránka, bez ?tvorba) — v náhľade bez
      // session vedie na /portal/trening bez dát, overí sa len zatvorenie buildera
      await page.getByRole("navigation").getByRole("link", { name: "Tréning", exact: true }).first().click();
      await page.waitForURL((url) => url.pathname === "/portal/trening" && !url.searchParams.has("tvorba"));
      await expect(builder).toHaveCount(0, { timeout: 15_000 });
    }
    expect(new URL(page.url()).searchParams.has("tvorba")).toBe(false);
  });
});
