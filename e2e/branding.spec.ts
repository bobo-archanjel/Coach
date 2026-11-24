// i18n-ignore-file: testy brandingu trénera (Business) — čisté testy bez siete a bez DB
import { test, expect } from "@playwright/test";
import sharp from "sharp";
import {
  ACCENT_PRESETS,
  contrastRatio,
  deriveBrandTheme,
  ensureContrast,
  normalizeHex,
  pickOnColor,
} from "../lib/branding/colors";
import {
  BRAND_NAME_MAX,
  WELCOME_TEXT_MAX,
  charLength,
  cleanLine,
  cleanMultiline,
  validateBranding,
} from "../lib/branding/validation";
import { brandIconPath, brandObjectPath, isOwnBrandPath, isOwnIconPath, sniffImageType } from "../lib/branding/image";
import { extractPalette, meanOpaqueColor, pickIconBackground } from "../lib/branding/palette";
import { ICON_LOGO_RATIO, paletteFromLogo, renderAppIcons } from "../lib/branding/appIcons";
import { buildDefaultManifest, buildPortalManifest, shortBrandName, DEFAULT_ICONS } from "../lib/branding/manifest";
import { pickLogoVariant } from "../lib/branding/logoVariant";
import type { PublicBranding } from "../lib/branding/types";
import { brandingAvailableForClients, type SubscriptionRow } from "../lib/billing/entitlements";
import { generatePlanPdf } from "../lib/pdf/planReport";

/** Čisté testy brandingu: farby/kontrast, validácia, magic bytes, brána podľa tarify, PDF so značkou. */

const NOW = new Date("2026-12-01T12:00:00Z");
const DAY = 86_400_000;
const TRAINER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const UUID = "33333333-3333-4333-8333-333333333333";

function sub(over: Partial<SubscriptionRow>): SubscriptionRow {
  return {
    trainer_id: TRAINER,
    stripe_customer_id: null,
    stripe_subscription_id: null,
    tier: "business",
    status: "active",
    trial_ends_at: null,
    current_period_end: null,
    cancel_at_period_end: false,
    past_due_since: null,
    comped: false,
    client_limit: null,
    scheduled_tier: null,
    scheduled_client_limit: null,
    scheduled_change_at: null,
    ...over,
  };
}

// povrchy tém — zrkadlo lib/branding/colors.ts (najhorší prípad)
const LIGHT_BG = "#f2ece6";
const DARK_BG = "#0f0c0b";
const DARK_SURFACE = "#2a2420";

const SAMPLE_COLORS = [
  ...ACCENT_PRESETS,
  "#ffffff", "#000000", "#ffff00", "#fffacd", "#00ff00", "#0000ff", "#ff0000", "#808080",
  "#f5f5f5", "#101010", "#7fffd4", "#ffd700", "#123456", "#fedcba",
];

