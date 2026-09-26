import { test, expect, type Page, type Browser } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import {
  comparePlanWithActual,
  parseLoggedEntries,
  parsePlanSnapshot,
  rowTone,
  snapshotToPlanEntries,
} from "../lib/workouts/completed";
import { parseReps, parseWeight, summarizeWorkoutForm } from "../lib/workouts/setInput";

/**
 * Dokončený tréning je len na čítanie (feature/training-done, migrácia 0048).
 *
 * 1. Čistá logika plán vs. realita (lib/workouts/completed.ts).
 * 2. UI cez DEV `?preview=` (bez session): detail trénera + karta Dnes v portáli.
 * 3. Celý tok proti reálnej Supabase DB — tréner vytvorí tréning → klient ho
 *    odcvičí a ukončí → tréner vidí presne tie hodnoty bez editácie → priame
 *    úpravy cez Supabase zlyhajú → "Duplikovať" vytvorí editovateľnú kópiu.
 *    Beží len s QA účtami v env (spárovaný tréner + klient) a so spustenou 0048:
 *      E2E_TRAINER_EMAIL, E2E_TRAINER_PASSWORD, E2E_CLIENT_EMAIL, E2E_CLIENT_PASSWORD
 *    Po sebe zmaže vytvorené plány; zamknuté záznamy tréningu v DB ostanú (tak má byť).
 */

function collectErrors(page: Page): string[] {
  const e: string[] = [];
  page.on("pageerror", (x) => e.push(x.message));
  page.on("console", (m) => {
    if (m.type() === "error") e.push(`console: ${m.text()}`);
  });
  return e;
}
const IGNORED = [/favicon/i, /supabase/i, /Failed to fetch/i, /net::ERR/i, /Failed to load resource.*40[34]/i];
const real = (e: string[]) => e.filter((x) => !IGNORED.some((re) => re.test(x)));

// ---------------------------------------------------------------- 1. logika
test.describe("plán vs. realita — čistá logika", () => {
  const snapshot = parsePlanSnapshot({
    plan_id: "p",
    plan_name: "Plán",
    day_id: "d",
    day_name: "Deň A",
    exercises: [
      { entry_id: "e1", exercise_id: "x1", exercise_name: "Drep", sets: 3, reps: "8-10", load_kg: 60, tempo: null, rest_seconds: 90 },
      { entry_id: "e2", exercise_id: null, exercise_name: "Plank", sets: 2, reps: 30, load_kg: null, tempo: null, rest_seconds: 60 },
    ],
  });

  test("páruje podľa entryId, označí sériu navyše, vynechaný cvik aj cvik mimo plánu", () => {
    const entries = parseLoggedEntries([
      { entryId: "e1", name: "Drep", note: "ťažké", sets: [{ reps: 8, weight: 60 }, { reps: 10, weight: 62.5 }, { reps: 6, weight: 60 }, { reps: 5, weight: 55 }] },
      { entryId: null, name: "Bicykel", sets: [{ reps: null, weight: null, durationS: 600, distanceM: 4000 }] },
    ]);
    const rows = comparePlanWithActual(snapshot, entries);

    expect(rows.map((r) => [r.name, r.status])).toEqual([
      ["Drep", "planned"],
      ["Plank", "skipped"],
      ["Bicykel", "extra"],
    ]);
    const drep = rows[0];
    expect(drep.note).toBe("ťažké");
    expect(drep.rows).toHaveLength(4);
    expect(drep.rows[3].planned).toBeNull(); // 4. séria navyše
    expect(drep.rows.map(rowTone)).toEqual(["met", "above", "below", null]);
    expect(rows[1].rows.every((r) => r.actual === null)).toBe(true);
    expect(rows[2].rows[0].actual).toMatchObject({ durationS: 600, distanceM: 4000 });
  });

  test("starší záznam bez entryId sa spáruje podľa názvu; reps ako číslo sa zachová", () => {
    const entries = parseLoggedEntries([{ exercise_name: "plank", sets: [{ reps: 30, weight: null }] }]);
    const rows = comparePlanWithActual(snapshot, entries);
    expect(rows.find((r) => r.name === "Plank")?.status).toBe("planned");
    expect(snapshot?.exercises[1].reps).toBe("30");
  });

  test("duplikát plánu = plánované hodnoty s novými entry_id, bez výsledkov", () => {
    let n = 0;
    const entries = snapshotToPlanEntries(snapshot!, () => `new-${++n}`);
    expect(entries).toEqual([
      { entry_id: "new-1", exercise_id: "x1", exercise_name: "Drep", sets: 3, reps: "8-10", load_kg: 60, tempo: null, rest_seconds: 90 },
      { entry_id: "new-2", exercise_id: null, exercise_name: "Plank", sets: 2, reps: "30", load_kg: null, tempo: null, rest_seconds: 60 },
    ]);
  });
});

