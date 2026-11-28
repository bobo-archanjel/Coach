// i18n-ignore-file: test hlavnej fotky verejnej stránky — texty z UI a vymyslené dáta
import { test, expect } from "@playwright/test";
import sharp from "sharp";
import { sessionLogin } from "./helpers/sessionLogin";
import { adminClient, seedPublicPage, trainerIdByEmail, type Seeded } from "./helpers/publicPageSeed";

/**
 * Hlavná fotka sa nahráva vo Verejnej stránke (nie v Značke); ukladá sa do trainer_branding.photo_path.
 * Skutočná DB + QA tréner s Business; dáta sa po teste vrátia do pôvodného stavu.
 */
try {
  process.loadEnvFile(".env.local");
} catch {
  /* bez .env.local sa DB test preskočí */
}
const trainerEmail = process.env.E2E_TRAINER_EMAIL;
const PREVIEW = "/dashboard/nastavenia/stranka-nahlad";

test.describe.serial("hlavná fotka vo Verejnej stránke (DB)", () => {
  test.skip(!trainerEmail || !process.env.SUPABASE_SERVICE_ROLE_KEY, "Chýba E2E_TRAINER_EMAIL alebo service role.");

  const admin = trainerEmail ? adminClient() : null;
  let seeded: Seeded | null = null;

  const photoPath = async () => {
    const { data } = await admin!.from("trainer_branding").select("photo_path").eq("trainer_id", seeded!.trainerId).maybeSingle();
    return (data?.photo_path as string | null | undefined) ?? null;
  };
  const objectExists = async (path: string) => {
    const dir = path.split("/")[0];
    const { data } = await admin!.storage.from("branding").list(dir, { limit: 200 });
    return (data ?? []).some((o) => `${dir}/${o.name}` === path);
  };

  test.beforeAll(async () => {
    const id = await trainerIdByEmail(admin!, trainerEmail!);
    seeded = await seedPublicPage(admin!, id, { handle: "qa-fotka", withPhoto: false, gallery: 0 });
  });
  test.afterAll(async () => {
    await seeded?.restore();
    // súbory nahrané cez akcie seed nesleduje — vyčistiť priečinok trénera
    const dir = seeded?.trainerId;
    if (dir) {
      const { data } = await admin!.storage.from("branding").list(dir, { limit: 200 });
      if (data?.length) await admin!.storage.from("branding").remove(data.map((o) => `${dir}/${o.name}`));
    }
  });
  test.beforeEach(async ({ page, baseURL }) => {
    await sessionLogin(page, trainerEmail!, baseURL!);
  });

  test("Značka nemá pole na fotku; Verejná stránka nahrá, ukáže a odstráni fotku; uloženie značky ju nemení", async ({ page }) => {
    // 1) Značka: žiadne pole na fotku
    await page.goto("/dashboard/nastavenia?sekcia=znacka");
    await expect(page.locator("#logo")).toBeAttached();
    await expect(page.locator("#photo")).toHaveCount(0);
    await expect(page.getByText("Tvoja fotka")).toHaveCount(0);

    // 2) Verejná stránka: nahranie
    await page.goto("/dashboard/nastavenia?sekcia=stranka");
    const block = page.getByTestId("public-photo");
    await expect(block.getByText("Tvoja fotka")).toBeVisible();
    await expect(block.getByTestId("public-photo-img")).toHaveCount(0);
    const png = await sharp({ create: { width: 900, height: 1200, channels: 3, background: { r: 200, g: 90, b: 60 } } }).png().toBuffer();
    await block.locator("#pp-photo-file").setInputFiles({ name: "fotka.png", mimeType: "image/png", buffer: png });
    await expect(block.getByTestId("public-photo-img")).toBeVisible({ timeout: 20_000 });
    const first = await photoPath();
    expect(first).toMatch(/\/photo-/);
    expect(await objectExists(first!)).toBe(true);

    // náhľad stránky ukáže fotku v úvode
    await page.goto(PREVIEW);
    await expect(page.getByTestId("public-trainer-page").locator("img[alt='Maja Fitová']").first()).toBeAttached();
    expect(await page.getByTestId("public-trainer-page").locator(`img[src*="${first!.split("/")[1]}"]`).count()).toBeGreaterThan(0);

    // 3) uloženie značky nemení photo_path
    await page.goto("/dashboard/nastavenia?sekcia=znacka");
    await page.locator("#brand_name").fill("Maja Fitová QA");
    await page.getByRole("button", { name: "Uložiť značku" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Značka je uložená." })).toBeVisible({ timeout: 20_000 });
    expect(await photoPath()).toBe(first);
    expect(await objectExists(first!)).toBe(true);

    // 4) nahradenie zmaže starý súbor
    await page.goto("/dashboard/nastavenia?sekcia=stranka");
    const jpg = await sharp({ create: { width: 900, height: 1200, channels: 3, background: { r: 40, g: 120, b: 200 } } }).jpeg().toBuffer();
    await page.getByTestId("public-photo").locator("#pp-photo-file").setInputFiles({ name: "fotka2.jpg", mimeType: "image/jpeg", buffer: jpg });
    await expect.poll(photoPath, { timeout: 20_000 }).not.toBe(first);
    const second = await photoPath();
    expect(second).toBeTruthy();
    expect(await objectExists(second!)).toBe(true);
    expect(await objectExists(first!)).toBe(false);

    // 5) odstránenie
    await page.reload();
    await page.getByTestId("public-photo").getByRole("button", { name: "Odstrániť" }).click();
    await expect.poll(photoPath, { timeout: 20_000 }).toBeNull();
    expect(await objectExists(second!)).toBe(false);
    await expect(page.getByTestId("public-photo").getByTestId("public-photo-img")).toHaveCount(0);
  });
});
