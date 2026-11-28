// i18n-ignore-file: testy šablón verejnej stránky trénera — texty z UI a vymyslené dáta
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { DEFAULT_TEMPLATE, SECTION_ANCHOR, TEMPLATES, TEMPLATE_IDS, coerceTemplate, isTemplateId, recipeFor, visibleSections } from "../lib/publicPage/templates";
import type { PublicPageData } from "../lib/publicPage/types";
import skPublic from "../messages/sk/publicPage.json";
import csPublic from "../messages/cs/publicPage.json";
import { sessionLogin } from "./helpers/sessionLogin";
import { adminClient, seedPublicPage, templateColumnExists, trainerIdByEmail, type Seeded } from "./helpers/publicPageSeed";

/**
 * Šablóny verejnej stránky (fáza 1): 4 vzhľady, jeden obsah. Čisté testy receptov + test so skutočnou DB
 * (QA tréner s Business; dočasné dáta sa po teste vrátia do pôvodného stavu).
 *   E2E_TRAINER_EMAIL
 * Ak migrácia 0090 ešte nebehla (stĺpec `template` chýba), test ukladania šablóny sa preskočí; náhľady
 * (?sablona=) a vypnutý výber fungujú aj bez nej.
 */
try {
  process.loadEnvFile(".env.local");
} catch {
  /* bez .env.local sa DB testy preskočia */
}
const trainerEmail = process.env.E2E_TRAINER_EMAIL;
const PREVIEW = "/dashboard/nastavenia/stranka-nahlad";

// ------------------------------------------------------------------ čisté testy

test.describe("šablóny — recepty", () => {
  test("id, predvolená šablóna a kontrola hodnoty", () => {
    expect([...TEMPLATE_IDS]).toEqual(["klasik", "sport", "minimal", "wellness"]);
    expect(DEFAULT_TEMPLATE).toBe("klasik");
    for (const id of TEMPLATE_IDS) expect(isTemplateId(id), id).toBe(true);
    for (const bad of ["", "Klasik", "sport ", "retro", null, undefined, 3, {}, ["sport"]]) expect(isTemplateId(bad), String(bad)).toBe(false);
    expect(coerceTemplate("sport")).toBe("sport");
    expect(coerceTemplate("zle")).toBe("klasik");
    expect(coerceTemplate(undefined)).toBe("klasik");
  });

  test("každý recept má hrdinu na začiatku a kontakt práve raz na konci (lišta a päta sú pevné)", () => {
    for (const id of TEMPLATE_IDS) {
      const r = recipeFor(id);
      expect(r.id).toBe(id);
      const kinds = r.sections.map((s) => s.kind);
      expect(kinds[0], id).toBe("hero");
      expect(kinds.filter((k) => k === "contact"), id).toHaveLength(1);
      expect(kinds[kinds.length - 1], id).toBe("contact");
      expect(new Set(kinds).size, `${id}: sekcie sa neopakujú`).toBe(kinds.length);
      for (const s of r.sections) expect(s.variant.length, `${id}/${s.kind}`).toBeGreaterThan(0);
    }
    expect(Object.keys(TEMPLATES).sort()).toEqual([...TEMPLATE_IDS].sort());
  });

  test("tón je pevný: šport tmavý, ostatné svetlé (stránka nezávisí od témy appky ani telefónu)", () => {
    expect(recipeFor("sport").tone).toBe("dark");
    for (const id of ["klasik", "minimal", "wellness"] as const) expect(recipeFor(id).tone, id).toBe("light");
  });

  test("sekcie bez dát sa nevykreslia (ani v navigácii) a kotvy majú svoje id", () => {
    const empty = { bio: "", specializations: [], services: [], testimonials: [], galleryUrls: [] } as unknown as PublicPageData;
    for (const id of TEMPLATE_IDS) expect(visibleSections(recipeFor(id), empty).map((s) => s.kind), id).toEqual(["hero", "contact"]);
    const full = { ...empty, bio: "x", services: [{}], testimonials: [{}], galleryUrls: ["u"] } as unknown as PublicPageData;
    expect(visibleSections(recipeFor("klasik"), full).map((s) => SECTION_ANCHOR[s.kind])).toEqual(["top", "o-mne", "sluzby", "referencie", "galeria", "kontakt"]);
  });

  test("preklady: názov a popis každej šablóny v sk aj cs", () => {
    for (const m of [skPublic, csPublic]) {
      for (const id of TEMPLATE_IDS) {
        expect(m.templates.names[id], id).toBeTruthy();
        expect(m.templates.descriptions[id], id).toBeTruthy();
      }
      expect(m.settings.errors.templateUnavailable).toBeTruthy();
    }
  });

  test("migrácia 0090: stĺpec, CHECK, RPC vracia template a oprávnenia ostávajú", () => {
    const sql = readFileSync("supabase/migrations/0090_public_page_template.sql", "utf8");
    expect(sql).toContain("add column if not exists template text not null default 'klasik'");
    expect(sql).toContain("template in ('klasik', 'sport', 'minimal', 'wellness')");
    expect(sql).toContain("'template', p.template");
    expect(sql).toContain("create or replace function public.get_public_trainer_page");
    expect(sql).toContain("revoke execute on function public.get_public_trainer_page(text) from public, anon, authenticated;");
    expect(sql).toContain("grant execute on function public.get_public_trainer_page(text) to service_role;");
    // zvyšok funkcie je zhodný s 0083 (okrem pridaného riadku)
    const old = readFileSync("supabase/migrations/0083_trainer_public_page.sql", "utf8");
    const body = (s: string) => s.slice(s.indexOf("select jsonb_build_object("), s.indexOf("limit 1;")).replace(/\s*'template', p\.template,/, "");
    expect(body(sql)).toBe(body(old));
  });
});

