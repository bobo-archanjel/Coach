import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Upozornenie „Nový tréningový plán“ (zvonček klienta), reálna DB s QA klientom:
 * klient si vytvorí vlastný plán → vo zvončeku je upozornenie → klik vedie na presne
 * ten plán (/portal/trening?plan=<id>, plán rozbalený) → upozornenie zmizne a po
 * obnovení stránky sa nevráti (skrytie uložené na serveri — aj keď sa klikne priamo
 * na stránke Tréning, kde sa trasa nezmení). Plán aj skrytie po sebe zmaže.
 *   E2E_CLIENT_EMAIL, E2E_CLIENT_PASSWORD
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
  email: process.env.E2E_CLIENT_EMAIL,
  password: process.env.E2E_CLIENT_PASSWORD,
};
const AUTH = { auth: { persistSession: false, autoRefreshToken: false } };

async function openBell(page: Page) {
  await page.getByRole("button", { name: /^Upozornenia/ }).click();
  const panel = page.getByRole("region", { name: "Upozornenia" });
  await expect(panel).toBeVisible();
  await expect(panel.getByText("Načítavam…")).toHaveCount(0, { timeout: 15_000 });
  return panel;
}

test("nový vlastný plán: upozornenie vedie na plán a po kliknutí zmizne", async ({ page }, info) => {
  test.skip(!Object.values(env).every(Boolean), "Chýbajú E2E_CLIENT_* údaje alebo Supabase env.");
  test.skip(info.project.name !== "desktop", "Zápis do DB len raz (desktop).");
  test.setTimeout(120_000);

  const api: SupabaseClient = createClient(env.url!, env.anon!, AUTH);
  const { data: auth, error: authErr } = await api.auth.signInWithPassword({ email: env.email!, password: env.password! });
  if (authErr || !auth.user) throw new Error(authErr?.message);
  const admin = createClient(env.url!, env.serviceRole!, AUTH);
  const { data: client } = await api.from("clients").select("id").eq("user_id", auth.user.id).order("created_at").limit(1).single();
  const name = `E2E Upozornenie ${Date.now().toString().slice(-6)}`;
  const { data: plan, error: planErr } = await api
    .from("workout_plans")
    .insert({ client_id: client!.id, trainer_id: null, name })
    .select("id")
    .single();
  if (planErr || !plan) throw new Error(planErr?.message);
  await api.from("workout_days").insert({
    plan_id: plan.id,
    day_number: 1,
    name: "E2E Deň",
    exercises: [{ entry_id: crypto.randomUUID(), exercise_id: null, exercise_name: "E2E Drep", sets: 3, reps: "8" }],
  });

  try {
    await page.goto("/prihlasenie");
    await page.locator("#login-email").fill(env.email!);
    await page.locator("#login-password").fill(env.password!);
    await page.getByRole("button", { name: "Prihlásiť sa" }).click();
    await page.waitForURL(/\/portal$/, { timeout: 30_000 });

    // klik priamo na stránke Tréning (trasa sa nezmení — predtým sa skrytie neuložilo)
    await page.goto("/portal/trening");
    const panel = await openBell(page);
    await panel.getByRole("link", { name: new RegExp(name) }).click();
    await expect(page).toHaveURL(new RegExp(`/portal/trening\\?plan=${plan.id}`));
    await expect(page.locator(`#plan-${plan.id}`).getByRole("button", { name: new RegExp(name) })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await expect(panel).toHaveCount(0); // panel sa po kliknutí zavrie

    // upozornenie zmizlo — hneď aj po obnovení stránky (uložené na serveri)
    let again = await openBell(page);
    await expect(again.getByRole("link", { name: new RegExp(name) })).toHaveCount(0);
    await page.reload();
    again = await openBell(page);
    await expect(again.getByRole("link", { name: new RegExp(name) })).toHaveCount(0);
  } finally {
    await admin.from("client_notification_dismissals").delete().eq("key", `plan:${plan.id}`);
    await admin.from("workout_plans").delete().eq("id", plan.id);
  }
});
