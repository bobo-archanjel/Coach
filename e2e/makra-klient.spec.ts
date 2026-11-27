import { test, expect } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { sessionLogin, userIdByEmail } from "./helpers/sessionLogin";
import {
  applyManualMacros,
  calculateNutrition,
  caloriesFromMacros,
  validateManualMacros,
  validateNutritionInput,
} from "../lib/nutrition";
import { isMissingMacroTable, pickMacroTarget } from "../lib/macroTarget";

/**
 * Klient si nastaví vlastný makro cieľ (migrácia 0089, app/portal/strava/MacroGoalDialog.tsx):
 *  - čisté testy zdieľaných pomocníkov (validácia vstupov/ručných makier, výber efektívneho cieľa),
 *  - DEV náhľady (?preview=ok|macros-own|macros-self|empty): tlačidlo „Nastaviť makrá“, okno, živý výpočet,
 *    ručná úprava, prepínač Moje makrá / Makrá od trénera,
 *  - reálna DB (QA klient + tréner, len desktop): preskočí sa, kým nie je spustená migrácia 0089.
 */
try {
  process.loadEnvFile(".env.local");
} catch {
  /* bez .env.local sa test s DB preskočí */
}

const row = (kcal: number, p: number, c: number, f: number) => ({ bmr: 1700, tdee: 2400, calories_target: kcal, protein_g: p, carbs_g: c, fat_g: f });

