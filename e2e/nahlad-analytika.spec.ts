import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Náhľad odcvičeného vlastného tréningu = vyhodnotenie plánu (feature/nahlad-analytika):
 *  - celý odcvičený vlastný plán má „Náhľad“ namiesto „Upraviť“ (rozpracovaný ostáva „Upraviť“),
 *  - náhľad: bez „Uložiť“ / „Uložiť zmeny“, poľa názvu, „+ tréning“ a knižnice cvikov,
 *  - súhrn, úspechy (rekordy oproti obdobiu pred plánom), zistenia, karty cvikov s grafom
 *    najťažšej série, ako sa cvičilo a „Zopakovať s progresiou“.
 * DEV náhľad (?preview=ok) + reálna DB na QA klientovi (plán a zápisy po sebe zmaže).
 *   E2E_CLIENT_EMAIL, E2E_CLIENT_PASSWORD
 */

const planCard = (page: Page, id: string) => page.locator(`#plan-${id}`);

test.describe("náhľad hotového plánu — náhľady", () => {
  test.skip(process.env.NODE_ENV === "production", "DEV náhľady len v next dev");

  test("hotový vlastný plán: Náhľad bez úprav, rozpracovaný ostáva Upraviť", async ({ page }) => {
    await page.goto("/portal/trening?preview=ok");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.getByRole("button", { name: /Moje kardio \+ core/ }).click();
    await expect(planCard(page, "plan-own").getByRole("button", { name: "Upraviť" })).toBeVisible();
    await expect(planCard(page, "plan-own").getByRole("button", { name: "Náhľad" })).toHaveCount(0);

    await page.getByRole("button", { name: /Moja jesenná sila/ }).click();
    const card = planCard(page, "plan-own-done");
    await expect(card.getByRole("button", { name: "Upraviť" })).toHaveCount(0);
    await card.getByRole("button", { name: "Náhľad" }).click();

    const view = page.getByRole("region", { name: "Náhľad tréningu" });
    await expect(view).toBeVisible();
    // bez hlavičky „Tréningové plány“ — nadpisom stránky je názov plánu
    await expect(page.getByRole("heading", { level: 1, name: "Tréningové plány" })).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1, name: "Moja jesenná sila" })).toBeVisible();
    await expect(view.getByRole("button", { name: "Uložiť", exact: true })).toHaveCount(0);
    await expect(view.getByRole("button", { name: /Uložiť zmeny|Uložiť tréning/ })).toHaveCount(0);
    await expect(view.getByLabel("Názov tréningového plánu")).toHaveCount(0);
    await expect(view.getByRole("button", { name: "+ tréning" })).toHaveCount(0);
    await expect(view.getByLabel("Názov vlastného cviku")).toHaveCount(0);
    // karty cvikov vybraného tréningu, prepínanie tréningov funguje
    await expect(view.getByTestId("review-card").first()).toContainText("Bench press");
    await view.getByRole("button", { name: /Tréning 2/ }).click();
    await expect(view.getByTestId("review-card").first()).toContainText("Mŕtvy ťah");

    // zatvorenie (späť) — z náhľadu nevznikne rozpracovaný koncept („Pokračovať“)
    await page.goBack();
    await expect(view).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1, name: "Tréningové plány" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Pokračovať" })).toHaveCount(0);
  });

  test("hotový plán od trénera: Náhľad s vyhodnotením, bez Zopakovať s progresiou", async ({ page }) => {
    await page.goto("/portal/trening?preview=ok");
    await page.getByRole("button", { name: /Letný plán — celé telo/ }).click();
    const card = planCard(page, "plan-done");
    await expect(card.getByRole("button", { name: "Upraviť" })).toHaveCount(0);
    await card.getByRole("button", { name: "Náhľad" }).click();

    const view = page.getByRole("region", { name: "Náhľad tréningu" });
    await expect(view.getByRole("heading", { name: "Letný plán — celé telo" })).toBeVisible();
    await expect(view.getByTestId("review-stats")).toContainText(/Tréningy\s*1/);
    await expect(view.getByTestId("review-card").first()).toContainText("Bench press");
    await expect(view.getByTestId("review-timeline")).toContainText("„Prvý tréning po dovolenke.“");
    // nový plán od trénera zostaví tréner — klient ho neopakuje
    await expect(view.getByRole("button", { name: "Zopakovať s progresiou" })).toHaveCount(0);
    await expect(view.getByRole("button", { name: /Uložiť/ })).toHaveCount(0);
  });

  test("vyhodnotenie: súhrn, úspechy, zistenia, karty cvikov a ako sa cvičilo", async ({ page }) => {
    await page.goto("/portal/trening?preview=ok");
    await page.getByRole("button", { name: /Moja jesenná sila/ }).click();
    await planCard(page, "plan-own-done").getByRole("button", { name: "Náhľad" }).click();
    const view = page.getByRole("region", { name: "Náhľad tréningu" });

    const stats = view.getByTestId("review-stats");
    await expect(stats).toContainText(/Tréningy\s*2/);
    await expect(stats).toContainText("13/14 · 93 %");
    await expect(stats).toContainText(/4\s355 kg/);
    await expect(stats).toContainText("8,5/10");
    await expect(view.getByTestId("review-records")).toContainText("Mŕtvy ťah: 120 kg × 5 — nový rekord");
    await expect(view.getByTestId("review-records")).toContainText("+5 kg oproti predtým");
    const insights = view.getByTestId("review-insights");
    await expect(insights).toContainText("Bench press: všetky série s 80 kg splnené — pripravené na vyššiu záťaž.");
    await expect(insights).toContainText("Zhyby: robíš viac opakovaní");
    await expect(insights).toContainText("Tlaky nad hlavu: naposledy 2 z 3 sérií.");

    // karty cvikov vybraného tréningu: graf najťažšej série, detail sérií na rozbalenie
    const cards = view.getByTestId("review-card");
    await expect(cards).toHaveCount(2);
    await expect(cards.nth(0)).toContainText("Bench press");
    await expect(cards.nth(0).getByRole("slider", { name: /Graf najťažšej série: Bench press, 3 tréningy/ })).toBeVisible();
    await expect(cards.nth(0)).toContainText(/Objem pri poslednom tréningu: 2\s000 kg/);
    await expect(cards.nth(0).getByTestId("completed-exercise")).toHaveCount(0);
    await cards.nth(0).getByRole("button", { name: "Zobraziť série" }).click();
    await expect(cards.nth(0).getByTestId("completed-exercise")).toBeVisible();
    await expect(cards.nth(1)).toContainText("Graf sa ukáže, keď cvik spravíš aspoň na dvoch tréningoch.");

    await view.getByRole("button", { name: /Tréning 2/ }).click();
    await expect(cards.nth(0)).toContainText("Mŕtvy ťah");
    await expect(cards.nth(0)).toContainText("Rekord");
    await expect(cards.nth(1)).toContainText("Bez záťaže — najlepšia séria 10 opak.");

    const timeline = view.getByTestId("review-timeline");
    await expect(timeline.getByRole("listitem")).toHaveCount(2);
    await expect(timeline).toContainText("„Bench išiel ľahko.“");
  });

  test("Zopakovať s progresiou: voľba %, náhľad zmien, nový plán s vyššou záťažou", async ({ page }) => {
    await page.goto("/portal/trening?preview=ok");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.getByRole("button", { name: /Moja jesenná sila/ }).click();
    await planCard(page, "plan-own-done").getByRole("button", { name: "Náhľad" }).click();
    await page.getByRole("button", { name: "Zopakovať s progresiou" }).click();

    // okno: predvolene +5 %, náhľad zmien; Esc zavrie bez zmeny
    const dialog = page.getByRole("dialog", { name: "Zopakovať s progresiou" });
    await expect(dialog.getByRole("radio", { name: "+5 %" })).toHaveAttribute("aria-checked", "true");
    const changes = dialog.getByTestId("progression-changes");
    await expect(changes.getByRole("listitem").filter({ hasText: "Bench press" })).toContainText("80 → 84 kg");
    await expect(changes.getByRole("listitem").filter({ hasText: "Tlaky nad hlavu" })).toContainText("45 kg · ostáva — nesplnené série");
    await expect(changes.getByRole("listitem").filter({ hasText: "Zhyby" })).toContainText("bez záťaže");
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);

    await page.getByRole("button", { name: "Zopakovať s progresiou" }).click();
    await dialog.getByRole("radio", { name: "+2,5 %" }).click();
    await expect(dialog.getByRole("radio", { name: "+2,5 %" })).toHaveAttribute("aria-checked", "true");
    await expect(changes.getByRole("listitem").filter({ hasText: "Bench press" })).toContainText("80 → 82 kg");
    await dialog.getByRole("button", { name: "Vyskladať plán" }).click();

    const builder = page.getByRole("region", { name: "Nový vlastný tréning" });
    await expect(builder).toBeVisible();
    await expect(builder.getByLabel("Názov tréningového plánu")).toHaveValue("Moja jesenná sila — pokračovanie");
    await expect(builder.getByRole("button", { name: "Uložiť", exact: true })).toBeVisible();
    // bench 80 → 82 kg (+2,5 %, zaokrúhlené na 0,5 kg), tlaky (nesplnené série) ostávajú 45 kg
    await expect(builder).toContainText("4× 6 @ 82 kg");
    await expect(builder).toContainText("3× 8 @ 45 kg");
    await expect(builder.getByRole("button", { name: /Tréning 2/ })).toBeVisible();
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
  serviceRole: process.env.SUPABASE_SERVICE_ROLE_KEY,
  clientEmail: process.env.E2E_CLIENT_EMAIL,
  clientPassword: process.env.E2E_CLIENT_PASSWORD,
};
const hasEnv = Object.values(env).every(Boolean);
const AUTH = { auth: { persistSession: false, autoRefreshToken: false } };

