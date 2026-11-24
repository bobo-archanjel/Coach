import { test, expect } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { calculateNutrition } from "../lib/nutrition";
import { sessionLogin, userIdByEmail } from "./helpers/sessionLogin";

/**
 * Makro cieľ — tréner vie prepísať automatický výpočet (detail klienta → Makro cieľ):
 * „Upraviť hodnoty“ → bielkoviny / sacharidy / tuky v gramoch, kalorický cieľ = ich súčet,
 * štítok „Upravené ručne“, návrat k výpočtu uložením údajov a kontrola rozsahu.
 * Reálna DB (QA tréner a klient, prihlásenie bez formulára); pôvodný profil klienta sa vráti.
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

test.describe("makro cieľ — ručná úprava hodnôt (reálna DB)", () => {
  test.skip(!hasEnv, "Chýbajú E2E_* údaje alebo Supabase env (aj service role).");

  let admin: SupabaseClient;
  let clientId = "";
  let original: Record<string, unknown> | null = null;
  test.afterAll(async () => {
    if (!admin || !clientId) return;
    if (original) await admin.from("nutrition_profiles").upsert(original, { onConflict: "client_id" });
    else await admin.from("nutrition_profiles").delete().eq("client_id", clientId);
  });

  test("Upraviť hodnoty → Upravené ručne → Aktualizovať makro cieľ vráti výpočet", async ({ page, baseURL }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "zápis do DB len raz (desktop)");
    test.setTimeout(120_000);
    admin = createClient(env.url!, env.serviceRole!, { auth: { persistSession: false } });
    const trainerId = await userIdByEmail(env.trainerEmail!);
    const clientUserId = await userIdByEmail(env.clientEmail!);
    const { data: c } = await admin.from("clients").select("id").eq("user_id", clientUserId).eq("trainer_id", trainerId).single();
    clientId = c!.id as string;
    const { data: prev } = await admin.from("nutrition_profiles").select("*").eq("client_id", clientId).maybeSingle();
    original = prev ?? null;

    // známy profil s automatickým výpočtom
    const inputs = { sex: "muz", age: 30, weight_kg: 80, height_cm: 180, activity_level: "stredna", goal: "udrzanie" } as const;
    const auto = calculateNutrition({ sex: "muz", age: 30, weightKg: 80, heightCm: 180, activityLevel: "stredna", goal: "udrzanie" });
    await admin.from("nutrition_profiles").upsert(
      {
        client_id: clientId,
        trainer_id: trainerId,
        ...inputs,
        bmr: auto.bmr,
        tdee: auto.tdee,
        calories_target: auto.caloriesTarget,
        protein_g: auto.proteinG,
        carbs_g: auto.carbsG,
        fat_g: auto.fatG,
      },
      { onConflict: "client_id" },
    );

    await sessionLogin(page, env.trainerEmail!, baseURL!);
    await page.goto(`/dashboard/klienti/${clientId}?sekcia=jedalnicky`);
    const panel = page.getByRole("tabpanel", { name: "Makro cieľ" });
    await expect(panel.getByTestId("macro-manual")).toHaveCount(0);

    // ručná úprava — kalorický cieľ sa dopočíta zo súčtu makier
    await panel.getByRole("button", { name: "Upraviť hodnoty" }).click();
    const edit = panel.getByTestId("macro-edit");
    await expect(edit).toContainText(`výpočet: ${auto.proteinG} g`);
    await edit.getByLabel("Bielkoviny v gramoch").fill("150");
    await edit.getByLabel("Sacharidy v gramoch").fill("250");
    await edit.getByLabel("Tuky v gramoch").fill("70");
    await expect(edit.getByTestId("macro-edit-kcal")).toHaveText(/2\s?230 kcal\/deň — súčet makier/);

    // mimo rozsahu → chyba, nič sa neuloží
    await edit.getByLabel("Bielkoviny v gramoch").fill("600");
    await edit.getByRole("button", { name: "Uložiť hodnoty" }).click();
    await expect(edit.getByRole("alert")).toContainText("bielkoviny 0–500");
    await edit.getByLabel("Bielkoviny v gramoch").fill("150");

    await edit.getByRole("button", { name: "Uložiť hodnoty" }).click();
    await expect(panel.getByTestId("macro-manual")).toHaveText("Upravené ručne", { timeout: 15_000 });
    await expect(panel).toContainText("150 g");
    const { data: manual } = await admin.from("nutrition_profiles").select("protein_g, carbs_g, fat_g, calories_target").eq("client_id", clientId).single();
    expect(manual).toEqual({ protein_g: 150, carbs_g: 250, fat_g: 70, calories_target: 2230 });

    // zmena vstupných údajov upozorní, že ručné hodnoty nahradí výpočet
    await panel.getByLabel("Váha (kg)").fill("82");
    await expect(panel).toContainText("Makrá sú upravené ručne — uložením údajov sa nahradia automatickým výpočtom.");
    await panel.getByLabel("Váha (kg)").fill("80");

    // späť na automatický výpočet — uloženie vstupných údajov makrá prepočíta
    await expect(panel.getByRole("button", { name: "Obnoviť automatický výpočet" })).toHaveCount(0);
    await panel.getByRole("button", { name: "Aktualizovať makro cieľ" }).click();
    await expect(panel.getByTestId("macro-manual")).toHaveCount(0, { timeout: 15_000 });
    const { data: reset } = await admin.from("nutrition_profiles").select("protein_g, carbs_g, fat_g, calories_target").eq("client_id", clientId).single();
    expect(reset).toEqual({ protein_g: auto.proteinG, carbs_g: auto.carbsG, fat_g: auto.fatG, calories_target: auto.caloriesTarget });
  });
});
