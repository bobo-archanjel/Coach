import { test, expect, type Page } from "@playwright/test";
import { sessionLogin, userIdByEmail } from "./helpers/sessionLogin";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Celý odcvičený (uzamknutý) plán u trénera: rovnaký prehľad ako rozpracovaný — dráha dní,
 * pri každom dni dátum, RPE / poznámka a plán vs. skutočnosť. Bez „+ tréning“, bez úprav,
 * bez zoznamu „Odcvičené tréningy“ (každý tréning sa predtým otváral zvlášť).
 */

try {
  process.loadEnvFile(".env.local");
} catch {
  /* bez .env.local sa test s DB preskočí */
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

async function expectReadOnlyPlan(page: Page) {
  await expect(page.getByRole("button", { name: "+ tréning" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Premenovať", exact: true })).toHaveCount(0);
  await expect(page.getByText("Pridať nový cvik")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Odcvičené tréningy" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Detail tréningu" })).toHaveCount(0);
}

test.describe("hotový plán — prehľad dní (náhľad)", () => {
  test.skip(process.env.NODE_ENV === "production", "DEV náhľady len v next dev");

  test("dráha dní, pri každom dni výsledok, nič sa nedá upraviť", async ({ page }) => {
    await page.goto("/dashboard/treningy/x?preview=builder_done");
    const tabs = page.getByRole("group", { name: /dni/i }).getByRole("button");
    await expect(tabs).toHaveCount(4);
    // hotový plán sa dá zmazať (odcvičené tréningy ostanú) — dole vedľa PDF
    await expect(page.getByRole("button", { name: "Zmazať", exact: true })).toBeVisible();
    await expect(page.locator("[data-done='true']")).toHaveCount(4);
    await expectReadOnlyPlan(page);

    // prvý deň vybraný hneď — dátum a plán vs. skutočnosť bez klikania na detail
    await expect(page.getByTestId("day-done")).toContainText("Odcvičené");
    await expect(page.getByTestId("completed-exercise").first()).toBeVisible();

    await page.getByRole("button", { name: /Deň 3 — Ťah/ }).click();
    // poznámka je aj vo vyhodnotení plánu (Ako sa klientovi cvičilo) — tu tá pri dni (posledná)
    await expect(page.getByText("„Zhyby v poslednej sérii už s gumou.“").last()).toBeVisible();
    await expect(page.getByTestId("completed-exercise").filter({ hasText: "Veslovanie v predklone" }).getByTestId("set-row").nth(2)).toContainText(
      "neodcvičené",
    );
    await expectReadOnlyPlan(page);
  });
});

test.describe("hotový plán — reálna DB", () => {
  test.skip(!hasEnv, "Chýbajú E2E_* údaje alebo Supabase env (aj service role).");

  let admin: SupabaseClient;
  let planId = "";
  let otherPlanId = "";
  let clientRow: { id: string; active_plan_id: string | null; active_day_id: string | null } | null = null;
  test.afterAll(async () => {
    if (!admin || !planId) return;
    const { data: days } = await admin.from("workout_days").select("id").eq("plan_id", planId);
    const ids = (days ?? []).map((d) => d.id as string);
    if (ids.length) await admin.from("workout_logs").delete().in("workout_day_id", ids);
    await admin.from("workout_plans").delete().in("id", [planId, otherPlanId].filter(Boolean));
    // klientovi vrátiť pôvodný aktívny plán
    if (clientRow) {
      const { id, ...original } = clientRow;
      await admin.from("clients").update(original).eq("id", id);
    }
  });

  test("celý odcvičený plán: prehľad dní s výsledkami", async ({ page, baseURL }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "zápis do DB len raz (desktop)");
    test.setTimeout(120_000);
    admin = createClient(env.url!, env.serviceRole!, AUTH);
    const t = { user: { id: await userIdByEmail(env.trainerEmail!) } };
    const c = { user: { id: await userIdByEmail(env.clientEmail!) } };
    const { data: client } = await admin.from("clients").select("id").eq("user_id", c.user!.id).limit(1).single();
    const { data: plan } = await admin
      .from("workout_plans")
      .insert({ client_id: client!.id, trainer_id: t.user!.id, name: `E2E hotový plán ${Date.now()}`, published: true })
      .select("id")
      .single();
    planId = plan!.id;
    const ex = (id: string, name: string) => ({ entry_id: id, exercise_id: null, exercise_name: name, sets: 2, reps: "10", load_kg: 30, tempo: null, rest_seconds: 60 });
    const { data: days } = await admin
      .from("workout_days")
      .insert([
        { plan_id: planId, day_number: 1, name: "E2E Deň A", exercises: [ex("a", "E2E Drep")] },
        { plan_id: planId, day_number: 2, name: "E2E Deň B", exercises: [ex("b", "E2E Zhyby")] },
      ])
      .select("id, name");
    for (const d of days ?? []) {
      await admin.from("workout_logs").insert({
        client_id: client!.id,
        workout_day_id: d.id,
        status: "completed",
        rpe: d.name === "E2E Deň B" ? 9 : null,
        note: d.name === "E2E Deň B" ? "E2E ťažký deň" : null,
        entries: [{ entryId: d.name === "E2E Deň A" ? "a" : "b", name: "x", sets: [{ reps: 10, weight: 30 }] }],
      });
    }

    // prihlásenie bez formulára (CAPTCHA v Supabase) — e2e/helpers/sessionLogin.ts
    await sessionLogin(page, env.trainerEmail!, baseURL!);
    await page.goto(`/dashboard/treningy/${planId}`);

    await expect(page.getByText("Hotovo", { exact: true }).first()).toBeVisible();
    await expect(page.locator("[data-done='true']")).toHaveCount(2);
    await expectReadOnlyPlan(page);
    const rowsA = page.getByTestId("completed-exercise").filter({ hasText: "E2E Drep" }).getByTestId("set-row");
    await expect(rowsA.nth(1)).toContainText("neodcvičené");

    await page.getByRole("button", { name: /E2E Deň B/ }).click();
    // RPE a poznámka sú aj vo vyhodnotení plánu nad prehľadom — tu tie pri dni (posledné)
    await expect(page.getByText("9/10").last()).toBeVisible();
    await expect(page.getByText("„E2E ťažký deň“").last()).toBeVisible();

    // detail klienta: hotový plán má „Hotovo“ a nedá sa nastaviť ako aktívny
    await page.goto(`/dashboard/klienti/${client!.id}`);
    const row = page.locator(`#plan-${planId}`);
    await expect(row.locator("header")).toContainText("Hotovo");
    await expect(row.getByRole("link", { name: "Otvoriť plán" })).toHaveAttribute("href", `/dashboard/treningy/${planId}`);
    await expect(page.getByRole("button", { name: new RegExp(`^Nastaviť „E2E hotový plán`) })).toHaveCount(0);

    // klient: hotový plán má „Hotovo“, v Tréningu ani v prepínači na Dnes sa nedá nastaviť ako aktívny.
    // Aktívny je iný (rozpracovaný) plán — inak by sa hotový plán ako najnovší stal aktívnym sám.
    const { data: original } = await admin.from("clients").select("id, active_plan_id, active_day_id").eq("id", client!.id).single();
    clientRow = original;
    const { data: other } = await admin
      .from("workout_plans")
      .insert({ client_id: client!.id, trainer_id: t.user!.id, name: `E2E rozpracovaný plán ${Date.now()}`, published: true })
      .select("id")
      .single();
    otherPlanId = other!.id;
    await admin.from("workout_days").insert({ plan_id: otherPlanId, day_number: 1, name: "E2E Deň C", exercises: [ex("c", "E2E Kliky")] });
    await admin.from("clients").update({ active_plan_id: otherPlanId, active_day_id: null }).eq("id", client!.id);

    await page.context().clearCookies();
    // prihlásenie bez formulára (CAPTCHA v Supabase) — e2e/helpers/sessionLogin.ts
    await sessionLogin(page, env.clientEmail!, baseURL!);

    const doneName = (await admin.from("workout_plans").select("name").eq("id", planId).single()).data!.name as string;
    await page.goto("/portal/trening");
    const head = page.locator(`#plan-${planId} header`);
    await expect(head).toContainText(doneName);
    await expect(head).toContainText("Hotovo");
    await expect(page.locator(`#plan-${planId}`)).toContainText("Celý plán máš odcvičený");
    await expect(page.locator(`#plan-${planId}`).getByRole("button", { name: "Nastaviť ako aktívny" })).toHaveCount(0);

    await page.goto("/portal");
    await page.getByRole("button", { name: "Zmeniť plán", exact: true }).click();
    const sheet = page.getByRole("dialog", { name: "Aktívny tréningový plán" });
    await expect(sheet.getByRole("button", { name: new RegExp(doneName) })).toBeDisabled();
    await expect(sheet.getByRole("button", { name: new RegExp(doneName) })).toContainText("Hotovo");
  });
});
