import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { sessionLogin } from "./helpers/sessionLogin";

/* /portal/uspechy (reálna DB, QA klient): bez Zdieľať vo výzvach/týždni, 3 viditeľné riadky + scroll,
   odznaky 4 + „Zobraziť všetky“, skrytý rebríček (dočasne mení nastavenie a vráti ho). */
const EMAIL = process.env.E2E_CLIENT_EMAIL ?? "qa.klient.agent@fitpilot-testaccount.com";
const SHOTS = process.env.SHOTS_DIR;
test.skip(!process.env.SUPABASE_SERVICE_ROLE_KEY, "treba service role");

const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

async function listCheck(page: import("@playwright/test").Page, testid: string) {
  const list = page.getByTestId(testid);
  await expect(list).toBeVisible();
  const rows = await list.locator(":scope > li").count();
  if (rows <= 3) return rows;
  const m = await list.evaluate((el) => {
    const r = [...el.children] as HTMLElement[];
    const box = el.getBoundingClientRect();
    return { ch: el.clientHeight, sh: el.scrollHeight, third: r[2].getBoundingClientRect().bottom - box.top, fourth: r[3] ? r[3].getBoundingClientRect().top - box.top : null };
  });
  {
    expect(m.sh).toBeGreaterThan(m.ch);
    expect(Math.abs(m.ch - m.third)).toBeLessThan(2);
    expect(m.fourth!).toBeGreaterThanOrEqual(m.ch - 1);
  }
  return rows;
}

test.describe("uspechy C", () => {
  test.beforeEach(async ({ page, baseURL }) => {
    await sessionLogin(page, EMAIL, baseURL!);
  });

  test("zoznamy, odznaky, bez Zdieľať", async ({ page }) => {
    await page.goto("/portal/uspechy");
    await expect(page.getByTestId("level-card")).toBeVisible();
    for (const id of ["challenges-card", "weekly-summary"]) {
      const el = page.getByTestId(id);
      if (await el.count()) await expect(el.getByText(/Zdieľať/)).toHaveCount(0);
    }
    if (await page.getByTestId("recent-list").count()) await listCheck(page, "recent-list");
    await listCheck(page, "record-list");

    const col = page.getByTestId("badges-collapsed");
    await expect(col.locator("li")).toHaveCount(4);
    await page.getByTestId("badges-toggle").scrollIntoViewIfNeeded();
    if (SHOTS) await page.getByTestId("badges-toggle").locator("xpath=ancestor::section").screenshot({ path: `${SHOTS}-badges-collapsed.png` });
    await page.getByTestId("badges-toggle").click();
    const total = await page.locator("li[data-badge]").count();
    expect(total).toBeGreaterThan(4);
    expect(total).toBe(31);
    await expect(page.getByTestId("badges-toggle")).toHaveText("Skryť");
    await page.getByTestId("badges-toggle").click();
    await expect(page.getByTestId("badges-collapsed").locator("li")).toHaveCount(4);
  });

  test("skrytý rebríček: malé farebné tlačidlo na stred", async ({ page }) => {
    const a = admin();
    const { data: c } = await a.from("clients").select("id, user_id");
    const { data: u } = await a.auth.admin.listUsers({ perPage: 200 });
    const uid = u!.users.find((x) => x.email === EMAIL)!.id;
    const id = c!.find((x) => x.user_id === uid)!.id as string;
    const { data: prev } = await a.from("gamification_settings").select("leaderboard_visible").eq("client_id", id).maybeSingle();
    try {
      await a.from("gamification_settings").upsert({ client_id: id, leaderboard_visible: false }, { onConflict: "client_id" });
      await page.goto("/portal/uspechy");
      const card = page.getByTestId("leaderboard-hidden");
      await expect(card).toBeVisible();
      const btn = page.getByTestId("leaderboard-show");
      const [cb, bb] = [await card.boundingBox(), await btn.boundingBox()];
      expect(Math.abs(cb!.x + cb!.width / 2 - (bb!.x + bb!.width / 2))).toBeLessThan(3);
      expect(bb!.height).toBeLessThan(36);
      expect(bb!.width).toBeLessThan(cb!.width * 0.7);
      expect(await btn.evaluate((e) => getComputedStyle(e).backgroundColor)).not.toBe("rgba(0, 0, 0, 0)");
      if (SHOTS) await card.screenshot({ path: `${SHOTS}-lb-hidden.png` });
    } finally {
      await a.from("gamification_settings").upsert({ client_id: id, leaderboard_visible: prev?.leaderboard_visible ?? true }, { onConflict: "client_id" });
    }
  });
});
