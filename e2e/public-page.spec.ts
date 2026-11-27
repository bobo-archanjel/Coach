// i18n-ignore-file: testy verejnej stránky trénera a záujemcov — čisté testy bez siete a bez DB (vymyslené mená a texty)
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { HANDLE_MAX, HANDLE_MIN, RESERVED_HANDLES, isHandleShape, isReservedHandle, normalizeHandle, validateHandle } from "../lib/publicPage/handle";
import { EXTERNAL_REL, SOCIAL_KINDS, readSocials, validateSocialUrl, validateSocials } from "../lib/publicPage/socials";
import { LIMITS, parseTags, validateProfile } from "../lib/publicPage/profile";
import {
  LEAD_GOALS,
  LEAD_SUBMIT_LIMITS,
  canSetStatus,
  cleanPhone,
  countLinks,
  decideLeadSubmit,
  isLeadStatus,
  statusAfterInvite,
  validateLead,
  LEAD_STATUSES,
} from "../lib/publicPage/leads";
import { isPageVisible, pageState } from "../lib/publicPage/visibility";
import { DESCRIPTION_MAX, buildPageMetadata, pageCanonical, pageDescription } from "../lib/publicPage/seo";
import { renderLeadMail } from "../lib/mail/templates";
import { applyDismissals, attentionTotal, buildAttentionItems } from "../lib/dashboard/attention";
import { effectiveTier, type SubscriptionRow } from "../lib/billing/entitlements";
import { isOwnBrandPath, brandObjectPath } from "../lib/branding/image";
import skPublic from "../messages/sk/publicPage.json";
import csPublic from "../messages/cs/publicPage.json";

/** Verejná stránka trénera (branding bod 3): handle, odkazy, obsah, formulár záujemcu, limity, stavy, viditeľnosť, SEO. */

const TRAINER = "11111111-1111-4111-8111-111111111111";
const UUID = "33333333-3333-4333-8333-333333333333";
const NOW = new Date("2026-12-01T12:00:00Z");

// ------------------------------------------------------------------ handle

test.describe("handle", () => {
  test("platné adresy (3–30 znakov, a-z, 0-9, pomlčka vnútri)", () => {
    for (const h of ["fitsmajom", "maja-fit", "a1b", "tomas-2026-fit", "x".repeat(HANDLE_MAX)]) {
      const r = validateHandle(h);
      expect(r.ok, h).toBe(true);
    }
    expect(HANDLE_MIN).toBe(3);
    expect(HANDLE_MAX).toBe(30);
  });

  test("zjednotí veľkosť písmen a medzery", () => {
    expect(normalizeHandle("  FitSMajom ")).toBe("fitsmajom");
    expect(validateHandle("  Maja-Fit ")).toEqual({ ok: true, value: "maja-fit" });
    expect(normalizeHandle(42)).toBe("");
  });

  test("zlý tvar: dĺžka, diakritika, pomlčky, znaky", () => {
    expect(validateHandle("ab")).toEqual({ ok: false, code: "handleTooShort" });
    expect(validateHandle("")).toEqual({ ok: false, code: "handleTooShort" });
    expect(validateHandle("x".repeat(HANDLE_MAX + 1))).toEqual({ ok: false, code: "handleTooLong" });
    for (const bad of ["majka_fit", "mája", "-maja", "maja-", "maja--fit", "ma ja", "maja.fit", "maja/fit", "maja@fit", "<script>", "../x", "m%20a"]) {
      expect(validateHandle(bad), bad).toEqual({ ok: false, code: "handleInvalid" });
    }
  });

  test("rezervované slová a „fitpilot“ kdekoľvek", () => {
    for (const r of ["admin", "api", "portal", "dashboard", "prihlasenie", "t", "www", "fitpilot", "support", "nahlad", "pozvanka", "nastavenia"]) {
      expect(isReservedHandle(r), r).toBe(true);
    }
    expect(validateHandle("admin")).toEqual({ ok: false, code: "handleReserved" });
    expect(validateHandle("Support")).toEqual({ ok: false, code: "handleReserved" });
    expect(validateHandle("fitpilot-maja")).toEqual({ ok: false, code: "handleReserved" });
    expect(validateHandle("mojfitpilot")).toEqual({ ok: false, code: "handleReserved" });
    expect(validateHandle("fitsmajom").ok).toBe(true);
  });

  test("tvar z URL (pred dopytom do DB) a zoznam rezervovaných zhodný s migráciou 0083", () => {
    expect(isHandleShape("fitsmajom")).toBe(true);
    expect(isHandleShape("Fit")).toBe(false);
    expect(isHandleShape("ab")).toBe(false);
    expect(isHandleShape("a--b")).toBe(false);
    const sql = readFileSync("supabase/migrations/0083_trainer_public_page.sql", "utf8");
    for (const r of RESERVED_HANDLES) expect(sql, r).toContain(`'${r}'`);
    const quoted = [...sql.matchAll(/handle <> all \(array\[([\s\S]*?)\]\)/g)][0][1].match(/'[^']+'/g) ?? [];
    expect(quoted.length).toBe(RESERVED_HANDLES.length);
  });
});

