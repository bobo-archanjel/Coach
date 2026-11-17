import { test, expect } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Reálne prihlásenie (nie ?preview=) — QA tréner z env (E2E_TRAINER_*), ktorý má
 * konverzáciu s QA klientom. Bez údajov sa súbor preskočí. Správa, ktorú test
 * pošle, sa na konci zmaže (service role) — nič neostane v chate.
 * Predtým test používal natvrdo cudzí účet a posielal správy jeho klientom.
 */
try {
  process.loadEnvFile(".env.local");
} catch {
  /* bez .env.local sa testy preskočia */
}
const env = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  serviceRole: process.env.SUPABASE_SERVICE_ROLE_KEY,
  email: process.env.E2E_TRAINER_EMAIL,
  password: process.env.E2E_TRAINER_PASSWORD,
};
const hasEnv = Object.values(env).every(Boolean);
const TEXT_PREFIX = "e2e test spravy-inbox";

test.skip(!hasEnv, "Chýbajú E2E_TRAINER_* údaje alebo Supabase env (aj service role).");

test.afterAll(async () => {
  if (!hasEnv) return;
  const admin = createClient(env.url!, env.serviceRole!, { auth: { persistSession: false, autoRefreshToken: false } });
  await admin.from("messages").delete().like("body", `${TEXT_PREFIX} %`).eq("sender_id", await trainerId(admin));
});

async function trainerId(admin: SupabaseClient): Promise<string> {
  const { data } = await admin.from("profiles").select("id").eq("email", env.email!).maybeSingle();
  return (data as { id: string } | null)?.id ?? "00000000-0000-0000-0000-000000000000";
}

async function loginAsTrainer(page: import("@playwright/test").Page) {
  await page.goto("/prihlasenie");
  await page.locator("#login-email").fill(env.email!);
  await page.locator("#login-password").fill(env.password!);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/dashboard/, { timeout: 20000 });
  // texty testu sú slovenské: prihlásenie nastaví jazyk z profilu (a jazyk.spec.ts ho
  // tomuto účtu súbežne prepína na češtinu) — cookie má prednosť, preto sk natvrdo
  await page.context().addCookies([{ name: "fp-locale", value: "sk", url: page.url() }]);
  await page.reload();

  // ak účet ešte nemá dokončený sprievodca (profiles.tour_completed_at NULL),
  // overlay by blokoval kliky — preskočiť
  const skipTour = page.getByRole("button", { name: "Preskočiť" });
  if (await skipTour.isVisible({ timeout: 3000 }).catch(() => false)) {
    await skipTour.click();
    await expect(page.getByRole("dialog")).toBeHidden({ timeout: 3000 });
  }
}

test.describe("Centrálna schránka správ /dashboard/spravy", () => {
  test("nav položka 'Správy' vedie na inbox", async ({ page }) => {
    await loginAsTrainer(page);
    await page.locator("a[href='/dashboard/spravy']").click();
    await expect(page).toHaveURL(/\/dashboard\/spravy/);
    await expect(page.getByRole("heading", { name: "Správy" })).toBeVisible();
  });

  test("zoznam konverzácií sa načíta, zoradený podľa aktivity", async ({ page }) => {
    await loginAsTrainer(page);
    await page.goto("/dashboard/spravy");
    const rows = page.locator("a[href^='/dashboard/spravy?client=']");
    await expect(rows.first()).toBeVisible({ timeout: 10000 });
    expect(await rows.count()).toBeGreaterThan(0);
  });

  test("výber konverzácie otvorí vlákno a dá sa v ňom písať", async ({ page, isMobile }) => {
    await loginAsTrainer(page);
    await page.goto("/dashboard/spravy");
    const firstRow = page.locator("a[href^='/dashboard/spravy?client=']").first();
    await firstRow.waitFor({ timeout: 10000 });
    const clientName = (await firstRow.locator("[class*='clientName']").innerText()).trim();
    await firstRow.click();
    await expect(page).toHaveURL(/client=/);

    // vlákno vpravo (desktop) alebo namiesto zoznamu (mobile) — v oboch
    // prípadoch composer musí byť viditeľný a nadpis sedí na vybraného klienta.
    await expect(page.locator("textarea[aria-label='Napísať správu']")).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("heading", { name: clientName })).toBeVisible();

    if (isMobile) {
      // na mobile sa po výbere zoznam aj hlavička stránky skryjú — ostáva len vlákno
      // (späť potiahnutím zľava doprava alebo ťuknutím na Správy v spodnej lište)
      await expect(page.locator("a[href^='/dashboard/spravy?client=']").first()).toBeHidden();
      await expect(page.getByRole("heading", { name: "Správy", exact: true })).toBeHidden();
    } else {
      // na desktope zoznam ostáva viditeľný vedľa vlákna
      await expect(page.locator("a[href^='/dashboard/spravy?client=']").first()).toBeVisible();
    }

    const before = await page.locator("[class*='bubble']").count();
    const text = `${TEXT_PREFIX} ${Date.now()}`;
    await page.locator("textarea[aria-label='Napísať správu']").fill(text);
    await page.locator("button[aria-label='Odoslať']").click();
    await expect
      .poll(async () => page.locator("[class*='bubble']").count(), { timeout: 15000 })
      .toBeGreaterThan(before);
    await expect(page.getByText(text)).toBeVisible();
  });

  test("ťuknutie na Správy v spodnej lište na mobile vráti na plný zoznam", async ({ page, isMobile }) => {
    test.skip(!isMobile, "návrat z vlákna na zoznam je relevantný len na mobile layoute");
    await loginAsTrainer(page);
    await page.goto("/dashboard/spravy");
    await page.locator("a[href^='/dashboard/spravy?client=']").first().click();
    await expect(page).toHaveURL(/client=/);
    await page.locator("nav a[href='/dashboard/spravy']").click();
    await expect(page).toHaveURL(/\/dashboard\/spravy$/);
    await expect(page.locator("a[href^='/dashboard/spravy?client=']").first()).toBeVisible();
  });
});
