import { test, expect } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
// súhlas s aktuálnymi podmienkami (0063) — inak dočasný účet skončí na bráne /prihlasenie/suhlas
import { TERMS_VERSION } from "../lib/legal/terms";

/**
 * Tréner si zmaže účet (Nastavenia → „Zmazanie účtu“, migrácia 0062):
 *  - žiadosť → 30-dňová lehota, klient dostane upozornenie v chate, dá sa zrušiť,
 *  - po lehote (tu hneď cez purge_trainer, service role): účet trénera preč, klient s
 *    vlastným účtom odpojený so zverejneným plánom aj jedálničkom (teraz jeho vlastné),
 *    koncept, správy a klient bez účtu zmazané.
 * Dočasný tréner aj klient (admin API) — na konci sa zmažú. Bez migrácie 0062 sa preskočí.
 */

try {
  process.loadEnvFile(".env.local");
} catch {
  /* bez .env.local sa test preskočí */
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
const AUTH = { auth: { persistSession: false, autoRefreshToken: false } };
const PASSWORD = "E2e#Zmazanie2026!";

test.describe("zmazanie účtu trénera (reálna DB)", () => {
  test.skip(!url || !anon || !serviceRole, "chýbajú Supabase env premenné");
  test.describe.configure({ mode: "serial" });

  let admin: SupabaseClient;
  let trainerApi: SupabaseClient;
  let migrated = false;
  const stamp = Date.now().toString().slice(-7);
  const trainerEmail = `e2e.zmazanie.trener.${stamp}@fitpilot-testaccount.com`;
  const clientEmail = `e2e.zmazanie.klient.${stamp}@fitpilot-testaccount.com`;
  let trainerId = "";
  let clientUserId = "";
  let clientRowId = "";
  let manualClientId = "";
  const ids = { published: "", draft: "", meal: "" };

  test.beforeAll(async () => {
    admin = createClient(url!, serviceRole!, AUTH);
    const probe = await createClient(url!, anon!, AUTH).rpc("request_trainer_deletion");
    migrated = !(probe.error && /Could not find|does not exist|PGRST202/i.test(`${probe.error.message} ${probe.error.code}`));
    if (!migrated) return;

    const t = await admin.auth.admin.createUser({
      email: trainerEmail,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: "E2E Zmazaný Tréner", role: "trainer", terms_version: TERMS_VERSION },
    });
    const c = await admin.auth.admin.createUser({
      email: clientEmail,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: "E2E Klient Zmazania", role: "client", terms_version: TERMS_VERSION },
    });
    if (t.error || c.error) throw new Error(`createUser: ${t.error?.message ?? c.error?.message}`);
    trainerId = t.data.user!.id;
    clientUserId = c.data.user!.id;

    trainerApi = createClient(url!, anon!, AUTH);
    await trainerApi.auth.signInWithPassword({ email: trainerEmail, password: PASSWORD });

    // klient s účtom: tréner ho pridá jeho FitPilot kódom
    const { data: row } = await admin.from("clients").select("id, invite_code").eq("user_id", clientUserId).single();
    clientRowId = row!.id;
    const added = await trainerApi.rpc("add_client_by_code", { p_code: row!.invite_code });
    expect(added.error).toBeNull();

    // klient bez účtu
    const manual = await trainerApi
      .from("clients")
      .insert({ trainer_id: trainerId, full_name: `E2E bez účtu ${stamp}` })
      .select("id")
      .single();
    expect(manual.error).toBeNull();
    manualClientId = manual.data!.id;

    // zverejnený plán + koncept + zverejnený jedálniček + správa
    const plan = async (name: string, published: boolean) =>
      (await trainerApi.from("workout_plans").insert({ client_id: clientRowId, trainer_id: trainerId, name, published }).select("id").single())
        .data!.id as string;
    ids.published = await plan(`E2E zverejnený ${stamp}`, true);
    ids.draft = await plan(`E2E koncept ${stamp}`, false);
    ids.meal = (
      await trainerApi
        .from("meal_plans")
        .insert({ client_id: clientRowId, trainer_id: trainerId, name: `E2E jedálniček ${stamp}`, published: true })
        .select("id")
        .single()
    ).data!.id;
    await trainerApi.from("messages").insert({ client_id: clientRowId, sender: "trainer", sender_id: trainerId, body: `E2E správa ${stamp}` });
  });

  test.afterAll(async () => {
    if (!migrated) return;
    // ak test spadol pred zmazaním trénera
    if (trainerId) await admin.auth.admin.deleteUser(trainerId).catch(() => {});
    await admin.from("workout_plans").delete().in("id", [ids.published, ids.draft].filter(Boolean));
    await admin.from("meal_plans").delete().eq("id", ids.meal);
    await admin.from("clients").delete().in("id", [clientRowId, manualClientId].filter(Boolean));
    if (clientUserId) await admin.auth.admin.deleteUser(clientUserId).catch(() => {});
  });

  test("žiadosť v Nastaveniach, upozornenie klientovi, zrušenie", async ({ page }, testInfo) => {
    test.skip(!migrated, "migrácia 0062 (zmazanie účtu trénera) na tejto DB ešte nebežala");
    test.skip(testInfo.project.name !== "desktop", "zápis do DB len raz (desktop)");
    await page.goto("/prihlasenie");
    await page.locator("#login-email").fill(trainerEmail);
    await page.locator("#login-password").fill(PASSWORD);
    await page.getByRole("button", { name: "Prihlásiť sa" }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
    await page.goto("/dashboard/nastavenia");

    const card = page.getByTestId("trainer-deletion");
    // úplne dole v Nastaveniach
    expect(await card.evaluate((el) => el.nextElementSibling === null)).toBe(true);
    await card.getByRole("button", { name: "Požiadať o zmazanie účtu" }).click();
    await expect(card.getByText(/Naozaj chceš zmazať svoj účet/)).toBeVisible();
    await card.getByRole("button", { name: "Áno, zmazať účet" }).click();
    await expect(card.getByRole("status")).toContainText("Účet sa natrvalo zmaže");
    await expect(card.getByRole("status")).toContainText("30 dní");

    const systemMsgs = async () =>
      ((await admin.from("messages").select("body").eq("client_id", clientRowId).eq("sender", "system")).data ?? []).map((m) => m.body);
    await expect.poll(systemMsgs).toContain(
      "E2E Zmazaný Tréner si o 30 dní zmaže účet vo FitPilot. Tréningové plány a jedálničky od neho ti ostanú, správy s ním sa zmažú.",
    );

    await card.getByRole("button", { name: "Zrušiť zmazanie" }).click();
    await expect(card.getByRole("button", { name: "Požiadať o zmazanie účtu" })).toBeVisible();
    await expect.poll(systemMsgs).toContain("E2E Zmazaný Tréner zrušil/-a zmazanie účtu — spolupráca pokračuje.");
    const { data: prof } = await admin.from("profiles").select("deletion_requested_at").eq("id", trainerId).single();
    expect(prof!.deletion_requested_at).toBeNull();
  });

  test("po lehote: účet preč, klientovi ostanú zverejnené plány, koncept a správy zmiznú", async ({}, testInfo) => {
    test.skip(!migrated, "migrácia 0062 (zmazanie účtu trénera) na tejto DB ešte nebežala");
    test.skip(testInfo.project.name !== "desktop", "zápis do DB len raz (desktop)");
    const req = await trainerApi.rpc("request_trainer_deletion");
    expect(req.error).toBeNull();
    const purge = await admin.rpc("purge_trainer", { p_trainer: trainerId });
    expect(purge.error).toBeNull();

    // účet trénera
    const { data: user } = await admin.auth.admin.getUserById(trainerId);
    expect(user?.user ?? null).toBeNull();
    expect((await admin.from("profiles").select("id").eq("id", trainerId)).data).toEqual([]);
    trainerId = "";

    // klient s účtom: odpojený, zverejnený plán a jedálniček sú jeho
    const { data: client } = await admin.from("clients").select("trainer_id, user_id").eq("id", clientRowId).single();
    expect(client).toEqual({ trainer_id: null, user_id: clientUserId });
    const { data: plans } = await admin.from("workout_plans").select("id, trainer_id").eq("client_id", clientRowId);
    expect(plans).toEqual([{ id: ids.published, trainer_id: null }]); // koncept zmizol
    const { data: meals } = await admin.from("meal_plans").select("id, trainer_id").eq("client_id", clientRowId);
    expect(meals).toEqual([{ id: ids.meal, trainer_id: null }]);
    expect((await admin.from("messages").select("id").eq("client_id", clientRowId)).data).toEqual([]);

    // klient bez účtu zmazaný
    expect((await admin.from("clients").select("id").eq("id", manualClientId)).data).toEqual([]);

    // klient vidí plán v portáli ako vlastný
    const clientApi = createClient(url!, anon!, AUTH);
    await clientApi.auth.signInWithPassword({ email: clientEmail, password: PASSWORD });
    const own = await clientApi.from("workout_plans").select("id, trainer_id").eq("id", ids.published).single();
    expect(own.data).toEqual({ id: ids.published, trainer_id: null });
  });
});
