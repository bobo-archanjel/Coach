import { readFileSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { GUIDES } from "../lib/onboarding/guides";
import { CLIENT_TOUR_STEPS, TRAINER_TOUR_STEPS } from "../lib/onboarding/tourSteps";

/**
 * Sprievodca appkou (feature/sprievodca-sekcii):
 *  - plynulý sprievodca (?tour=1 / prvé prihlásenie) prejde sekcie z menu jednu po druhej:
 *    položka menu, hlavné funkcie sekcie na jej stránke, potom sám prejde na ďalšiu sekciu,
 *  - hlbšie okná (builder, detail klienta, zapisovanie tréningu) majú krátkeho sprievodcu pri
 *    prvom otvorení — sám sa spustí raz, zoznam videných je v účte (migrácia 0060).
 * Konfigurácia testov má cookie fitpilot_guides_seen=all (sprievodcovia okien vypnutí);
 * ich testy odpoveď API podvrhnú alebo cookie zmažú. Test zápisu do účtu sa bez migrácie preskočí.
 *   E2E_TRAINER_EMAIL, E2E_TRAINER_PASSWORD, E2E_CLIENT_EMAIL, E2E_CLIENT_PASSWORD
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
  clientEmail: process.env.E2E_CLIENT_EMAIL,
  clientPassword: process.env.E2E_CLIENT_PASSWORD,
};
const hasEnv = Object.values(env).every(Boolean);
const AUTH = { auth: { persistSession: false, autoRefreshToken: false } };
const DEV = process.env.NODE_ENV !== "production";

type Text = { title: string; body: string };
const messages = (locale: "sk" | "cs") => JSON.parse(readFileSync(`messages/${locale}/tour.json`, "utf8")) as Record<string, unknown>;
/** Text podľa cesty ku kľúču („trainer.navClients“, „guides.t-plan.days“). */
const textAt = (root: Record<string, unknown>, path: string) =>
  path.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], root) as Text | undefined;
const sk = messages("sk");
const guideTitle = (id: string, key: string) => textAt(sk, `guides.${id}.${key}`)!.title;

async function login(page: Page, email: string, password: string, to: RegExp) {
  await page.goto("/prihlasenie");
  await page.locator("#login-email").fill(email);
  await page.locator("#login-password").fill(password);
  await page.getByRole("button", { name: "Prihlásiť sa" }).click();
  await page.waitForURL(to, { timeout: 30_000 });
}

/** Stlmenie sprievodcu (aj počas čakania na stránku) a jeho bublina s krokom. */
const overlay = (page: Page) => page.locator("[data-tour-overlay]");
const bubble = (page: Page) => page.locator("[data-tour-overlay][role=dialog]");

/** Aktuálny krok: zvýraznenie je vidieť a bublina je celá v okne. Vráti titulok. */
async function expectStep(page: Page, label: string): Promise<string> {
  const dialog = bubble(page);
  await expect(dialog, label).toBeVisible({ timeout: 15_000 });
  await expect(dialog.locator("[class*=spotlight]"), label).toBeVisible();
  const heading = (await dialog.locator("h3").textContent()) ?? "";
  // po doscrollovaní na cieľ (plynulý posun + prechod polohy) je bublina celá v okne
  const tip = dialog.locator("[class*=tooltip]");
  const vp = page.viewportSize()!;
  await expect
    .poll(
      async () => {
        const box = await tip.boundingBox();
        return !!box && box.x >= 0 && box.y >= 0 && box.x + box.width <= vp.width + 1 && box.y + box.height <= vp.height + 1;
      },
      { message: `${label} · ${heading}: bublina celá v okne`, timeout: 5_000 },
    )
    .toBe(true);
  return heading;
}

