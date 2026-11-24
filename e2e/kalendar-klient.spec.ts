import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { apiSession, sessionLogin, userIdByEmail } from "./helpers/sessionLogin";

/**
 * Kalendár klienta na karte Dnes (feature/kalendar-klient; predtým „Tento týždeň“):
 * 2 týždne (14 dní), bodky — zelená tréning, červená termín od trénera, oranžová vlastná
 * udalosť; okno dňa s tréningom, termínmi a „+ Pridať udalosť“ (upraviť / zmazať).
 * DEV náhľad (/portal?preview=ok — 24. 8. – 6. 9., dnes 28. 8.) + reálna DB (migrácia 0072).
 */
const calendar = (page: Page) => page.getByTestId("client-calendar");
const cell = (page: Page, iso: string) => calendar(page).locator(`[data-iso="${iso}"]`);
const dots = (page: Page, iso: string, kind: string) => cell(page, iso).locator(`[data-kind="${kind}"]`);

test.describe("kalendár klienta — náhľad", () => {
  test.skip(process.env.NODE_ENV === "production", "DEV náhľady len v next dev");

  test("14 dní, dnes zvýraznený, bodky troch farieb a legenda", async ({ page }) => {
    await page.goto("/portal?preview=ok");
    await expect(calendar(page)).toContainText("Kalendár");
    await expect(calendar(page)).toContainText("24. aug – 6. sep");
    await expect(calendar(page).locator("[data-iso]")).toHaveCount(14);
    await expect(cell(page, "2026-08-28")).toHaveAttribute("aria-current", "date");
    await expect(dots(page, "2026-08-24", "training")).toHaveCount(1);
    await expect(dots(page, "2026-08-26", "training")).toHaveCount(1);
    await expect(dots(page, "2026-08-26", "own")).toHaveCount(1);
    await expect(dots(page, "2026-08-27", "trainer")).toHaveCount(1);
    await expect(dots(page, "2026-08-31", "own")).toHaveCount(1);
    await expect(cell(page, "2026-08-27")).toHaveAccessibleName(/Štvrtok 27\. augusta — 1 termín od trénera/);
    await expect(calendar(page)).toContainText("Tréning");
    await expect(calendar(page)).toContainText("Moja udalosť");
    await expect(calendar(page)).toContainText("Od trénera");
  });

  test("okno dňa: tréning, termín od trénera, vlastná udalosť — pridať, upraviť, zmazať", async ({ page }) => {
    await page.goto("/portal?preview=ok");
    await cell(page, "2026-08-27").click();
    let dialog = page.getByRole("dialog", { name: /27\. augusta/ });
    await expect(dialog).toContainText("Od trénera");
    await expect(dialog).toContainText("18:00 – 18:45");
    await expect(dialog).toContainText("Konzultácia — technika drepu");
    await expect(dialog).toContainText("Vezmi si tenisky na drep.");
    // termín od trénera sa nedá upraviť
    await expect(dialog.getByRole("button", { name: /Upraviť udalosť/ })).toHaveCount(0);

    // nová vlastná udalosť → oranžová bodka
    await dialog.getByRole("button", { name: "+ Pridať udalosť" }).click();
    await dialog.getByLabel("Názov").fill("Joga");
    await dialog.getByLabel("Od", { exact: true }).fill("07:15");
    await dialog.getByLabel("Do (voliteľné)").fill("08:00");
    await dialog.getByRole("button", { name: "Uložiť" }).click();
    await expect(dialog).toContainText("Moje udalosti");
    await expect(dialog).toContainText("07:15 – 08:00");
    await expect(dots(page, "2026-08-27", "own")).toHaveCount(1);

    // úprava
    await dialog.getByRole("button", { name: "Upraviť udalosť Joga" }).click();
    await dialog.getByLabel("Názov").fill("Joga s Luciou");
    await dialog.getByRole("button", { name: "Uložiť" }).click();
    await expect(dialog).toContainText("Joga s Luciou");

    // zmazanie s potvrdením
    await dialog.getByRole("button", { name: "Zmazať udalosť Joga s Luciou" }).click();
    await dialog.getByRole("button", { name: "Áno, zmazať" }).click();
    await expect(dialog).not.toContainText("Joga s Luciou");
    await expect(dots(page, "2026-08-27", "own")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);

    // deň s tréningom ukáže odcvičené ako doteraz
    await cell(page, "2026-08-24").click();
    dialog = page.getByRole("dialog", { name: /24\. augusta/ });
    await expect(dialog).toContainText("Odcvičené");
    await expect(dialog).toContainText("Deň A — Tlak");
    await expect(dialog.getByTestId("completed-exercise").first()).toBeVisible();
  });
});

