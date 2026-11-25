// FitPilot — šablóny e-mailov klientom (pozvánka, týždenné zhrnutie). Čistý modul bez I/O
// (testy: e2e/mail.spec.ts). Vzhľad zodpovedá docs/email-templates (svetlý „liquid-glass“ štýl
// e-mailov Supabase Auth); pri značke trénera (Business) sa použije jeho logo, názov a
// kontrastne bezpečná farba z lib/branding. Texty sú v messages/<jazyk>/mail.json.
// Každý používateľský text sa pri vykreslení escapuje (escapeHtml) — HTML od používateľa sa nevkladá.

import { MESSAGES } from "@/messages";
import { intlLocale, type Locale } from "@/lib/i18n/locales";
import { mix } from "@/lib/branding/colors";
import { cleanLine } from "@/lib/branding/validation";
import type { PublicBranding } from "@/lib/branding/types";
import type { WeeklySummary } from "@/lib/gamification/weekly";
import { cleanHeaderText, escapeHtml } from "./sanitize";

// ------------------------------------------------------------------ značka e-mailu

/** Vzhľad e-mailu: predvolený FitPilot, alebo značka trénera. */
export interface MailBrand {
  /** zobrazený názov v hlavičke e-mailu */
  name: string;
  /** absolútna URL loga (svetlá varianta) alebo null = len text */
  logoUrl: string | null;
  /** výplň tlačidla (kontrast voči pozadiu ≥ 3:1) */
  accent: string;
  /** text na výplni tlačidla (kontrast ≥ 4.5:1) */
  on: string;
  /** farba odkazov a zvýraznení v texte (kontrast ≥ 4.5:1 voči povrchu) */
  text: string;
  /** jemné plné pozadie dlaždíc (bez rgba — Outlook ho nepodporuje) */
  tint: string;
  /** true = značka trénera (Business), false = FitPilot */
  isTrainerBrand: boolean;
}

const SURFACE = "#fbf6f1";

export function defaultMailBrand(siteUrl: string): MailBrand {
  return {
    name: "FitPilot",
    logoUrl: `${siteUrl.replace(/\/+$/, "")}/brand/logo-mark.png`,
    accent: "#b4492d",
    on: "#ffffff",
    text: "#b4492d",
    tint: "#f7e3da",
    isTrainerBrand: false,
  };
}

/** Značka trénera → vzhľad e-mailu; `null` (tréner bez Business / bez značky) → FitPilot. */
export function mailBrandFrom(branding: PublicBranding | null | undefined, siteUrl: string): MailBrand {
  const base = defaultMailBrand(siteUrl);
  if (!branding) return base;
  const name = cleanLine(branding.brandName);
  const light = branding.theme?.light ?? null;
  if (!name && !branding.logoUrl && !light) return base;
  return {
    name: name || base.name,
    // e-mail je vždy svetlý → len logo pre svetlé pozadie (tmavé logo by sa na ňom stratilo)
    logoUrl: branding.logoUrl,
    accent: light?.accent ?? base.accent,
    on: light?.on ?? base.on,
    text: light?.text ?? base.text,
    tint: light ? mix(light.accent, SURFACE, 0.86) : base.tint,
    isTrainerBrand: true,
  };
}

// ------------------------------------------------------------------ dokument e-mailu

export interface MailStat {
  value: string;
  label: string;
}

export interface MailDoc {
  lang: Locale;
  preheader: string;
  heading: string;
  greeting: string;
  paragraphs: string[];
  /** zvýraznený citát (napr. uvítací text trénera z pozvánky) */
  quote?: string;
  stats?: MailStat[];
  cta?: { label: string; url: string };
  /** drobný text pod tlačidlom */
  afterCta?: string[];
  /** odkaz pod tlačidlom, keď tlačidlo nefunguje */
  fallbackLink?: { label: string; url: string };
  /** päta: dôvod, prečo e-mail prišiel */
  reasons: string[];
  /** nepovinný e-mail → odkaz na odhlásenie */
  unsubscribe?: { label: string; url: string };
}