/** Prejde otvoreného sprievodcu do konca; vráti kroky s adresou, na ktorej sa ukázali. */
async function walk(page: Page, label: string): Promise<{ path: string; title: string }[]> {
  const shown: { path: string; title: string }[] = [];
  for (let i = 0; i < 60; i++) {
    const title = await expectStep(page, label);
    shown.push({ path: new URL(page.url()).pathname, title });
    const dialog = bubble(page);
    const finish = dialog.getByRole("button", { name: "Dokončiť" });
    if (await finish.isVisible()) {
      await finish.click();
      await expect(overlay(page), label).toHaveCount(0, { timeout: 15_000 });
      return shown;
    }
    await dialog.getByRole("button", { name: "Ďalej" }).click();
    // ďalší krok (aj po prechode na inú sekciu): iný titulok alebo iná adresa
    const before = `${shown[shown.length - 1].path}|${title}`;
    await expect
      .poll(
        async () => {
          if (!(await bubble(page).isVisible())) return before; // stlmenie pri prechode na ďalšiu sekciu
          return `${new URL(page.url()).pathname}|${await bubble(page).locator("h3").textContent()}`;
        },
        { message: `${label}: krok po „${title}“`, timeout: 20_000 },
      )
      .not.toBe(before);
  }
  throw new Error(`${label}: sprievodca sa neskončil`);
}

/** GET zoznamu videných vráti `seen`; POST zapíše id do vráteného poľa, DELETE zvýši počítadlo. */
async function mockGuides(page: Page, seen: string[]) {
  const calls = { marked: [] as string[], resets: 0 };
  await page.route("**/api/onboarding/guides", async (route) => {
    const req = route.request();
    if (req.method() === "POST") calls.marked.push((req.postDataJSON() as { id: string }).id);
    if (req.method() === "DELETE") calls.resets++;
    await route.fulfill({ json: req.method() === "GET" ? { auto: true, seen } : { ok: true } });
  });
  return calls;
}

/** Sprievodca okna `id` sa spustil sám; ukáže povinné kroky v poradí, voliteľné len ak majú cieľ. */
async function expectGuide(page: Page, id: string) {
  const g = GUIDES.find((x) => x.id === id)!;
  const shown = (await walk(page, id)).map((s) => s.title);
  const all = g.steps.map((s) => guideTitle(id, s.key));
  expect(all.filter((t) => shown.includes(t)), `${id}: poradie krokov`).toEqual(shown);
  for (const s of g.steps.filter((x) => !x.optional)) expect(shown, `${id}: povinný krok`).toContain(guideTitle(id, s.key));
}

test.describe("texty sprievodcu", () => {
  test("každý krok má titulok aj text v slovenčine aj češtine", () => {
    for (const locale of ["sk", "cs"] as const) {
      const root = messages(locale);
      const paths = [
        ...TRAINER_TOUR_STEPS.map((s) => s.text),
        ...CLIENT_TOUR_STEPS.map((s) => s.text),
        ...GUIDES.flatMap((g) => g.steps.map((s) => `guides.${g.id}.${s.key}`)),
      ];
      for (const path of paths) {
        expect(textAt(root, path)?.title, `${locale} ${path}.title`).toBeTruthy();
        expect(textAt(root, path)?.body, `${locale} ${path}.body`).toBeTruthy();
      }
      // žiadne osirelé texty v `guides`
      const used = new Set(paths.filter((p) => p.startsWith("guides.")));
      const present = Object.entries(root.guides as Record<string, Record<string, Text>>).flatMap(([id, steps]) =>
        Object.keys(steps).map((key) => `guides.${id}.${key}`),
      );
      expect(present.filter((p) => !used.has(p)), `${locale}: texty bez kroku`).toEqual([]);
    }
  });
});