test.describe("zdieľané pomocníky (čisté)", () => {
  const ok = { sex: "muz", age: 30, weightKg: 80, heightCm: 180, activityLevel: "stredna", goal: "udrzanie" };

  test("validateNutritionInput: platné vstupy a hranice", () => {
    expect(validateNutritionInput(ok)).toEqual({ ok: true, value: ok });
    expect(validateNutritionInput({ ...ok, age: "30" }).ok).toBe(true); // formulár posiela text
    expect(validateNutritionInput({ ...ok, sex: "x" })).toEqual({ ok: false, error: "meals.chooseSex" });
    expect(validateNutritionInput({ ...ok, age: 9 })).toEqual({ ok: false, error: "meals.invalidAge" });
    expect(validateNutritionInput({ ...ok, age: 120 })).toEqual({ ok: false, error: "meals.invalidAge" });
    expect(validateNutritionInput({ ...ok, age: 30.5 })).toEqual({ ok: false, error: "meals.invalidAge" });
    expect(validateNutritionInput({ ...ok, weightKg: 19 })).toEqual({ ok: false, error: "meals.invalidWeight" });
    expect(validateNutritionInput({ ...ok, weightKg: 501 })).toEqual({ ok: false, error: "meals.invalidWeight" });
    expect(validateNutritionInput({ ...ok, heightCm: 79 })).toEqual({ ok: false, error: "meals.invalidHeight" });
    expect(validateNutritionInput({ ...ok, heightCm: 301 })).toEqual({ ok: false, error: "meals.invalidHeight" });
    expect(validateNutritionInput({ ...ok, activityLevel: "x" })).toEqual({ ok: false, error: "meals.chooseActivity" });
    expect(validateNutritionInput({ ...ok, goal: undefined })).toEqual({ ok: false, error: "plans.chooseGoal" });
    expect(validateNutritionInput({}).ok).toBe(false);
  });

  test("validateManualMacros: celé gramy, rozsahy a kcal 800–8000", () => {
    const good = validateManualMacros({ proteinG: 150, carbsG: 250, fatG: 70 });
    expect(good).toEqual({ ok: true, value: { macros: { proteinG: 150, carbsG: 250, fatG: 70 }, kcal: 150 * 4 + 250 * 4 + 70 * 9 } });
    expect(validateManualMacros({ proteinG: 150.5, carbsG: 250, fatG: 70 })).toEqual({ ok: false, error: "meals.invalidMacros" });
    expect(validateManualMacros({ proteinG: 501, carbsG: 250, fatG: 70 })).toEqual({ ok: false, error: "meals.invalidMacros" });
    expect(validateManualMacros({ proteinG: 150, carbsG: 1501, fatG: 70 })).toEqual({ ok: false, error: "meals.invalidMacros" });
    expect(validateManualMacros({ proteinG: 150, carbsG: 250, fatG: 401 })).toEqual({ ok: false, error: "meals.invalidMacros" });
    expect(validateManualMacros({ proteinG: NaN, carbsG: 250, fatG: 70 })).toEqual({ ok: false, error: "meals.invalidMacros" });
    expect(validateManualMacros(null)).toEqual({ ok: false, error: "meals.invalidMacros" });
    expect(validateManualMacros({ proteinG: 50, carbsG: 50, fatG: 20 })).toEqual({ ok: false, error: "meals.macroKcalRange" });
    expect(validateManualMacros({ proteinG: 500, carbsG: 1500, fatG: 400 })).toEqual({ ok: false, error: "meals.macroKcalRange" });
    expect(caloriesFromMacros({ proteinG: 10, carbsG: 10, fatG: 10 })).toBe(170);
  });

  test("applyManualMacros: ručné makrá = súčet kcal, rovnaké ako výpočet = výpočet", () => {
    const auto = calculateNutrition({ sex: "muz", age: 30, weightKg: 80, heightCm: 180, activityLevel: "stredna", goal: "udrzanie" });
    expect(applyManualMacros(auto, null)).toEqual(auto);
    const same = validateManualMacros({ proteinG: auto.proteinG, carbsG: auto.carbsG, fatG: auto.fatG });
    expect(same.ok && applyManualMacros(auto, same.value)).toEqual(auto);
    const manual = validateManualMacros({ proteinG: 200, carbsG: 300, fatG: 80 });
    if (!manual.ok) throw new Error("manual");
    expect(applyManualMacros(auto, manual.value)).toEqual({ bmr: auto.bmr, tdee: auto.tdee, caloriesTarget: 200 * 4 + 300 * 4 + 80 * 9, proteinG: 200, carbsG: 300, fatG: 80 });
  });

  test("pickMacroTarget: aktívne vlastné > trénerove; neaktívne/žiadne → trénerove; nič → null", () => {
    const trainer = row(2300, 150, 260, 70);
    const own = { ...row(1600, 128, 160, 58), active: true };
    expect(pickMacroTarget(own, trainer)).toMatchObject({ source: "client", caloriesTarget: 1600, proteinG: 128 });
    expect(pickMacroTarget({ ...own, active: false }, trainer)).toMatchObject({ source: "trainer", caloriesTarget: 2300, proteinG: 150 });
    expect(pickMacroTarget(null, trainer)).toMatchObject({ source: "trainer" });
    expect(pickMacroTarget(undefined, trainer)).toMatchObject({ source: "trainer" });
    expect(pickMacroTarget(own, null)).toMatchObject({ source: "client" });
    expect(pickMacroTarget({ ...own, active: false }, null)).toBeNull();
    expect(pickMacroTarget(null, null)).toBeNull();
    // numeric z PostgREST môže prísť ako text
    expect(pickMacroTarget(null, { ...trainer, protein_g: "150.5" })?.proteinG).toBe(150.5);
  });

  test("isMissingMacroTable: chýbajúca tabuľka (PGRST205 / 42P01)", () => {
    expect(isMissingMacroTable({ code: "PGRST205" })).toBe(true);
    expect(isMissingMacroTable({ code: "42P01" })).toBe(true);
    expect(isMissingMacroTable({ message: "Could not find the table 'public.client_macro_goals' in the schema cache" })).toBe(true);
    expect(isMissingMacroTable({ code: "42501", message: "permission denied" })).toBe(false);
    expect(isMissingMacroTable(null)).toBe(false);
  });
});