try {
  process.loadEnvFile(".env.local");
} catch {
  /* bez .env.local sa reálna časť preskočí */
}
const env = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  serviceRole: process.env.SUPABASE_SERVICE_ROLE_KEY,
  trainerEmail: process.env.E2E_TRAINER_EMAIL,
  clientEmail: process.env.E2E_CLIENT_EMAIL,
};
const hasEnv = Object.values(env).every(Boolean);

test.describe("kalendár klienta — reálna DB", () => {
  test.skip(!hasEnv, "Chýbajú E2E_* údaje alebo Supabase env (aj service role).");

  let admin: SupabaseClient;
  let clientId = "";
  const apptIds: string[] = [];
  test.afterAll(async () => {
    if (!admin || !clientId) return;
    await admin.from("client_events").delete().eq("client_id", clientId).like("title", "E2E%");
    if (apptIds.length) await admin.from("appointments").delete().in("id", apptIds);
  });

  test("vlastná udalosť (oranžová), termín od trénera (červený); tréner vlastnú nevidí", async ({ page, baseURL }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "zápis do DB len raz (desktop)");
    test.setTimeout(120_000);
    admin = createClient(env.url!, env.serviceRole!, { auth: { persistSession: false } });
    const probe = await admin.from("client_events").select("id").limit(1);
    test.skip(Boolean(probe.error), "Migrácia 0072 nie je spustená.");

    const trainerId = await userIdByEmail(env.trainerEmail!);
    const clientUserId = await userIdByEmail(env.clientEmail!);
    const { data: client } = await admin.from("clients").select("id, trainer_id").eq("user_id", clientUserId).limit(1).single();
    clientId = client!.id;
    // zajtra 17:00 — termín od trénera (ak QA klient trénera má)
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    if (client!.trainer_id === trainerId) {
      const { data: appt } = await admin
        .from("appointments")
        .insert({ trainer_id: trainerId, client_id: clientId, title: "E2E Konzultácia", starts_at: `${tomorrow}T15:00:00Z` })
        .select("id")
        .single();
      apptIds.push(appt!.id);
    }

    await sessionLogin(page, env.clientEmail!, baseURL!);
    await page.goto("/portal");
    if (apptIds.length) await expect(dots(page, tomorrow, "trainer")).toHaveCount(1, { timeout: 20_000 });

    await cell(page, tomorrow).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "+ Pridať udalosť" }).click();
    await dialog.getByLabel("Názov").fill("E2E Beh");
    await dialog.getByLabel("Od", { exact: true }).fill("06:30");
    await dialog.getByRole("button", { name: "Uložiť" }).click();
    await expect(dialog).toContainText("E2E Beh", { timeout: 15_000 });
    await expect(dots(page, tomorrow, "own")).toHaveCount(1);

    const { data: rows } = await admin.from("client_events").select("title, starts_at").eq("client_id", clientId).eq("title", "E2E Beh");
    expect(rows).toHaveLength(1);

    // súkromné: tréner (RLS) vlastnú udalosť klienta nevidí
    const trainer = await apiSession(env.trainerEmail!);
    const { data: seen } = await trainer.api.from("client_events").select("id").eq("client_id", clientId);
    expect(seen ?? []).toEqual([]);

    // zmazanie
    await dialog.getByRole("button", { name: "Zmazať udalosť E2E Beh" }).click();
    await dialog.getByRole("button", { name: "Áno, zmazať" }).click();
    await expect(dialog).not.toContainText("E2E Beh", { timeout: 15_000 });
    const { data: gone } = await admin.from("client_events").select("id").eq("client_id", clientId).eq("title", "E2E Beh");
    expect(gone).toEqual([]);
  });
});