test.describe("plynulý sprievodca (DEV náhľad klienta)", () => {
  test.skip(!DEV, "DEV náhľady len v next dev");

  test("prejde sekcie jednu po druhej a skončí na úvodnej", async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto("/portal?preview=ok&tour=1");
    const shown = await walk(page, "klient");
    // poradie sekcií = poradie v menu; každá sekcia začína svojou položkou menu
    const paths = shown.map((s) => s.path).filter((p, i, a) => p !== a[i - 1]);
    expect(paths.filter((p) => p !== "/portal/ai-kouc")).toEqual([
      "/portal",
      "/portal/trening",
      "/portal/strava",
      "/portal/dennik",
      "/portal/chat",
      "/portal/profil",
    ]);
    for (const [path, navTitle] of [
      ["/portal", "Dnes"],
      ["/portal/trening", "Tréning"],
      ["/portal/dennik", "Denník"],
      ["/portal/profil", "Profil"],
    ]) {
      expect(shown.find((s) => s.path === path)?.title, `${path}: prvý krok je položka menu`).toBe(navTitle);
    }
    // obsah sekcií sa vysvetľuje na ich stránke
    for (const [path, title] of [
      ["/portal", "Tvoj tréning"],
      ["/portal", "Týždeň"],
      ["/portal/trening", "Vlastný tréning"],
      ["/portal/dennik", "Pridanie jedla"],
      ["/portal/profil", "Návod"],
    ]) {
      expect(shown, `${path}: krok „${title}“`).toContainEqual({ path, title });
    }
    // „Dokončiť“ vráti na Dnes, bez ?tour=1
    await expect(page).toHaveURL(/\/portal\?preview=ok$/);
  });

  test("„Späť“ sa vráti aj cez hranicu sekcie, „Preskočiť“ skončí na aktuálnej stránke", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/portal?preview=ok&tour=1");
    const next = () => bubble(page).getByRole("button", { name: "Ďalej" }).click();
    await expect(page.getByRole("dialog", { name: "Návod: Dnes" })).toBeVisible({ timeout: 15_000 });
    await expect(bubble(page).getByRole("button", { name: "Späť" })).toHaveCount(0); // prvý krok
    // až po položku menu ďalšej sekcie
    let last = "";
    while (!(await page.getByRole("dialog", { name: "Návod: Tréning" }).isVisible())) {
      last = (await bubble(page).locator("h3").textContent()) ?? "";
      await next();
      await expect(bubble(page)).toBeVisible({ timeout: 15_000 });
    }
    await expect(page).toHaveURL(/\/portal\/trening/);
    await bubble(page).getByRole("button", { name: "Späť" }).click();
    await expect(page.getByRole("dialog", { name: `Návod: ${last}` })).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveURL(/\/portal\?/);
    // dopredu na Tréning a preskočiť — ostáva sa na Tréningu
    await next();
    await expect(page.getByRole("dialog", { name: "Návod: Tréning" })).toBeVisible({ timeout: 15_000 });
    await bubble(page).getByRole("button", { name: "Preskočiť" }).click();
    await expect(overlay(page)).toHaveCount(0);
    await expect(page).toHaveURL(/\/portal\/trening/);
  });
});

test.describe("sprievodcovia hlbších okien (podvrhnutý zoznam videných)", () => {
  test.skip(!DEV, "DEV náhľady len v next dev");

  test("builder tréningu: pri prvom otvorení sa spustí sám, zapíše sa a neopakuje sa", async ({ page }) => {
    const calls = await mockGuides(page, []);
    await page.goto("/dashboard/treningy/x?preview=builder");
    await expect(page.getByRole("dialog", { name: "Návod: Tréningové dni" })).toBeVisible({ timeout: 15_000 });
    expect(calls.marked).toEqual(["t-plan"]); // zapísané hneď pri spustení, nie až po dokončení
    await expectGuide(page, "t-plan");
    await page.waitForTimeout(3000);
    await expect(overlay(page)).toHaveCount(0);
    expect(calls.marked).toEqual(["t-plan"]);
  });

  test("videný sprievodca sa nespustí; sekcie z menu vlastného sprievodcu okna nemajú", async ({ page }) => {
    await mockGuides(page, ["t-plan"]);
    await page.goto("/dashboard/treningy/x?preview=builder");
    await expect(page.locator('[data-tour="plan-days"]')).toBeVisible();
    await page.waitForTimeout(3000);
    await expect(overlay(page)).toHaveCount(0);
    // Dnes patrí plynulému sprievodcovi — pri bežnej návšteve sa tam nič samo nespustí
    await page.unroute("**/api/onboarding/guides");
    await mockGuides(page, []);
    await page.goto("/portal?preview=ok");
    await expect(page.locator('[data-tour="today-hero"]')).toBeVisible();
    await page.waitForTimeout(3000);
    await expect(overlay(page)).toHaveCount(0);
  });

  test("zapisovanie tréningu: spustí sa po „Začať tréning“", async ({ page }) => {
    const calls = await mockGuides(page, []);
    await page.goto("/portal?preview=ok");
    await page.getByRole("button", { name: "Začať tréning" }).first().click();
    await expect(page.locator('[data-tour="workout-form"]')).toBeVisible();
    await expect(page.getByRole("dialog", { name: "Návod: Zapisovanie sérií" })).toBeVisible({ timeout: 15_000 });
    await expectGuide(page, "c-workout");
    expect(calls.marked).toEqual(["c-workout"]);
  });

  test("vlastný tréning klienta: spustí sa po otvorení buildera", async ({ page }) => {
    const calls = await mockGuides(page, []);
    await page.goto("/portal/trening?preview=ok");
    await page.getByRole("button", { name: "Vlastný tréning" }).click();
    await expect(page.locator('[data-tour="cbuilder-days"]')).toBeVisible();
    await expect(page.getByRole("dialog", { name: "Návod: Názov tréningu" })).toBeVisible({ timeout: 15_000 });
    await expectGuide(page, "c-builder");
    expect(calls.marked).toEqual(["c-builder"]);
  });

  test("otvorené okno sprievodcu zdrží", async ({ page }) => {
    await mockGuides(page, []);
    await page.goto("/dashboard/treningy/x?preview=builder");
    await page.getByRole("button", { name: "+ deň" }).click();
    await expect(page.getByRole("dialog", { name: "Nový deň" })).toBeVisible();
    await page.waitForTimeout(3000);
    await expect(overlay(page)).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Návod: Tréningové dni" })).toBeVisible({ timeout: 15_000 });
  });

  test("plynulý sprievodca má prednosť a „Spustiť návod znova“ vráti aj sprievodcov okien", async ({ page }) => {
    const calls = await mockGuides(page, []);
    await page.goto("/portal?preview=ok&tour=1");
    await expect(page.getByRole("dialog", { name: "Návod: Dnes" })).toBeVisible({ timeout: 15_000 });
    await expect.poll(() => calls.resets).toBe(1); // ?tour=1 vynuluje zoznam videných okien
    await page.waitForTimeout(3000);
    await expect(bubble(page)).toHaveCount(1);
    await expect(page.getByRole("dialog", { name: "Návod: Dnes" })).toBeVisible();
    expect(calls.marked).toEqual([]);
  });
});