export interface RenderedMail {
  subject: string;
  html: string;
  text: string;
}

const FONT = "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** Dosadí {kľúč} do textu (texty v mail.json nemajú ICU plurály). */
export function fmt(template: string, values: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in values ? String(values[k]) : m));
}

function safeUrl(url: string): string {
  return /^https?:\/\/[^\s<>"']+$/.test(url) ? url : "#";
}

function renderStats(stats: MailStat[], brand: MailBrand): string {
  const cell = (s: MailStat) =>
    `<td width="50%" valign="top" style="padding:4px;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>` +
    `<td bgcolor="${brand.tint}" style="background:${brand.tint}; border-radius:16px; padding:14px 12px; text-align:center;">` +
    `<div style="color:#1f1a17; font-family:${FONT}; font-size:24px; font-weight:800; letter-spacing:-0.02em; line-height:1.2;">${escapeHtml(s.value)}</div>` +
    `<div style="margin-top:2px; color:#574d47; font-family:${FONT}; font-size:12.5px; line-height:1.35;">${escapeHtml(s.label)}</div>` +
    `</td></tr></table></td>`;
  const rows: string[] = [];
  for (let i = 0; i < stats.length; i += 2) {
    rows.push(`<tr>${cell(stats[i])}${stats[i + 1] ? cell(stats[i + 1]) : `<td width="50%"></td>`}</tr>`);
  }
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 16px;">${rows.join("")}</table>`;
}

export function renderMailHtml(doc: MailDoc, brand: MailBrand, poweredBy: string, footerFitPilot: string): string {
  const header = brand.logoUrl
    ? `<td style="padding-right:10px; vertical-align:middle;"><img src="${escapeHtml(safeUrl(brand.logoUrl))}" alt="${escapeHtml(brand.name)}" height="36" style="display:block; height:36px; max-width:160px; width:auto;" /></td>` +
      (brand.isTrainerBrand
        ? ""
        : `<td style="vertical-align:middle; color:#1f1a17; font-family:${FONT}; font-weight:800; font-size:21px; letter-spacing:-0.02em;">${escapeHtml(brand.name)}</td>`)
    : `<td style="vertical-align:middle; color:#1f1a17; font-family:${FONT}; font-weight:800; font-size:21px; letter-spacing:-0.02em;">${escapeHtml(brand.name)}</td>`;
  // značka s logom: názov ostáva v alt a v päte; značka bez loga: text v hlavičke (vyššie)

  const p = (html: string, style = "") =>
    `<p style="margin:0 0 14px; color:#574d47; font-family:${FONT}; font-size:15px; line-height:1.55; white-space:pre-line;${style}">${html}</p>`;

  const body: string[] = [];
  body.push(
    `<h1 style="margin:0 0 12px; color:#1f1a17; font-family:${FONT}; font-size:22px; font-weight:800; letter-spacing:-0.02em;">${escapeHtml(doc.heading)}</h1>`,
    p(escapeHtml(doc.greeting)),
  );
  for (const para of doc.paragraphs) body.push(p(escapeHtml(para)));
  if (doc.quote) {
    body.push(
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;"><tr>` +
        `<td bgcolor="${brand.tint}" style="background:${brand.tint}; border-radius:16px; padding:14px 18px; color:#1f1a17; font-family:${FONT}; font-size:15px; line-height:1.55; white-space:pre-line;">${escapeHtml(doc.quote)}</td></tr></table>`,
    );
  }
  if (doc.stats && doc.stats.length > 0) body.push(renderStats(doc.stats, brand));
  if (doc.cta) {
    body.push(
      `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 16px;"><tr>` +
        `<td align="center" bgcolor="${brand.accent}" style="background:${brand.accent}; border-radius:999px;">` +
        `<a href="${escapeHtml(safeUrl(doc.cta.url))}" style="display:inline-block; padding:14px 30px; color:${brand.on}; font-family:${FONT}; font-size:15px; font-weight:700; text-decoration:none;">${escapeHtml(doc.cta.label)}</a>` +
        `</td></tr></table>`,
    );
  }
  for (const line of doc.afterCta ?? []) body.push(p(escapeHtml(line), " font-size:13.5px; color:#7d726a;"));
  if (doc.fallbackLink) {
    const u = safeUrl(doc.fallbackLink.url);
    body.push(
      p(`${escapeHtml(doc.fallbackLink.label)}<br /><a href="${escapeHtml(u)}" style="color:${brand.text}; word-break:break-all;">${escapeHtml(u)}</a>`, " font-size:12.5px; color:#7d726a;"),
    );
  }

  const footerParts: string[] = doc.reasons.map((r) => escapeHtml(r));
  if (doc.unsubscribe) {
    footerParts.push(`<a href="${escapeHtml(safeUrl(doc.unsubscribe.url))}" style="color:${brand.text};">${escapeHtml(doc.unsubscribe.label)}</a>`);
  }
  footerParts.push(escapeHtml(brand.isTrainerBrand ? poweredBy : footerFitPilot));

  return `<!doctype html>
<html lang="${doc.lang}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light only" />
    <meta name="supported-color-schemes" content="light only" />
    <title>${escapeHtml(doc.heading)}</title>
  </head>
  <body bgcolor="#f2ece6" style="margin:0; padding:0; background:#f2ece6;">
    <div style="display:none; max-height:0; overflow:hidden; opacity:0; color:transparent;">${escapeHtml(doc.preheader)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#f2ece6" style="background:#f2ece6;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="520" cellpadding="0" cellspacing="0" bgcolor="${SURFACE}" style="max-width:520px; width:100%; background:${SURFACE}; border:1px solid #efe6dd; border-radius:28px; overflow:hidden;">
            <tr>
              <td align="center" style="padding:30px 32px 6px;">
                <table role="presentation" cellpadding="0" cellspacing="0"><tr>${header}</tr></table>
              </td>
            </tr>
            <tr>
              <td style="padding:22px 32px 8px;">
                ${body.join("\n                ")}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 26px; border-top:1px solid #efe6dd; font-family:${FONT};">
                <p style="margin:0; color:#7d726a; font-size:12px; line-height:1.6;">${footerParts.join("<br />")}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function renderMailText(doc: MailDoc, brand: MailBrand, poweredBy: string, footerFitPilot: string): string {
  const out: string[] = [doc.heading, "", doc.greeting, ""];
  for (const para of doc.paragraphs) out.push(para, "");
  if (doc.quote) out.push(...doc.quote.split("\n").map((l) => `> ${l}`), "");
  if (doc.stats) for (const s of doc.stats) out.push(`${s.label}: ${s.value}`);
  if (doc.stats && doc.stats.length > 0) out.push("");
  if (doc.cta) out.push(`${doc.cta.label}: ${doc.cta.url}`, "");
  for (const line of doc.afterCta ?? []) out.push(line, "");
  out.push("--");
  for (const r of doc.reasons) out.push(r);
  if (doc.unsubscribe) out.push(`${doc.unsubscribe.label}: ${doc.unsubscribe.url}`);
  out.push(brand.isTrainerBrand ? poweredBy : footerFitPilot);
  return out.join("\n");
}

function finish(doc: MailDoc, brand: MailBrand, subject: string): RenderedMail {
  const m = MESSAGES[doc.lang].mail;
  return {
    subject: cleanHeaderText(subject, 150),
    html: renderMailHtml(doc, brand, m.poweredBy, m.footerFitPilot),
    text: renderMailText(doc, brand, m.poweredBy, m.footerFitPilot),
  };
}

// ------------------------------------------------------------------ pozvánka

export interface InviteMailInput {
  locale: Locale;
  brand: MailBrand;
  /** meno trénera z profilu */
  trainerName: string;
  /** meno príjemcu (už očistené cleanRecipientName) alebo null */
  recipientName: string | null;
  /** odkaz pozvánky (/pozvanka/<odkaz>) alebo registrácie */
  link: string;
  /** true = odkaz vedie na pozvánku trénera s Business (jedným klikom sa pripojí) */
  branded: boolean;
  /** uvítací text z pozvánky trénera (už validovaný, max. 300 znakov); len pri Business */
  welcomeText?: string;
  unsubscribeUrl: string;
}

export function renderInviteMail(i: InviteMailInput): RenderedMail {
  const m = MESSAGES[i.locale].mail;
  const trainer = cleanLine(i.trainerName) || i.brand.name;
  const brandName = i.brand.name;
  const sender = i.branded && i.brand.isTrainerBrand ? brandName : trainer;
  const doc: MailDoc = {
    lang: i.locale,
    preheader: m.invite.preheader,
    heading: i.branded && i.brand.isTrainerBrand ? fmt(m.invite.headingBranded, { brand: brandName }) : fmt(m.invite.headingDefault, { trainer }),
    greeting: i.recipientName ? fmt(m.invite.greeting, { name: i.recipientName }) : m.invite.greetingNoName,
    paragraphs: [fmt(m.invite.intro, { trainer })],
    quote: i.branded && i.welcomeText ? i.welcomeText : undefined,
    cta: { label: i.branded ? m.invite.ctaBranded : m.invite.ctaDefault, url: i.link },
    afterCta: [i.branded ? m.invite.stepsBranded : m.invite.stepsDefault, m.invite.ignore],
    fallbackLink: { label: m.linkFallback, url: i.link },
    reasons: [fmt(m.invite.reason, { trainer })],
    unsubscribe: { label: m.invite.unsubscribe, url: i.unsubscribeUrl },
  };
  return finish(doc, i.brand, fmt(m.invite.subject, { sender: cleanHeaderText(sender, 50) }));
}

// ------------------------------------------------------------------ týždenné zhrnutie

export interface WeeklyMailInput {
  locale: Locale;
  brand: MailBrand;
  summary: WeeklySummary;
  /** true = minulý týždeň bez aktivity, ale klient bol nedávno aktívny → jemné povzbudenie */
  nudge: boolean;
  /** krstné meno klienta alebo prázdne */
  firstName: string;
  appUrl: string;
  unsubscribeUrl: string;
}

export function weeklyStats(summary: WeeklySummary, locale: Locale): MailStat[] {
  const m = MESSAGES[locale].mail.weekly;
  const nf = new Intl.NumberFormat(intlLocale(locale));
  const rings = Object.fromEntries(summary.rings.map((r) => [r.id, r]));
  const vol = summary.volume;
  const earned = summary.badgeIds.length + summary.challengeNames.length;
  const stats: MailStat[] = [{ value: `${summary.workouts.done}/${summary.workouts.target}`, label: m.workouts }];
  if (rings.food) stats.push({ value: `${rings.food.value}/${rings.food.goal}`, label: m.foodDays });
  if (rings.protein) stats.push({ value: `${rings.protein.value}/${rings.protein.goal}`, label: m.proteinDays });
  stats.push({ value: String(summary.prs.count), label: m.prs });
  if (earned > 0) stats.push({ value: String(earned), label: m.badges });
  if (vol.thisKg > 0) {
    stats.push({
      value: `${nf.format(vol.thisKg)} kg`,
      label: vol.trend === "up" && vol.deltaPct != null ? `${m.volume}, ${fmt(m.volumeUp, { pct: vol.deltaPct })}` : m.volume,
    });
  }
  if (summary.streakWeeks >= 2) stats.push({ value: String(summary.streakWeeks), label: m.streak });
  return stats;
}

export function renderWeeklyMail(i: WeeklyMailInput): RenderedMail {
  const m = MESSAGES[i.locale].mail.weekly;
  const fmtDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString(intlLocale(i.locale), { day: "numeric", month: "numeric", timeZone: "UTC" });
  const range = fmt(m.range, { from: fmtDate(i.summary.weekStart), to: fmtDate(i.summary.weekEnd) });
  const greeting = i.firstName ? fmt(m.greeting, { name: i.firstName }) : m.greetingNoName;
  const brandName = i.brand.name;

  const doc: MailDoc = {
    lang: i.locale,
    preheader: m.preheader,
    heading: i.nudge ? m.subjectNudge : m.heading,
    greeting,
    paragraphs: [],
    cta: { label: m.cta, url: i.appUrl },
    afterCta: [m.unsubscribeProfile],
    reasons: [fmt(m.reason, { brand: brandName })],
    unsubscribe: { label: m.unsubscribe, url: i.unsubscribeUrl },
  };

  if (i.nudge) {
    doc.paragraphs = [m.nudgeIntro, m.nudgeText];
  } else {
    doc.paragraphs = [`${range}`, i.summary.workouts.met ? m.goalMet : fmt(m.goalProgress, { done: i.summary.workouts.done, target: i.summary.workouts.target })];
    doc.stats = weeklyStats(i.summary, i.locale);
    const top = i.summary.prs.top;
    if (top.length > 0) {
      const list = top.map((p) => `${cleanLine(p.exerciseName)} ${p.weightKg} kg${p.reps ? ` × ${p.reps}` : ""}`).join(", ");
      doc.paragraphs.push(fmt(m.topPrs, { list }));
    }
  }
  return finish(doc, i.brand, i.nudge ? m.subjectNudge : fmt(m.subject, { range }));
}

// ------------------------------------------------------------------ nový záujemca (e-mail trénerovi)

export interface LeadMailInput {
  locale: Locale;
  /** meno trénera (oslovenie) */
  trainerName: string;
  /** polia formulára záujemcu — už zvalidované a očistené (lib/publicPage/leads.ts) */
  lead: { name: string; email: string; phone: string | null; goal: string; experience: string; availability: string; message: string };
  /** odkaz do sekcie Záujemcovia v dashboarde */
  link: string;
}

/** E-mail trénerovi o novom záujemcovi. Vždy v štýle FitPilot (notifikácia pre trénera, nie pre klienta). */
export function renderLeadMail(i: LeadMailInput, siteUrl: string): RenderedMail {
  const m = MESSAGES[i.locale].mail;
  const l = m.lead;
  const brand = defaultMailBrand(siteUrl);
  const goalLabel = (l.goals as Record<string, string>)[i.lead.goal] ?? i.lead.goal;
  const expLabel = (l.experiences as Record<string, string>)[i.lead.experience] ?? i.lead.experience;
  const lines = [fmt(l.email, { value: i.lead.email }), fmt(l.goal, { value: goalLabel }), fmt(l.experience, { value: expLabel })];
  if (i.lead.phone) lines.splice(1, 0, fmt(l.phone, { value: i.lead.phone }));
  if (i.lead.availability) lines.push(fmt(l.availability, { value: i.lead.availability }));
  const doc: MailDoc = {
    lang: i.locale,
    preheader: l.preheader,
    heading: l.heading,
    greeting: fmt(l.greeting, { name: cleanLine(i.trainerName) || brand.name }),
    paragraphs: [fmt(l.intro, { lead: i.lead.name }), lines.join("\n")],
    quote: i.lead.message ? i.lead.message : undefined,
    cta: { label: l.cta, url: i.link },
    afterCta: [l.hint],
    reasons: [l.reason],
  };
  return finish(doc, brand, fmt(l.subject, { name: cleanHeaderText(i.lead.name, 60) }));
}
