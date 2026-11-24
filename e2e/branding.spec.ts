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
import { brandObjectPath, isOwnBrandPath, sniffImageType } from "../lib/branding/image";
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
