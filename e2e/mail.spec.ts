// i18n-ignore-file: testy e-mailov a uvítacej správy — čisté testy bez siete, SMTP a DB (vymyslené mená a texty)
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { cleanHeaderText, cleanRecipientName, escapeHtml, normalizeEmail } from "../lib/mail/sanitize";
import { hashRecipient } from "../lib/mail/recipientHash";
import { buildFrom, buildMessage, buildReplyTo, deliver, formatAddress, senderDisplayName, type MailMessage, type MailTransport } from "../lib/mail/message";
import { INVITE_LIMITS, decideInviteSend, remainingInvites } from "../lib/mail/limits";
import { signUnsubToken, verifyUnsubToken } from "../lib/mail/token";
import { decideWeeklyEmail } from "../lib/mail/weeklyRules";
import { WELCOME_MESSAGE_MAX, firstNameOf, renderWelcomeMessage, validateWelcomeMessage } from "../lib/mail/welcome";
import { defaultMailBrand, mailBrandFrom, renderInviteMail, renderWeeklyMail } from "../lib/mail/templates";
import { getMailSecret, getSmtpConfig, mailSiteUrl } from "../lib/mail/envConfig";
import { deriveBrandTheme } from "../lib/branding/colors";
import { buildWeeklySummary } from "../lib/gamification/weekly";
import type { PublicBranding } from "../lib/branding/types";
import skMail from "../messages/sk/mail.json";
import csMail from "../messages/cs/mail.json";

/**
 * Branding bod 2: e-maily klientom a uvítacia správa. Čisté testy — nič sa neposiela (transport je falošný),
 * žiadna sieť ani DB. Pokrýva čistenie hlavičiek, formát From/Reply-To, šablóny (FitPilot vs značka trénera,
 * SK/CS), limity odosielania, podpísané tokeny odhlásenia, pravidlá týždenného e-mailu a uvítaciu správu.
 */

const SITE = "https://app.example.test";
const SECRET = "test-secret-with-enough-length-0123456789";

const branding = (over: Partial<PublicBranding> = {}): PublicBranding => ({
  brandName: "Fit s Majou",
  welcomeText: "Vitaj v mojom tíme!",
  logoUrl: "https://cdn.example.test/branding/t/logo-1.webp",
  logoDarkUrl: "https://cdn.example.test/branding/t/logodark-1.webp",
  photoUrl: null,
  icons: null,
  theme: deriveBrandTheme("#2f6fed"),
  ...over,
});

test.describe("čistenie hlavičiek a adries", () => {
  test("CR/LF a riadiace znaky sa odstránia — nedá sa vložiť ďalšia hlavička", () => {
    const evil = "Maja\r\nBcc: obet@example.com\r\nX-Evil: 1";
    const clean = cleanHeaderText(evil);
    expect(clean).not.toMatch(/[\r\n]/);
    expect(clean).toBe("Maja Bcc: obet@example.com X-Evil: 1");
    expect(cleanHeaderText("a\u0000b‮c​d")).not.toMatch(/[\u0000‮​]/);
    expect(cleanHeaderText('Meno "<script>" \\')).toBe("Meno script");
    expect(cleanHeaderText(123)).toBe("");
  });

  test("dĺžka sa orezáva po znakoch (emoji = 1)", () => {
    expect(Array.from(cleanHeaderText("x".repeat(500), 80))).toHaveLength(80);
    expect(Array.from(cleanHeaderText("😀".repeat(100), 10))).toHaveLength(10);
  });

  test("predmet správy sa čistí aj v buildMessage", () => {
    const msg = buildMessage({
      from: buildFrom(null, "info@example.test"),
      to: "klient@example.com",
      subject: "Ahoj\r\nBcc: x@y.sk",
      html: "<p>x</p>",
      text: "x",
    });
    expect(msg.subject).not.toMatch(/[\r\n]/);
    expect(Object.keys(msg.headers).some((h) => h.toLowerCase() === "bcc")).toBe(false);
  });

  test("normalizeEmail: platné aj neplatné adresy", () => {
    expect(normalizeEmail("  Jana.Novakova+fit@Example.COM ")).toBe("jana.novakova+fit@example.com");
    for (const bad of ["", "a", "a@b", "a@b.c", "a b@example.com", "a@example.com\r\nBcc: x@y.sk", "<a@example.com>", "a@@example.com", ".a@example.com", "a..b@example.com", "a@-example.com", "a,b@example.com", "x".repeat(300) + "@example.com", null, 5]) {
      expect(normalizeEmail(bad as unknown)).toBeNull();
    }
  });

  test("cleanRecipientName: len písmená, pomlčka a apostrof; inak null", () => {
    expect(cleanRecipientName("Jana")).toBe("Jana");
    expect(cleanRecipientName("  Anna-Mária  Ďurišová ")).toBe("Anna-Mária Ďurišová");
    expect(cleanRecipientName("O'Neil")).toBe("O'Neil");
    expect(cleanRecipientName("Kúp teraz http://spam.example")).toBeNull();
    expect(cleanRecipientName("<b>x</b>")).toBeNull();
    expect(cleanRecipientName("x".repeat(41))).toBeNull();
    expect(cleanRecipientName("   ")).toBeNull();
  });

  test("hash príjemcu je stabilný, závislý od kľúča a nezverejňuje adresu", () => {
    const a = hashRecipient("Jana@Example.com", SECRET);
    expect(a).toBe(hashRecipient("jana@example.com", SECRET));
    expect(a).not.toBe(hashRecipient("jana@example.com", `${SECRET}x`));
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toContain("jana");
  });
});

