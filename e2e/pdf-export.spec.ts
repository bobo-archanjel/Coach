import { test, expect } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { PDFDocument } from "pdf-lib";
import { generatePlanPdf } from "../lib/pdf/planReport";
import { buildShoppingList, generateMealPlanPdf } from "../lib/pdf/mealPlanReport";
import { generateProgressPdf } from "../lib/pdf/progressReport";

/**
 * PDF exporty (lib/pdf, vzhľad v6): generovanie z ukážkových dát bez servera — diakritika,
 * dlhé názvy, prázdne dni, zalomenie na viac strán — a stiahnutie cez skutočné API
 * s prihláseným QA trénerom (route handlery /api/export/…/pdf).
 *   E2E_TRAINER_EMAIL, E2E_TRAINER_PASSWORD, E2E_CLIENT_EMAIL, E2E_CLIENT_PASSWORD
 */

const ex = (exerciseName: string, sets = 3, restSeconds: number | null = 90) => ({
  exerciseName,
  sets,
  reps: "8-10",
  loadKg: 40,
  tempo: null,
  restSeconds,
});
const meal = (food_name: string, meal_slot: "ranajky" | "obed" | "vecera", grams: number) => ({
  food_name,
  meal_slot,
  grams,
  kcal_100g: 150,
  protein_100g: 10,
  carbs_100g: 15,
  fat_100g: 5,
});

async function pageCount(bytes: Uint8Array): Promise<number> {
  return (await PDFDocument.load(bytes)).getPageCount();
}

test.describe("PDF exporty — generovanie (bez servera)", () => {
  test("tréningový plán: diakritika, dlhé názvy, prázdny deň, zalomenie strany", async () => {
    const bytes = await generatePlanPdf({
      planName: "Silový základ — 4-týždňový plán pre začiatočníčku Ľubicu so šťastím a žiarou ťažkých drepov",
      clientName: "Ľubica Šťastná",
      days: [
        { name: "Deň 1 — Horná časť tela", exercises: [ex("Bench press s veľkou činkou na rovnej lavici s pauzou na hrudi"), ex("Príťahy")] },
        { name: "Deň 2 — Core", exercises: [] },
        { name: "Deň 3 — Full body", exercises: Array.from({ length: 40 }, (_, i) => ex(`Cvik ${i + 1} — ťahy, drepy, výpady`, 3, 75)) },
      ],
    });
    expect(await pageCount(bytes)).toBeGreaterThanOrEqual(2);
  });

  test("jedálniček: makro cieľ, dni s jedlami, prázdny deň, nákupný zoznam", async () => {
    const day = (name: string) => ({
      name,
      meals: [meal("Ovsené vločky", "ranajky", 80), meal("Kuracie prsia", "obed", 180), meal("Ryža", "obed", 200), meal("Losos", "vecera", 150)],
    });
    const bytes = await generateMealPlanPdf({
      planName: "Udržanie 2700 kcal — jeseň",
      clientName: "Ján Novák",
      goal: { caloriesTarget: 2700, proteinG: 160, carbsG: 330, fatG: 80 },
      days: [day("Pondelok"), { name: "Streda — voľný deň", meals: [] }, day("Štvrtok"), day("Piatok"), day("Sobota")],
    });
    expect(await pageCount(bytes)).toBeGreaterThanOrEqual(2);
  });

  test("nákupný zoznam zlúči rovnakú potravinu naprieč dňami (bez ohľadu na veľkosť písmen)", () => {
    const list = buildShoppingList([
      { name: "Po", meals: [meal("Ryža", "obed", 200), meal("Losos", "vecera", 150)] },
      { name: "Ut", meals: [meal(" ryža ", "obed", 100), meal("", "obed", 50)] },
    ]);
    expect(list).toEqual([
      { name: "Losos", grams: 150 },
      { name: "Ryža", grams: 300 },
    ]);
  });

  test("progres: dlaždice adherencie, váha, silový progres; bez makro cieľa", async () => {
    const iso = (n: number) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
    const bytes = await generateProgressPdf({
      clientName: "Ján Novák",
      trainingAdherence: { window30: { pct: 73, trainedDays: 22, totalDays: 30 }, window90: { pct: 68, trainedDays: 61, totalDays: 90 } } as never,
      nutritionAdherence: { hasGoal: false } as never,
      bodyMetrics: Array.from({ length: 30 }, (_, i) => ({ measuredOn: iso(90 - i * 3), weightKg: 88 - i * 0.3 })) as never,
      strengthNames: ["Drep", "Bench press"],
      strengthByExercise: {
        Drep: [30, 15, 2].map((d, i) => ({ date: iso(d), bestWeightKg: 80 + i * 5, reps: 6 })),
        "Bench press": [20, 5].map((d, i) => ({ date: iso(d), bestWeightKg: 60 + i * 5, reps: 5 })),
      } as never,
    });
    expect(await pageCount(bytes)).toBeGreaterThanOrEqual(1);
  });
});

