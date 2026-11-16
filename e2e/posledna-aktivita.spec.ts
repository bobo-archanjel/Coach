import { test, expect } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isTrainerPlanLog } from "../lib/workouts/completed";

/**
 * Detail klienta → Tréningy → „Posledná aktivita tréningov“: len tréningy z plánov trénera, vlastné
 * tréningy klienta nie (feature/fixing).
 *  - vlastník plánu zo snapshotu (0061), pri starších záznamoch viditeľnosť dňa cez RLS,
 *  - reálna DB: dočasný vlastný plán klienta a plán trénera so záznamom „in_progress“
 *    (dokončené záznamy sú zamknuté a nedajú sa po teste zmazať), na konci sa zmažú.
 *   E2E_TRAINER_EMAIL, E2E_TRAINER_PASSWORD, E2E_CLIENT_EMAIL, E2E_CLIENT_PASSWORD
 */

try {
  process.loadEnvFile(".env.local");
} catch {
  /* bez .env.local sa DB test preskočí */
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

test.describe("posledná aktivita — čistá logika", () => {
  test("vlastník zo snapshotu, inak viditeľnosť dňa", () => {
    const snap = (extra: Record<string, unknown>) => ({ plan_id: "p", day_name: "Deň", exercises: [], ...extra });
    // snapshot s vlastníkom (0061)
    expect(isTrainerPlanLog({ planSnapshot: snap({ plan_trainer_id: "t1" }), workoutDayId: "d", dayVisible: false })).toBe(true);
    expect(isTrainerPlanLog({ planSnapshot: snap({ plan_trainer_id: null }), workoutDayId: "d", dayVisible: true })).toBe(false);
    expect(isTrainerPlanLog({ planSnapshot: snap({ plan_trainer_id: null }), workoutDayId: null, dayVisible: false })).toBe(false);
    // bez vlastníka: deň existuje, tréner ho nevidí → vlastný plán klienta
    expect(isTrainerPlanLog({ planSnapshot: snap({}), workoutDayId: "d", dayVisible: false })).toBe(false);
    expect(isTrainerPlanLog({ planSnapshot: null, workoutDayId: "d", dayVisible: false })).toBe(false);
    expect(isTrainerPlanLog({ planSnapshot: null, workoutDayId: "d", dayVisible: true })).toBe(true);
    // zmazaný plán bez vlastníka v snapshote — nedá sa zistiť, ukáže sa
    expect(isTrainerPlanLog({ planSnapshot: snap({}), workoutDayId: null, dayVisible: false })).toBe(true);
  });
});

test.describe("posledná aktivita — reálna DB", () => {
  test.skip(!hasEnv, "chýbajú E2E_* / Supabase env premenné");

  let admin: SupabaseClient;
  let clientApi: SupabaseClient;
  let trainerApi: SupabaseClient;
  let trainerId = "";
  let qaClientId = "";
  const planIds: string[] = [];
  const logIds: string[] = [];
  const stamp = Date.now().toString().slice(-6);

  test.beforeAll(async () => {
    admin = createClient(env.url!, env.serviceRole!, AUTH);
    clientApi = createClient(env.url!, env.anon!, AUTH);
    trainerApi = createClient(env.url!, env.anon!, AUTH);
    const c = await clientApi.auth.signInWithPassword({ email: env.clientEmail!, password: env.clientPassword! });
    const t = await trainerApi.auth.signInWithPassword({ email: env.trainerEmail!, password: env.trainerPassword! });
    if (c.error || t.error) throw new Error("prihlásenie QA účtov zlyhalo");
    trainerId = t.data.user!.id;
    const { data: row } = await clientApi.from("clients").select("id").eq("user_id", c.data.user!.id).single();
    qaClientId = row!.id;
  });

  test.afterAll(async () => {
    if (logIds.length) await admin.from("workout_logs").delete().in("id", logIds);
    if (planIds.length) await admin.from("workout_plans").delete().in("id", planIds);
  });

  test("tréning z vlastného plánu klienta sa trénerovi neukáže, z plánu trénera áno", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "zápis do DB len raz (desktop)");
    const today = new Date().toISOString().slice(0, 10);

    // vlastný plán klienta (trainer_id null) — vytvorí ho klient sám
    const own = await clientApi
      .from("workout_plans")
      .insert({ client_id: qaClientId, trainer_id: null, name: `E2E vlastný ${stamp}`, published: true })
      .select("id")
      .single();
    expect(own.error).toBeNull();
    planIds.push(own.data!.id);
    const ownDay = await clientApi
      .from("workout_days")
      .insert({ plan_id: own.data!.id, day_number: 1, name: `E2E vlastný deň ${stamp}`, exercises: [] })
      .select("id")
      .single();
    expect(ownDay.error).toBeNull();

    // plán trénera
    const tp = await trainerApi
      .from("workout_plans")
      .insert({ client_id: qaClientId, trainer_id: trainerId, name: `E2E trénerov ${stamp}`, published: true })
      .select("id")
      .single();
    expect(tp.error).toBeNull();
    planIds.push(tp.data!.id);
    const tDay = await trainerApi
      .from("workout_days")
      .insert({ plan_id: tp.data!.id, day_number: 1, name: `E2E trénerov deň ${stamp}`, exercises: [] })
      .select("id")
      .single();
    expect(tDay.error).toBeNull();

    // rozpracované záznamy (in_progress — dajú sa po teste zmazať)
    for (const dayId of [ownDay.data!.id, tDay.data!.id]) {
      const log = await admin
        .from("workout_logs")
        .insert({ client_id: qaClientId, workout_day_id: dayId, performed_on: today, status: "in_progress", entries: [] })
        .select("id")
        .single();
      expect(log.error).toBeNull();
      logIds.push(log.data!.id);
    }

    await page.goto("/prihlasenie");
    await page.locator("#login-email").fill(env.trainerEmail!);
    await page.locator("#login-password").fill(env.trainerPassword!);
    await page.getByRole("button", { name: "Prihlásiť sa" }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
    await page.goto(`/dashboard/klienti/${qaClientId}`);
    const panel = page.getByRole("tabpanel");
    await expect(panel.getByText("Posledná aktivita tréningov")).toBeVisible();
    // podľa odkazu na záznam — názov dňa z vlastného plánu tréner aj tak nevidí (RLS)
    const [ownLogId, trainerLogId] = logIds;
    await expect(panel.locator(`a[href="/dashboard/klienti/${qaClientId}/treningy/${trainerLogId}"]`)).toContainText(
      `E2E trénerov deň ${stamp}`,
    );
    await expect(panel.locator(`a[href="/dashboard/klienti/${qaClientId}/treningy/${ownLogId}"]`)).toHaveCount(0);
  });
});
