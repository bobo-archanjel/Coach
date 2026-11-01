import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * „Duplikovať“ a „Premenovať“ deň tréningu (rovnako ako v jedálničku) — tréner v builderi
 * plánu (zmena sa hneď uloží, builder sa prepne na kópiu) aj klient vo vlastnom tréningu
 * v portáli (zmeny v drafte, do DB až „Uložiť“). Nový dizajn v6, reálna DB s QA účtami;
 * testovacie plány po sebe zmaže.
 *   E2E_TRAINER_EMAIL, E2E_TRAINER_PASSWORD, E2E_CLIENT_EMAIL, E2E_CLIENT_PASSWORD
 */

try {
  process.loadEnvFile(".env.local");
} catch {
  /* bez .env.local sa test preskočí */
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

async function apiSignIn(email: string, password: string): Promise<{ api: SupabaseClient; userId: string }> {
  const api = createClient(env.url!, env.anon!, AUTH);
  const { data, error } = await api.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw new Error(`Prihlásenie ${email} zlyhalo: ${error?.message}`);
  return { api, userId: data.user.id };
}

async function loginV6(page: Page, context: BrowserContext, baseURL: string, email: string, password: string, expectUrl: RegExp) {
  await context.addCookies([{ name: "fp-dash-skin", value: "v6", url: baseURL }]);
  await page.goto("/v6design/prihlasenie");
  await page.locator("#login-email").fill(email);
  await page.locator("#login-password").fill(password);
  await page.getByRole("button", { name: "Prihlásiť sa" }).click();
  await page.waitForURL(expectUrl, { timeout: 30_000 });
}

type Entry = { entry_id: string; exercise_id: string | null; exercise_name: string; sets: number; reps: string };

test.describe("Duplikovať a premenovať deň tréningu (reálna DB, dizajn v6)", () => {
  test.skip(!hasEnv, "Chýbajú E2E_* údaje QA účtov alebo Supabase env (aj service role).");

  const stamp = Date.now().toString().slice(-6);
  const trainerPlanName = `E2E Duplikovať tréner ${stamp}`;
  const clientPlanName = `E2E Duplikovať klient ${stamp}`;
  let trainer: { api: SupabaseClient; userId: string } | null = null;
  let client: { api: SupabaseClient; userId: string } | null = null;

  test.afterAll(async () => {
    if (trainer) await trainer.api.from("workout_plans").delete().eq("trainer_id", trainer.userId).eq("name", trainerPlanName);
    if (client) {
      // vlastný plán klienta (trainer_id null) — zmaže service role, nezávisle od RLS klienta
      const admin = createClient(env.url!, env.serviceRole!, AUTH);
      await admin.from("workout_plans").delete().eq("name", clientPlanName);
    }
  });

  test("tréner: kópia dňa aj s cvikmi na koniec plánu, prepnutie na ňu, premenovanie", async ({ page, context, baseURL }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Zápis do DB len raz (desktop).");
    test.setTimeout(90_000);
    trainer = await apiSignIn(env.trainerEmail!, env.trainerPassword!);
    client = await apiSignIn(env.clientEmail!, env.clientPassword!);
    const { data: row } = await client.api.from("clients").select("id").eq("user_id", client.userId).limit(1).single();
    const { data: lib } = await trainer.api.from("exercises").select("id, name").order("name").limit(2);
    const entries: Entry[] = (lib ?? []).map((e, i) => ({
      entry_id: crypto.randomUUID(),
      exercise_id: e.id,
      exercise_name: e.name,
      sets: 3 + i,
      reps: "8-10",
    }));
    const { data: plan } = await trainer.api
      .from("workout_plans")
      .insert({ client_id: row!.id, trainer_id: trainer.userId, name: trainerPlanName, published: false })
      .select("id")
      .single();
    await trainer.api.from("workout_days").insert([
      { plan_id: plan!.id, day_number: 1, name: "E2E Push", exercises: entries },
      { plan_id: plan!.id, day_number: 2, name: "E2E Pull", exercises: [] },
    ]);

    await loginV6(page, context, baseURL!, env.trainerEmail!, env.trainerPassword!, /\/dashboard/);
    await page.goto(`/dashboard/treningy/${plan!.id}`);
    await page.getByRole("button", { name: "E2E Push", exact: true }).click();
    await page.getByRole("button", { name: "Duplikovať", exact: true }).click();

    const copyTab = page.getByRole("button", { name: "E2E Push (kópia)", exact: true });
    await expect(copyTab).toHaveAttribute("aria-current", "true", { timeout: 15_000 });
    for (const e of entries) await expect(page.getByText(e.exercise_name, { exact: true }).first()).toBeVisible();

    // Premenovať: Esc zruší, Hotovo uloží; kým je formulár otvorený, Duplikovať/Zmazať deň nie sú
    await page.getByRole("button", { name: "Premenovať", exact: true }).click();
    await expect(page.getByRole("button", { name: "Duplikovať", exact: true })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(page.getByLabel("Názov dňa")).toHaveCount(0);
    await page.getByRole("button", { name: "Premenovať", exact: true }).click();
    await expect(page.getByLabel("Názov dňa")).toHaveValue("E2E Push (kópia)");
    await page.getByLabel("Názov dňa").fill("E2E Push B");
    await page.getByRole("button", { name: "Hotovo", exact: true }).click();
    await expect(page.getByRole("button", { name: "E2E Push B", exact: true })).toHaveAttribute("aria-current", "true", { timeout: 15_000 });

    const { data: days } = await trainer.api
      .from("workout_days")
      .select("day_number, name, exercises")
      .eq("plan_id", plan!.id)
      .order("day_number");
    expect(days?.map((d) => [d.day_number, d.name])).toEqual([
      [1, "E2E Push"],
      [2, "E2E Pull"],
      [3, "E2E Push B"],
    ]);
    const copy = days![2].exercises as Entry[];
    // rovnaké cviky a hodnoty, ale vlastné entry_id
    expect(copy.map((e) => [e.exercise_id, e.sets, e.reps])).toEqual(entries.map((e) => [e.exercise_id, e.sets, e.reps]));
    expect(copy.some((e) => entries.some((o) => o.entry_id === e.entry_id))).toBe(false);
  });

  test("klient: vlastný tréning — kópia a premenovanie dňa v drafte, uloží sa až „Uložiť“", async ({ page, context, baseURL }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Zápis do DB len raz (desktop).");
    test.setTimeout(90_000);
    client = await apiSignIn(env.clientEmail!, env.clientPassword!);
    await loginV6(page, context, baseURL!, env.clientEmail!, env.clientPassword!, /\/portal/);
    await page.goto("/v6design/portal/trening");
    await page.getByRole("button", { name: "Vlastný tréning" }).click();

    const builder = page.getByRole("region", { name: "Nový vlastný tréning" });
    await builder.getByLabel("Názov tréningového plánu").fill(clientPlanName);
    await builder.locator("#client-day-name").fill("E2E Nohy");
    await builder.getByRole("button", { name: "Pridať", exact: true }).click();
    await builder.getByLabel("Názov vlastného cviku").fill("E2E Výpad");
    await builder.getByRole("button", { name: "+ Pridať do tréningu" }).click();

    await builder.getByRole("button", { name: "Duplikovať", exact: true }).click();
    await expect(builder.getByRole("button", { name: "E2E Nohy (kópia)", exact: true })).toHaveAttribute("aria-current", "true");
    await expect(builder.getByText("E2E Výpad", { exact: true })).toBeVisible();

    await builder.getByRole("button", { name: "Premenovať", exact: true }).click();
    await expect(builder.getByLabel("Názov tréningu")).toHaveValue("E2E Nohy (kópia)");
    await builder.getByLabel("Názov tréningu").fill("E2E Nohy B");
    await builder.getByRole("button", { name: "Hotovo", exact: true }).click();
    await expect(builder.getByRole("button", { name: "E2E Nohy B", exact: true })).toHaveAttribute("aria-current", "true");

    // nič sa neuložilo, kým klient neťukne „Uložiť“
    const before = await client.api.from("workout_plans").select("id").eq("name", clientPlanName);
    expect(before.data ?? []).toEqual([]);

    await builder.getByRole("button", { name: "Uložiť", exact: true }).click();
    await expect(builder).toBeHidden({ timeout: 15_000 });

    const { data: plan } = await client.api
      .from("workout_plans")
      .select("id, trainer_id, workout_days(day_number, name, exercises)")
      .eq("name", clientPlanName)
      .single();
    expect(plan?.trainer_id).toBeNull();
    const days = ((plan?.workout_days ?? []) as { day_number: number; name: string; exercises: Entry[] }[]).sort(
      (a, b) => a.day_number - b.day_number,
    );
    expect(days.map((d) => d.name)).toEqual(["E2E Nohy", "E2E Nohy B"]);
    expect(days.map((d) => d.exercises.map((e) => e.exercise_name))).toEqual([["E2E Výpad"], ["E2E Výpad"]]);
    expect(days[0].exercises[0].entry_id).not.toBe(days[1].exercises[0].entry_id);
  });
});
