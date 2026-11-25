import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { apiSession, sessionLogin } from "./helpers/sessionLogin";

/**
 * Karta Dnes: tréning odcvičený dnes v INOM pláne než aktívnom sa ukáže ako karta
 * „Dnešný tréning z iného plánu“ s názvom plánu. Reálna DB (QA účty); plány po sebe zmaže
 * a klientovi vráti pôvodný aktívny plán. Dokončené logy sa zmazať nedajú (DB zámok) —
 * po zmazaní plánu ostanú s workout_day_id = null, ako pri ostatných e2e.
 */
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

test.describe("Dnes — tréning z iného plánu (reálna DB)", () => {
  test.skip(!hasEnv, "Chýbajú E2E_* údaje QA účtov alebo Supabase env (aj service role).");

  const stamp = Date.now().toString().slice(-6);
  const names = { a: `E2E Dnes aktívny ${stamp}`, b: `E2E Dnes iný ${stamp}` };
  const admin = hasEnv
    ? createClient(env.url!, env.serviceRole!, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;
  let clientRowId: string | null = null;
  let original: { active_plan_id: string | null; active_day_id: string | null } | null = null;

  test.afterAll(async () => {
    if (!admin) return;
    if (clientRowId && original) await admin.from("clients").update(original).eq("id", clientRowId);
    await admin.from("workout_plans").delete().in("name", Object.values(names));
  });

  test("log z neaktívneho plánu je na Dnes s kickerom a názvom plánu", async ({ page, baseURL }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Zápis do DB len raz (desktop).");
    test.setTimeout(120_000);
    const trainer = await apiSession(env.trainerEmail!);
    const client = await apiSession(env.clientEmail!);
    const { data: row } = await client.api.from("clients").select("id").eq("user_id", client.userId).limit(1).single();
    clientRowId = row!.id;
    const { data: before } = await admin!.from("clients").select("active_plan_id, active_day_id").eq("id", clientRowId).single();
    original = before!;

    const makePlan = async (name: string, dayName: string) => {
      const { data: plan } = await trainer.api
        .from("workout_plans")
        .insert({ client_id: clientRowId, trainer_id: trainer.userId, name, published: false })
        .select("id")
        .single();
      const { data: day } = await trainer.api
        .from("workout_days")
        .insert({
          plan_id: plan!.id,
          day_number: 1,
          name: dayName,
          exercises: [{ entry_id: "e2e-1", exercise_id: null, exercise_name: "E2E Drep", sets: 3, reps: "8" }],
        })
        .select("id")
        .single();
      await trainer.api.from("workout_plans").update({ published: true }).eq("id", plan!.id);
      return { planId: plan!.id as string, dayId: day!.id as string };
    };
    const a = await makePlan(names.a, "E2E Deň aktívny");
    const b = await makePlan(names.b, `E2E Deň iný ${stamp}`);
    await admin!.from("clients").update({ active_plan_id: a.planId, active_day_id: null }).eq("id", clientRowId);

    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bratislava" }).format(new Date());
    const { error } = await admin!.from("workout_logs").insert({
      client_id: clientRowId,
      workout_day_id: b.dayId,
      performed_on: today,
      status: "completed",
      completed_at: new Date().toISOString(),
      entries: [{ entry_id: "e2e-1", name: "E2E Drep", sets: [{ reps: 8, weight: 60 }] }],
    });
    expect(error).toBeNull();

    await sessionLogin(page, env.clientEmail!, baseURL!);
    await page.goto("/portal");
    const card = page.getByTestId("other-today").filter({ hasText: `E2E Deň iný ${stamp}` });
    await expect(card).toHaveCount(1);
    await expect(card).toContainText("Dnešný tréning z iného plánu");
    await expect(card.getByTestId("other-today-plan")).toHaveText(`Plán ${names.b}`);
    // hlavná karta ostáva na aktívnom pláne a nemá tento tréning
    await expect(page.getByTestId("hero-plan")).toHaveText(names.a);
    await expect(page.locator('[data-tour="today-hero"] [data-testid="other-today"]')).toHaveCount(0);
    // úprava hodnôt funguje aj pre log z iného plánu
    await card.getByTestId("done-toggle").click();
    await expect(card.getByRole("button", { name: /Upraviť hodnoty/ })).toBeVisible();
  });
});