test.describe("farby značky a kontrast (WCAG AA)", () => {
  test("normalizeHex prijme len platné #rrggbb", () => {
    expect(normalizeHex("#D9694A")).toBe("#d9694a");
    expect(normalizeHex("  d9694a ")).toBe("#d9694a");
    for (const bad of ["#fff", "red", "#12345", "#gggggg", "", null, undefined, 42, "url(x)", "#ffffff; background:red"]) {
      expect(normalizeHex(bad)).toBeNull();
    }
  });

  test("contrastRatio: čierna/biela = 21, rovnaká farba = 1", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 1);
    expect(contrastRatio("#d9694a", "#d9694a")).toBeCloseTo(1, 5);
  });

  test("pickOnColor vždy dá kontrast >= 4.5 (aj pri stredných farbách)", () => {
    for (const c of SAMPLE_COLORS) {
      expect(contrastRatio(c, pickOnColor(c))).toBeGreaterThanOrEqual(4.5);
    }
  });

  test("ensureContrast upraví len nevyhovujúcu farbu a dosiahne cieľ", () => {
    expect(ensureContrast("#1a1a1a", LIGHT_BG, 4.5, "darken")).toBe("#1a1a1a"); // už vyhovuje
    const fixed = ensureContrast("#ffff00", LIGHT_BG, 4.5, "darken");
    expect(fixed).not.toBe("#ffff00");
    expect(contrastRatio(fixed, LIGHT_BG)).toBeGreaterThanOrEqual(4.5);
    const fixedDark = ensureContrast("#101010", DARK_SURFACE, 4.5, "lighten");
    expect(contrastRatio(fixedDark, DARK_SURFACE)).toBeGreaterThanOrEqual(4.5);
  });

  test("deriveBrandTheme: pre všetky vzorky platí AA v svetlej aj tmavej téme", () => {
    for (const c of SAMPLE_COLORS) {
      const th = deriveBrandTheme(c);
      expect(th, c).not.toBeNull();
      if (!th) continue;
      // text v akcentovej farbe
      expect(contrastRatio(th.light.text, LIGHT_BG), `${c} light text`).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(th.dark.text, DARK_SURFACE), `${c} dark text`).toBeGreaterThanOrEqual(4.5);
      // výplň voči pozadiu (UI komponent 3:1)
      expect(contrastRatio(th.light.accent, LIGHT_BG), `${c} light fill`).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(th.dark.accent, DARK_BG), `${c} dark fill`).toBeGreaterThanOrEqual(3);
      // text na výplni
      expect(contrastRatio(th.light.accent, th.light.on), `${c} light on`).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(th.dark.accent, th.dark.on), `${c} dark on`).toBeGreaterThanOrEqual(4.5);
    }
  });

  test("deriveBrandTheme: neplatná farba = null (ostáva FitPilot) a CSS hodnoty sú len hex/rgba", () => {
    expect(deriveBrandTheme("nie-farba")).toBeNull();
    expect(deriveBrandTheme(null)).toBeNull();
    const th = deriveBrandTheme("#2f6fed");
    expect(th?.light.accent).toMatch(/^#[0-9a-f]{6}$/);
    expect(th?.light.soft).toMatch(/^rgba\(\d+, \d+, \d+, [\d.]+\)$/);
  });
});

test.describe("validácia vstupov značky", () => {
  test("cleanLine odstráni riadiace a obojsmerné znaky a zalomenia", () => {
    expect(cleanLine("  Fit\u0000 s‮ Majom\n\t ")).toBe("Fit s Majom");
    expect(cleanLine("a​b")).toBe("ab");
    expect(cleanLine(42)).toBe("");
  });

  test("cleanMultiline zachová zalomenia, zníži prázdne riadky a vyhodí riadiace znaky", () => {
    expect(cleanMultiline("Ahoj\r\n\r\n\r\n\r\nSvet\u0007")).toBe("Ahoj\n\nSvet");
  });

  test("validateBranding: limity dĺžky a farba", () => {
    expect(validateBranding({ brandName: "Fit s Majom", welcomeText: "Ahoj", accent: "#D9694A" })).toEqual({
      ok: true,
      value: { brandName: "Fit s Majom", welcomeText: "Ahoj", accent: "#d9694a" },
    });
    expect(validateBranding({ brandName: "x".repeat(BRAND_NAME_MAX + 1), welcomeText: "", accent: "" })).toEqual({ ok: false, code: "brandNameTooLong" });
    expect(validateBranding({ brandName: "x".repeat(BRAND_NAME_MAX), welcomeText: "", accent: "" }).ok).toBe(true);
    expect(validateBranding({ brandName: "", welcomeText: "y".repeat(WELCOME_TEXT_MAX + 1), accent: null })).toEqual({ ok: false, code: "welcomeTooLong" });
    expect(validateBranding({ brandName: "", welcomeText: "", accent: "javascript:alert(1)" })).toEqual({ ok: false, code: "accentInvalid" });
    // prázdna farba = predvolená FitPilot (null)
    const empty = validateBranding({ brandName: "", welcomeText: "", accent: "" });
    expect(empty.ok && empty.value.accent).toBeNull();
  });

  test("dĺžka sa počíta v znakoch (emoji = 1)", () => {
    expect(charLength("💪".repeat(BRAND_NAME_MAX))).toBe(BRAND_NAME_MAX);
    expect(validateBranding({ brandName: "💪".repeat(BRAND_NAME_MAX), welcomeText: "", accent: null }).ok).toBe(true);
  });

  test("HTML sa nijako nevykonáva — text ostáva textom (escapuje React), riadiace znaky preč", () => {
    const res = validateBranding({ brandName: "<script>alert(1)</script>", welcomeText: "<img src=x onerror=1>", accent: null });
    expect(res.ok && res.value.brandName).toBe("<script>alert(1)</script>");
  });
});

