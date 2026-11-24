import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { sessionLogin, userIdByEmail } from "./helpers/sessionLogin";

/**
 * Náhľad aj rozpracovaného plánu (rátajú sa len odcvičené tréningy) a zmazanie plánu trénerom
 * z karty v detaile klienta → Tréningy (aj hotového — odcvičené tréningy ostanú).
 * DEV náhľad klienta (/portal/trening?preview=ok — „Moje kardio + core“ má 1 z 2 odcvičený)
 * + reálna DB (QA tréner a klient, prihlásenie bez formulára — e2e/helpers/sessionLogin.ts).
 */
const card = (page: Page, id: string) => page.locator(`#plan-${id}`);

test.describe("náhľad rozpracovaného plánu — klient (náhľad)", () => {
  test.skip(process.env.NODE_ENV === "production", "DEV náhľady len v next dev");

  test("Report aj Upraviť; vyhodnotenie len z odcvičených, bez Zopakovať s progresiou", async ({ page }) => {
    await page.goto("/portal/trening?preview=ok");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    const own = card(page, "plan-own");
    await expect(own.getByRole("button", { name: "Upraviť" })).toBeVisible();
    // plán bez odcvičeného tréningu by Náhľad nemal — tu je 1 z 2 odcvičený
    await own.getByRole("button", { name: "Report" }).click();

    const view = page.getByRole("region", { name: "Report tréningu" });
    await expect(view).toBeVisible();
    await expect(view.getByTestId("review-stats")).toContainText(/Tréningy\s*1/);
    await expect(view.getByRole("button", { name: "Zopakovať s progresiou" })).toHaveCount(0);
    await expect(view.getByLabel("Názov tréningového plánu")).toHaveCount(0);

    // odcvičený tréning — karty cvikov; neodcvičený — len veta
    await view.getByRole("button", { name: /Sila — horná časť/ }).click();
    await expect(view.getByTestId("review-card").first()).toContainText("Bench press");
    await view.getByRole("button", { name: /Rozcvička/ }).click();
    await expect(view.getByTestId("day-not-done")).toHaveText("Tento tréning ešte nie je odcvičený.");
    await expect(view.getByTestId("review-card")).toHaveCount(0);
  });

  test("plán bez odcvičeného tréningu Report nemá; hotový ho má ako doteraz", async ({ page }) => {
    await page.goto("/portal/trening?preview=own");
    // „own“ náhľad: len vlastné plány — hotový „Moja jesenná sila“ má Náhľad, nie Upraviť
    await expect(card(page, "plan-own-done").getByRole("button", { name: "Report" })).toBeVisible();
    await expect(card(page, "plan-own-done").getByRole("button", { name: "Upraviť" })).toHaveCount(0);
  });
});

try {
  process.loadEnvFile(".env.local");
} catch {
  /* bez .env.local sa reálna časť preskočí */
}
const env = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  serviceRole: process.env.SUPABASE_SERVICE_ROLE_KEY,
  trainerEmail: process.env.E2E_TRAINER_EMAIL,
  clientEmail: process.env.E2E_CLIENT_EMAIL,
};
const hasEnv = Object.values(env).every(Boolean);
const AUTH = { auth: { persistSession: false } };