test.describe("náhľad hotového plánu — reálna DB", () => {
  test.skip(!hasEnv, "Chýbajú E2E_CLIENT_* údaje alebo Supabase env (aj service role).");

  let admin: SupabaseClient;
  const planIds: string[] = [];
  test.afterAll(async () => {
    if (!admin || planIds.length === 0) return;
    const { data: days } = await admin.from("workout_days").select("id").in("plan_id", planIds);
    const ids = (days ?? []).map((d) => d.id as string);
    if (ids.length) await admin.from("workout_logs").delete().in("workout_day_id", ids);
    await admin.from("workout_plans").delete().in("id", planIds);
  });

  test("vyhodnotenie z reálnych zápisov: rekord oproti staršiemu plánu, návrh progresie, Zopakovať", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "zápis do DB len raz (desktop)");
    test.setTimeout(120_000);
    admin = createClient(env.url!, env.serviceRole!, AUTH);
    const anon = createClient(env.url!, env.anon!, AUTH);
    const { data: auth } = await anon.auth.signInWithPassword({ email: env.clientEmail!, password: env.clientPassword! });
    const { data: client } = await admin.from("clients").select("id").eq("user_id", auth.user!.id).limit(1).single();
    const stamp = Date.now();
    const exName = `E2E Drep ${stamp}`;
    const bwName = `E2E Kliky ${stamp}`;

    const mkPlan = async (name: string, entryId: string) => {
      const exercises = [
        { entry_id: entryId, exercise_id: null, exercise_name: exName, sets: 3, reps: "10", load_kg: 50, tempo: null, rest_seconds: 60 },
        { entry_id: `${entryId}b`, exercise_id: null, exercise_name: bwName, sets: 3, reps: "10", load_kg: null, tempo: null, rest_seconds: 60 },
      ];
      const { data: plan } = await admin.from("workout_plans").insert({ client_id: client!.id, trainer_id: null, name }).select("id").single();
      planIds.push(plan!.id);
      const { data: day } = await admin
        .from("workout_days")
        .insert({ plan_id: plan!.id, day_number: 1, name: "Tréning 1", exercises })
        .select("id")
        .single();
      return { planId: plan!.id as string, dayId: day!.id as string, exercises };
    };
    const log = (p: { planId: string; dayId: string; exercises: unknown[] }, entryId: string, performedOn: string, kg: number, rpe: number | null, note: string | null) =>
      admin.from("workout_logs").insert({
        client_id: client!.id,
        workout_day_id: p.dayId,
        status: "completed",
        performed_on: performedOn,
        rpe,
        note,
        plan_snapshot: { plan_id: p.planId, day_id: p.dayId, exercises: p.exercises },
        entries: [
          { entryId, name: exName, sets: [{ reps: 10, weight: kg }, { reps: 10, weight: kg }, { reps: 10, weight: kg }] },
          { entryId: `${entryId}b`, name: bwName, sets: [{ reps: 12, weight: null }, { reps: 12, weight: null }, { reps: 12, weight: null }] },
        ],
      });

    // starší plán s tým istým cvikom (iný entry_id) — rekord sa porovná s obdobím pred plánom
    const older = await mkPlan(`E2E Starší plán ${stamp}`, `old${stamp}`);
    await log(older, `old${stamp}`, "2026-01-05", 40, null, null);
    const done = await mkPlan(`E2E Hotový vlastný ${stamp}`, `new${stamp}`);
    await log(done, `new${stamp}`, "2026-01-12", 50, 7, "E2E dobrý tréning");

    await page.goto("/prihlasenie");
    await page.locator("#login-email").fill(env.clientEmail!);
    await page.locator("#login-password").fill(env.clientPassword!);
    await page.getByRole("button", { name: "Prihlásiť sa" }).click();
    await page.waitForURL(/\/portal/, { timeout: 30_000 });
    await page.goto("/portal/trening");

    await page.getByRole("button", { name: new RegExp(`E2E Hotový vlastný ${stamp}`) }).click();
    await planCard(page, done.planId).getByRole("button", { name: "Náhľad" }).click();
    const view = page.getByRole("region", { name: "Náhľad tréningu" });
    await expect(view.getByRole("button", { name: "Uložiť", exact: true })).toHaveCount(0);

    const stats = view.getByTestId("review-stats");
    await expect(stats).toContainText("6/6 · 100 %", { timeout: 15_000 });
    await expect(stats).toContainText(/1\s500 kg/);
    await expect(stats).toContainText("7/10");
    await expect(view.getByTestId("review-records")).toContainText(`${exName}: 50 kg × 10 — nový rekord`);
    await expect(view.getByTestId("review-records")).toContainText("+10 kg oproti predtým");
    await expect(view.getByTestId("review-insights")).toContainText(`${exName}: všetky série s 50 kg splnené — pripravené na vyššiu záťaž.`);
    await expect(view.getByTestId("review-insights")).toContainText(`${bwName}: robíš viac opakovaní`);
    const cards = view.getByTestId("review-card");
    await expect(cards.nth(0).getByRole("slider", { name: new RegExp(`Graf najťažšej série: ${exName}, 2 tréningy`) })).toBeVisible();
    await expect(view.getByTestId("review-timeline")).toContainText("„E2E dobrý tréning“");

    // Zopakovať s progresiou +10 % → builder nového plánu (neukladáme)
    await view.getByRole("button", { name: "Zopakovať s progresiou" }).click();
    const dialog = page.getByRole("dialog", { name: "Zopakovať s progresiou" });
    await dialog.getByRole("radio", { name: "+10 %" }).click();
    await expect(dialog.getByTestId("progression-changes")).toContainText("50 → 55 kg");
    await dialog.getByRole("button", { name: "Vyskladať plán" }).click();
    const builder = page.getByRole("region", { name: "Nový vlastný tréning" });
    await expect(builder.getByLabel("Názov tréningového plánu")).toHaveValue(`E2E Hotový vlastný ${stamp} — pokračovanie`.slice(0, 60));
    await expect(builder).toContainText("3× 10 @ 55 kg");
  });
});