// ---------------------------------------------------------------- 2. UI (preview)
test.describe("detail dokončeného tréningu — tréner (?preview=done)", () => {
  test("štítok Dokončený, plán vs. realita, žiadna editácia, akcia Duplikovať", async ({ page }) => {
    const errs = collectErrors(page);
    await page.goto("/dashboard/klienti/c1/treningy/l1?preview=done");

    await expect(page.getByRole("heading", { name: "Deň A — Nohy" })).toBeVisible();
    await expect(page.getByTestId("workout-status")).toHaveText(/Dokončený – 24\. 9\. 2026/);

    const drep = page.getByTestId("completed-exercise").filter({ hasText: "Drep s činkou" });
    await expect(drep.getByText("Plán: 3 × 8 · 60 kg · tempo 3-0-1 · pauza 120 s")).toBeVisible();
    const rows = drep.getByTestId("set-row");
    await expect(rows).toHaveCount(4);
    await expect(rows.nth(1)).toContainText("8 op. × 60 kg");
    await expect(rows.nth(1)).toContainText("8 op. × 62.5 kg");
    await expect(rows.nth(3)).toContainText("navyše");

    const rdl = page.getByTestId("completed-exercise").filter({ hasText: "Rumunský mŕtvy ťah" });
    await expect(rdl.getByText(/Bolel ma spodný chrbát/)).toBeVisible();
    await expect(rdl.getByTestId("set-row").nth(2)).toContainText("neodcvičené");

    await expect(page.getByTestId("completed-exercise").filter({ hasText: "Lýtka v stoji" })).toContainText("Nezapísané");
    await expect(page.getByTestId("completed-exercise").filter({ hasText: "Bicykel" })).toContainText("10:00 min × 4,2 km");
    await expect(page.getByText("8/10")).toBeVisible();

    // len na čítanie: žiadne vstupy, úpravy, mazanie ani presúvanie
    await expect(page.locator("main input, main textarea, main select")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Upraviť|Uložiť|Zmazať|Odobrať|Posunúť|hore|dole/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Duplikovať ako nový tréning" })).toBeEnabled();

    expect(real(errs), real(errs).join("\n")).toEqual([]);
  });
});

test.describe("portál — dokončený tréning na karte Dnes (?preview=done)", () => {
  test("zapísané hodnoty + Upraviť hodnoty v 24 h okne (predvyplnený formulár, Zrušiť)", async ({ page }) => {
    const errs = collectErrors(page);
    await page.goto("/portal?preview=done");

    await expect(page.getByText("6 op. × 92 kg").first()).toBeVisible();
    await expect(page.getByText(/Posledná séria ťažká na úchop/)).toBeVisible();
    await expect(page.getByText(/RPE 8/)).toBeVisible();
    await expect(page.getByText(/Zabudnuté hodnoty môžeš opraviť do (dnes|zajtra) \d/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Začať tréning" })).toHaveCount(0);

    await page.getByRole("button", { name: /Upraviť hodnoty/ }).click();
    await expect(page.getByLabel("Drep s veľkou činkou, séria 1, opakovania")).toHaveValue("6");
    await expect(page.getByLabel("Drep s veľkou činkou, séria 1, váha v kg")).toHaveValue("92");
    await expect(page.getByLabel("Poznámka k cviku Rumunský mŕtvy ťah")).toHaveValue("Posledná séria ťažká na úchop");
    await expect(page.getByLabel("Náročnosť tréningu (RPE)")).toHaveValue("8");
    await page.getByRole("button", { name: "Zrušiť" }).click();
    await expect(page.getByRole("button", { name: /Upraviť hodnoty/ })).toBeVisible();

    expect(real(errs), real(errs).join("\n")).toEqual([]);
  });
});

test.describe("portál — plán hotový (?preview=complete)", () => {
  test("všetky dni odcvičené: žiadne Začať tréning", async ({ page }) => {
    await page.goto("/portal?preview=complete");
    await expect(page.getByRole("heading", { name: "Plán máš hotový" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Začať tréning" })).toHaveCount(0);
  });
});

test.describe("sekcia Tréning — odcvičený deň (?preview=ok)", () => {
  test("neodcvičený: Začať · odcvičený v okne: Upraviť hodnoty · po okne: uzavreté", async ({ page }) => {
    await page.goto("/portal/trening?preview=ok");
    await page.getByRole("button", { name: /Silový plán/ }).click().catch(() => {});
    const plan = page.getByRole("button", { name: /Silový plán/ });
    if ((await plan.getAttribute("aria-expanded")) !== "true") await plan.click();

    await page.getByRole("button", { name: /Deň A — Tlak/ }).click();
    await expect(page.getByRole("button", { name: "Začať tréning" })).toHaveCount(0);
    await page.getByRole("button", { name: /Upraviť hodnoty/ }).click();
    await expect(page.getByLabel("Bench press, séria 1, váha v kg")).toHaveValue("80");
    await expect(page.getByRole("button", { name: "Uložiť zmeny" })).toBeVisible();
    await page.getByRole("button", { name: "Zrušiť" }).click();

    await page.getByRole("button", { name: "Všetky dni" }).click();
    await page.getByRole("button", { name: /Deň B — Ťah/ }).click();
    await expect(page.getByRole("button", { name: /Upraviť hodnoty|Začať tréning/ })).toHaveCount(0);
    await expect(page.getByText(/teraz sú uzavreté/)).toBeVisible();

    await page.getByRole("button", { name: /Moje kardio/ }).click();
    await page.getByRole("button", { name: /Rozcvička/ }).click();
    await expect(page.getByRole("button", { name: "Začať tréning" })).toBeVisible();
  });
});

test.describe("zápis série — parsovanie a validácia (lib/workouts/setInput.ts)", () => {
  test("desatinná čiarka aj bodka, prázdne = nezadané", () => {
    expect(parseWeight("62,5")).toEqual({ value: 62.5, error: null });
    expect(parseWeight(" 62.5 ")).toEqual({ value: 62.5, error: null });
    expect(parseWeight("")).toEqual({ value: null, error: null });
    expect(parseReps("8")).toEqual({ value: 8, error: null });
  });

  test("nezmysly sa odmietnu namiesto tichého orezania", () => {
    for (const bad of ["-5", "abc", "1001", "62,555", "1e3"]) expect(parseWeight(bad).error, bad).not.toBeNull();
    for (const bad of ["-1", "8.5", "8,5", "1000", "x"]) expect(parseReps(bad).error, bad).not.toBeNull();
  });

  test("súhrn formulára: neplatné polia, cviky bez zápisu, nič nezapísané", () => {
    const s = summarizeWorkoutForm(3, {
      0: [{ reps: "8", weight: "62,5" }, { reps: "", weight: "" }],
      1: [{ reps: "9999", weight: "60" }],
      2: [],
    });
    expect(s.sets[0]).toEqual([{ reps: 8, weight: 62.5 }]);
    expect(s.invalidCount).toBe(1);
    expect(s.emptyExercises).toEqual([1, 2]);
    expect(s.nothingLogged).toBe(false);
    expect(summarizeWorkoutForm(2, { 0: [{ reps: "", weight: "" }] }).nothingLogged).toBe(true);
  });
});

test.describe("portál — formulár pri ukončení (?preview=ok)", () => {
  const reps = (page: Page, ex: string, set: number) => page.getByLabel(`${ex}, séria ${set}, opakovania`);
  const kg = (page: Page, ex: string, set: number) => page.getByLabel(`${ex}, séria ${set}, váha v kg`);

  test.beforeEach(async ({ page }) => {
    await page.goto("/portal?preview=ok");
    // koncept z predošlého testu (localStorage) nech neovplyvní ďalší
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.getByRole("button", { name: "Začať tréning" }).click();
  });

  test("série + voliteľná poznámka ku cviku, RPE a poznámka k tréningu", async ({ page }) => {
    await reps(page, "Drep s veľkou činkou", 1).fill("6");
    await page.getByRole("button", { name: "Poznámka" }).first().click();
    await expect(page.getByLabel("Poznámka k cviku Drep s veľkou činkou")).toBeVisible();
    await page.getByLabel("Náročnosť tréningu (RPE)").selectOption("8");
    await page.getByLabel("Poznámka k tréningu").fill("OK");

    await page.getByRole("button", { name: "Ukončiť tréning" }).click();
    await expect(page.getByText(/zabudnuté hodnoty môžeš opraviť ešte 24 hodín/)).toBeVisible();
  });

  test("K8: desatinná čiarka ostane „62,5“, placeholder ukazuje plánovanú váhu", async ({ page }) => {
    const field = kg(page, "Drep s veľkou činkou", 1);
    await expect(field).toHaveAttribute("placeholder", "90");
    await expect(field).toHaveAttribute("inputmode", "decimal");
    await field.pressSequentially("62,5");
    await expect(field).toHaveValue("62,5");
    await page.getByRole("button", { name: "Ukončiť tréning" }).click();
    await expect(page.getByRole("alertdialog")).toBeVisible();
  });

  test("K9: neplatné hodnoty zablokujú ukončenie a sú označené", async ({ page }) => {
    await reps(page, "Drep s veľkou činkou", 1).fill("8,5");
    await kg(page, "Drep s veľkou činkou", 2).fill("-5");
    await page.getByRole("button", { name: "Ukončiť tréning" }).click();

    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    const invalidMsg = page.getByText("Oprav označené hodnoty.");
    await expect(invalidMsg).toBeVisible();
    await expect(reps(page, "Drep s veľkou činkou", 1)).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByText("Opakovania zadaj ako celé číslo.")).toBeVisible();
    await expect(page.getByText("Váhu zadaj ako číslo, napr. 62,5.")).toBeVisible();

    // po oprave sa dá pokračovať
    await reps(page, "Drep s veľkou činkou", 1).fill("8");
    await kg(page, "Drep s veľkou činkou", 2).fill("60");
    await expect(invalidMsg).toHaveCount(0);
    await page.getByRole("button", { name: "Ukončiť tréning" }).click();
    await expect(page.getByRole("alertdialog")).toBeVisible();
  });

  test("K17: ukončenie bez hodnôt a cviky bez zápisu majú varovanie", async ({ page }) => {
    await page.getByRole("button", { name: "Ukončiť tréning" }).click();
    await expect(page.getByRole("alertdialog")).toContainText("Nezapísal si žiadnu sériu");
    await page.getByRole("button", { name: "Pokračovať v tréningu" }).click();

    await reps(page, "Drep s veľkou činkou", 1).fill("6");
    await page.getByRole("button", { name: "Ukončiť tréning" }).click();
    await expect(page.getByRole("alertdialog")).toContainText("Bez zápisu: Rumunský mŕtvy ťah, Predkopávanie na stroji");
    await expect(page.getByRole("alertdialog")).not.toContainText("Drep s veľkou činkou,");
  });

  test("K7: rozpísané hodnoty prežijú refresh aj prepnutie tabu", async ({ page }) => {
    await reps(page, "Drep s veľkou činkou", 1).fill("7");
    await kg(page, "Drep s veľkou činkou", 1).fill("62,5");
    await page.getByRole("button", { name: "Poznámka" }).first().click();
    await page.getByLabel("Poznámka k cviku Drep s veľkou činkou").fill("koleno OK");
    await page.getByLabel("Náročnosť tréningu (RPE)").selectOption("7");

    await page.reload();
    await expect(reps(page, "Drep s veľkou činkou", 1)).toHaveValue("7");
    await expect(kg(page, "Drep s veľkou činkou", 1)).toHaveValue("62,5");
    await expect(page.getByLabel("Poznámka k cviku Drep s veľkou činkou")).toHaveValue("koleno OK");
    await expect(page.getByLabel("Náročnosť tréningu (RPE)")).toHaveValue("7");

    await page.goto("/portal/trening?preview=ok");
    await page.goto("/portal?preview=ok");
    await expect(kg(page, "Drep s veľkou činkou", 1)).toHaveValue("62,5");
  });

  test("K20: „Skryť stopky“ skryje len stopky, tréning beží ďalej", async ({ page }) => {
    await reps(page, "Drep s veľkou činkou", 1).fill("5");
    await page.getByRole("button", { name: /Otvoriť stopky|Otvoriť panel/ }).click();
    await page.getByRole("button", { name: "Skryť stopky" }).click();
    await expect(page.getByRole("button", { name: /Otvoriť stopky|Otvoriť panel/ })).toHaveCount(0);

    await page.reload();
    await expect(page.getByRole("button", { name: "Začať tréning" })).toHaveCount(0);
    await expect(reps(page, "Drep s veľkou činkou", 1)).toHaveValue("5");
    await expect(page.getByRole("button", { name: /Otvoriť stopky|Otvoriť panel/ })).toHaveCount(0);
  });
});

// ---------------------------------------------------------------- 3. celý tok (reálna DB)
// Supabase URL/anon kľúč z .env.local (Playwright ho sám nenačíta); existujúce env má prednosť.
try {
  process.loadEnvFile(".env.local");
} catch {
  /* bez .env.local sa celý tok preskočí */
}
const env = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  anon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  trainerEmail: process.env.E2E_TRAINER_EMAIL,
  trainerPassword: process.env.E2E_TRAINER_PASSWORD,
  clientEmail: process.env.E2E_CLIENT_EMAIL,
  clientPassword: process.env.E2E_CLIENT_PASSWORD,
};
const hasEnv = Object.values(env).every(Boolean);

async function apiSignIn(email: string, password: string): Promise<{ api: SupabaseClient; userId: string }> {
  const api = createClient(env.url!, env.anon!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await api.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw new Error(`Prihlásenie ${email} zlyhalo: ${error?.message}`);
  return { api, userId: data.user.id };
}

async function uiSignIn(page: Page, email: string, password: string, landing: RegExp) {
  await page.goto("/prihlasenie");
  await page.locator("#login-email").fill(email);
  await page.locator("#login-password").fill(password);
  await page.getByRole("button", { name: "Prihlásiť sa" }).click();
  await page.waitForURL(landing, { timeout: 30_000 });
}

async function newPage(browser: Browser, baseURL: string | undefined): Promise<Page> {
  const ctx = await browser.newContext({ baseURL });
  return ctx.newPage();
}

test.describe("celý tok: odcvičený tréning je zamknutý (reálna DB)", () => {
  test.skip(!hasEnv, "Chýbajú E2E_* prihlasovacie údaje QA účtov (a Supabase env).");
  test.describe.configure({ mode: "serial" });

  const createdPlanIds: string[] = [];
  let trainer: { api: SupabaseClient; userId: string };
  let client: { api: SupabaseClient; userId: string };
  let restoreActive: { planId: string | null; dayId: string | null } | null = null;

  test.afterAll(async () => {
    if (!trainer) return;
    // Plány zmaže tréner (RLS) — dni kaskádou, zamknuté záznamy tréningu ostanú (deň → null).
    for (const id of createdPlanIds) await trainer.api.from("workout_plans").delete().eq("id", id);
    if (client && restoreActive) {
      await client.api.rpc("set_active_plan", { p_plan_id: restoreActive.planId, p_day_id: restoreActive.dayId });
    }
  });

  test("tréner → klient ukončí → tréner vidí hodnoty bez editácie → úpravy zlyhajú → Duplikovať", async ({
    page,
    browser,
    baseURL,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Zápis do DB len raz (desktop), UI mobilu pokrýva preview.");
    test.setTimeout(180_000);

    trainer = await apiSignIn(env.trainerEmail!, env.trainerPassword!);
    client = await apiSignIn(env.clientEmail!, env.clientPassword!);

    const probe = await trainer.api.from("workout_logs").select("completed_at, edited_at").limit(1);
    test.skip(probe.error?.code === "42703", "Migrácie 0048/0049 ešte nie sú spustené v Supabase.");

    const { data: clientRow } = await client.api
      .from("clients")
      .select("id, trainer_id, active_plan_id, active_day_id")
      .eq("user_id", client.userId)
      .order("created_at")
      .limit(1)
      .single();
    expect(clientRow?.trainer_id, "QA klient musí byť spárovaný s QA trénerom").toBe(trainer.userId);
    const clientId = clientRow!.id as string;
    restoreActive = { planId: clientRow!.active_plan_id, dayId: clientRow!.active_day_id };

    // --- 1. tréner vytvorí tréning (publikovaný plán s jedným dňom)
    const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "");
    const dayName = `E2E Deň ${stamp}`;
    const { data: plan, error: planErr } = await trainer.api
      .from("workout_plans")
      .insert({ client_id: clientId, trainer_id: trainer.userId, name: `E2E dokončený ${stamp}`, published: true })
      .select("id")
      .single();
    expect(planErr).toBeNull();
    createdPlanIds.push(plan!.id);
    const entryId = randomUUID();
    const { data: day, error: dayErr } = await trainer.api
      .from("workout_days")
      .insert({
        plan_id: plan!.id,
        day_number: 1,
        name: dayName,
        exercises: [
          { entry_id: entryId, exercise_id: null, exercise_name: "Drep E2E", sets: 2, reps: "8", load_kg: 60, tempo: null, rest_seconds: 90 },
        ],
      })
      .select("id")
      .single();
    expect(dayErr).toBeNull();
    const { error: activeErr } = await client.api.rpc("set_active_plan", { p_plan_id: plan!.id, p_day_id: day!.id });
    expect(activeErr).toBeNull();

    // --- 2. klient odcvičí so zapísanými hodnotami a ukončí
    await uiSignIn(page, env.clientEmail!, env.clientPassword!, /\/portal/);
    await page.goto("/portal");
    await expect(page.getByText(dayName).first()).toBeVisible();
    await page.getByRole("button", { name: "Začať tréning" }).click();
    await page.getByLabel("Drep E2E, séria 1, opakovania").fill("8");
    await page.getByLabel("Drep E2E, séria 1, váha v kg").fill("60");
    await page.getByLabel("Drep E2E, séria 2, opakovania").fill("7");
    await page.getByLabel("Drep E2E, séria 2, váha v kg").fill("62,5");
    await page.getByRole("button", { name: "Poznámka" }).click();
    await page.getByLabel("Poznámka k cviku Drep E2E").fill("Posledná séria ťažká");
    await page.getByLabel("Náročnosť tréningu (RPE)").selectOption("8");
    await page.getByLabel("Poznámka k tréningu").fill("E2E tréning");
    await page.getByRole("button", { name: "Ukončiť tréning" }).click();
    await page.getByRole("button", { name: "Áno, ukončiť" }).click();
    await expect(page.getByRole("button", { name: /Upraviť hodnoty/ })).toBeVisible({ timeout: 20_000 });

    // --- 2b. klient v 24 h okne opraví zabudnutú hodnotu (0049)
    await page.getByRole("button", { name: /Upraviť hodnoty/ }).click();
    await page.getByLabel("Drep E2E, séria 2, opakovania").fill("8");
    await page.getByRole("button", { name: "Uložiť zmeny" }).click();
    await expect(page.getByText("8 op. × 62,5 kg")).toBeVisible({ timeout: 20_000 });

    const { data: log } = await client.api
      .from("workout_logs")
      .select("id, status, completed_at, edited_at, entries, plan_snapshot")
      .eq("workout_day_id", day!.id)
      .single();
    expect(log?.status).toBe("completed");
    expect(log?.completed_at).toBeTruthy();
    expect(log?.edited_at).toBeTruthy();
    const logId = log!.id as string;

    // --- 3. tréner zmení plán dňa (smie — ide o budúce tréningy) a pozrie detail
    await trainer.api
      .from("workout_days")
      .update({
        exercises: [
          { entry_id: entryId, exercise_id: null, exercise_name: "Drep E2E", sets: 2, reps: "8", load_kg: 80, tempo: null, rest_seconds: 90 },
        ],
      })
      .eq("id", day!.id);

    const trainerPage = await newPage(browser, baseURL);
    await uiSignIn(trainerPage, env.trainerEmail!, env.trainerPassword!, /\/dashboard/);
    await trainerPage.goto(`/dashboard/klienti/${clientId}/treningy/${logId}`);
    await expect(trainerPage.getByTestId("workout-status")).toHaveText(/Dokončený – \d+\. \d+\. \d{4}/);
    const ex = trainerPage.getByTestId("completed-exercise").filter({ hasText: "Drep E2E" });
    // plán zo snapshotu (60 kg), nie z neskôr upraveného dňa (80 kg)
    await expect(ex.getByText("Plán: 2 × 8 · 60 kg · pauza 90 s")).toBeVisible();
    const rows = ex.getByTestId("set-row");
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText("8 op. × 60 kg");
    await expect(rows.nth(1)).toContainText("8 op. × 62.5 kg");
    await expect(trainerPage.getByTestId("workout-edited")).toContainText("Klient hodnoty dodatočne upravil");
    await expect(ex.getByText("„Posledná séria ťažká“")).toBeVisible();
    await expect(trainerPage.getByText("„E2E tréning“")).toBeVisible();
    await expect(trainerPage.getByText("8/10")).toBeVisible();
    await expect(trainerPage.locator("main input, main textarea, main select")).toHaveCount(0);
    await expect(trainerPage.getByRole("button", { name: /Upraviť|Uložiť|Zmazať|Odobrať/i })).toHaveCount(0);

    // --- 4. priame úpravy cez Supabase (obídenie UI): klient nezmení plán/stav ani nezmaže,
    //        tréner nezmení ani nezmaže nič (hodnoty smie opraviť len klient v 24 h okne)
    const before = JSON.stringify(log!.entries);
    const attempts = [
      await client.api.from("workout_logs").update({ plan_snapshot: {}, status: "in_progress" }).eq("id", logId).select("id"),
      await client.api.from("workout_logs").delete().eq("id", logId).select("id"),
      await trainer.api.from("workout_logs").update({ note: "hack" }).eq("id", logId).select("id"),
      await trainer.api.from("workout_logs").delete().eq("id", logId).select("id"),
    ];
    for (const a of attempts) {
      // RLS vráti 0 riadkov, trigger chybu — oboje znamená "zamietnuté".
      expect(a.error !== null || (a.data ?? []).length === 0).toBe(true);
    }
    const { data: after } = await client.api
      .from("workout_logs")
      .select("entries, note, status, plan_snapshot")
      .eq("id", logId)
      .single();
    expect(JSON.stringify(after!.entries)).toBe(before);
    expect((after!.plan_snapshot as { day_name?: string }).day_name).toBe(dayName);
    expect(after!.note).toBe("E2E tréning");
    expect(after!.status).toBe("completed");

    // --- 5. Duplikovať ako nový tréning → editovateľná kópia bez výsledkov
    await trainerPage.getByRole("button", { name: "Duplikovať ako nový tréning" }).click();
    await trainerPage.waitForURL(/\/dashboard\/treningy\/[0-9a-f-]{36}$/, { timeout: 30_000 });
    const newPlanId = trainerPage.url().split("/").pop()!;
    createdPlanIds.push(newPlanId);
    expect(newPlanId).not.toBe(plan!.id);
    await expect(trainerPage.getByRole("heading", { name: `${dayName} (kópia)` })).toBeVisible();
    await expect(trainerPage.getByText("Koncept — klient ho ešte nevidí")).toBeVisible();
    // vlastný cvik (exercise_id null) je v builderi text, nie tlačidlo detailu
    await expect(trainerPage.getByText("Drep E2E", { exact: true })).toBeVisible();
    await expect(trainerPage.getByRole("button", { name: "Upraviť cvik" })).toBeVisible();

    const { data: copyDays } = await trainer.api.from("workout_days").select("id, exercises").eq("plan_id", newPlanId);
    expect(copyDays).toHaveLength(1);
    const copyEx = (copyDays![0].exercises as { entry_id: string; load_kg: number; sets: number }[])[0];
    expect(copyEx).toMatchObject({ load_kg: 60, sets: 2 });
    expect(copyEx.entry_id).not.toBe(entryId);
    // kópia je editovateľná (tréner ju smie meniť)
    const { error: editErr } = await trainer.api
      .from("workout_days")
      .update({ name: `${dayName} upravený` })
      .eq("id", copyDays![0].id);
    expect(editErr).toBeNull();

    // pôvodný tréning nedotknutý
    const { data: orig } = await client.api.from("workout_logs").select("entries, status").eq("id", logId).single();
    expect(JSON.stringify(orig!.entries)).toBe(before);
    expect(orig!.status).toBe("completed");

    await trainerPage.context().close();
  });
});
