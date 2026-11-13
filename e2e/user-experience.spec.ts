import { test, expect, type Locator, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * UX úpravy (feature/user-experience):
 *  - akcie dňa (Premenovať · Duplikovať · Zmazať deň) vždy v jednom riadku — tréner aj klient,
 *  - prázdny deň / plán bez dní v sklenenej karte, návod k pridaniu cviku za otáznikom,
 *  - v menu nie sú Nastavenia (tréner) ani Profil (klient) — vedie tam ikona s iniciálou,
 *    krok sprievodcu ukazuje na ňu,
 *  - kalendár: nový termín pre viacerých klientov naraz,
 *  - zvonček trénera: meno klienta pri neprečítaných správach a termín do 24 h.
 * Prvé tri cez DEV `?preview=`, posledné dva proti reálnej DB s QA trénerom (dočasní
 * klienti, termíny aj správy sa po teste zmažú service role).
 *   E2E_TRAINER_EMAIL, E2E_TRAINER_PASSWORD
 */

try {
  process.loadEnvFile(".env.local");
} catch {
  /* bez .env.local sa DB testy preskočia */
}
const env = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  anon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  serviceRole: process.env.SUPABASE_SERVICE_ROLE_KEY,
  trainerEmail: process.env.E2E_TRAINER_EMAIL,
  trainerPassword: process.env.E2E_TRAINER_PASSWORD,
};
const hasEnv = Object.values(env).every(Boolean);
const AUTH = { auth: { persistSession: false, autoRefreshToken: false } };

/** Všetky prvky ležia v jednom riadku (rovnaký vrch ±2 px). */
async function expectOneRow(buttons: Locator[]) {
  const tops: number[] = [];
  for (const b of buttons) {
    await expect(b).toBeVisible();
    tops.push((await b.boundingBox())!.y);
  }
  expect(Math.max(...tops) - Math.min(...tops), `vrchy: ${tops.join(", ")}`).toBeLessThanOrEqual(2);
}

const overlaps = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

test.describe("Builder: akcie dňa a prázdne stavy", () => {
  test.skip(process.env.NODE_ENV === "production", "DEV náhľady len v next dev");

  test("tréner: Premenovať · Duplikovať · Zmazať deň v jednom riadku", async ({ page }) => {
    await page.goto("/dashboard/treningy/x?preview=builder");
    await expectOneRow([
      page.getByRole("button", { name: "Premenovať", exact: true }),
      page.getByRole("button", { name: "Duplikovať", exact: true }),
      page.getByRole("button", { name: "Zmazať deň", exact: true }),
    ]);
  });

  test("tréner: plán bez dní — žiadna karta „Zatiaľ žiadny deň“, len „+ deň“", async ({ page }) => {
    await page.goto("/dashboard/treningy/x?preview=builder_empty");
    await expect(page.getByRole("button", { name: "+ deň" })).toBeVisible();
    // karta „Zatiaľ žiadny deň“ zrušená (feature/builder-cleanup) — klik na cvik bez dňa hlási chybu
    await expect(page.getByText("Zatiaľ žiadny deň", { exact: true })).toHaveCount(0);
    await expect(page.getByText(/Pridaj prvý deň/)).toHaveCount(0);
  });

  test("klient: prázdne stavy v karte, návod za otáznikom, akcie dňa v jednom riadku", async ({ page }) => {
    await page.goto("/portal/trening?preview=ok");
    await page.getByRole("button", { name: "Vlastný tréning" }).click();
    await expect(page.getByRole("button", { name: "+ deň" })).toBeVisible();
    await expect(page.getByText("Zatiaľ žiadny deň", { exact: true })).toHaveCount(0);

    await page.getByRole("button", { name: "+ deň" }).click();
    const dayDialog = page.getByRole("dialog", { name: "Nový deň" });
    await dayDialog.locator("#client-day-name").fill("Push");
    await dayDialog.getByRole("button", { name: "Pridať", exact: true }).click();
    await expect(dayDialog).toHaveCount(0);
    await expect(page.getByText("Zatiaľ žiadne cviky", { exact: true })).toBeVisible();
    // pôvodný dlhý text už nie je voľne na stránke — je v okne za otáznikom
    await expect(page.getByText(/Klikni na cvik v knižnici/)).toHaveCount(0);
    await page.getByRole("button", { name: "Vysvetlivka: Ako pridať cvik" }).click();
    const tip = page.getByRole("dialog", { name: "Ako pridať cvik" });
    await expect(tip).toContainText("Klikni na cvik v knižnici");
    await tip.getByRole("button", { name: "Zavrieť" }).click();
    await expect(tip).toHaveCount(0);

    await expectOneRow([
      page.getByRole("button", { name: "Premenovať", exact: true }),
      page.getByRole("button", { name: "Duplikovať", exact: true }),
      page.getByRole("button", { name: "Zmazať deň", exact: true }),
    ]);
  });
});