test.describe("tréner — náhľad a zmazanie plánu (reálna DB)", () => {
  test.skip(!hasEnv, "Chýbajú E2E_* údaje alebo Supabase env (aj service role).");

  let admin: SupabaseClient;
  const plans: string[] = [];
  test.afterAll(async () => {
    // zmazané testom už nie sú; dokončené zápisy tréningov ostávajú (zámok 0048 ich mazať nedovolí)
    if (admin && plans.length) await admin.from("workout_plans").delete().in("id", plans);
  });

  test("rozpracovaný plán: Report (1 z 2) → Zmazať; hotový plán sa zmaže tiež", async ({ page, baseURL }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "zápis do DB len raz (desktop)");
    test.setTimeout(150_000);
    admin = createClient(env.url!, env.serviceRole!, AUTH);
    const trainerId = await userIdByEmail(env.trainerEmail!);
    const clientUserId = await userIdByEmail(env.clientEmail!);
    const { data: client } = await admin.from("clients").select("id, active_plan_id, active_day_id").eq("user_id", clientUserId).eq("trainer_id", trainerId).single();
    const clientId = client!.id as string;

    const ex = (id: string, name: string) => ({ entry_id: id, exercise_id: null, exercise_name: name, sets: 2, reps: "10", load_kg: 30, tempo: null, rest_seconds: 60 });
    const makePlan = async (name: string, logBoth: boolean) => {
      const { data: plan } = await admin
        .from("workout_plans")
        .insert({ client_id: clientId, trainer_id: trainerId, name, published: true })
        .select("id")
        .single();
      plans.push(plan!.id);
      const { data: days } = await admin
        .from("workout_days")
        .insert([
          { plan_id: plan!.id, day_number: 1, name: "E2E Deň A", exercises: [ex("a", "E2E Drep")] },
          { plan_id: plan!.id, day_number: 2, name: "E2E Deň B", exercises: [ex("b", "E2E Zhyby")] },
        ])
        .select("id, name");
      const ordered = (days ?? []).slice().sort((x, y) => String(x.name).localeCompare(String(y.name)));
      for (const d of ordered.slice(0, logBoth ? 2 : 1)) {
        await admin.from("workout_logs").insert({
          client_id: clientId,
          workout_day_id: d.id,
          status: "completed",
          entries: [{ entryId: d.name === "E2E Deň A" ? "a" : "b", name: d.name === "E2E Deň A" ? "E2E Drep" : "E2E Zhyby", sets: [{ reps: 10, weight: 30 }] }],
        });
      }
      return { planId: plan!.id as string, dayIds: ordered.map((d) => d.id as string) };
    };

    const stamp = Date.now();
    const wip = await makePlan(`E2E rozpracovaný náhľad ${stamp}`, false);
    const done = await makePlan(`E2E hotový zmazať ${stamp}`, true);
    // nové plány nesmú prebiť pôvodný aktívny plán klienta
    await admin.from("clients").update({ active_plan_id: client!.active_plan_id, active_day_id: client!.active_day_id }).eq("id", clientId);

    await sessionLogin(page, env.trainerEmail!, baseURL!);
    await page.goto(`/dashboard/klienti/${clientId}`);

    // ---------- Náhľad rozpracovaného plánu ----------
    const wipCard = card(page, wip.planId);
    await expect(wipCard.locator("header")).toContainText("2 tréningy");
    await wipCard.getByRole("link", { name: "Report" }).click();
    await expect(page).toHaveURL(new RegExp(`/dashboard/treningy/${wip.planId}/report`), { timeout: 30_000 });
    await expect(page.getByRole("heading", { level: 1, name: `E2E rozpracovaný náhľad ${stamp}` })).toBeVisible();
    await expect(page.getByTestId("preview-progress")).toHaveText("Odcvičené 1/2");
    const panel = page.getByTestId("trainer-plan-review");
    await expect(panel.getByRole("heading", { name: "Priebežné vyhodnotenie" })).toBeVisible();
    await expect(panel.getByTestId("review-stats")).toContainText(/Tréningy\s*1/);
    await expect(panel.getByRole("button", { name: "Zopakovať s progresiou" })).toHaveCount(0);
    const previewDays = page.getByTestId("preview-day");
    await expect(previewDays).toHaveCount(2);
    await expect(previewDays.nth(0)).toHaveAttribute("data-done", "true");
    await expect(previewDays.nth(0).getByTestId("review-card").first()).toContainText("E2E Drep");
    await expect(previewDays.nth(1)).toContainText("Tento tréning klient ešte neodcvičil.");

    // ---------- Zmazať rozpracovaný plán (karta zmizne, zápis tréningu ostane) ----------
    await page.goto(`/dashboard/klienti/${clientId}`);
    await wipCard.getByRole("button", { name: `Zmazať plán E2E rozpracovaný náhľad ${stamp}` }).click();
    await expect(wipCard.getByRole("alertdialog")).toContainText("Tréningy, ktoré už klient odcvičil, ostanú uložené.");
    // Esc = zrušiť
    await page.keyboard.press("Escape");
    await expect(wipCard.getByRole("alertdialog")).toHaveCount(0);
    await wipCard.getByRole("button", { name: `Zmazať plán E2E rozpracovaný náhľad ${stamp}` }).click();
    await wipCard.getByRole("button", { name: "Áno, zmazať" }).click();
    await expect(wipCard).toHaveCount(0, { timeout: 15_000 });
    const { data: gone } = await admin.from("workout_plans").select("id").eq("id", wip.planId);
    expect(gone).toEqual([]);
    const { data: kept } = await admin.from("workout_logs").select("id, workout_day_id").eq("plan_snapshot->>plan_id", wip.planId);
    expect(kept).toHaveLength(1);
    expect(kept![0].workout_day_id).toBeNull();

    // ---------- hotový plán sa tiež zmaže ----------
    const doneCard = card(page, done.planId);
    await expect(doneCard.locator("header")).toContainText("Hotovo");
    // hotový plán: Report áno, „Otvoriť plán“ nie (Report ukáže to isté)
    await expect(doneCard.getByRole("link", { name: "Report" })).toBeVisible();
    await expect(doneCard.getByRole("link", { name: "Otvoriť plán" })).toHaveCount(0);
    await doneCard.getByRole("button", { name: `Zmazať plán E2E hotový zmazať ${stamp}` }).click();
    await doneCard.getByRole("button", { name: "Áno, zmazať" }).click();
    await expect(doneCard).toHaveCount(0, { timeout: 15_000 });
    const { data: goneDone } = await admin.from("workout_plans").select("id").eq("id", done.planId);
    expect(goneDone).toEqual([]);
  });
});