const trainerEnv = {
  email: process.env.E2E_TRAINER_EMAIL,
  password: process.env.E2E_TRAINER_PASSWORD,
};

test.describe("tréner: vyhodnotenie hotového plánu — náhľad", () => {
  test.skip(process.env.NODE_ENV === "production", "DEV náhľady len v next dev");

  test("súhrn, úspechy, zistenia, ako sa cvičilo a okno progresie", async ({ page }) => {
    await page.goto("/dashboard/treningy/x?preview=builder_done");
    const panel = page.getByTestId("trainer-plan-review");
    await expect(panel.getByRole("heading", { name: "Vyhodnotenie plánu" })).toBeVisible();
    await expect(panel.getByTestId("review-stats")).toContainText(/Tréningy\s*4/);
    await expect(panel.getByTestId("review-records")).toContainText("Tlaky nad hlavu: 40 kg × 10 — nový rekord");
    await expect(panel.getByTestId("review-insights")).toContainText("Veslovanie v predklone: naposledy 2 z 3 sérií.");
    await expect(panel.getByRole("heading", { name: "Ako sa klientovi cvičilo" })).toBeVisible();
    await expect(panel.getByTestId("review-timeline")).toContainText("„Zhyby v poslednej sérii už s gumou.“");
    // prehľad dní (plán vs. skutočnosť) ostáva pod vyhodnotením
    await expect(page.locator("[data-done='true']").first()).toBeVisible();

    await panel.getByRole("button", { name: "Zopakovať s progresiou" }).click();
    const dialog = page.getByRole("dialog", { name: "Zopakovať s progresiou" });
    await expect(dialog).toContainText("Vznikne nový koncept plánu pre klienta");
    const tlaky = dialog.getByTestId("progression-changes").getByRole("listitem").filter({ hasText: "Tlaky nad hlavu" });
    await expect(tlaky).toContainText("40 → 42 kg");
    await dialog.getByRole("radio", { name: "+10 %" }).click();
    await expect(tlaky).toContainText("40 → 44 kg");
    await expect(dialog.getByRole("button", { name: "Vytvoriť koncept" })).toBeInViewport();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  });
});