test.describe("Menu bez Nastavení / Profilu", () => {
  test.skip(process.env.NODE_ENV === "production", "DEV náhľady len v next dev");

  test("tréner: v menu nie sú Nastavenia, vedie tam ikona s iniciálou", async ({ page }) => {
    await page.goto("/dashboard/klienti/x?preview=progress");
    const nav = page.getByRole("navigation", { name: "Trénerský dashboard" });
    await expect(nav.getByRole("link", { name: "Klienti" })).toBeVisible();
    await expect(nav.getByRole("link", { name: /Nastavenia/ })).toHaveCount(0);
    const avatar = page.getByRole("link", { name: /— Nastavenia$/ });
    await expect(avatar).toBeVisible();
    await expect(avatar).toHaveAttribute("href", "/dashboard/nastavenia");
    await expect(avatar).toHaveAttribute("data-tour", "nav-nastavenia");
  });

  test("klient: v menu nie je Profil, vedie tam ikona; sprievodca ukáže na ňu", async ({ page }) => {
    await page.goto("/portal?preview=ok&tour=1");
    const nav = page.getByRole("navigation", { name: "Klientsky portál" });
    await expect(nav.getByRole("link", { name: "Dnes" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Profil", exact: true })).toHaveCount(0);
    // na mobile ikona v hlavičke, na počítači pilulka dole v bočnom paneli — vždy práve jedna viditeľná
    const avatar = page.locator('[data-tour="nav-profil"]:visible');
    await expect(avatar).toHaveCount(1);
    await expect(avatar).toHaveAttribute("href", "/portal/profil");

    // posledný krok sprievodcu zvýrazní práve viditeľnú ikonu
    await expect(page.getByRole("dialog", { name: "Návod: Dnes" })).toBeVisible();
    while (!(await page.getByRole("dialog", { name: "Návod: Profil" }).isVisible())) {
      await page.getByRole("button", { name: "Ďalej" }).click();
    }
    const spotlight = page.locator('[class*="spotlight"]');
    await expect(spotlight).toBeVisible();
    await expect
      .poll(async () => overlaps((await spotlight.boundingBox())!, (await avatar.boundingBox())!), { timeout: 5_000 })
      .toBe(true);
  });

  test("tréner: sprievodca na poslednom kroku zvýrazní ikonu s iniciálou", async ({ page }) => {
    await page.goto("/dashboard/klienti/x?preview=progress&tour=1");
    await expect(page.getByRole("dialog", { name: "Návod: Klienti" })).toBeVisible();
    while (!(await page.getByRole("dialog", { name: "Návod: Nastavenia" }).isVisible())) {
      await page.getByRole("button", { name: "Ďalej" }).click();
    }
    const avatar = page.getByRole("link", { name: /— Nastavenia$/ });
    const spotlight = page.locator('[class*="spotlight"]');
    await expect(spotlight).toBeVisible();
    await expect
      .poll(async () => overlaps((await spotlight.boundingBox())!, (await avatar.boundingBox())!), { timeout: 5_000 })
      .toBe(true);
  });
});

/** „YYYY-MM-DD“ a „HH:MM“ okamihu v zóne Europe/Bratislava (ako to zadá tréner do formulára). */
function bratislavaParts(d: Date): { date: string; time: string } {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Bratislava",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

async function loginTrainer(page: Page) {
  await page.goto("/prihlasenie");
  await page.locator("#login-email").fill(env.trainerEmail!);
  await page.locator("#login-password").fill(env.trainerPassword!);
  await page.getByRole("button", { name: "Prihlásiť sa" }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
}

async function openTrainerBell(page: Page) {
  await page.getByRole("button", { name: /^Upozornenia/ }).first().click();
  const panel = page.getByRole("region", { name: "Upozornenia" });
  await expect(panel).toBeVisible();
  await expect(panel.getByText("Načítavam…")).toHaveCount(0, { timeout: 15_000 });
  return panel;
}

test.describe("Kalendár a zvonček trénera (reálna DB)", () => {
  test.skip(!hasEnv, "Chýbajú E2E_TRAINER_* údaje alebo Supabase env (aj service role).");

  let trainer: { api: SupabaseClient; userId: string };
  let admin: SupabaseClient;
  const temp: { id: string; name: string }[] = [];
  let title = "";

  test.beforeAll(async () => {
    const stamp = `${test.info().project.name} ${Date.now().toString().slice(-6)}`;
    title = `E2E Termín ${stamp}`;
    admin = createClient(env.url!, env.serviceRole!, AUTH);
    const api = createClient(env.url!, env.anon!, AUTH);
    const { data, error } = await api.auth.signInWithPassword({ email: env.trainerEmail!, password: env.trainerPassword! });
    if (error || !data.user) throw new Error(error?.message);
    trainer = { api, userId: data.user.id };
    for (const name of [`E2E Termín Adam ${stamp}`, `E2E Termín Bea ${stamp}`]) {
      const { data: row, error: insErr } = await api
        .from("clients")
        .insert({ trainer_id: trainer.userId, full_name: name })
        .select("id")
        .single();
      expect(insErr).toBeNull();
      temp.push({ id: row!.id, name });
    }
  });

  test.afterAll(async () => {
    if (!admin) return;
    const ids = temp.map((c) => c.id);
    if (ids.length) {
      const { data: appts } = await admin.from("appointments").select("id").in("client_id", ids);
      const keys = (appts ?? []).map((a) => `appt:${a.id}`);
      if (keys.length) await admin.from("notification_dismissals").delete().in("key", keys);
      // termíny aj správy zmažú kaskády s klientom
      await admin.from("clients").delete().in("id", ids);
    }
  });

  test("nový termín pre dvoch klientov naraz → dva termíny, pripomienka vo zvončeku", async ({ page }) => {
    test.setTimeout(120_000);
    await loginTrainer(page);
    await page.goto("/dashboard/kalendar");

    // o 2 h (v zóne Bratislava) → do 24 h, teda aj vo zvončeku
    const when = bratislavaParts(new Date(Date.now() + 2 * 3600_000));
    const form = page.locator("form").filter({ has: page.getByRole("button", { name: /^Pridať termín/ }) });
    await form.locator('input[name="title"]').fill(title);
    await form.locator('input[name="date"]').fill(when.date);
    await form.locator('input[name="time"]').fill(when.time);

    // bez klienta neodošle a povie prečo (vyplnené polia ostanú)
    await form.getByRole("button", { name: "Pridať termín", exact: true }).click();
    await expect(form.getByRole("alert")).toHaveText("Vyber aspoň jedného klienta.");
    await expect(form.locator('input[name="title"]')).toHaveValue(title);

    await page.getByRole("button", { name: "Vyber klientov" }).click();
    for (const c of temp) await page.getByRole("checkbox", { name: c.name }).click();
    await page.getByRole("button", { name: "Hotovo" }).click();
    await expect(form.getByRole("alert")).toHaveCount(0);
    await expect(form.getByText("Každý vybraný klient dostane vlastný termín v rovnakom čase.")).toBeVisible();
    await form.getByRole("button", { name: "Pridať termín (2)" }).click();
    // po úspechu sa výber vyprázdni
    await expect(page.getByRole("button", { name: "Vyber klientov" })).toBeVisible({ timeout: 15_000 });

    const { data: rows } = await admin.from("appointments").select("client_id, title, starts_at, trainer_id").eq("title", title);
    expect(rows ?? []).toHaveLength(2);
    expect(new Set(rows!.map((r) => r.client_id))).toEqual(new Set(temp.map((c) => c.id)));
    expect(new Set(rows!.map((r) => r.starts_at)).size).toBe(1);
    expect(rows!.every((r) => r.trainer_id === trainer.userId)).toBe(true);

    await page.reload();
    const panel = await openTrainerBell(page);
    await expect(panel.getByText(/blížiac/).first()).toBeVisible();
    for (const c of temp) {
      const row = panel.getByRole("listitem").filter({ has: page.getByRole("link", { name: c.name, exact: true }) });
      await expect(row).toBeVisible();
      await expect(row).toContainText(`${when.time} · ${title}`);
      await expect(row.getByRole("button", { name: `Skryť ${c.name}`, exact: true })).toBeVisible();
    }
  });

  test("neprečítané správy vo zvončeku s menom klienta a odkazom do jeho vlákna", async ({ page }) => {
    test.setTimeout(120_000);
    const [adam] = temp;
    const { error } = await admin.from("messages").insert({ client_id: adam.id, sender: "client", body: "E2E ahoj" });
    expect(error).toBeNull();

    await loginTrainer(page);
    const panel = await openTrainerBell(page);
    const thread = panel.locator(`a[href="/dashboard/spravy?client=${adam.id}"]`);
    await expect(thread).toBeVisible();
    // buď nadpis „1 neprečítaná správa od <meno>“ (jediný klient), alebo odkaz s menom pod súčtom
    await expect(thread).toContainText(adam.name);
    await expect(panel.getByText(/od klientov/)).toHaveCount(0);
    await thread.click();
    await expect(page).toHaveURL(new RegExp(`/dashboard/spravy\\?client=${adam.id}`));
  });
});