test.describe("From / Reply-To", () => {
  test("tréner so značkou: „<Značka> (FitPilot)“, inak „FitPilot“", () => {
    expect(senderDisplayName("Fit s Majou")).toBe("Fit s Majou (FitPilot)");
    expect(senderDisplayName(null)).toBe("FitPilot");
    expect(senderDisplayName("   ")).toBe("FitPilot");
    expect(senderDisplayName("FitPilot")).toBe("FitPilot");
  });

  test("adresa odosielateľa je vždy z konfigurácie, nie od používateľa", () => {
    const from = buildFrom("Maja\r\nFrom: attacker@evil.test", "info@example.test");
    expect(from.address).toBe("info@example.test");
    expect(from.name).not.toMatch(/[\r\n]/);
    expect(formatAddress(buildFrom("Fit s Majou", "info@example.test"))).toBe('"Fit s Majou (FitPilot)" <info@example.test>');
    expect(() => buildFrom("x", "nie-je-email")).toThrow();
  });

  test("Reply-To je účet trénera; neplatný e-mail → žiadna hlavička", () => {
    expect(buildReplyTo("Maja@Example.com", "Maja Nováková")).toEqual({ name: "Maja Nováková", address: "maja@example.com" });
    expect(buildReplyTo("rozbite", "Maja")).toBeUndefined();
    expect(buildReplyTo(null, "Maja")).toBeUndefined();
    expect(buildReplyTo("maja@example.com", "Maja\r\nBcc: x@y.sk")?.name).not.toMatch(/[\r\n]/);
  });

  test("List-Unsubscribe + One-Click len pre platný https odkaz", () => {
    const base = { from: buildFrom(null, "info@example.test"), to: "a@example.com", subject: "s", html: "h", text: "t" };
    const ok = buildMessage({ ...base, unsubscribeUrl: `${SITE}/api/mail/unsubscribe?t=abc` });
    expect(ok.headers["List-Unsubscribe"]).toBe(`<${SITE}/api/mail/unsubscribe?t=abc>`);
    expect(ok.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(() => buildMessage({ ...base, unsubscribeUrl: `${SITE}/x\r\nBcc: a@b.sk` })).toThrow();
    expect(() => buildMessage({ ...base, to: "zle" })).toThrow();
    expect(buildMessage(base).headers["List-Unsubscribe"]).toBeUndefined();
  });
});

test.describe("odoslanie cez falošný transport", () => {
  const msg = (): MailMessage =>
    buildMessage({ from: buildFrom("Maja", "info@example.test"), to: "a@example.com", subject: "s", html: "<p>h</p>", text: "t" });

  test("úspech: transport dostane presne zloženú správu", async () => {
    const sent: MailMessage[] = [];
    const transport: MailTransport = { sendMail: async (m) => void sent.push(m) };
    const res = await deliver(transport, msg());
    expect(res).toEqual({ ok: true });
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("a@example.com");
    expect(sent[0].from.address).toBe("info@example.test");
  });

  test("chyba transportu sa vráti ako výsledok, nikdy nevyhodí", async () => {
    const transport: MailTransport = {
      sendMail: async () => {
        throw Object.assign(new Error("smtp down a@example.com"), { code: "ECONNREFUSED" });
      },
    };
    const res = await deliver(transport, msg());
    expect(res).toEqual({ ok: false, reason: "failed" });
  });
});

test.describe("konfigurácia z env (bez SMTP = no-op)", () => {
  const full = { SMTP_HOST: "smtp.example.test", SMTP_PORT: "465", SMTP_USER: "u", SMTP_PASSWORD: "p", MAIL_FROM_ADDRESS: "Info@Example.test" };

  test("úplné nastavenie sa načíta, adresa sa normalizuje", () => {
    expect(getSmtpConfig(full)).toEqual({ host: "smtp.example.test", port: 465, user: "u", password: "p", fromAddress: "info@example.test" });
  });

  test("chýbajúca / neplatná hodnota = null", () => {
    expect(getSmtpConfig({})).toBeNull();
    for (const key of Object.keys(full)) expect(getSmtpConfig({ ...full, [key]: "" })).toBeNull();
    expect(getSmtpConfig({ ...full, SMTP_PORT: "abc" })).toBeNull();
    expect(getSmtpConfig({ ...full, SMTP_PORT: "70000" })).toBeNull();
    expect(getSmtpConfig({ ...full, MAIL_FROM_ADDRESS: "nie-je-email" })).toBeNull();
  });

  test("tajný kľúč: vlastný, inak odvodený z CRON_SECRET, inak null", () => {
    expect(getMailSecret({})).toBeNull();
    expect(getMailSecret({ MAIL_UNSUBSCRIBE_SECRET: "krátky" })).toBeNull();
    expect(getMailSecret({ MAIL_UNSUBSCRIBE_SECRET: SECRET })).toBe(SECRET);
    const derived = getMailSecret({ CRON_SECRET: SECRET });
    expect(derived).toMatch(/^[0-9a-f]{64}$/);
    expect(derived).not.toBe(SECRET); // surový CRON_SECRET sa nepoužíva priamo
    expect(getMailSecret({ CRON_SECRET: SECRET })).toBe(derived);
  });

  test("základ odkazov", () => {
    expect(mailSiteUrl({ NEXT_PUBLIC_SITE_URL: "https://myfitpilot.sk/" })).toBe("https://myfitpilot.sk");
    expect(mailSiteUrl({})).toBe("http://localhost:3000");
  });
});

test.describe("šablóny: FitPilot vs značka trénera", () => {
  const unsub = `${SITE}/api/mail/unsubscribe?t=tok`;
  const base = { trainerName: "Maja Nováková", recipientName: "Jana", link: `${SITE}/pozvanka/${"a".repeat(20)}`, unsubscribeUrl: unsub };

  test("predvolený FitPilot: logo FitPilot, pokyny s kódom, bez citátu trénera", () => {
    const brand = defaultMailBrand(SITE);
    const r = renderInviteMail({ ...base, locale: "sk", brand, branded: false, welcomeText: "NEMÁ SA UKÁZAŤ", link: `${SITE}/prihlasenie#register` });
    expect(r.html).toContain(`${SITE}/brand/logo-mark.png`);
    expect(r.html).toContain("#b4492d");
    expect(r.html).toContain(skMail.invite.stepsDefault);
    expect(r.html).not.toContain("NEMÁ SA UKÁZAŤ");
    expect(r.html).not.toContain(skMail.poweredBy);
    expect(r.html).toContain(skMail.footerFitPilot);
    expect(r.subject).toBe("Maja Nováková ťa pozýva do appky");
    expect(r.html).toContain("Ahoj Jana,");
    expect(r.html).toContain(unsub);
  });

  test("značka trénera: logo, názov, kontrastná farba, uvítací text, „Beží na FitPilot“", () => {
    const b = branding();
    const brand = mailBrandFrom(b, SITE);
    expect(brand.isTrainerBrand).toBe(true);
    expect(brand.logoUrl).toBe(b.logoUrl); // svetlé logo, nie tmavé
    expect(brand.accent).toBe(b.theme!.light.accent);
    expect(brand.on).toBe(b.theme!.light.on);
    const r = renderInviteMail({ ...base, locale: "sk", brand, branded: true, welcomeText: b.welcomeText });
    expect(r.html).toContain(b.logoUrl!);
    expect(r.html).not.toContain(b.logoDarkUrl!);
    expect(r.html).toContain(b.theme!.light.accent);
    expect(r.html).toContain("Fit s Majou ťa pozýva");
    expect(r.html).toContain("Vitaj v mojom tíme!");
    expect(r.html).toContain(skMail.invite.stepsBranded);
    expect(r.html).toContain(skMail.poweredBy);
    expect(r.html).not.toContain("logo-mark.png");
    expect(r.subject).toBe("Fit s Majou ťa pozýva do appky");
    expect(r.text).toContain(unsub);
    expect(r.text).toContain("> Vitaj v mojom tíme!");
  });

  test("značka bez farby ostane s farbou FitPilot; prázdna značka = predvolený vzhľad", () => {
    const noColor = mailBrandFrom(branding({ theme: null }), SITE);
    expect(noColor.accent).toBe("#b4492d");
    expect(noColor.isTrainerBrand).toBe(true);
    expect(mailBrandFrom(null, SITE).isTrainerBrand).toBe(false);
    expect(mailBrandFrom(branding({ brandName: "", logoUrl: null, theme: null }), SITE).isTrainerBrand).toBe(false);
    // len tmavé logo: v svetlom e-maile sa nepoužije
    expect(mailBrandFrom(branding({ logoUrl: null }), SITE).logoUrl).toBeNull();
  });

  test("čeština podľa jazyka klienta", () => {
    const r = renderInviteMail({ ...base, locale: "cs", brand: defaultMailBrand(SITE), branded: false });
    expect(r.html).toContain('lang="cs"');
    expect(r.html).toContain(csMail.invite.stepsDefault);
    expect(r.html).toContain("tě zve");
    expect(r.subject).toBe("Maja Nováková tě zve do aplikace");
    const sk = renderInviteMail({ ...base, locale: "sk", brand: defaultMailBrand(SITE), branded: false });
    expect(sk.html).toContain('lang="sk"');
    expect(sk.html).not.toContain(csMail.invite.stepsDefault);
  });

  test("používateľský text sa escapuje (žiadne vložené HTML)", () => {
    const evilBrand = mailBrandFrom(branding({ brandName: "<img src=x onerror=alert(1)>" }), SITE);
    const r = renderInviteMail({ ...base, trainerName: "<script>alert(1)</script>", locale: "sk", brand: evilBrand, branded: true, welcomeText: '"><b>tučné</b>' });
    expect(r.html).not.toContain("<script>");
    expect(r.html).not.toContain("<img src=x");
    expect(r.html).not.toContain("<b>tučné</b>");
    expect(r.html).toContain("&lt;b&gt;tučné&lt;/b&gt;");
    expect(escapeHtml(`a&b<c>"d'`)).toBe("a&amp;b&lt;c&gt;&quot;d&#39;");
    // v predmete nie sú zalomenia ani <>
    expect(r.subject).not.toMatch(/[\r\n<>]/);
  });

  test("odkaz s nebezpečnou schémou sa nikdy nevykreslí", () => {
    const r = renderInviteMail({ ...base, link: "javascript:alert(1)", locale: "sk", brand: defaultMailBrand(SITE), branded: false });
    expect(r.html).not.toContain("javascript:");
  });
});

test.describe("týždenný e-mail", () => {
  const summary = buildWeeklySummary({
    weekStart: "2026-11-16",
    logsWeek: [
      { performedOn: "2026-11-17", entries: [{ sets: [{ weight: 100, reps: 5 }] }] },
      { performedOn: "2026-11-19", entries: [{ sets: [{ weight: 100, reps: 5 }] }] },
    ],
    logsPrev: [],
    foodDates: ["2026-11-17", "2026-11-18"],
    proteinDays: 1,
    proteinTarget: 120,
    workoutTarget: 2,
    prs: [{ exerciseName: "Drep", weightKg: 110, reps: 3 }],
    badgeIds: ["workouts_10"],
    challengeNames: [],
    streakWeeks: 3,
  });
  const unsub = `${SITE}/api/mail/unsubscribe?t=tok`;

  test("plné zhrnutie: čísla, rozsah dátumov, odhlásenie, jazyk", () => {
    const r = renderWeeklyMail({ locale: "sk", brand: defaultMailBrand(SITE), summary, nudge: false, firstName: "Jana", appUrl: `${SITE}/portal`, unsubscribeUrl: unsub });
    expect(r.subject).toContain(skMail.weekly.heading);
    expect(r.html).toContain("2/2");
    expect(r.html).toContain(skMail.weekly.goalMet);
    expect(r.html).toContain("Drep 110 kg × 3");
    expect(r.html).toContain(unsub);
    expect(r.html).toContain(`${SITE}/portal`);
    expect(r.html).toContain("Ahoj Jana,");
    expect(r.text).toContain(`${skMail.weekly.unsubscribe}: ${unsub}`);
    const cs = renderWeeklyMail({ locale: "cs", brand: defaultMailBrand(SITE), summary, nudge: false, firstName: "", appUrl: `${SITE}/portal`, unsubscribeUrl: unsub });
    expect(cs.html).toContain(csMail.weekly.goalMet);
    expect(cs.html).toContain(csMail.weekly.greetingNoName);
    expect(cs.subject).toContain("Tvůj týden");
  });

  test("povzbudenie (týždeň bez aktivity) nemá čísla ani výčitky", () => {
    const empty = buildWeeklySummary({ weekStart: "2026-11-16", logsWeek: [], logsPrev: [], foodDates: [], proteinDays: 0, proteinTarget: null, workoutTarget: 2, prs: [], badgeIds: [], challengeNames: [], streakWeeks: 0 });
    expect(empty.hasActivity).toBe(false);
    const r = renderWeeklyMail({ locale: "sk", brand: defaultMailBrand(SITE), summary: empty, nudge: true, firstName: "Jana", appUrl: `${SITE}/portal`, unsubscribeUrl: unsub });
    expect(r.subject).toBe(skMail.weekly.subjectNudge);
    expect(r.html).toContain(skMail.weekly.nudgeIntro);
    expect(r.html).not.toContain("0/2");
  });

  test("značka trénera sa prenesie aj do týždenného e-mailu", () => {
    const b = branding();
    const r = renderWeeklyMail({ locale: "sk", brand: mailBrandFrom(b, SITE), summary, nudge: false, firstName: "Jana", appUrl: `${SITE}/portal`, unsubscribeUrl: unsub });
    expect(r.html).toContain(b.logoUrl!);
    expect(r.html).toContain(b.theme!.light.accent);
    expect(r.html).toContain("Fit s Majou");
    expect(r.html).toContain(skMail.poweredBy);
  });
});

test.describe("pravidlá týždenného e-mailu", () => {
  const ok = { optedIn: true, hasEmail: true, trainerActive: true, weekHasActivity: true, recentActivity: true };

  test("aktívny týždeň → plné zhrnutie", () => {
    expect(decideWeeklyEmail(ok)).toEqual({ send: true, kind: "full" });
  });
  test("bez aktivity, ale nedávno aktívny → povzbudenie", () => {
    expect(decideWeeklyEmail({ ...ok, weekHasActivity: false })).toEqual({ send: true, kind: "nudge" });
  });
  test("3 a viac týždňov bez aktivity → nič", () => {
    expect(decideWeeklyEmail({ ...ok, weekHasActivity: false, recentActivity: false })).toEqual({ send: false, reason: "dormant" });
  });
  test("odhlásený, bez e-mailu, tréner bez prístupu → nič (aj pri aktivite)", () => {
    expect(decideWeeklyEmail({ ...ok, optedIn: false })).toEqual({ send: false, reason: "opted_out" });
    expect(decideWeeklyEmail({ ...ok, hasEmail: false })).toEqual({ send: false, reason: "no_email" });
    expect(decideWeeklyEmail({ ...ok, trainerActive: false })).toEqual({ send: false, reason: "trainer_inactive" });
  });
});

test.describe("limity pozvánok", () => {
  const zero = { hour: 0, day: 0, recipientInWindow: 0, global: 0 };

  test("v limite → ok", () => {
    expect(decideInviteSend(zero)).toBe("ok");
    expect(decideInviteSend({ ...zero, hour: INVITE_LIMITS.perHour - 1, day: INVITE_LIMITS.perDay - 1 })).toBe("ok");
  });
  test("hodinový, denný a globálny strop", () => {
    expect(decideInviteSend({ ...zero, hour: 20 })).toBe("hour_limit");
    expect(decideInviteSend({ ...zero, day: 50 })).toBe("day_limit");
    expect(decideInviteSend({ ...zero, global: 500 })).toBe("global_limit");
    expect(INVITE_LIMITS).toMatchObject({ perHour: 20, perDay: 50, recipientCooldownHours: 24 });
  });
  test("tá istá adresa v 24 h má prednosť pred ostatnými dôvodmi", () => {
    expect(decideInviteSend({ ...zero, recipientInWindow: 1 })).toBe("recipient_cooldown");
    expect(decideInviteSend({ hour: 99, day: 99, recipientInWindow: 1, global: 999 })).toBe("recipient_cooldown");
  });
  test("zostatok sa nikdy nepodlezie pod 0 a berie užší limit", () => {
    expect(remainingInvites({ hour: 0, day: 0 })).toEqual({ hour: 20, day: 50, now: 20 });
    expect(remainingInvites({ hour: 5, day: 48 })).toEqual({ hour: 15, day: 2, now: 2 });
    expect(remainingInvites({ hour: 30, day: 80 }).now).toBe(0);
  });
  test("SQL reserve_mail_send zrkadlí rovnaké limity a poradie kontrol", () => {
    const sql = readFileSync("supabase/migrations/0082_branding_comms.sql", "utf8");
    const order = ["recipient_cooldown", "hour_limit", "day_limit", "global_limit"].map((s) => sql.indexOf(`'${s}'`));
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
});

test.describe("tokeny odhlásenia", () => {
  const NOW = Date.UTC(2026, 10, 24, 6, 0, 0);
  const CLIENT = "0b6d3f1e-8a2c-4f7d-9b1e-2c3d4e5f6a7b";

  test("podpis a overenie: obsah sa vráti nezmenený", () => {
    const token = signUnsubToken({ k: "weekly", s: CLIENT, l: "cs" }, SECRET, NOW);
    const v = verifyUnsubToken(token, SECRET, NOW + 1000);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.payload).toMatchObject({ k: "weekly", s: CLIENT, l: "cs" });
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  });

  test("zmenený obsah alebo podpis, cudzí kľúč → zamietnuté", () => {
    const token = signUnsubToken({ k: "weekly", s: CLIENT, l: "sk" }, SECRET, NOW);
    const [body, sig] = token.split(".");
    // podvrhnutý payload s iným klientom a pôvodným podpisom
    const forged = Buffer.from(JSON.stringify({ k: "weekly", s: "11111111-2222-3333-4444-555555555555", l: "sk", e: Math.floor(NOW / 1000) + 99999 })).toString("base64url");
    expect(verifyUnsubToken(`${forged}.${sig}`, SECRET, NOW)).toEqual({ ok: false, reason: "bad_signature" });
    expect(verifyUnsubToken(`${body}.${sig.slice(0, -2)}AA`, SECRET, NOW)).toEqual({ ok: false, reason: "bad_signature" });
    expect(verifyUnsubToken(token, `${SECRET}x`, NOW)).toEqual({ ok: false, reason: "bad_signature" });
  });

  test("expirovaný token", () => {
    const token = signUnsubToken({ k: "invite", s: "ab".repeat(32), l: "sk" }, SECRET, NOW, 60);
    expect(verifyUnsubToken(token, SECRET, NOW + 30_000).ok).toBe(true);
    expect(verifyUnsubToken(token, SECRET, NOW + 61_000)).toEqual({ ok: false, reason: "expired" });
  });

  test("neplatný tvar (prázdne, bez bodky, cudzie znaky, príliš dlhé, nie reťazec)", () => {
    for (const bad of ["", "abc", "a.b.c", ".x", "x.", "a b.c d", "x".repeat(700), null, undefined, 42]) {
      expect(verifyUnsubToken(bad, SECRET, NOW).ok).toBe(false);
    }
  });

  test("token neobsahuje e-mail ani čitateľné osobné údaje", () => {
    const token = signUnsubToken({ k: "invite", s: hashRecipient("jana@example.com", SECRET), l: "sk" }, SECRET, NOW);
    expect(Buffer.from(token.split(".")[0], "base64url").toString("utf8")).not.toContain("jana");
  });
});

test.describe("uvítacia správa", () => {
  test("{meno} sa nahradí krstným menom klienta", () => {
    expect(renderWelcomeMessage("Ahoj {meno}! Vitaj.", "Jana Nováková")).toBe("Ahoj Jana! Vitaj.");
    expect(renderWelcomeMessage("{meno}, {meno}!", "Peter Horváth")).toBe("Peter, Peter!");
    expect(renderWelcomeMessage("Bez zástupného znaku.", "Jana")).toBe("Bez zástupného znaku.");
    expect(firstNameOf("  Anna Mária  Kováčová ")).toBe("Anna");
  });

  test("bez mena sa zástupný znak vynechá a interpunkcia sa upraví", () => {
    expect(renderWelcomeMessage("Ahoj {meno}! Vitaj.", "")).toBe("Ahoj! Vitaj.");
    expect(renderWelcomeMessage("Ahoj {meno}, vitaj.", null)).toBe("Ahoj, vitaj.");
    expect(renderWelcomeMessage("{meno}", undefined)).toBe("");
  });

  test("neznáme zátvorky ostanú nedotknuté a mená s $ či & sa nevyhodnocujú", () => {
    expect(renderWelcomeMessage("Ahoj {meno} {cieľ}", "A$&B")).toBe("Ahoj A$&B {cieľ}");
  });

  test("validácia: čistí riadiace znaky a drží limit 1000 znakov (emoji = 1)", () => {
    const ok = validateWelcomeMessage("Ahoj‮ {meno}\u0000!");
    expect(ok).toEqual({ ok: true, value: "Ahoj {meno}!" });
    expect(validateWelcomeMessage("x".repeat(WELCOME_MESSAGE_MAX))).toMatchObject({ ok: true });
    expect(validateWelcomeMessage("x".repeat(WELCOME_MESSAGE_MAX + 1))).toEqual({ ok: false, code: "welcomeMessageTooLong" });
    expect(validateWelcomeMessage("😀".repeat(WELCOME_MESSAGE_MAX))).toMatchObject({ ok: true });
    expect(validateWelcomeMessage("   ")).toEqual({ ok: true, value: "" }); // prázdne = uvítanie sa neposiela
    expect(validateWelcomeMessage(42 as unknown)).toEqual({ ok: true, value: "" });
  });
});

test.describe("migrácia 0082: bezpečnosť", () => {
  const sql = readFileSync("supabase/migrations/0082_branding_comms.sql", "utf8");

  test("logy a limity sú len pre service role, RLS všade zapnuté", () => {
    for (const table of ["mail_send_log", "weekly_summary_log", "mail_suppressions", "trainer_welcome_sent", "client_email_prefs", "trainer_welcome_messages"]) {
      expect(sql).toContain(`alter table public.${table} enable row level security`);
    }
    expect(sql).toMatch(/revoke all on public\.mail_send_log, public\.weekly_summary_log, public\.mail_suppressions from public, anon, authenticated/);
    expect(sql).toMatch(/grant execute on function public\.reserve_mail_send\(uuid, text, int, int, int, int\) to service_role/);
    expect(sql).toMatch(/revoke execute on function public\.reserve_mail_send\(uuid, text, int, int, int, int\) from public, anon, authenticated/);
  });

  test("uvítacia funkcia nie je volateľná používateľom a nikdy nevyhodí výnimku", () => {
    expect(sql).toMatch(/revoke execute on function public\.send_trainer_welcome\(uuid, uuid\) from public, anon, authenticated/);
    expect(sql).toContain("exception when others then");
    expect(sql).toContain("security definer");
    expect(sql.match(/set search_path = public/g)!.length).toBe(sql.match(/security definer/g)!.length);
  });

  test("obe párovacie funkcie volajú uvítanie a ostávajú len pre authenticated", () => {
    expect(sql.match(/perform public\.send_trainer_welcome\(/g)).toHaveLength(2);
    expect(sql).toMatch(/revoke execute on function public\.add_client_by_code\(text\) from public, anon;/);
    expect(sql).toMatch(/grant execute on function public\.claim_invite\(text\) to authenticated;/);
    expect(sql).toContain("raise exception 'not_authenticated'");
  });

  test("príjemca sa ukladá len ako hash (žiadny stĺpec s e-mailom)", () => {
    expect(sql).toContain("recipient_hash text not null");
    expect(sql).not.toMatch(/\bemail text\b/);
  });
});