test.describe("tréner: zopakovať s progresiou — reálna DB", () => {
  test.skip(!hasEnv || !trainerEnv.email || !trainerEnv.password, "Chýbajú E2E_TRAINER_* / E2E_CLIENT_* údaje alebo Supabase env.");

  let admin: SupabaseClient;
  const planIds: string[] = [];
  test.afterAll(async () => {
    if (!admin || planIds.length === 0) return;
    const { data: days } = await admin.from("workout_days").select("id").in("plan_id", planIds);
    const ids = (days ?? []).map((d) => d.id as string);
    if (ids.length) await admin.from("workout_logs").delete().in("workout_day_id", ids);
    await admin.from("workout_plans").delete().in("id", planIds);
  });

  test("hotový plán → +10 % → nový koncept pre klienta s vyššou záťažou", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "zápis do DB len raz (desktop)");
    test.setTimeout(120_000);
    admin = createClient(env.url!, env.serviceRole!, AUTH);
    const anon = createClient(env.url!, env.anon!, AUTH);
    const { data: tr } = await anon.auth.signInWithPassword({ email: trainerEnv.email!, password: trainerEnv.password! });
    const { data: cl } = await anon.auth.signInWithPassword({ email: env.clientEmail!, password: env.clientPassword! });
    const { data: client } = await admin.from("clients").select("id").eq("user_id", cl.user!.id).limit(1).single();
    const stamp = Date.now();
    const name = `E2E Progresia tréner ${stamp}`;
    const exercises = [
      { entry_id: `a${stamp}`, exercise_id: null, exercise_name: `E2E Tlak ${stamp}`, sets: 3, reps: "10", load_kg: 50, tempo: null, rest_seconds: 60 },
      { entry_id: `b${stamp}`, exercise_id: null, exercise_name: `E2E Veslo ${stamp}`, sets: 3, reps: "10", load_kg: 30, tempo: null, rest_seconds: 60 },
    ];
    const { data: plan } = await admin
      .from("workout_plans")
      .insert({ client_id: client!.id, trainer_id: tr.user!.id, name, published: true })
      .select("id")
      .single();
    planIds.push(plan!.id);
    const { data: day } = await admin.from("workout_days").insert({ plan_id: plan!.id, day_number: 1, name: "E2E Deň A", exercises }).select("id").single();
    await admin.from("workout_logs").insert({
      client_id: client!.id,
      workout_day_id: day!.id,
      status: "completed",
      performed_on: "2026-01-12",
      rpe: 8,
      plan_snapshot: { plan_id: plan!.id, day_id: day!.id, exercises },
      entries: [
        // tlak: všetky série splnené → +10 %; veslo: 2 z 3 sérií → ostáva
        { entryId: `a${stamp}`, name: exercises[0].exercise_name, sets: [{ reps: 10, weight: 50 }, { reps: 10, weight: 50 }, { reps: 10, weight: 50 }] },
        { entryId: `b${stamp}`, name: exercises[1].exercise_name, sets: [{ reps: 10, weight: 30 }, { reps: 9, weight: 30 }] },
      ],
    });

    await page.goto("/prihlasenie");
    await page.locator("#login-email").fill(trainerEnv.email!);
    await page.locator("#login-password").fill(trainerEnv.password!);
    await page.getByRole("button", { name: "Prihlásiť sa" }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
    await page.goto(`/dashboard/treningy/${plan!.id}`);

    const panel = page.getByTestId("trainer-plan-review");
    await expect(panel.getByTestId("review-insights")).toContainText(`E2E Tlak ${stamp}: všetky série s 50 kg splnené`);
    await panel.getByRole("button", { name: "Zopakovať s progresiou" }).click();
    const dialog = page.getByRole("dialog", { name: "Zopakovať s progresiou" });
    await dialog.getByRole("radio", { name: "+10 %" }).click();
    await expect(dialog.getByTestId("progression-changes")).toContainText("50 → 55 kg");
    await expect(dialog.getByTestId("progression-changes")).toContainText("30 kg · ostáva — nesplnené série");
    await dialog.getByRole("button", { name: "Vytvoriť koncept" }).click();

    await page.waitForURL((url) => url.pathname.startsWith("/dashboard/treningy/") && !url.pathname.endsWith(plan!.id), { timeout: 30_000 });
    const newId = new URL(page.url()).pathname.split("/").pop()!;
    planIds.push(newId);
    const { data: created } = await admin.from("workout_plans").select("name, published, client_id, workout_days(name, exercises)").eq("id", newId).single();
    expect(created!.name).toBe(`${name} — pokračovanie`);
    expect(created!.published).toBe(false);
    expect(created!.client_id).toBe(client!.id);
    const days = created!.workout_days as { name: string; exercises: { entry_id: string; load_kg: number | null }[] }[];
    expect(days.map((d) => d.name)).toEqual(["E2E Deň A"]);
    expect(days[0].exercises.map((e) => e.load_kg)).toEqual([55, 30]);
    expect(days[0].exercises[0].entry_id).not.toBe(`a${stamp}`);
  });
});
