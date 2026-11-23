import { test, expect } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { sessionLogin } from "./helpers/sessionLogin";

/**
 * Úpravy zverejneného plánu trénera (migrácia 0071, feature/nahlad-analytika): prvá úprava
 * vytvorí skrytú kópiu — klient ďalej vidí pôvodný plán, kým tréner nedá „Uložiť úpravy“;
 * „Zahodiť úpravy“ kópiu zmaže. Odcvičený deň ostane nedotknutý, id dní a cvikov ostanú.
 * Reálna DB na QA účtoch (plán aj zápis po sebe zmaže).
 *   E2E_TRAINER_EMAIL, E2E_TRAINER_PASSWORD, E2E_CLIENT_EMAIL
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
  trainerPassword: process.env.E2E_TRAINER_PASSWORD,
  clientEmail: process.env.E2E_CLIENT_EMAIL,
};
const hasEnv = Object.values(env).every(Boolean);
const AUTH = { auth: { persistSession: false, autoRefreshToken: false } };

test.describe("úpravy zverejneného plánu — reálna DB", () => {
  test.skip(!hasEnv, "Chýbajú E2E_* údaje alebo Supabase env (aj service role).");

  let admin: SupabaseClient;
  let planId = "";
  test.afterAll(async () => {
    if (!admin || !planId) return;
    const { data: days } = await admin.from("workout_days").select("id").eq("plan_id", planId);
    const ids = (days ?? []).map((d) => d.id as string);
    if (ids.length) await admin.from("workout_logs").delete().in("workout_day_id", ids);
    await admin.from("workout_plans").delete().eq("id", planId); // kópia úprav ide kaskádou
  });

  test("zmeny sa klientovi ukážu až po Uložiť úpravy, Zahodiť ich zruší", async ({ page, baseURL }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "zápis do DB len raz (desktop)");
    test.setTimeout(150_000);
    admin = createClient(env.url!, env.serviceRole!, AUTH);
    // 0071 musí byť spustená
    const probe = await admin.from("workout_plans").select("edit_of").limit(1);
    test.skip(Boolean(probe.error), "Migrácia 0071 nie je spustená.");

    const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const trainer = users.users.find((u) => u.email === env.trainerEmail)!;
    const clientUser = users.users.find((u) => u.email === env.clientEmail)!;
    const { data: client } = await admin.from("clients").select("id").eq("user_id", clientUser.id).limit(1).single();
    const stamp = Date.now();
    const name = `E2E Úpravy plánu ${stamp}`;
    const ex = (id: string, n: string) => ({ entry_id: id, exercise_id: null, exercise_name: n, sets: 3, reps: "10", load_kg: 40, tempo: null, rest_seconds: 60 });
    const { data: plan } = await admin
      .from("workout_plans")
      .insert({ client_id: client!.id, trainer_id: trainer.id, name, published: true })
      .select("id")
      .single();
    planId = plan!.id;
    const { data: days } = await admin
      .from("workout_days")
      .insert([
        { plan_id: planId, day_number: 1, name: "E2E Deň A", exercises: [ex(`a${stamp}`, "E2E Tlak")] },
        { plan_id: planId, day_number: 2, name: "E2E Deň B", exercises: [ex(`b${stamp}`, "E2E Drep")] },
      ])
      .select("id, name");
    const dayA = days!.find((d) => d.name === "E2E Deň A")!.id as string;
    const dayB = days!.find((d) => d.name === "E2E Deň B")!.id as string;
    // deň A klient odcvičil — ostáva zamknutý
    await admin.from("workout_logs").insert({
      client_id: client!.id,
      workout_day_id: dayA,
      status: "completed",
      plan_snapshot: { plan_id: planId, day_id: dayA, exercises: [ex(`a${stamp}`, "E2E Tlak")] },
      entries: [{ entryId: `a${stamp}`, name: "E2E Tlak", sets: [{ reps: 10, weight: 40 }] }],
    });

    const liveExercises = async () =>
      ((await admin.from("workout_days").select("exercises").eq("id", dayB).single()).data!.exercises as { entry_id: string; exercise_name: string }[]);
    const draftCount = async () => (await admin.from("workout_plans").select("id", { count: "exact", head: true }).eq("edit_of", planId)).count ?? 0;

    // prihlásenie bez formulára (CAPTCHA v Supabase) — e2e/helpers/sessionLogin.ts
    await sessionLogin(page, env.trainerEmail!, baseURL!);
    await page.goto(`/dashboard/treningy/${planId}`);
    await expect(page.getByTestId("pending-badge")).toHaveCount(0);

    const addCustom = async (exName: string) => {
      await page.getByRole("button", { name: /E2E Deň B/ }).click();
      await page.getByPlaceholder("Nový vlastný cvik").fill(exName);
      await page.getByRole("button", { name: "+ Pridať do tréningu" }).click();
      await expect(page.getByText(exName).first()).toBeVisible({ timeout: 15_000 });
    };

    // 1. úprava → kópia, klient (živý deň) nič nevidí; vybraný ostáva deň B
    await addCustom("E2E Nový cvik");
    await expect(page.getByTestId("pending-badge")).toHaveText("Neuložené úpravy");
    await expect(page.getByRole("button", { name: /E2E Deň B/ })).toHaveAttribute("aria-current", "true");
    expect(await draftCount()).toBe(1);
    expect((await liveExercises()).map((e) => e.exercise_name)).toEqual(["E2E Drep"]);

    // kópia sa neukáže ako ďalší plán v detaile klienta
    await page.goto(`/dashboard/klienti/${client!.id}`);
    await expect(page.locator(`a[href^="/dashboard/treningy/"]`).filter({ hasText: name })).toHaveCount(1);
    await page.goto(`/dashboard/treningy/${planId}`);

    // 2. Zahodiť úpravy → kópia preč, plán bez zmeny
    await page.getByRole("button", { name: "Zahodiť úpravy" }).click();
    await page.getByRole("button", { name: "Áno, zahodiť" }).click();
    await expect(page.getByTestId("pending-badge")).toHaveCount(0, { timeout: 15_000 });
    await expect(page.getByText("E2E Nový cvik")).toHaveCount(0);
    expect(await draftCount()).toBe(0);
    expect((await liveExercises()).map((e) => e.exercise_name)).toEqual(["E2E Drep"]);

    // 3. znova uprav + Uložiť úpravy → živý plán zmenený na mieste (rovnaké id dňa aj cviku)
    await addCustom("E2E Ďalší cvik");
    await expect(page.getByTestId("pending-badge")).toBeVisible();
    await page.getByRole("button", { name: "Uložiť úpravy" }).click();
    await expect(page.getByTestId("pending-badge")).toHaveCount(0, { timeout: 15_000 });
    expect(await draftCount()).toBe(0);
    const saved = await liveExercises();
    expect(saved.map((e) => e.exercise_name)).toEqual(["E2E Drep", "E2E Ďalší cvik"]);
    expect(saved[0].entry_id).toBe(`b${stamp}`);
    const { data: after } = await admin.from("workout_days").select("id, exercises").eq("plan_id", planId).order("day_number");
    expect(after!.map((d) => d.id)).toEqual([dayA, dayB]);
    expect((after![0].exercises as { exercise_name: string }[]).map((e) => e.exercise_name)).toEqual(["E2E Tlak"]);
  });
});