test.describe("DEV náhľad — Nastaviť makrá", () => {
  test("od trénera: štítok zdroja, okno s prepínačom a živým výpočtom", async ({ page }) => {
    await page.goto("/portal/strava?preview=ok");
    await expect(page.getByTestId("macro-source")).toHaveText("Od trénera");
    await page.getByTestId("macro-set-btn").click();
    const dlg = page.getByRole("dialog", { name: "Nastaviť makrá" });
    await expect(dlg).toBeVisible();
    // prepínač: vlastné ešte nie sú, trénerove áno
    await expect(dlg.getByTestId("macro-choice-own")).toContainText("Zatiaľ nenastavené");
    await expect(dlg.getByTestId("macro-choice-trainer")).toContainText("2300 kcal");
    // živý výpočet zo vstupov (prefill z trénerových vstupov: muž 34 / 82 / 180, stredná, udržanie)
    const exp = calculateNutrition({ sex: "muz", age: 34, weightKg: 82, heightCm: 180, activityLevel: "stredna", goal: "udrzanie" });
    await expect(dlg.getByTestId("macro-dialog-kcal")).toContainText(String(exp.caloriesTarget));
    await dlg.getByLabel("Váha (kg)").fill("90");
    const exp2 = calculateNutrition({ sex: "muz", age: 34, weightKg: 90, heightCm: 180, activityLevel: "stredna", goal: "udrzanie" });
    await expect(dlg.getByTestId("macro-dialog-kcal")).toContainText(String(exp2.caloriesTarget));
    // voľba trénera skryje formulár
    await dlg.getByTestId("macro-choice-trainer").click();
    await expect(dlg.getByLabel("Váha (kg)")).toBeHidden();
    await expect(dlg.getByTestId("macro-dialog-save")).toHaveText("Použiť makrá od trénera");
    await page.keyboard.press("Escape");
    await expect(dlg).toBeHidden();
  });

  test("ručná úprava: kcal = súčet makier, hint s výpočtom", async ({ page }) => {
    await page.goto("/portal/strava?preview=ok");
    await page.getByTestId("macro-set-btn").click();
    const dlg = page.getByRole("dialog", { name: "Nastaviť makrá" });
    await dlg.getByTestId("macro-dialog-edit").click();
    await expect(dlg.getByTestId("macro-dialog-manual")).toBeVisible();
    await dlg.getByLabel("Bielkoviny v gramoch").fill("200");
    await dlg.getByLabel("Sacharidy v gramoch").fill("300");
    await dlg.getByLabel("Tuky v gramoch").fill("80");
    await expect(dlg.getByTestId("macro-dialog-kcal")).toContainText(String(200 * 4 + 300 * 4 + 80 * 9));
    await expect(dlg.getByText(/výpočet: \d+ g/).first()).toBeVisible();
    await dlg.getByTestId("macro-dialog-edit").click(); // Späť na výpočet
    await expect(dlg.getByTestId("macro-dialog-manual")).toBeHidden();
  });

  test("vlastné makrá aktívne: štítok Vlastné makrá a prefill z vlastných vstupov", async ({ page }) => {
    await page.goto("/portal/strava?preview=macros-own");
    await expect(page.getByTestId("macro-source")).toHaveText("Vlastné makrá");
    await expect(page.getByTestId("macro-source")).toBeVisible();
    const own = calculateNutrition({ sex: "zena", age: 31, weightKg: 64, heightCm: 168, activityLevel: "lahka", goal: "chudnutie" });
    await page.getByTestId("macro-set-btn").click();
    const dlg = page.getByRole("dialog", { name: "Nastaviť makrá" });
    await expect(dlg.getByLabel("Váha (kg)")).toHaveValue("64");
    await expect(dlg.getByTestId("macro-choice-own")).toContainText(`${own.caloriesTarget} kcal`);
    await expect(dlg.getByTestId("macro-choice-trainer")).toContainText("2300 kcal");
  });

  test("bez trénera a bez makier: výzva a okno bez prepínača", async ({ page }) => {
    await page.goto("/portal/strava?preview=empty");
    await expect(page.getByText("Zatiaľ nemáš makro cieľ — nastav si ho.")).toBeVisible();
    await expect(page.getByTestId("macro-source")).toHaveCount(0);
    await page.getByTestId("macro-set-btn").click();
    const dlg = page.getByRole("dialog", { name: "Nastaviť makrá" });
    await expect(dlg.getByTestId("macro-choice-trainer")).toHaveCount(0);
    await expect(dlg.getByTestId("macro-dialog-save")).toBeDisabled(); // bez vstupov nie je čo ukladať
    await dlg.getByLabel("Vek").fill("30");
    await dlg.getByLabel("Váha (kg)").fill("70");
    await dlg.getByLabel("Výška (cm)").fill("175");
    await expect(dlg.getByTestId("macro-dialog-save")).toBeEnabled();
  });
});

