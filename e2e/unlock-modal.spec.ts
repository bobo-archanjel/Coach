import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { sessionLogin } from "./helpers/sessionLogin";
import { BADGES } from "../lib/gamification/badges";
import { encodeFinishSummary, FINISH_COOKIE, type FinishSummary } from "../lib/gamification/finishSummary";

/**
 * Oslava úspechu (UnlockModal): nezmizne sama po obnovení layoutu, zavrie sa len akciou klienta, po zavretí
 * sa označí ako videná, a ukáže sa až po zatvorení súhrnu tréningu („Pokračovať“). Reálna časť beží na QA klientovi
 * a vloží jeden testovací odznak (client_achievements), ktorý na konci zmaže.
 */
try {
  process.loadEnvFile(".env.local");
} catch {
  /* bez .env.local sa test preskočí */
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
const clientEmail = process.env.E2E_CLIENT_EMAIL;
const ready = Boolean(url && serviceRole && clientEmail);

test.describe("UnlockModal", () => {
  test.skip(!ready, "chýba .env.local / E2E_CLIENT_EMAIL");
  test.describe.configure({ mode: "serial" });

  let admin: ReturnType<typeof createClient>;
  let rowId: string | null = null;

  async function insertBadge(): Promise<void> {
    const { data: u } = await admin.from("clients").select("id").eq("user_id", await userId()).order("created_at", { ascending: true }).limit(1).maybeSingle();
    const clientId = u!.id as string;
    const { data: have } = await admin.from("client_achievements").select("badge_id").eq("client_id", clientId).eq("kind", "badge");
    const owned = new Set((have ?? []).map((r) => r.badge_id as string));
    const free = BADGES.find((b) => !owned.has(b.id));
    if (!free) throw new Error("QA klient má všetky odznaky — nemám čo vložiť");
    const { data, error } = await admin
      .from("client_achievements")
      .insert({ client_id: clientId, kind: "badge", badge_id: free.id, achieved_on: new Date().toISOString().slice(0, 10), seen_at: null })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    rowId = data.id as string;
  }
  async function userId(): Promise<string> {
    const { userIdByEmail } = await import("./helpers/sessionLogin");
    return userIdByEmail(clientEmail!);
  }

  test.beforeAll(() => {
    admin = createClient(url!, serviceRole!, { auth: { persistSession: false, autoRefreshToken: false } });
  });
  test.afterAll(async () => {
    if (rowId) await admin.from("client_achievements").delete().eq("id", rowId);
  });

  test("ostane po obnovení a po 5 s, zavrie sa len akciou; po zavretí sa nevráti", async ({ page, baseURL }) => {
    await insertBadge();
    await sessionLogin(page, clientEmail!, baseURL!);
    await page.goto("/portal");
    const modal = page.getByTestId("unlock-modal");
    await expect(modal).toBeVisible();

    // obnovenie layoutu (server medzitým vráti prázdny zoznam, ak by sa označilo skoro) nesmie modal zrušiť
    await page.evaluate(() => (window as unknown as { next?: { router?: { refresh(): void } } }).next?.router?.refresh());
    await page.waitForTimeout(5000);
    await expect(modal).toBeVisible();
    // ani po navigácii v rámci portálu sa neoznačuje predčasne: v DB je stále nevidená
    const { data: before } = await admin.from("client_achievements").select("seen_at").eq("id", rowId!).single();
    expect(before?.seen_at).toBeNull();

    // server už úspech nevidí ako nevidený (napr. označený inde) a layout sa obnoví — otvorený modal ostane
    await admin.from("client_achievements").update({ seen_at: new Date().toISOString() }).eq("id", rowId!);
    await page.evaluate(() => (window as unknown as { next?: { router?: { refresh(): void } } }).next?.router?.refresh());
    await page.waitForTimeout(3000);
    await expect(modal).toBeVisible();
    await admin.from("client_achievements").update({ seen_at: null }).eq("id", rowId!);

    await page.keyboard.press("Escape");
    await expect(modal).toHaveCount(0);
    await expect.poll(async () => (await admin.from("client_achievements").select("seen_at").eq("id", rowId!).single()).data?.seen_at, { timeout: 10_000 }).not.toBeNull();

    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("unlock-modal")).toHaveCount(0);
  });

  test("po súhrne tréningu: oslava až po „Pokračovať“ a zostane", async ({ page, baseURL }) => {
    // vráť odznak do „nevidený“
    await admin.from("client_achievements").update({ seen_at: null }).eq("id", rowId!);
    await sessionLogin(page, clientEmail!, baseURL!);
    const summary: FinishSummary = {
      durationMin: 30, volumeKg: 1000, sets: 10, exercises: 3, prs: 0, xp: 25, missions: [], bonus: false,
      streakWeeks: 1, needThisWeek: 2, freezeUsed: false, levelUp: null, weekStart: "2026-11-23",
    };
    await page.context().addCookies([{ name: FINISH_COOKIE, value: encodeFinishSummary(summary), url: baseURL! + "/portal", httpOnly: true }]);
    await page.goto("/portal");
    const finish = page.getByTestId("finish-summary");
    await expect(finish).toBeVisible();
    // oslava sa nesmie ukázať pod/popri súhrne
    await page.waitForTimeout(1500);
    await expect(page.getByTestId("unlock-modal")).toHaveCount(0);

    await finish.getByRole("button", { name: "Pokračovať" }).click();
    const modal = page.getByTestId("unlock-modal");
    await expect(modal).toBeVisible();
    // zavretie súhrnu zmaže cookie a obnoví layout — oslava musí ostať
    await page.waitForTimeout(5000);
    await expect(modal).toBeVisible();
    await modal.getByRole("button").first().click();
    await expect(modal).toHaveCount(0);
    await expect.poll(async () => (await admin.from("client_achievements").select("seen_at").eq("id", rowId!).single()).data?.seen_at, { timeout: 10_000 }).not.toBeNull();
  });
});