test.describe("rozpoznanie obrázka podľa magic bytes", () => {
  test("PNG / JPEG / WebP vytvorené sharpom sa rozpoznajú", async () => {
    const img = sharp({ create: { width: 8, height: 8, channels: 3, background: "#2f6fed" } });
    expect(sniffImageType(new Uint8Array(await img.clone().png().toBuffer()))).toBe("png");
    expect(sniffImageType(new Uint8Array(await img.clone().jpeg().toBuffer()))).toBe("jpeg");
    expect(sniffImageType(new Uint8Array(await img.clone().webp().toBuffer()))).toBe("webp");
  });

  test("SVG, GIF, HTML, PDF, prázdny súbor a náhodné bajty sa odmietnu", () => {
    const enc = (s: string) => new TextEncoder().encode(s);
    expect(sniffImageType(enc('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'))).toBeNull();
    expect(sniffImageType(enc("GIF89a\x01\x00\x01\x00"))).toBeNull();
    expect(sniffImageType(enc("<!doctype html><script>alert(1)</script>"))).toBeNull();
    expect(sniffImageType(enc("%PDF-1.7"))).toBeNull();
    expect(sniffImageType(new Uint8Array(0))).toBeNull();
    expect(sniffImageType(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]))).toBeNull();
  });

  test("falošná hlavička: RIFF bez WEBP a PNG s odrezanou signatúrou sa odmietnu", () => {
    const riffWav = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]);
    expect(sniffImageType(riffWav)).toBeNull();
    expect(sniffImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeNull();
  });

  test("polyglot (PNG + pripojený skript) prejde sniffom, ale re-enkódovanie z neho nič nenechá", async () => {
    const png = await sharp({ create: { width: 16, height: 16, channels: 3, background: "#ff0000" } }).png().toBuffer();
    const polyglot = Buffer.concat([png, Buffer.from("<script>alert(1)</script>")]);
    expect(sniffImageType(new Uint8Array(polyglot))).toBe("png");
    const out = await sharp(polyglot).rotate().resize({ width: 512, height: 512, fit: "inside", withoutEnlargement: true }).webp().toBuffer();
    expect(out.includes(Buffer.from("<script>"))).toBe(false);
    expect(sniffImageType(new Uint8Array(out))).toBe("webp");
  });

  test("cesta objektu: <trainerId>/<druh>-<uuid>.webp a kontrola vlastníctva", () => {
    const p = brandObjectPath(TRAINER, "logo", UUID);
    expect(p).toBe(`${TRAINER}/logo-${UUID}.webp`);
    expect(isOwnBrandPath(TRAINER, p, "logo")).toBe(true);
    expect(isOwnBrandPath(OTHER, p, "logo")).toBe(false); // cudzí tréner
    expect(isOwnBrandPath(TRAINER, p, "photo")).toBe(false); // zlý druh
    expect(isOwnBrandPath(TRAINER, `${TRAINER}/../${OTHER}/logo-${UUID}.webp`, "logo")).toBe(false);
    expect(isOwnBrandPath(TRAINER, `${TRAINER}/logo-${UUID}.svg`, "logo")).toBe(false);
    expect(isOwnBrandPath(TRAINER, null, "logo")).toBe(false);
  });
});