try {
  process.loadEnvFile(".env.local");
} catch {
  /* bez .env.local sa reálna časť preskočí */
}
const env = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  anon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  trainerEmail: process.env.E2E_TRAINER_EMAIL,
  trainerPassword: process.env.E2E_TRAINER_PASSWORD,
  clientEmail: process.env.E2E_CLIENT_EMAIL,
  clientPassword: process.env.E2E_CLIENT_PASSWORD,
};
const hasEnv = Object.values(env).every(Boolean);

test.describe("PDF exporty — stiahnutie cez API (reálna DB)", () => {
  test.skip(!hasEnv, "Chýbajú E2E_* údaje QA účtov alebo Supabase env.");

  test("plán, jedálniček aj progres sa stiahnu ako platné PDF", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Zápis do DB len raz (desktop).");
    test.setTimeout(90_000);
    const opts = { auth: { persistSession: false, autoRefreshToken: false } };
    const trainer: SupabaseClient = createClient(env.url!, env.anon!, opts);
    const { data: auth } = await trainer.auth.signInWithPassword({ email: env.trainerEmail!, password: env.trainerPassword! });
    const client = createClient(env.url!, env.anon!, opts);
    const { data: cAuth } = await client.auth.signInWithPassword({ email: env.clientEmail!, password: env.clientPassword! });
    const { data: row } = await client.from("clients").select("id").eq("user_id", cAuth.user!.id).limit(1).single();
    const stamp = Date.now().toString().slice(-6);

    const { data: plan } = await trainer
      .from("workout_plans")
      .insert({ client_id: row!.id, trainer_id: auth.user!.id, name: `E2E PDF plán ${stamp}`, published: false })
      .select("id")
      .single();
    const { data: mealPlan } = await trainer
      .from("meal_plans")
      .insert({ client_id: row!.id, trainer_id: auth.user!.id, name: `E2E PDF jedálniček ${stamp}`, published: false })
      .select("id")
      .single();
    try {
      await trainer.from("workout_days").insert({
        plan_id: plan!.id,
        day_number: 1,
        name: "Deň 1 — Ťahy",
        exercises: [{ entry_id: crypto.randomUUID(), exercise_id: null, exercise_name: "Príťahy", sets: 4, reps: "8", load_kg: null, tempo: null, rest_seconds: 90 }],
      });
      await trainer.from("meal_days").insert({
        plan_id: mealPlan!.id,
        day_number: 1,
        name: "Pondelok",
        meals: [{ entry_id: crypto.randomUUID(), food_id: crypto.randomUUID(), ...meal("Ovsené vločky", "ranajky", 80) }],
      });

      await page.goto("/prihlasenie");
      await page.locator("#login-email").fill(env.trainerEmail!);
      await page.locator("#login-password").fill(env.trainerPassword!);
      await page.getByRole("button", { name: "Prihlásiť sa" }).click();
      await page.waitForURL(/\/dashboard/, { timeout: 30_000 });

      for (const url of [`/api/export/plan/${plan!.id}/pdf`, `/api/export/meal-plan/${mealPlan!.id}/pdf`, `/api/export/progress/${row!.id}/pdf`]) {
        const res = await page.request.get(url);
        expect(res.status(), url).toBe(200);
        expect(res.headers()["content-type"], url).toContain("application/pdf");
        expect(await pageCount(await res.body()), url).toBeGreaterThanOrEqual(1);
      }
    } finally {
      await trainer.from("workout_plans").delete().eq("id", plan!.id);
      await trainer.from("meal_plans").delete().eq("id", mealPlan!.id);
    }
  });
});