/* ---------- reálna DB: až po migrácii 0089 ---------- */
const env = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  serviceRole: process.env.SUPABASE_SERVICE_ROLE_KEY,
  trainerEmail: process.env.E2E_TRAINER_EMAIL,
  clientEmail: process.env.E2E_CLIENT_EMAIL,
};
const hasEnv = Object.values(env).every(Boolean);

test.describe("vlastné makrá klienta (reálna DB, po migrácii 0089)", () => {
  test.skip(!hasEnv, "Chýbajú E2E_* údaje alebo Supabase env (aj service role).");

  let admin: SupabaseClient;
  let clientId = "";
  test.afterAll(async () => {
    if (admin && clientId) await admin.from("client_macro_goals").delete().eq("client_id", clientId);
  });

  test("Nastaviť makrá → Vlastné makrá, trénerov odznak, prepnutie späť na trénerove", async ({ page, baseURL }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "zápis do DB len raz (desktop)");
    test.setTimeout(180_000);
    admin = createClient(env.url!, env.serviceRole!, { auth: { persistSession: false } });
    const probe = await admin.from("client_macro_goals").select("client_id").limit(1);
    test.skip(Boolean(probe.error), `Tabuľka client_macro_goals ešte neexistuje (migrácia 0089): ${probe.error?.message}`);

    const trainerId = await userIdByEmail(env.trainerEmail!);
    const clientUserId = await userIdByEmail(env.clientEmail!);
    const { data: c } = await admin.from("clients").select("id").eq("user_id", clientUserId).eq("trainer_id", trainerId).single();
    clientId = c!.id as string;
    await admin.from("client_macro_goals").delete().eq("client_id", clientId);

    // klient: Nastaviť makrá
    await sessionLogin(page, env.clientEmail!, baseURL!);
    await page.goto("/portal/strava");
    await page.getByTestId("macro-set-btn").click();
    const dlg = page.getByRole("dialog", { name: "Nastaviť makrá" });
    await dlg.getByTestId("macro-choice-own").click().catch(() => {}); // prepínač je len pri trénerových makrách
    await dlg.getByLabel("Vek").fill("31");
    await dlg.getByLabel("Váha (kg)").fill("64");
    await dlg.getByLabel("Výška (cm)").fill("168");
    await dlg.getByLabel("Pohlavie").selectOption("zena");
    await dlg.getByLabel("Aktivita").selectOption("lahka");
    await dlg.getByLabel("Cieľ").selectOption("chudnutie");
    await dlg.getByTestId("macro-dialog-save").click();
    await expect(dlg).toBeHidden({ timeout: 20_000 });

    const exp = calculateNutrition({ sex: "zena", age: 31, weightKg: 64, heightCm: 168, activityLevel: "lahka", goal: "chudnutie" });
    await expect(page.getByTestId("macro-source")).toHaveText("Vlastné makrá");
    const { data: saved } = await admin.from("client_macro_goals").select("*").eq("client_id", clientId).single();
    expect(saved).toMatchObject({ active: true, calories_target: exp.caloriesTarget, protein_g: exp.proteinG });

    // tréner vidí odznak
    await page.context().clearCookies();
    await sessionLogin(page, env.trainerEmail!, baseURL!);
    await page.goto(`/dashboard/klienti/${clientId}?sekcia=jedalnicky`);
    await expect(page.getByTestId("client-own-macros")).toContainText("Klient používa vlastné makrá");
    await expect(page.getByTestId("client-own-macros")).toContainText(String(exp.caloriesTarget));

    // klient: prepnutie späť na trénerove (ak ich má), vlastné ostanú uložené
    const { data: tp } = await admin.from("nutrition_profiles").select("client_id").eq("client_id", clientId).maybeSingle();
    if (tp) {
      await page.context().clearCookies();
      await sessionLogin(page, env.clientEmail!, baseURL!);
      await page.goto("/portal/strava");
      await page.getByTestId("macro-set-btn").click();
      await dlg.getByTestId("macro-choice-trainer").click();
      await dlg.getByTestId("macro-dialog-save").click();
      await expect(dlg).toBeHidden({ timeout: 20_000 });
      await expect(page.getByTestId("macro-source")).toHaveText("Od trénera");
      const { data: after } = await admin.from("client_macro_goals").select("active, calories_target").eq("client_id", clientId).single();
      expect(after).toMatchObject({ active: false, calories_target: exp.caloriesTarget });
    }
  });
});