// ------------------------------------------------------------------ odkazy

test.describe("odkazy na siete a web", () => {
  test("platné: https, správna sieť, doplní schému a vyčistí hash", () => {
    expect(validateSocialUrl("instagram", "https://www.instagram.com/maja_fit")).toEqual({ ok: true, value: "https://www.instagram.com/maja_fit" });
    expect(validateSocialUrl("instagram", "instagram.com/maja")).toEqual({ ok: true, value: "https://instagram.com/maja" });
    expect(validateSocialUrl("youtube", "https://youtu.be/abc123#t=1")).toEqual({ ok: true, value: "https://youtu.be/abc123" });
    expect(validateSocialUrl("facebook", "https://m.facebook.com/maja")).toEqual({ ok: true, value: "https://m.facebook.com/maja" });
    expect(validateSocialUrl("tiktok", "https://www.tiktok.com/@maja")).toEqual({ ok: true, value: "https://www.tiktok.com/@maja" });
    expect(validateSocialUrl("web", "https://moja-stranka.sk/o-mne?x=1")).toEqual({ ok: true, value: "https://moja-stranka.sk/o-mne?x=1" });
  });

  test("prázdne = bez odkazu", () => {
    expect(validateSocialUrl("web", "")).toEqual({ ok: true, value: null });
    expect(validateSocialUrl("web", "   ")).toEqual({ ok: true, value: null });
    expect(validateSocialUrl("web", undefined)).toEqual({ ok: true, value: null });
  });

  test("zakázané schémy a nebezpečné tvary", () => {
    for (const bad of [
      "javascript:alert(1)",
      "JaVaScRiPt:alert(1)",
      "data:text/html;base64,AAAA",
      "http://moja-stranka.sk",
      "ftp://moja-stranka.sk",
      "//moja-stranka.sk",
      "https://user:pass@moja-stranka.sk",
      "https://moja-stranka.sk:8443/x",
      "https://localhost/x",
      "https://127.0.0.1/x",
      "https://moja stranka.sk",
      "https://moja-stranka.sk/\"onmouseover=\"x",
      "https://moja-stranka.sk/<script>",
      "https://" + "a".repeat(250) + ".sk",
    ]) {
      expect(validateSocialUrl("web", bad), bad).toEqual({ ok: false, code: "socialInvalid" });
    }
  });

  test("sociálna sieť musí mať doménu tej siete (nie zástupná adresa ani podobná doména)", () => {
    expect(validateSocialUrl("instagram", "https://evil.example/instagram.com")).toEqual({ ok: false, code: "socialHost" });
    expect(validateSocialUrl("instagram", "https://instagram.com.evil.example/x")).toEqual({ ok: false, code: "socialHost" });
    expect(validateSocialUrl("instagram", "https://notinstagram.com/x")).toEqual({ ok: false, code: "socialHost" });
    expect(validateSocialUrl("facebook", "https://instagram.com/x")).toEqual({ ok: false, code: "socialHost" });
    expect(validateSocialUrl("youtube", "https://vimeo.com/1")).toEqual({ ok: false, code: "socialHost" });
  });

  test("celý objekt: neznáme kľúče sa ignorujú, chyba nesie sieť; čítanie z DB potichu vynechá zlé", () => {
    const ok = validateSocials({ instagram: "instagram.com/maja", web: "https://x.sk", evil: "https://x.sk" });
    expect(ok).toEqual({ ok: true, value: { instagram: "https://instagram.com/maja", web: "https://x.sk/" } });
    expect(validateSocials({ instagram: "javascript:1" })).toEqual({ ok: false, code: "socialInvalid", kind: "instagram" });
    expect(readSocials({ instagram: "javascript:1", web: "https://x.sk" })).toEqual({ web: "https://x.sk/" });
    expect(readSocials(null)).toEqual({});
    expect(SOCIAL_KINDS).toEqual(["instagram", "facebook", "tiktok", "youtube", "web"]);
  });
});