// ------------------------------------------------------------------ skutočná DB

test.describe.serial("šablóny — náhľad, výber a verejná stránka (DB)", () => {
  test.skip(!trainerEmail || !process.env.SUPABASE_SERVICE_ROLE_KEY, "Chýba E2E_TRAINER_EMAIL alebo service role.");

  const admin = trainerEmail ? adminClient() : null;
  let seeded: Seeded | null = null;
  let columnReady = false;

  test.beforeAll(async () => {
    if (!admin || !trainerEmail) return;
    const id = await trainerIdByEmail(admin, trainerEmail);
    columnReady = await templateColumnExists(admin);
    seeded = await seedPublicPage(admin, id, { handle: "qa-sablony" });
  });
  test.afterAll(async () => {
    await seeded?.restore();
  });
  test.beforeEach(async ({ page, baseURL }) => {
    await sessionLogin(page, trainerEmail!, baseURL!);
  });

  async function noOverflow(page: import("@playwright/test").Page) {
    const w = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
    expect(w.sw, `scrollWidth ${w.sw} > innerWidth ${w.iw}`).toBeLessThanOrEqual(w.iw);
  }

  for (const id of TEMPLATE_IDS) {
    test(`náhľad ?sablona=${id}: web (lišta, päta), formulár, bez pretečenia pri 320, 390, 768 a 1440`, async ({ page }) => {
      for (const width of [320, 390, 768, 1440]) {
        await page.setViewportSize({ width, height: 800 });
        await page.goto(`${PREVIEW}?sablona=${id}`);
        const root = page.getByTestId("public-trainer-page");
        await expect(root).toHaveAttribute("data-template", id);
        await expect(root).toHaveAttribute("data-theme", recipeFor(id).tone);
        await expect(root.getByRole("heading", { level: 1 })).toHaveText("Maja Fitová");
        await expect(root.getByRole("note")).toContainText("zatiaľ nie je uložená");
        // web: lišta s odkazom na #kontakt, päta s „Stránka beží na FitPilot“ (v náhľade bez odkazu)
        await expect(root.locator("header").getByRole("link", { name: /^Chcem trénovať/ })).toHaveAttribute("href", "#kontakt");
        await expect(root.locator("footer")).toContainText("Stránka beží na FitPilot");
        await expect(root.getByTestId("powered-by-link")).toHaveCount(0);
        await expect(root.locator("main")).toBeVisible();
        if (width >= 900) {
          // na šírke sú odkazy sekcií v lište (len na existujúce sekcie)
          const nav = root.getByRole("navigation", { name: "Hlavná navigácia" });
          for (const l of ["O mne", "Služby", "Referencie", "Galéria", "Kontakt"]) await expect(nav.getByRole("link", { name: l, exact: true })).toBeVisible();
        }
        // formulár záujemcu je v náhľade, ale vypnutý
        await expect(root.locator("#kontakt")).toBeVisible();
        await expect(root.locator("#kontakt").getByRole("button", { name: "Odoslať" })).toBeDisabled();
        // obsah: služby, referencie, galéria, fotka s alt textom
        await expect(root.getByRole("heading", { name: "Služby a ceny" })).toBeVisible();
        await expect(root.getByText("Jana K.")).toBeAttached();
        await expect(root.locator("img[alt^='Fotka 1 z galérie']")).toHaveCount(1);
        await expect(root.locator("img[alt='Maja Fitová']").first()).toBeAttached();
        await noOverflow(page);
      }
    });
  }

  test("náhľad: neplatná šablóna sa ignoruje, odkaz späť vedie na záložku stránky", async ({ page }) => {
    await page.goto(`${PREVIEW}?sablona=zle`);
    await expect(page.getByTestId("public-trainer-page")).toHaveAttribute("data-template", DEFAULT_TEMPLATE);
    await expect(page.getByRole("link", { name: "Späť do nastavení" })).toHaveAttribute("href", "/dashboard/nastavenia?sekcia=stranka");
  });

  test("výber v nastaveniach: 4 voľby, klávesnica, odkazy na náhľad", async ({ page }) => {
    await page.goto("/dashboard/nastavenia?sekcia=stranka");
    const picker = page.getByTestId("template-picker");
    await expect(picker.getByRole("heading", { name: "Šablóna stránky" })).toBeVisible();
    const radios = picker.getByRole("radio");
    await expect(radios).toHaveCount(4);
    for (const id of TEMPLATE_IDS) await expect(page.getByTestId(`template-preview-${id}`)).toHaveAttribute("href", `/dashboard/nastavenia/stranka-nahlad?sablona=${id}`);
    if (!columnReady) {
      // pred migráciou 0090: výber je vypnutý a vysvetlený
      await expect(page.getByTestId("template-picker-note")).toContainText("Šablóny budú dostupné po aktualizácii databázy");
      await expect(radios.first()).toBeDisabled();
      return;
    }
    await expect(picker.getByRole("radio", { name: /Klasik/ })).toBeChecked();
    await picker.getByRole("radio", { name: /Klasik/ }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(picker.getByRole("radio", { name: /Šport/ })).toBeChecked();
  });

  test("uloženie šablóny sa prejaví v náhľade aj na verejnej stránke", async ({ page, baseURL }) => {
    test.skip(!columnReady, "Migrácia 0090 ešte nebehla (stĺpec template chýba) — ukladanie sa neskúša.");
    await admin!.from("trainer_public_profiles").update({ published: true }).eq("trainer_id", seeded!.trainerId);
    await page.goto("/dashboard/nastavenia?sekcia=stranka");
    const picker = page.getByTestId("template-picker");
    await picker.getByRole("radio", { name: /Wellness/ }).check();
    await picker.getByTestId("template-save").click();
    await expect(picker.getByText("Šablóna je uložená.")).toBeVisible();
    await expect(picker.locator("[data-template-option='wellness']").getByText("Aktívna")).toBeVisible();

    const { data } = await admin!.from("trainer_public_profiles").select("template").eq("trainer_id", seeded!.trainerId).single();
    expect(data?.template).toBe("wellness");

    await page.goto(PREVIEW);
    await expect(page.getByTestId("public-trainer-page")).toHaveAttribute("data-template", "wellness");

    // verejná stránka (bez session) berie šablónu z DB
    // (/t/<handle> presmeruje na poddoménu, preto rovno poddoména — *.localhost smeruje na loopback)
    const res = await page.request.get(`http://${seeded!.handle}.localhost:${new URL(baseURL!).port}/`);
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).toContain('data-template="wellness"');
    // na verejnej stránke je päta s odkazom na FitPilot a odkaz v lište na formulár
    expect(html).toContain('data-testid="powered-by-link"');
    expect(html).toContain('href="#kontakt"');
  });
});
