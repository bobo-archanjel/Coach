import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { TERMS_VERSION } from "../lib/legal/terms";

/**
 * Tréner klienta s vlastným účtom nezmaže, len odstráni z portfólia (migrácia 0064):
 *  - Info → „Odstránenie z portfólia“ (nie „Požiadať o zmazanie klienta“),
 *  - po odstránení: klient odpojený, zverejnený plán a jedálniček sú jeho, koncept a správy
 *    preč, jeho riadok (a dáta) ostáva; na karte Dnes upozornenie,
 *  - DB: request_client_deletion trénerom pri klientovi s účtom zlyhá,
 *  - klient BEZ účtu má zmazanie ako doteraz.
 * Dočasný tréner aj klient (admin API) — na konci sa zmažú. Bez migrácie 0064 sa preskočí.
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
const PASSWORD = "E2e#Odstranenie2026!";

async function login(page: Page, email: string, to: RegExp) {
  await page.goto("/prihlasenie");
  await page.locator("#login-email").fill(email);
  await page.locator("#login-password").fill(PASSWORD);
  await page.getByRole("button", { name: "Prihlásiť sa" }).click();
  await page.waitForURL(to, { timeout: 30_000 });
}

test.describe("odstránenie klienta z portfólia (reálna DB)", () => {
  test.skip(!url || !anon || !serviceRole, "chýbajú Supabase env premenné");
  test.describe.configure({ mode: "serial" });

  let admin: SupabaseClient;
  let trainerApi: SupabaseClient;
  let migrated = false;
  const stamp = Date.now().toString().slice(-7);
  const trainerEmail = `e2e.odstranenie.trener.${stamp}@fitpilot-testaccount.com`;
  const clientEmail = `e2e.odstranenie.klient.${stamp}@fitpilot-testaccount.com`;
  let trainerId = "";
  let clientUserId = "";
  let clientRowId = "";
  let manualClientId = "";
  const ids = { published: "", draft: "", meal: "" };

  test.beforeAll(async () => {
    admin = createClient(url!, serviceRole!, AUTH);
    const probe = await createClient(url!, anon!, AUTH).rpc("remove_client_from_portfolio", {
      p_client_id: "00000000-0000-0000-0000-000000000000",
    });
    migrated = !(probe.error && /Could not find|does not exist|PGRST202/i.test(`${probe.error.message} ${probe.error.code}`));
    if (!migrated) return;

    const meta = (full_name: string, role: string) => ({ full_name, role, terms_version: TERMS_VERSION });
    const t = await admin.auth.admin.createUser({ email: trainerEmail, password: PASSWORD, email_confirm: true, user_metadata: meta("E2E Odstraňujúci Tréner", "trainer") });
    const c = await admin.auth.admin.createUser({ email: clientEmail, password: PASSWORD, email_confirm: true, user_metadata: meta("E2E Odstránený Klient", "client") });
    if (t.error || c.error) throw new Error(`createUser: ${t.error?.message ?? c.error?.message}`);
    trainerId = t.data.user!.id;
    clientUserId = c.data.user!.id;

    trainerApi = createClient(url!, anon!, AUTH);
    await trainerApi.auth.signInWithPassword({ email: trainerEmail, password: PASSWORD });
    const { data: row } = await admin.from("clients").select("id, invite_code").eq("user_id", clientUserId).single();
    clientRowId = row!.id;
    expect((await trainerApi.rpc("add_client_by_code", { p_code: row!.invite_code })).error).toBeNull();

    const manual = await trainerApi.from("clients").insert({ trainer_id: trainerId, full_name: `E2E bez účtu ${stamp}` }).select("id").single();
    manualClientId = manual.data!.id;

    const plan = async (name: string, published: boolean) =>
      (await trainerApi.from("workout_plans").insert({ client_id: clientRowId, trainer_id: trainerId, name, published }).select("id").single()).data!.id as string;
    ids.published = await plan(`E2E zverejnený ${stamp}`, true);
    ids.draft = await plan(`E2E koncept ${stamp}`, false);
    ids.meal = (
      await trainerApi.from("meal_plans").insert({ client_id: clientRowId, trainer_id: trainerId, name: `E2E jedálniček ${stamp}`, published: true }).select("id").single()
    ).data!.id;
    await trainerApi.from("messages").insert({ client_id: clientRowId, sender: "trainer", sender_id: trainerId, body: `E2E správa ${stamp}` });
  });

  test.afterAll(async () => {
    if (!migrated) return;
    await admin.from("workout_plans").delete().in("id", [ids.published, ids.draft].filter(Boolean));
    await admin.from("meal_plans").delete().eq("id", ids.meal);
    await admin.from("messages").delete().eq("client_id", clientRowId);
    await admin.from("clients").delete().in("id", [clientRowId, manualClientId].filter(Boolean));
    for (const id of [trainerId, clientUserId]) if (id) await admin.auth.admin.deleteUser(id).catch(() => {});
  });

  test("tréner nemôže požiadať o zmazanie klienta s účtom (DB)", async () => {
    test.skip(!migrated, "migrácia 0064 na tejto DB ešte nebežala");
    const { error } = await trainerApi.rpc("request_client_deletion", { p_client_id: clientRowId });
    expect(error?.message).toMatch(/client_has_account/);
    // klient bez účtu — zmazanie ide (a hneď ho zrušíme)
    expect((await trainerApi.rpc("request_client_deletion", { p_client_id: manualClientId })).error).toBeNull();
    expect((await trainerApi.rpc("cancel_client_deletion", { p_client_id: manualClientId })).error).toBeNull();
  });

  test("Info: klient bez účtu má zmazanie, klient s účtom odstránenie z portfólia", async ({ page }, testInfo) => {
    test.skip(!migrated, "migrácia 0064 na tejto DB ešte nebežala");
    test.skip(testInfo.project.name !== "desktop", "zápis do DB len raz (desktop)");
    await login(page, trainerEmail, /\/dashboard/);

    await page.goto(`/dashboard/klienti/${manualClientId}?sekcia=info`);
    await expect(page.getByRole("button", { name: "Požiadať o zmazanie klienta" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Odstrániť z portfólia" })).toHaveCount(0);

    await page.goto(`/dashboard/klienti/${clientRowId}?sekcia=info`);
    await expect(page.getByRole("button", { name: "Požiadať o zmazanie klienta" })).toHaveCount(0);
    await page.getByRole("button", { name: "Odstrániť z portfólia" }).click();
    await expect(page.getByText(/Naozaj odstrániť klienta E2E/)).toBeVisible();
    await page.getByRole("button", { name: "Áno, odstrániť" }).click();
    await page.waitForURL(/\/dashboard$/, { timeout: 30_000 });
    await expect(page.getByRole("link", { name: "E2E Odstránený Klient" })).toHaveCount(0);

    // DB: klient odpojený, jeho riadok ostal; zverejnené plány jeho, koncept a správy preč
    const { data: client } = await admin.from("clients").select("trainer_id, user_id, ended_at").eq("id", clientRowId).single();
    expect(client?.trainer_id).toBeNull();
    expect(client?.user_id).toBe(clientUserId);
    expect(client?.ended_at).not.toBeNull();
    expect((await admin.from("workout_plans").select("id, trainer_id").eq("client_id", clientRowId)).data).toEqual([{ id: ids.published, trainer_id: null }]);
    expect((await admin.from("meal_plans").select("id, trainer_id").eq("client_id", clientRowId)).data).toEqual([{ id: ids.meal, trainer_id: null }]);
    expect((await admin.from("messages").select("id").eq("client_id", clientRowId)).data).toEqual([]);
  });

  test("klient: na karte Dnes upozornenie, plán mu ostal", async ({ page }, testInfo) => {
    test.skip(!migrated, "migrácia 0064 na tejto DB ešte nebežala");
    test.skip(testInfo.project.name !== "desktop", "zápis do DB len raz (desktop)");
    await login(page, clientEmail, /\/portal/);
    await expect(page.getByText("Tréner ťa odstránil zo svojho portfólia")).toBeVisible();
    await page.goto("/portal/trening");
    await expect(page.getByText(`E2E zverejnený ${stamp}`)).toBeVisible();
  });
});