test.describe("reálna DB (QA tréner a klient)", () => {
  test.skip(!hasEnv, "chýbajú E2E_* / Supabase env premenné");
  test.describe.configure({ mode: "serial" });

  let api: SupabaseClient;
  let admin: SupabaseClient;
  let trainerId = "";
  let qaClientId = "";
  let migrated = false;
  let seenBefore: string[] = [];
  const planIds: string[] = [];

  test.beforeAll(async () => {
    admin = createClient(env.url!, env.serviceRole!, AUTH);
    api = createClient(env.url!, env.anon!, AUTH);
    const { data, error } = await api.auth.signInWithPassword({ email: env.trainerEmail!, password: env.trainerPassword! });
    if (error || !data.user) throw new Error(`Prihlásenie trénera zlyhalo: ${error?.message}`);
    trainerId = data.user.id;
    const { data: row } = await admin.from("clients").select("id").eq("trainer_id", trainerId).not("user_id", "is", null).limit(1).single();
    qaClientId = row!.id;
    const seen = await api.rpc("get_guides_seen");
    migrated = !seen.error && Array.isArray(seen.data);
    seenBefore = migrated ? (seen.data as string[]) : [];
  });

  test.afterAll(async () => {
    if (planIds.length) await admin.from("meal_plans").delete().in("id", planIds);
    if (migrated) {
      await api.rpc("reset_guides_seen");
      for (const id of seenBefore) await api.rpc("mark_guide_seen", { p_guide: id });
    }
  });

  test("tréner: plynulý sprievodca vysvetlí každú sekciu na jej stránke", async ({ page }) => {
    test.setTimeout(240_000);
    await mockGuides(page, []); // „Spustiť návod znova“ nesiaha na zoznam videných QA účtu
    await login(page, env.trainerEmail!, env.trainerPassword!, /\/dashboard/);
    await page.goto("/dashboard?tour=1");
    const shown = await walk(page, "tréner");
    for (const [path, titles] of [
      ["/dashboard", ["Klienti", "Nový klient", "Upozornenia"]],
      ["/dashboard/treningy", ["Tréningy", "Nový plán", "AI generátor"]],
      ["/dashboard/jedalnicky", ["Jedálničky", "Nový jedálniček"]],
      ["/dashboard/spravy", ["Správy", "Konverzácie", "Hromadná správa"]],
      ["/dashboard/kalendar", ["Kalendár", "Nový termín", "Pripomienka"]],
      ["/dashboard/sablony", ["Šablóny", "Druh šablón"]],
      ["/dashboard/nastavenia", ["Nastavenia", "Návod"]],
    ] as const) {
      const here = shown.filter((s) => s.path === path).map((s) => s.title);
      expect(here.slice(0, 1), `${path}: prvý krok je položka menu`).toEqual([titles[0]]);
      for (const title of titles) expect(here, `${path}: krok „${title}“`).toContain(title);
    }
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("klient: plynulý sprievodca vysvetlí každú sekciu na jej stránke", async ({ page }) => {
    test.setTimeout(240_000);
    await mockGuides(page, []);
    await login(page, env.clientEmail!, env.clientPassword!, /\/portal/);
    await page.goto("/portal?tour=1");
    const shown = await walk(page, "klient");
    for (const [path, titles] of [
      ["/portal", ["Dnes", "Tvoj tréning", "Môj prehľad", "Týždeň", "Meranie", "Upozornenia"]],
      ["/portal/trening", ["Tréning", "Vlastný tréning"]],
      ["/portal/strava", ["Strava", "Makro cieľ", "Jedálniček"]],
      ["/portal/dennik", ["Denník", "Dnešný príjem", "Iný deň", "Pridanie jedla"]],
      ["/portal/chat", ["Chat", "Správa trénerovi"]],
      ["/portal/ai-kouc", ["AI Kouč", "Pýtaj sa"]],
      ["/portal/profil", ["Profil", "Prepojenie s trénerom", "Vzhľad a jazyk", "Návod"]],
    ] as const) {
      const here = shown.filter((s) => s.path === path).map((s) => s.title);
      expect(here.slice(0, 1), `${path}: prvý krok je položka menu`).toEqual([titles[0]]);
      for (const title of titles) expect(here, `${path}: krok „${title}“`).toContain(title);
    }
    await expect(page).toHaveURL(/\/portal$/);
  });

  test("tréner: sprievodca detailom klienta a builderom jedálnička", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "zápis do DB len raz (desktop)");
    test.setTimeout(120_000);
    const { data: plan, error } = await api
      .from("meal_plans")
      .insert({ client_id: qaClientId, trainer_id: trainerId, name: `E2E Sprievodca ${Date.now().toString().slice(-6)}`, published: false })
      .select("id")
      .single();
    expect(error).toBeNull();
    planIds.push(plan!.id);
    await api.from("meal_days").insert({
      plan_id: plan!.id,
      day_number: 1,
      name: "Pondelok",
      meals: [
        {
          entry_id: crypto.randomUUID(),
          food_id: crypto.randomUUID(),
          food_name: "E2E potravina",
          meal_slot: "obed",
          grams: 100,
          kcal_100g: 150,
          protein_100g: 10,
          carbs_100g: 10,
          fat_100g: 5,
        },
      ],
    });
    const calls = await mockGuides(page, []);
    await login(page, env.trainerEmail!, env.trainerPassword!, /\/dashboard/);
    await page.goto(`/dashboard/klienti/${qaClientId}`);
    await expectGuide(page, "t-client");
    await page.goto(`/dashboard/jedalnicky/jedalnicek/${plan!.id}`);
    await expectGuide(page, "t-mealplan");
    expect(calls.marked).toEqual(["t-client", "t-mealplan"]);
  });

  test("tréner: videný sprievodca okna je zapísaný v účte (migrácia 0060)", async ({ page, context }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "zápis do DB len raz (desktop)");
    test.skip(!migrated, "migrácia 0060 (profiles.guides_seen) na tejto DB ešte nebežala");
    await api.rpc("reset_guides_seen");
    await login(page, env.trainerEmail!, env.trainerPassword!, /\/dashboard/);
    await context.clearCookies({ name: "fitpilot_guides_seen" });
    await page.goto(`/dashboard/klienti/${qaClientId}`);
    await expect(page.getByRole("dialog", { name: "Návod: Všetko o klientovi" })).toBeVisible({ timeout: 15_000 });
    await expect.poll(async () => (await api.rpc("get_guides_seen")).data as string[], { timeout: 10_000 }).toContain("t-client");
    await walk(page, "t-client");
    // druhá návšteva — už sa nespustí
    await page.reload();
    await expect(page.locator('[data-tour="client-tabs"]')).toBeVisible();
    await page.waitForTimeout(3500);
    await expect(overlay(page)).toHaveCount(0);
  });
});
