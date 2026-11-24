// FitPilot — podpísané tokeny odhlásenia z e-mailov (HMAC-SHA256). Čistý modul bez I/O
// (testy: e2e/mail.spec.ts). Token = base64url(JSON payload) + "." + base64url(HMAC).
// Nesie len to, čo treba (druh, klient alebo hash adresy, jazyk, expirácia) — žiadne osobné údaje
// v čitateľnej podobe okrem identifikátora klienta, ktorý je sám o sebe neuhádnuteľný UUID.

import { createHmac, timingSafeEqual } from "crypto";

export type UnsubKind = "weekly" | "invite";

export interface UnsubPayload {
  /** druh odhlásenia */
  k: UnsubKind;
  /** weekly: UUID klienta; invite: hash adresy */
  s: string;
  /** jazyk stránky odhlásenia */
  l: "sk" | "cs";
  /** expirácia (sekundy od epochy) */
  e: number;
}

/** Odkazy v starších e-mailoch musia fungovať dlho — platnosť 400 dní. */
export const UNSUB_TOKEN_TTL_SECONDS = 400 * 24 * 3600;

/** UUID klienta alebo hex hash adresy. */
const SUBJECT_RE = /^[A-Za-z0-9-]{8,128}$/;

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

function mac(secret: string, body: string): Buffer {
  return createHmac("sha256", `unsub-v1:${secret}`).update(body).digest();
}

export function signUnsubToken(payload: Omit<UnsubPayload, "e">, secret: string, nowMs: number = Date.now(), ttlSeconds: number = UNSUB_TOKEN_TTL_SECONDS): string {
  const full: UnsubPayload = { ...payload, e: Math.floor(nowMs / 1000) + ttlSeconds };
  const body = b64url(Buffer.from(JSON.stringify(full), "utf8"));
  return `${body}.${b64url(mac(secret, body))}`;
}

export type UnsubVerify = { ok: true; payload: UnsubPayload } | { ok: false; reason: "malformed" | "bad_signature" | "expired" };

export function verifyUnsubToken(token: unknown, secret: string, nowMs: number = Date.now()): UnsubVerify {
  if (typeof token !== "string" || token.length > 600) return { ok: false, reason: "malformed" };
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, reason: "malformed" };
  const [body, sig] = parts;
  if (!/^[A-Za-z0-9_-]+$/.test(body) || !/^[A-Za-z0-9_-]+$/.test(sig)) return { ok: false, reason: "malformed" };

  const expected = mac(secret, body);
  const given = Buffer.from(sig, "base64url");
  // konštantný čas; rôzna dĺžka = zlý podpis
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, reason: "bad_signature" };

  let payload: UnsubPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as UnsubPayload;
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (
    !payload ||
    (payload.k !== "weekly" && payload.k !== "invite") ||
    typeof payload.s !== "string" ||
    !SUBJECT_RE.test(payload.s) ||
    (payload.l !== "sk" && payload.l !== "cs") ||
    typeof payload.e !== "number"
  ) {
    return { ok: false, reason: "malformed" };
  }
  if (payload.e * 1000 < nowMs) return { ok: false, reason: "expired" };
  return { ok: true, payload };
}
