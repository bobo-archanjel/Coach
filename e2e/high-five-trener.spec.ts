// i18n-ignore-file: e2e — reálna DB, QA účty, vymyslené texty
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { sessionLogin } from "./helpers/sessionLogin";

/**
 * High five trénera: úspech klienta (rekord) bez high five sa ukáže vo zvončeku aj v detaile
 * klienta; po „High five“ riadok zmizne hneď, zo zvončeka tiež, a po znovunačítaní sa nevráti.
 * Reálna DB (QA tréner + QA klient); vložené riadky sa po teste zmažú.
 */
try {
  process.loadEnvFile(".env.local");
} catch {
  /* bez .env.local sa test preskočí */
}
const env = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  serviceRole: process.env.SUPABASE_SERVICE_ROLE_KEY,
  trainerEmail: process.env.E2E_TRAINER_EMAIL,
  clientEmail: process.env.E2E_CLIENT_EMAIL,
};
const hasEnv = Object.values(env).every(Boolean);

test.describe("high five trénera — reálna DB", () => {
  test.skip(!hasEnv, "Chýbajú E2E_* údaje QA účtov alebo Supabase env (aj service role).");
  const admin = hasEnv ? createClient(env.url!, env.serviceRole!, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
  const exercise = `E2E Bench ${Date.now().toString().slice(-6)}`;
  let achievementId: string | null = null;

  test.afterAll(async () => {
    if (!admin || !achievementId) return;
    await admin.from("high_fives").delete().eq("achievement_id", achievementId);
    await admin.from("client_achievements").delete().eq("id", achievementId);
  });

  test("úspech bez high five: zvonček + detail klienta, po high five preč a natrvalo", async ({ page, baseURL }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Zápis do DB len raz (desktop).");
    test.setTimeout(120_000);
    const { data: users } = await admin!.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const clientUser = users.users.find((u) => u.email?.toLowerCase() === env.clientEmail!.toLowerCase());
    const { data: row } = await admin!.from("clients").select("id, full_name").eq("user_id", clientUser!.id).limit(1).single();
    const clientId = row!.id as string;

    const { data: ach, error } = await admin!
      .from("client_achievements")
      .insert({
        client_id: clientId,
        kind: "pr",
        exercise_key: exercise.toLowerCase(),
        exercise_name: exercise,
        pr_type: "weight",
        value: 90,
        reps: 5,
        e1rm: 105,
        source_log_id: randomUUID(),
        achieved_on: new Date().toISOString().slice(0, 10),
        seen_at: new Date().toISOString(),
        backfilled: false,
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    achievementId = ach!.id;

    await sessionLogin(page, env.trainerEmail!, baseURL!);
    await page.goto(`/dashboard/klienti/${clientId}`);

    const feed = page.getByTestId("achievements-feed");
    const feedRow = feed.locator("li", { hasText: exercise });
    await expect(feedRow).toBeVisible();

    // zvonček: položka s menom klienta a textom rekordu
    const bell = page.getByRole("button", { name: /^Upozornenia/ });
    await bell.click();
    const panel = page.locator("#attention-panel");
    await expect(panel).toContainText(exercise);
    await expect(panel.getByText(/úspech.* bez high five/)).toBeVisible();
    await bell.click();

    // high five → riadok preč hneď
    await feedRow.getByRole("button", { name: /^High five$|Poslať high five/ }).click();
    await expect(feedRow).toHaveCount(0);

    // zvonček (otvorený znova) už úspech nemá
    await bell.click();
    await expect(page.locator("#attention-panel")).not.toContainText(exercise);
    await bell.click();

    // po načítaní sa nevráti ani v detaile, ani vo zvončeku
    await page.reload();
    await expect(page.getByTestId("achievements-feed")).not.toContainText(exercise);
    await page.getByRole("button", { name: /^Upozornenia/ }).click();
    await expect(page.locator("#attention-panel")).not.toContainText(exercise);

    const { count } = await admin!.from("high_fives").select("id", { count: "exact", head: true }).eq("achievement_id", achievementId);
    expect(count).toBe(1);
  });
});
