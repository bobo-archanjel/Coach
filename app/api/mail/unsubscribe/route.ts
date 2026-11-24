// FitPilot — odhlásenie z e-mailov podpísaným odkazom (bez prihlásenia).
//  - GET  zobrazí potvrdenie (nič sa nemení — skenery odkazov v e-mailoch GET často otvárajú),
//  - POST vykoná odhlásenie: formulár z potvrdzovacej stránky aj „One-Click“ z List-Unsubscribe-Post
//    (RFC 8058: poštový klient POSTne na adresu z hlavičky, token je v query `t`).
// Token je HMAC-podpísaný (lib/mail/token.ts) a expiruje. Zápis ide cez service role a robí len
// jednu vec: weekly → client_email_prefs.weekly_summary = false pre klienta z tokenu;
// invite → mail_suppressions (hash adresy). Odpovede sú generické (nič sa nedá enumerovať).

import { NextResponse } from "next/server";
import { MESSAGES } from "@/messages";
import { allowWithinWindow } from "@/lib/rateLimitMemory";
import { tryCreateAdminClient } from "@/lib/supabase/admin";
import { getMailSecret } from "@/lib/mail/config";
import { escapeHtml } from "@/lib/mail/sanitize";
import { verifyUnsubToken, type UnsubPayload } from "@/lib/mail/token";
import type { Locale } from "@/lib/i18n/locales";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
};

function ip(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip")?.trim() || "unknown";
}

function page(locale: Locale, message: string, form?: { token: string; button: string }, status = 200): Response {
  const m = MESSAGES[locale].mail.unsubscribe;
  const body = `<!doctype html>
<html lang="${locale}"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" /><title>${escapeHtml(m.title)}</title></head>
<body style="margin:0; background:#f2ece6; font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; color:#1f1a17;">
<main style="max-width:480px; margin:48px auto; padding:32px; background:#fbf6f1; border:1px solid #efe6dd; border-radius:28px;">
<h1 style="margin:0 0 12px; font-size:22px; font-weight:800; letter-spacing:-0.02em;">${escapeHtml(m.title)}</h1>
<p style="margin:0 0 20px; font-size:15px; line-height:1.55; color:#574d47;">${escapeHtml(message)}</p>
${
  form
    ? `<form method="post" action="/api/mail/unsubscribe"><input type="hidden" name="t" value="${escapeHtml(form.token)}" /><button type="submit" style="padding:12px 24px; border:0; border-radius:14px; background:#b4492d; color:#fff; font-size:15px; font-weight:700; cursor:pointer;">${escapeHtml(form.button)}</button></form>`
    : ""
}
</main></body></html>`;
  return new Response(body, { status, headers: HEADERS });
}

function tokenFrom(req: Request, form: FormData | null): string | null {
  const q = new URL(req.url).searchParams.get("t");
  if (q) return q;
  const f = form?.get("t");
  return typeof f === "string" ? f : null;
}

export async function GET(req: Request) {
  const secret = getMailSecret();
  const token = tokenFrom(req, null);
  const verified = secret && token ? verifyUnsubToken(token, secret) : null;
  if (!allowWithinWindow(`unsub-get:${ip(req)}`, 30, 10 * 60_000)) return page("sk", MESSAGES.sk.mail.unsubscribe.tooMany, undefined, 429);
  if (!verified || !verified.ok) return page("sk", MESSAGES.sk.mail.unsubscribe.invalid, undefined, 400);
  const { l, k } = verified.payload;
  const m = MESSAGES[l].mail.unsubscribe;
  return page(l, k === "weekly" ? m.confirmWeekly : m.confirmInvite, { token: token!, button: m.button });
}

async function apply(payload: UnsubPayload): Promise<boolean> {
  const admin = tryCreateAdminClient();
  if (!admin) return false;
  if (payload.k === "weekly") {
    const { error } = await admin
      .from("client_email_prefs")
      .upsert({ client_id: payload.s, weekly_summary: false, updated_at: new Date().toISOString() }, { onConflict: "client_id" });
    return !error;
  }
  const { error } = await admin.from("mail_suppressions").upsert({ recipient_hash: payload.s }, { onConflict: "recipient_hash" });
  return !error;
}

export async function POST(req: Request) {
  const secret = getMailSecret();
  let form: FormData | null = null;
  try {
    // One-Click: telo `List-Unsubscribe=One-Click` (x-www-form-urlencoded); token je v query
    form = await req.formData();
  } catch {
    form = null;
  }
  if (!allowWithinWindow(`unsub-post:${ip(req)}`, 20, 10 * 60_000)) return page("sk", MESSAGES.sk.mail.unsubscribe.tooMany, undefined, 429);
  const token = tokenFrom(req, form);
  const verified = secret && token ? verifyUnsubToken(token, secret) : null;
  if (!verified || !verified.ok) return page("sk", MESSAGES.sk.mail.unsubscribe.invalid, undefined, 400);
  const { l, k } = verified.payload;
  const m = MESSAGES[l].mail.unsubscribe;
  if (!(await apply(verified.payload))) return page(l, m.failed, undefined, 500);
  return page(l, k === "weekly" ? m.doneWeekly : m.doneInvite);
}