test.describe("brána podľa tarify (Business)", () => {
  test("Business (aktívne, skúška Stripe, komped) = značku vidno; Starter/Pro nie", () => {
    expect(brandingAvailableForClients(sub({ tier: "business", status: "active" }), NOW)).toBe(true);
    expect(brandingAvailableForClients(sub({ tier: "business", status: "trialing" }), NOW)).toBe(true);
    expect(brandingAvailableForClients(sub({ tier: "business", status: "canceled", comped: true }), NOW)).toBe(true);
    expect(brandingAvailableForClients(sub({ tier: "pro" }), NOW)).toBe(false);
    expect(brandingAvailableForClients(sub({ tier: "starter" }), NOW)).toBe(false);
  });

  test("strata Business: zrušené, nezaplatené, vypršaný odklad aj žiadny riadok = FitPilot", () => {
    expect(brandingAvailableForClients(sub({ status: "canceled" }), NOW)).toBe(false);
    expect(brandingAvailableForClients(sub({ status: "unpaid" }), NOW)).toBe(false);
    expect(brandingAvailableForClients(sub({ status: "past_due", past_due_since: new Date(NOW.getTime() - 8 * DAY).toISOString() }), NOW)).toBe(false);
    // odklad ešte beží = značka ostáva
    expect(brandingAvailableForClients(sub({ status: "past_due", past_due_since: new Date(NOW.getTime() - 2 * DAY).toISOString() }), NOW)).toBe(true);
    expect(brandingAvailableForClients(null, NOW)).toBe(false);
  });

  test("skúšobná doba bez karty (Starter) značku nemá", () => {
    expect(
      brandingAvailableForClients(sub({ tier: "starter", status: "app_trial", trial_ends_at: new Date(NOW.getTime() + 5 * DAY).toISOString() }), NOW),
    ).toBe(false);
  });
});

test.describe("PDF so značkou trénera", () => {
  test("plán s logom, názvom a farbou sa vygeneruje; bez značky ostáva FitPilot", async () => {
    const logoPng = new Uint8Array(await sharp({ create: { width: 64, height: 64, channels: 4, background: "#2f6fed" } }).png().toBuffer());
    const input = {
      planName: "Plán A",
      clientName: "Jana",
      days: [{ name: "Deň 1", exercises: [{ exerciseName: "Drep", sets: 3, reps: "8", loadKg: 60, tempo: null, restSeconds: 90 }] }],
    };
    const branded = await generatePlanPdf(input, "sk", {
      name: "Fit s Majom",
      accent: "#2f6fed",
      accentText: "#2f6fed",
      accentSoft: "#dfe8fb",
      logoPng,
    });
    expect(Buffer.from(branded.slice(0, 5)).toString()).toBe("%PDF-");
    // poškodené logo nezhodí export (použije sa predvolená značka)
    const broken = await generatePlanPdf(input, "sk", { name: "X", accent: "#2f6fed", accentText: "#2f6fed", accentSoft: "#dfe8fb", logoPng: new Uint8Array([1, 2, 3]) });
    expect(Buffer.from(broken.slice(0, 5)).toString()).toBe("%PDF-");
    const plain = await generatePlanPdf(input, "sk");
    expect(Buffer.from(plain.slice(0, 5)).toString()).toBe("%PDF-");
  });
});

/* ------------------------------------------------------------------ */
/*  Fáza 2: ikony appky, farby z loga, manifest, tmavé logo             */
/* ------------------------------------------------------------------ */