// ------------------------------------------------------------------ obsah stránky

const base = { headline: "Tréner", bio: "Ahoj", location: "Bratislava", online: false, specializations: "", socials: {}, services: [], testimonials: [] };

test.describe("obsah stránky", () => {
  test("čistí texty (riadiace a obojsmerné znaky) a zachová zalomenia v bio", () => {
    const r = validateProfile({ ...base, headline: "  Maja‮  fit\u0000 ", bio: "Riadok 1\r\n\r\n\r\n\r\nRiadok 2​" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.headline).toBe("Maja fit");
      expect(r.value.bio).toBe("Riadok 1\n\nRiadok 2");
    }
  });

  test("HTML sa neinterpretuje — zostáva obyčajný text (React ho pri vykreslení escapuje)", () => {
    const r = validateProfile({ ...base, bio: "<img src=x onerror=alert(1)> **tučné**" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.bio).toBe("<img src=x onerror=alert(1)> **tučné**");
    const src = readFileSync("app/t/TrainerPublicPage.tsx", "utf8");
    expect(src.replace(/\/\*[\s\S]*?\*\//g, "")).not.toContain("dangerouslySetInnerHTML");
    expect(src).toContain("rel={EXTERNAL_REL}");
    expect(EXTERNAL_REL).toBe("nofollow noopener noreferrer");
  });

  test("limity dĺžky", () => {
    expect(validateProfile({ ...base, headline: "x".repeat(LIMITS.headline + 1) })).toMatchObject({ ok: false, code: "headlineTooLong" });
    expect(validateProfile({ ...base, bio: "x".repeat(LIMITS.bio + 1) })).toMatchObject({ ok: false, code: "bioTooLong" });
    expect(validateProfile({ ...base, bio: "x".repeat(LIMITS.bio) }).ok).toBe(true);
    expect(validateProfile({ ...base, location: "x".repeat(LIMITS.location + 1) })).toMatchObject({ ok: false, code: "locationTooLong" });
  });

  test("špecializácie: rozdelenie po čiarkach, duplicity preč, limity", () => {
    expect(parseTags("sila, Sila ,mobilita,,\nchudnutie")).toEqual(["sila", "mobilita", "chudnutie"]);
    expect(validateProfile({ ...base, specializations: "a,b,c,d,e,f,g,h,i" })).toMatchObject({ ok: false, code: "tooManySpecializations" });
    expect(validateProfile({ ...base, specializations: "x".repeat(31) })).toMatchObject({ ok: false, code: "specializationTooLong" });
  });

  test("služby: max. 6, prázdne riadky sa vynechajú, názov povinný, cena ako text", () => {
    const svc = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `S${i}`, description: "", priceText: "od 49 € / mesiac" }));
    const six = validateProfile({ ...base, services: svc(6) });
    expect(six.ok).toBe(true);
    if (six.ok) expect(six.value.services[0].priceText).toBe("od 49 € / mesiac");
    expect(validateProfile({ ...base, services: svc(7) })).toMatchObject({ ok: false, code: "tooManyServices" });
    expect(validateProfile({ ...base, services: [{ name: "", description: "", priceText: "" }] })).toMatchObject({ ok: true, value: { services: [] } });
    expect(validateProfile({ ...base, services: [{ name: "", description: "popis", priceText: "" }] })).toMatchObject({ ok: false, code: "serviceNameRequired", index: 1 });
    expect(validateProfile({ ...base, services: [{ name: "x".repeat(61), description: "", priceText: "" }] })).toMatchObject({ ok: false, code: "serviceNameTooLong" });
    expect(validateProfile({ ...base, services: [{ name: "A", description: "x".repeat(301), priceText: "" }] })).toMatchObject({ ok: false, code: "serviceDescTooLong" });
    expect(validateProfile({ ...base, services: [{ name: "A", description: "", priceText: "x".repeat(41) }] })).toMatchObject({ ok: false, code: "servicePriceTooLong" });
  });

  test("referencie: max. 6, meno aj text povinné, žiadne hodnotenie hviezdičkami v dátach", () => {
    const t = (n: number) => Array.from({ length: n }, (_, i) => ({ author: `Jana ${i}`, body: "Super" }));
    expect(validateProfile({ ...base, testimonials: t(6) }).ok).toBe(true);
    expect(validateProfile({ ...base, testimonials: t(7) })).toMatchObject({ ok: false, code: "tooManyTestimonials" });
    expect(validateProfile({ ...base, testimonials: [{ author: "", body: "Super" }] })).toMatchObject({ ok: false, code: "testimonialAuthorRequired", index: 1 });
    expect(validateProfile({ ...base, testimonials: [{ author: "J.", body: "" }] })).toMatchObject({ ok: false, code: "testimonialBodyRequired" });
    expect(validateProfile({ ...base, testimonials: [{ author: "J.", body: "x".repeat(401) }] })).toMatchObject({ ok: false, code: "testimonialBodyTooLong" });
    const r = validateProfile({ ...base, testimonials: [{ author: "J.", body: "Super", rating: 5, stars: 5 }] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(Object.keys(r.value.testimonials[0]).sort()).toEqual(["author", "body"]);
  });

  test("zlý odkaz zastaví uloženie a pomenuje sieť", () => {
    expect(validateProfile({ ...base, socials: { instagram: "javascript:1" } })).toMatchObject({ ok: false, code: "socialInvalid", kind: "instagram" });
    expect(validateProfile({ ...base, socials: { facebook: "https://instagram.com/x" } })).toMatchObject({ ok: false, code: "socialHost", kind: "facebook" });
  });

  test("cesta galérie: len vlastný priečinok a tvar gallery-<uuid>.webp", () => {
    const own = brandObjectPath(TRAINER, "gallery", UUID);
    expect(own).toBe(`${TRAINER}/gallery-${UUID}.webp`);
    expect(isOwnBrandPath(TRAINER, own, "gallery")).toBe(true);
    expect(isOwnBrandPath("22222222-2222-4222-8222-222222222222", own, "gallery")).toBe(false);
    expect(isOwnBrandPath(TRAINER, own, "logo")).toBe(false);
    expect(isOwnBrandPath(TRAINER, `${TRAINER}/gallery-../../x.webp`, "gallery")).toBe(false);
  });
});

// ------------------------------------------------------------------ formulár záujemcu

const lead = { name: "Jana Nováková", email: "Jana@Example.com ", phone: "+421 900 123 456", goal: "weight_loss", experience: "beginner", availability: "večer", message: "Chcem schudnúť.", consent: "on" };

test.describe("formulár záujemcu", () => {
  test("platný vstup: normalizuje e-mail, nepovinné polia", () => {
    const r = validateLead(lead);
    expect(r).toEqual({ ok: true, value: { name: "Jana Nováková", email: "jana@example.com", phone: "+421 900 123 456", goal: "weight_loss", experience: "beginner", availability: "večer", message: "Chcem schudnúť." } });
    const min = validateLead({ ...lead, phone: "", availability: "", message: "" });
    expect(min).toMatchObject({ ok: true, value: { phone: null, availability: "", message: "" } });
  });

  test("meno, e-mail, telefón", () => {
    expect(validateLead({ ...lead, name: "J" })).toEqual({ ok: false, code: "nameInvalid" });
    expect(validateLead({ ...lead, name: "x".repeat(81) })).toEqual({ ok: false, code: "nameInvalid" });
    expect(validateLead({ ...lead, name: undefined })).toEqual({ ok: false, code: "nameInvalid" });
    for (const e of ["", "nie-email", "a@b", "a b@example.com", "jana@example.com\r\nBcc: x@y.sk", "<x>@example.com"]) {
      expect(validateLead({ ...lead, email: e }), e).toEqual({ ok: false, code: "emailInvalid" });
    }
    for (const p of ["abc", "123", "+421 (900) 12-34-56 ext 5", "1".repeat(30)]) {
      expect(validateLead({ ...lead, phone: p }), p).toEqual({ ok: false, code: "phoneInvalid" });
    }
    expect(cleanPhone("0900 123 456")).toEqual({ ok: true, value: "0900 123 456" });
  });

  test("cieľ a skúsenosti len z povolených hodnôt", () => {
    expect(validateLead({ ...lead, goal: "hocico" })).toEqual({ ok: false, code: "goalInvalid" });
    expect(validateLead({ ...lead, goal: undefined })).toEqual({ ok: false, code: "goalInvalid" });
    expect(validateLead({ ...lead, experience: "guru" })).toEqual({ ok: false, code: "experienceInvalid" });
    for (const g of LEAD_GOALS) expect(validateLead({ ...lead, goal: g }).ok).toBe(true);
  });

  test("dĺžky a čistenie riadiacich znakov", () => {
    expect(validateLead({ ...lead, availability: "x".repeat(121) })).toEqual({ ok: false, code: "availabilityTooLong" });
    expect(validateLead({ ...lead, message: "x".repeat(1001) })).toEqual({ ok: false, code: "messageTooLong" });
    expect(validateLead({ ...lead, message: "x".repeat(1000) }).ok).toBe(true);
    const r = validateLead({ ...lead, name: "Jana\u0000‮ Nováková", message: "a​b\r\n\r\n\r\n\r\nc" });
    expect(r).toMatchObject({ ok: true, value: { name: "Jana Nováková", message: "ab\n\nc" } });
  });

  test("spam: priveľa odkazov", () => {
    expect(countLinks("pozri https://a.sk a www.b.sk a http://c.sk")).toBe(3);
    expect(validateLead({ ...lead, message: "https://a.sk https://b.sk https://c.sk" })).toEqual({ ok: false, code: "tooManyLinks" });
    expect(validateLead({ ...lead, message: "viď https://a.sk" }).ok).toBe(true);
  });

  test("súhlas je povinný", () => {
    expect(validateLead({ ...lead, consent: undefined })).toEqual({ ok: false, code: "consentRequired" });
    expect(validateLead({ ...lead, consent: "" })).toEqual({ ok: false, code: "consentRequired" });
    expect(validateLead({ ...lead, consent: "0" })).toEqual({ ok: false, code: "consentRequired" });
    expect(validateLead({ ...lead, consent: "1" }).ok).toBe(true);
  });
});

// ------------------------------------------------------------------ limity odosielania

test.describe("limity odosielania formulára", () => {
  const zero = { ipHour: 0, ipDay: 0, trainerHour: 0, trainerDay: 0, emailInWindow: 0 };
  const L = LEAD_SUBMIT_LIMITS;

  test("pod limitmi je ok", () => {
    expect(decideLeadSubmit(zero)).toBe("ok");
    expect(decideLeadSubmit({ ipHour: L.perIpHour - 1, ipDay: L.perIpDay - 1, trainerHour: L.perTrainerHour - 1, trainerDay: L.perTrainerDay - 1, emailInWindow: 0 })).toBe("ok");
  });

  test("každý limit zvlášť", () => {
    expect(decideLeadSubmit({ ...zero, ipHour: L.perIpHour })).toBe("ip_hour");
    expect(decideLeadSubmit({ ...zero, ipDay: L.perIpDay })).toBe("ip_day");
    expect(decideLeadSubmit({ ...zero, trainerHour: L.perTrainerHour })).toBe("trainer_hour");
    expect(decideLeadSubmit({ ...zero, trainerDay: L.perTrainerDay })).toBe("trainer_day");
    expect(decideLeadSubmit({ ...zero, emailInWindow: 1 })).toBe("duplicate");
  });

  test("poradie: duplicita → IP hodina → IP deň → tréner hodina → tréner deň (ako v SQL)", () => {
    const all = { ipHour: 99, ipDay: 99, trainerHour: 99, trainerDay: 99, emailInWindow: 1 };
    expect(decideLeadSubmit(all)).toBe("duplicate");
    expect(decideLeadSubmit({ ...all, emailInWindow: 0 })).toBe("ip_hour");
    expect(decideLeadSubmit({ ...all, emailInWindow: 0, ipHour: 0 })).toBe("ip_day");
    expect(decideLeadSubmit({ ...all, emailInWindow: 0, ipHour: 0, ipDay: 0 })).toBe("trainer_hour");
    expect(decideLeadSubmit({ ...all, emailInWindow: 0, ipHour: 0, ipDay: 0, trainerHour: 0 })).toBe("trainer_day");
  });

  test("SQL funkcia používa rovnaké poradie a nepúšťa anon", () => {
    const sql = readFileSync("supabase/migrations/0083_trainer_public_page.sql", "utf8");
    const order = ["'duplicate'", "'ip_hour'", "'ip_day'", "'trainer_hour'", "'trainer_day'"].map((k) => sql.indexOf(`select ${k}::text`));
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(sql).toMatch(/revoke execute on function public\.reserve_lead_submit[\s\S]*from public, anon, authenticated/);
  });
});

// ------------------------------------------------------------------ stavy záujemcu

test.describe("stavy záujemcu", () => {
  test("štyri stavy", () => {
    expect([...LEAD_STATUSES]).toEqual(["new", "contacted", "invited", "closed"]);
    expect(isLeadStatus("new")).toBe(true);
    expect(isLeadStatus("deleted")).toBe(false);
    expect(isLeadStatus(null)).toBe(false);
  });

  test("ručne sa nedá nastaviť „pozvaný“ ani ten istý stav; ostatné prechody áno", () => {
    expect(canSetStatus("new", "contacted")).toBe(true);
    expect(canSetStatus("new", "closed")).toBe(true);
    expect(canSetStatus("contacted", "new")).toBe(true);
    expect(canSetStatus("invited", "closed")).toBe(true);
    expect(canSetStatus("invited", "contacted")).toBe(true);
    expect(canSetStatus("closed", "new")).toBe(true);
    expect(canSetStatus("new", "invited")).toBe(false);
    expect(canSetStatus("contacted", "invited")).toBe(false);
    expect(canSetStatus("new", "new")).toBe(false);
  });

  test("po pozvánke: nový/kontaktovaný → pozvaný, pozvaný ostáva, uzavretý sa neotvára", () => {
    expect(statusAfterInvite("new")).toBe("invited");
    expect(statusAfterInvite("contacted")).toBe("invited");
    expect(statusAfterInvite("invited")).toBe("invited");
    expect(statusAfterInvite("closed")).toBe("closed");
  });
});

// ------------------------------------------------------------------ viditeľnosť stránky

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

test.describe("viditeľnosť stránky (publikovaná × tarifa)", () => {
  test("verejná je len publikovaná stránka trénera s Business", () => {
    expect(isPageVisible({ published: true, tier: "business" })).toBe(true);
    expect(isPageVisible({ published: false, tier: "business" })).toBe(false);
    expect(isPageVisible({ published: true, tier: "pro" })).toBe(false);
    expect(isPageVisible({ published: true, tier: "starter" })).toBe(false);
    expect(isPageVisible({ published: true, tier: null })).toBe(false);
    expect(isPageVisible({ published: false, tier: null })).toBe(false);
  });

  test("tarifa z predplatného: aktívny Business áno; skončené / bez prístupu / nižšia tarifa nie", () => {
    const tier = (s: SubscriptionRow | null) => effectiveTier(s, NOW);
    expect(isPageVisible({ published: true, tier: tier(sub({})) })).toBe(true);
    expect(isPageVisible({ published: true, tier: tier(sub({ comped: true })) })).toBe(true);
    expect(isPageVisible({ published: true, tier: tier(sub({ tier: "pro" })) })).toBe(false);
    expect(isPageVisible({ published: true, tier: tier(sub({ status: "canceled" })) })).toBe(false);
    expect(isPageVisible({ published: true, tier: tier(null) })).toBe(false);
  });

  test("stav v nastaveniach", () => {
    expect(pageState({ businessUnlocked: false, hasHandle: true, published: true })).toBe("locked");
    expect(pageState({ businessUnlocked: true, hasHandle: false, published: true })).toBe("draft");
    expect(pageState({ businessUnlocked: true, hasHandle: true, published: false })).toBe("draft");
    expect(pageState({ businessUnlocked: true, hasHandle: true, published: true })).toBe("live");
  });

  test("SQL: verejné RPC len pre service_role a len publikované + Business", () => {
    const sql = readFileSync("supabase/migrations/0083_trainer_public_page.sql", "utf8");
    for (const fn of ["get_public_trainer_page(text)", "get_public_trainer_target(text)", "list_public_trainer_pages()", "purge_old_leads(int)", "reserve_lead_submit(uuid, text, text, int, int, int, int, int)"]) {
      expect(sql, fn).toContain(`revoke execute on function public.${fn} from public, anon, authenticated;`);
      expect(sql, fn).toContain(`grant execute on function public.${fn} to service_role;`);
    }
    expect(sql).toContain("p.published");
    expect(sql).toContain("billing_effective_tier(p.trainer_id) = 'business'");
    // záujemcovia: žiadna INSERT politika, tréner mení len stav a poznámky
    expect(sql).not.toMatch(/create policy "leads_insert/);
    expect(sql).toContain("grant update (status, notes, status_changed_at, invited_at) on public.trainer_leads");
    expect(sql).not.toMatch(/to anon/);
  });
});

// ------------------------------------------------------------------ SEO

test.describe("SEO", () => {
  const page = { handle: "fitsmajom", displayName: "Fit s Majou", headline: "Osobná trénerka", bio: "Pomáham ženám po pôrode vrátiť sa do formy." };
  const opts = { site: "https://myfitpilot.sk/", locale: "sk_SK", descriptionFallback: "Záloha", siteName: "FitPilot" };

  test("metadáta: názov, popis, canonical, indexovateľné, OpenGraph a Twitter", () => {
    const m = buildPageMetadata(page, opts);
    expect(m.title).toBe("Fit s Majou — Osobná trénerka");
    expect(m.description).toBe(page.bio);
    expect(m.alternates.canonical).toBe("https://myfitpilot.sk/t/fitsmajom");
    expect(m.robots).toEqual({ index: true, follow: true });
    expect(m.openGraph.url).toBe("https://myfitpilot.sk/t/fitsmajom");
    expect(m.openGraph.images[0]).toMatchObject({ url: "https://myfitpilot.sk/t/fitsmajom/og", width: 1200, height: 630 });
    expect(m.openGraph.type).toBe("profile");
    expect(m.twitter.card).toBe("summary_large_image");
  });

  test("bez nadpisu je názov len meno; popis sa zreže na vete/slove a nepresiahne limit", () => {
    expect(buildPageMetadata({ ...page, headline: "" }, opts).title).toBe("Fit s Majou");
    const long = `${"Slovo ".repeat(60)}koniec`;
    const d = pageDescription({ bio: long, headline: "" }, "x");
    expect(d.length).toBeLessThanOrEqual(DESCRIPTION_MAX);
    expect(d.endsWith("…")).toBe(true);
    expect(pageDescription({ bio: "", headline: "Nadpis" }, "x")).toBe("Nadpis");
    expect(pageDescription({ bio: "", headline: "" }, "Záloha")).toBe("Záloha");
    expect(pageCanonical("https://x.sk///", "ab-c")).toBe("https://x.sk/t/ab-c");
  });

  test("sitemap a robots: sitemap dopĺňa publikované stránky, robots nezakazuje /t/", () => {
    const sm = readFileSync("app/sitemap.ts", "utf8");
    expect(sm).toContain("listPublicPages");
    expect(sm).toContain("trainerPublicUrl(p.handle)");
    const rb = readFileSync("app/robots.ts", "utf8");
    expect(rb).not.toMatch(/disallow:[^\]]*"\/t/);
  });
});

// ------------------------------------------------------------------ e-mail trénerovi, zvonček, texty

test.describe("notifikácie a texty", () => {
  const leadData = { name: "Jana <b>Nováková</b>", email: "jana@example.com", phone: null, goal: "muscle_gain", experience: "advanced", availability: "ráno", message: "<script>alert(1)</script>\nAhoj" };

  test("e-mail o novom záujemcovi: SK aj CS, texty sa escapujú, odkaz do dashboardu", () => {
    for (const locale of ["sk", "cs"] as const) {
      const m = renderLeadMail({ locale, trainerName: "Maja", lead: leadData, link: "https://myfitpilot.sk/dashboard/zaujemcovia" }, "https://myfitpilot.sk");
      expect(m.html).not.toContain("<script>");
      expect(m.html).toContain("&lt;script&gt;");
      expect(m.html).toContain("https://myfitpilot.sk/dashboard/zaujemcovia");
      expect(m.text).toContain("jana@example.com");
      expect(m.subject).not.toMatch(/[<>\r\n]/);
    }
    const sk = renderLeadMail({ locale: "sk", trainerName: "Maja", lead: leadData, link: "https://x.sk/d" }, "https://x.sk");
    expect(sk.text).toContain("naberanie svalov");
    expect(sk.text).toContain("pokročilý");
  });

  test("zvonček: noví záujemcovia sa počítajú, majú položku s odkazom a prežijú skrývanie", () => {
    const data = applyDismissals({ unread: 0, late: [], digest: null, newLeads: 3 }, new Set());
    expect(data.newLeads).toBe(3);
    expect(attentionTotal(data)).toBe(3);
    const items = buildAttentionItems(data, "sk");
    const item = items.find((i) => i.id === "leads");
    expect(item?.href).toBe("/dashboard/nastavenia?sekcia=zaujemcovia");
    expect(item?.title).toContain("3");
    expect(buildAttentionItems({ unread: 0, late: [], digest: null, newLeads: 0 }, "sk")).toEqual([]);
    expect(attentionTotal({ unread: 0, late: [], digest: null })).toBe(0);
  });

  test("SK a CS majú rovnaké kľúče v publicPage.json", () => {
    const keys = (o: unknown, p = ""): string[] =>
      o && typeof o === "object" ? Object.entries(o).flatMap(([k, v]) => keys(v, p ? `${p}.${k}` : k)) : [p];
    expect(keys(csPublic).sort()).toEqual(keys(skPublic).sort());
  });

  test("Turnstile: server overuje token cez siteverify a bez kľúča v produkcii odmieta", () => {
    const src = readFileSync("lib/turnstileVerify.ts", "utf8");
    expect(src).toContain("https://challenges.cloudflare.com/turnstile/v0/siteverify");
    expect(src).toContain("TURNSTILE_SECRET_KEY");
    const action = readFileSync("app/t/[handle]/actions.ts", "utf8");
    // poradie ochrán: honeypot → limit v pamäti → validácia → Turnstile → viditeľnosť → limity v DB → zápis
    const idx = ["isHoneypotTripped(formData)", "allowWithinWindow(`lead-form", "validateLead({", "await verifyTurnstile(", "rpc(\"get_public_trainer_target\"", "rpc(\"reserve_lead_submit\"", 'from("trainer_leads").insert'].map((k) => action.indexOf(k));
    expect(idx.every((i) => i > 0)).toBe(true);
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
  });
});
