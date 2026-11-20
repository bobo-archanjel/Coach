import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  addDaysToKey,
  bratislavaToUtcIso,
  dateKeyInTz,
  dayTitle,
  monthGrid,
  monthParam,
  monthTitle,
  parseMonthParam,
  shiftMonth,
} from "../lib/calendar/month";

/**
 * Mesačný kalendár trénera (app/dashboard/kalendar, lib/calendar/month.ts):
 * 1. čistá logika — mriežka po – ne, časové pásmo Europe/Bratislava (termín okolo polnoci),
 * 2. reálna DB (QA tréner) — prepnutie mesiaca, bodka pri dni s termínom, okno dňa
 *    (zoznam / prázdny stav), „+“ s formulárom a predvyplneným dátumom, uloženie bez reloadu.
 */

try {
  process.loadEnvFile(".env.local");
} catch {
  /* bez .env.local sa test s DB preskočí */
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

test.describe("kalendár — čistá logika", () => {
  test("mriežka mesiaca začína pondelkom a má celé týždne", () => {
    const nov = monthGrid({ year: 2026, month: 11 }); // 1. 11. 2026 je nedeľa
    expect(nov).toHaveLength(42);
    expect(nov[0]).toEqual({ key: "2026-10-26", day: 26, inMonth: false });
    expect(nov[6]).toEqual({ key: "2026-11-01", day: 1, inMonth: true });
    expect(nov[35]).toEqual({ key: "2026-11-30", day: 30, inMonth: true });
    expect(nov[41]).toEqual({ key: "2026-12-06", day: 6, inMonth: false });
    expect(nov.filter((d) => d.inMonth)).toHaveLength(30);

    const feb = monthGrid({ year: 2027, month: 2 }); // začína v pondelok, 28 dní
    expect(feb).toHaveLength(28);
    expect(feb.every((d) => d.inMonth)).toBe(true);
  });

  test("časové pásmo Europe/Bratislava: termín okolo polnoci ostane na svojom dni", () => {
    // zima (SEČ, UTC+1)
    expect(dateKeyInTz(new Date("2026-11-20T22:59:00Z"))).toBe("2026-11-20");
    expect(dateKeyInTz(new Date("2026-11-20T23:30:00Z"))).toBe("2026-11-21");
    expect(bratislavaToUtcIso("2026-11-21", "00:00")).toBe("2026-11-20T23:00:00.000Z");
    // leto (SELČ, UTC+2)
    expect(dateKeyInTz(new Date("2026-07-10T22:30:00Z"))).toBe("2026-07-11");
    expect(bratislavaToUtcIso("2026-07-11", "00:30")).toBe("2026-07-10T22:30:00.000Z");
  });

  test("mesiac z URL, posun cez rok, nadpisy po slovensky", () => {
    expect(parseMonthParam("2026-11", "2026-01-15")).toEqual({ year: 2026, month: 11 });
    expect(parseMonthParam("2026-13", "2026-01-15")).toEqual({ year: 2026, month: 1 });
    expect(parseMonthParam(undefined, "2026-05-15")).toEqual({ year: 2026, month: 5 });
    expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
    expect(monthParam({ year: 2026, month: 3 })).toBe("2026-03");
    expect(monthTitle({ year: 2026, month: 11 }, "sk")).toBe("November 2026");
    expect(dayTitle("2026-11-20", "sk")).toBe("Piatok 20. novembra");
  });
});

test.describe("kalendár — reálna DB (QA tréner)", () => {
  test.skip(!hasEnv, "Chýbajú E2E_* údaje alebo Supabase env (aj service role).");

  let admin: SupabaseClient;
  const stamp = Date.now();
  const prefix = `E2E mesiac ${stamp}`;
  test.afterAll(async () => {
    if (admin) await admin.from("appointments").delete().like("title", `${prefix}%`);
  });

  async function login(page: Page) {
    await page.goto("/prihlasenie");
    await page.locator("#login-email").fill(env.trainerEmail!);
    await page.locator("#login-password").fill(env.trainerPassword!);
    await page.getByRole("button", { name: "Prihlásiť sa" }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
  }

  test("prepnutie mesiaca, bodka, okno dňa, „+“ s predvyplneným dátumom, uloženie bez reloadu", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "zápis do DB len raz (desktop)");
    test.setTimeout(120_000);
    admin = createClient(env.url!, env.serviceRole!, AUTH);
    const anon = createClient(env.url!, env.anon!, AUTH);
    const { data: t } = await anon.auth.signInWithPassword({ email: env.trainerEmail!, password: env.trainerPassword! });
    const { data: c } = await anon.auth.signInWithPassword({ email: env.clientEmail!, password: env.clientPassword! });
    const { data: client } = await admin.from("clients").select("id, full_name").eq("user_id", c.user!.id).limit(1).single();

    // termín v budúcom mesiaci o 23:30 SEČ — musí byť pri svojom dni, nie pri nasledujúcom
    const todayKey = dateKeyInTz(new Date());
    const next = shiftMonth(parseMonthParam(undefined, todayKey), 1);
    const dayKey = `${monthParam(next)}-12`;
    const { error } = await admin.from("appointments").insert({
      trainer_id: t.user!.id,
      client_id: client!.id,
      title: `${prefix} večer`,
      starts_at: bratislavaToUtcIso(dayKey, "23:30"),
    });
    expect(error).toBeNull();

    await login(page);
    await page.goto("/dashboard/kalendar");
    const current = parseMonthParam(undefined, todayKey);
    await expect(page.getByRole("heading", { name: monthTitle(current, "sk"), level: 2 })).toBeVisible();
    await expect(page.locator(`[data-date="${todayKey}"]`)).toHaveAttribute("aria-current", "date");

    // šípka vpravo → budúci mesiac (URL aj nadpis), „Dnes“ vráti späť
    await page.getByRole("link", { name: "Nasledujúci mesiac" }).click();
    await expect(page).toHaveURL(new RegExp(`mesiac=${monthParam(next)}`));
    await expect(page.getByRole("heading", { name: monthTitle(next, "sk"), level: 2 })).toBeVisible();

    const day = page.locator(`[data-date="${dayKey}"]`);
    await expect(day).toHaveAttribute("data-count", "1");
    await expect(page.locator(`[data-date="${addDaysToKey(dayKey, 1)}"]`)).toHaveAttribute("data-count", "0");

    // okno dňa: dátum v hlavičke, termín s časom a klientom
    await page.evaluate(() => ((window as unknown as { __noReload: number }).__noReload = 1));
    await day.click();
    const dialog = page.getByRole("dialog", { name: dayTitle(dayKey, "sk") });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByTestId("day-appointments")).toContainText(`${prefix} večer`);
    await expect(dialog.getByTestId("day-appointments")).toContainText("23:30");
    await expect(dialog.getByTestId("day-appointments")).toContainText(client!.full_name);

    // „+“ → existujúci formulár s predvyplneným dátumom, uloženie → zoznam aj bodka bez reloadu
    await dialog.getByRole("button", { name: `Nový termín na ${dayTitle(dayKey, "sk")}` }).click();
    await expect(dialog.locator('input[name="date"]')).toHaveValue(dayKey);
    await dialog.locator('input[name="title"]').fill(`${prefix} ráno`);
    await dialog.locator('input[name="time"]').fill("07:15");
    if (await dialog.getByRole("button", { name: "Vyber klientov" }).isVisible()) {
      await dialog.getByRole("button", { name: "Vyber klientov" }).click();
      await dialog.getByRole("checkbox", { name: client!.full_name }).click();
      await dialog.getByRole("button", { name: "Hotovo" }).click();
    }
    await dialog.getByRole("button", { name: /^Pridať termín/ }).click();
    const list = dialog.getByTestId("day-appointments");
    await expect(list).toContainText(`${prefix} ráno`, { timeout: 20_000 });
    await expect(list.getByText(/^07:15/)).toBeVisible();
    await expect(day).toHaveAttribute("data-count", "2");
    expect(await page.evaluate(() => (window as unknown as { __noReload?: number }).__noReload)).toBe(1);

    // Esc zavrie; prázdny deň ukáže prázdny stav, klik mimo ho zavrie
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    const emptyKey = addDaysToKey(dayKey, 2);
    await page.locator(`[data-date="${emptyKey}"]`).click();
    const emptyDialog = page.getByRole("dialog", { name: dayTitle(emptyKey, "sk") });
    await expect(emptyDialog.getByText("Na tento deň nemáš nič naplánované.")).toBeVisible();
    await page.mouse.click(5, 5);
    await expect(emptyDialog).toHaveCount(0);

    await page.getByRole("link", { name: "Dnes" }).click();
    await expect(page.getByRole("heading", { name: monthTitle(current, "sk"), level: 2 })).toBeVisible();
    await page.getByRole("link", { name: "Predchádzajúci mesiac" }).click();
    await expect(page.getByRole("heading", { name: monthTitle(shiftMonth(current, -1), "sk"), level: 2 })).toBeVisible();
  });
});