/** Logo na test: červený štvorec 400×400 v strede priehľadného plátna 512×512 + modrý bod. */
async function sampleLogo(): Promise<Buffer> {
  return sharp({ create: { width: 512, height: 512, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([
      { input: await sharp({ create: { width: 400, height: 400, channels: 3, background: "#e02020" } }).png().toBuffer(), left: 56, top: 56 },
      { input: await sharp({ create: { width: 120, height: 120, channels: 3, background: "#2050e0" } }).png().toBuffer(), left: 300, top: 300 },
    ])
    .webp()
    .toBuffer();
}

async function pixel(png: Buffer, x: number, y: number): Promise<[number, number, number]> {
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * info.channels;
  return [data[i], data[i + 1], data[i + 2]];
}

function hexTuple(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const near = (a: [number, number, number], hex: string, tol = 6) => {
  const b = hexTuple(hex);
  return Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol && Math.abs(a[2] - b[2]) <= tol;
};

test.describe("ikony appky z loga", () => {
  test("rozmery 192 / 512 / maskable 512 / apple 180, PNG bez priehľadnosti", async () => {
    const icons = await renderAppIcons(await sampleLogo(), "#d9694a");
    for (const [buf, size] of [[icons.png192, 192], [icons.png512, 512], [icons.maskable512, 512], [icons.apple180, 180]] as const) {
      const meta = await sharp(buf).metadata();
      expect(meta.format).toBe("png");
      expect([meta.width, meta.height]).toEqual([size, size]);
      expect(meta.hasAlpha).toBe(false);
      expect(sniffImageType(new Uint8Array(buf))).toBe("png");
    }
  });

  test("okraj: „any“ ikona nechá ~10 % z každej strany, maskable ~22 % (bezpečná zóna), pozadie po okraj", async () => {
    const accent = "#0f172a";
    const icons = await renderAppIcons(await sampleLogo(), accent);
    const bg = icons.background;
    // červené logo sa na tmavomodrej farbe značky nestráca (kontrast ≥ 2) → pozadie = farba značky
    expect(bg).toBe(deriveBrandTheme(accent)!.light.accent);
    // „any“ 512: logo 80 % = 410 px → okraj ~51 px; pixel na 5 % je pozadie, v obsahu loga farba loga (logo v plátne má vlastný okraj)
    expect(near(await pixel(icons.png512, 2, 2), bg)).toBe(true);
    expect(near(await pixel(icons.png512, 26, 256), bg)).toBe(true);
    expect(near(await pixel(icons.png512, 110, 150), "#e02020")).toBe(true);
    // maskable: logo 56 % = 287 px → okraj ~112 px; pixel na 15 % (77) je ešte pozadie, na 30 % (154) logo
    expect(near(await pixel(icons.maskable512, 77, 256), bg)).toBe(true);
    expect(near(await pixel(icons.maskable512, 154, 200), "#e02020")).toBe(true);
    expect(ICON_LOGO_RATIO.any).toBe(0.8);
    expect(ICON_LOGO_RATIO.maskable).toBeLessThanOrEqual(0.6);
  });

  test("bez farby značky alebo pri splynutí loga s farbou je pozadie biele", async () => {
    expect(pickIconBackground(null, "#e02020")).toBe("#ffffff");
    // modré logo na modrej značke by zmizlo → biela
    const blueTheme = deriveBrandTheme("#2f6fed")!;
    expect(pickIconBackground("#2f6fed", blueTheme.light.accent)).toBe("#ffffff");
    // tmavé logo na svetlej farbe značky: farba značky ostáva
    expect(pickIconBackground("#e0a020", "#101010")).toBe(deriveBrandTheme("#e0a020")!.light.accent);
    const icons = await renderAppIcons(await sampleLogo(), null);
    expect(icons.background).toBe("#ffffff");
    expect(near(await pixel(icons.apple180, 1, 1), "#ffffff", 1)).toBe(true);
  });

  test("cesty ikon: tvar, vlastník a variant; logo pre tmavé pozadie má vlastný druh", () => {
    const p = brandIconPath(TRAINER, "maskable", UUID);
    expect(p).toBe(`${TRAINER}/icon-maskable-${UUID}.png`);
    expect(isOwnIconPath(TRAINER, p, "maskable")).toBe(true);
    expect(isOwnIconPath(TRAINER, p, "192")).toBe(false);
    expect(isOwnIconPath(OTHER, p, "maskable")).toBe(false);
    expect(isOwnIconPath(TRAINER, `${TRAINER}/icon-512-${UUID}.webp`, "512")).toBe(false);
    expect(isOwnIconPath(TRAINER, `${TRAINER}/../x/icon-512-${UUID}.png`, "512")).toBe(false);
    expect(isOwnIconPath(TRAINER, null, "512")).toBe(false);
    const d = brandObjectPath(TRAINER, "logodark", UUID);
    expect(d).toBe(`${TRAINER}/logodark-${UUID}.webp`);
    expect(isOwnBrandPath(TRAINER, d, "logodark")).toBe(true);
    expect(isOwnBrandPath(TRAINER, d, "logo")).toBe(false);
  });
});

test.describe("farby z loga", () => {
  test("extractPalette ignoruje bielu, čiernu a priehľadnú a vráti dominantné farby", async () => {
    const { data } = await sharp(await sampleLogo()).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const palette = extractPalette(data);
    expect(palette.length).toBeGreaterThanOrEqual(2);
    expect(palette.length).toBeLessThanOrEqual(5);
    // dominantná je červená, potom modrá; žiadna biela/čierna
    expect(near(hexTuple(palette[0]), "#e02020", 16)).toBe(true);
    expect(palette.some((c) => near(hexTuple(c), "#2050e0", 16))).toBe(true);
    for (const c of palette) expect(c).toMatch(/^#[0-9a-f]{6}$/);
    const flat = (r: number, g: number, b: number, a: number) => new Uint8Array(Array.from({ length: 64 }, () => [r, g, b, a]).flat());
    expect(extractPalette(flat(255, 255, 255, 255))).toEqual([]);
    expect(extractPalette(flat(5, 5, 5, 255))).toEqual([]);
    expect(extractPalette(flat(200, 30, 30, 0))).toEqual([]);
  });

  test("odtiene jednej farby sa nezlievajú do viacerých návrhov a výstup je deterministický", () => {
    const px: number[] = [];
    for (let i = 0; i < 400; i++) px.push(200 + (i % 4) * 3, 30, 30, 255);
    for (let i = 0; i < 200; i++) px.push(30, 160, 60, 255);
    const a = extractPalette(new Uint8Array(px));
    expect(a).toHaveLength(2);
    expect(extractPalette(new Uint8Array(px))).toEqual(a);
  });

  test("paletteFromLogo z reálneho WebP a pri chybnom vstupe prázdne pole", async () => {
    const palette = await paletteFromLogo(await sampleLogo());
    expect(palette.length).toBeGreaterThanOrEqual(2);
    expect(await paletteFromLogo(Buffer.from([1, 2, 3]))).toEqual([]);
    expect(meanOpaqueColor(new Uint8Array([0, 0, 0, 0]))).toBeNull();
  });
});

function branded(over: Partial<PublicBranding> = {}): PublicBranding {
  const base = "https://x.supabase.co/storage/v1/object/public/branding";
  return {
    brandName: "Fit s Majom",
    welcomeText: "",
    logoUrl: `${base}/${TRAINER}/logo-${UUID}.webp`,
    logoDarkUrl: null,
    photoUrl: null,
    icons: {
      i192: `${base}/${TRAINER}/icon-192-${UUID}.png`,
      i512: `${base}/${TRAINER}/icon-512-${UUID}.png`,
      maskable: `${base}/${TRAINER}/icon-maskable-${UUID}.png`,
      apple: `${base}/${TRAINER}/icon-apple-${UUID}.png`,
    },
    theme: deriveBrandTheme("#2f6fed"),
    ...over,
  };
}

test.describe("manifest appky", () => {
  test("predvolený FitPilot: názov, štart a rozsah, ikony zo /icons", () => {
    const m = buildDefaultManifest("sk", "popis");
    expect(m.name).toBe("FitPilot");
    expect(m.display).toBe("standalone");
    expect(m.start_url.startsWith(m.scope)).toBe(true);
    expect(m.icons).toEqual(DEFAULT_ICONS);
    expect(m.icons.some((i) => i.sizes === "192x192")).toBe(true);
    expect(m.icons.some((i) => i.sizes === "512x512" && i.purpose === "maskable")).toBe(true);
  });

  test("portál bez značky = FitPilot, so značkou = názov, farba a ikony trénera", () => {
    const plain = buildPortalManifest(null, "sk");
    expect(plain.name).toBe("FitPilot");
    expect(plain.icons).toEqual(DEFAULT_ICONS);

    const b = branded();
    const m = buildPortalManifest(b, "cs", "popis");
    expect(m.name).toBe("Fit s Majom");
    expect(m.short_name).toBe("Fit s Majom");
    expect(m.lang).toBe("cs");
    // štart musí ležať v rozsahu, inak prehliadač rozsah zahodí; display standalone = inštalovateľné
    expect(m.start_url).toBe("/portal");
    expect(m.start_url.startsWith(m.scope)).toBe(true);
    expect(m.display).toBe("standalone");
    // farby z kontrastne bezpečnej témy (nie surová farba trénera)
    expect(m.theme_color).toBe(b.theme!.light.accent);
    expect(contrastRatio(m.theme_color, LIGHT_BG)).toBeGreaterThanOrEqual(3);
    expect(m.icons.map((i) => i.src)).toEqual([b.icons!.i192, b.icons!.i512, b.icons!.maskable]);
    expect(m.icons.map((i) => i.purpose)).toEqual(["any", "any", "maskable"]);
    expect(m.icons.every((i) => i.type === "image/png")).toBe(true);
    // nič navyše z DB (len verejné polia manifestu)
    expect(Object.keys(JSON.parse(JSON.stringify(m))).sort()).toEqual(
      ["background_color", "description", "display", "icons", "id", "lang", "name", "orientation", "scope", "short_name", "start_url", "theme_color"],
    );
  });

  test("značka bez loga/ikon používa predvolené ikony, bez farby predvolené farby", () => {
    const noIcons = buildPortalManifest(branded({ icons: null, logoUrl: null }), "sk");
    expect(noIcons.icons).toEqual(DEFAULT_ICONS);
    expect(noIcons.name).toBe("Fit s Majom");
    const noTheme = buildPortalManifest(branded({ theme: null }), "sk");
    expect(noTheme.theme_color).toBe("#d9694a");
    expect(buildPortalManifest(branded({ brandName: "" }), "sk").name).toBe("FitPilot");
  });

  test("shortBrandName: do 12 znakov, inak prvé slovo, inak orezanie", () => {
    expect(shortBrandName("Fit s Majom")).toBe("Fit s Majom");
    expect(shortBrandName("Maja Nováková Coaching")).toBe("Maja");
    expect(shortBrandName("Supercalifragilistic")).toBe("Supercalifra");
    expect(shortBrandName("   ")).toBe("FitPilot");
    expect(Array.from(shortBrandName("💪".repeat(30)))).toHaveLength(12);
  });

  test("výber loga podľa témy: tmavá berie tmavé logo, chýbajúci variant sa nahradí druhým", () => {
    expect(pickLogoVariant("light", "L", "D")).toBe("L");
    expect(pickLogoVariant("dark", "L", "D")).toBe("D");
    expect(pickLogoVariant("dark", "L", null)).toBe("L");
    expect(pickLogoVariant("light", null, "D")).toBe("D");
    expect(pickLogoVariant("dark", null, null)).toBeNull();
  });

  test("dev server: /manifest.webmanifest a /portal/manifest.webmanifest bez prihlásenia = FitPilot", async ({ request }) => {
    for (const [url, start] of [["/manifest.webmanifest", "/"], ["/portal/manifest.webmanifest", "/portal"]] as const) {
      const res = await request.get(url);
      expect(res.status(), url).toBe(200);
      expect(res.headers()["content-type"]).toContain("application/manifest+json");
      const body = await res.json();
      expect(body.name).toBe("FitPilot");
      expect(body.start_url).toBe(start);
      for (const icon of body.icons) {
        const img = await request.get(icon.src);
        expect(img.status(), icon.src).toBe(200);
        expect(img.headers()["content-type"]).toContain("image/png");
      }
    }
    // manifest portálu je súkromný (závisí od prihlásenia)
    expect((await request.get("/portal/manifest.webmanifest")).headers()["cache-control"]).toContain("private");
  });
});

test.describe("splash portálu", () => {
  test("v obyčajnom prehliadači (nie standalone) sa splash nezobrazí a po hydratácii zmizne z DOM", async ({ page }) => {
    await page.goto("/portal?preview=ok");
    await expect(page.getByTestId("portal-splash")).toHaveCount(0);
    await expect(page.locator("html")).toHaveAttribute("data-fp-splash", "done");
    // manifest portálu je prilinkovaný s cookie (crossorigin=use-credentials), predvolený koreňový tu nie je
    const link = page.locator('link[rel="manifest"]');
    await expect(link).toHaveCount(1);
    await expect(link).toHaveAttribute("href", "/portal/manifest.webmanifest");
    await expect(link).toHaveAttribute("crossorigin", "use-credentials");
  });
});
