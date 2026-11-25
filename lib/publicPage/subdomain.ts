// FitPilot — subdomény verejných stránok trénerov (<handle>.myfitpilot.sk). Čistý modul bez I/O, bezpečný pre edge
// (middleware.ts) aj klienta; testy: e2e/trainer-subdomain.spec.ts.
// Funkcia sa zapína premennou TRAINER_SUBDOMAIN_BASE (napr. „myfitpilot.sk“); bez nej sa nič nemení.
// V `next dev` je predvolená základňa „localhost“ (test na fitsmajom.localhost:3000).

import { isHandleShape, isReservedHandle } from "./handle";

type Env = Record<string, string | undefined>;

/** Základná doména pre subdomény trénerov, alebo null = funkcia vypnutá. */
export function trainerSubdomainBase(env: Env = process.env): string | null {
  const raw = env.TRAINER_SUBDOMAIN_BASE?.trim().toLowerCase().replace(/^\.+|\.+$/g, "");
  if (raw && /^[a-z0-9.-]+$/.test(raw) && !raw.includes("..")) return raw;
  return env.NODE_ENV === "development" ? "localhost" : null;
}

export type TrainerHost =
  | { kind: "other" } // cudzí host (hlavná doména, preview nasadenia…) — middleware sa nedotkne
  | { kind: "www" } // www.<base>
  | { kind: "trainer"; handle: string }
  | { kind: "invalid" }; // neplatný tvar, rezervované slovo alebo viacúrovňová subdoména

/** Z hlavičky Host (s portom alebo bez) odvodí, o aký host ide. */
export function parseTrainerHost(hostHeader: string | null | undefined, base: string | null): TrainerHost {
  if (!base || !hostHeader) return { kind: "other" };
  const host = hostHeader.trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
  const suffix = `.${base}`;
  if (!host.endsWith(suffix)) return { kind: "other" };
  const label = host.slice(0, -suffix.length);
  if (label === "www") return { kind: "www" };
  if (!label || label.includes(".")) return { kind: "invalid" };
  if (!isHandleShape(label) || isReservedHandle(label)) return { kind: "invalid" };
  return { kind: "trainer", handle: label };
}

/** Handle trénera z hostu, alebo null (www, rezervované, neplatné, cudzí host, funkcia vypnutá). */
export function trainerHandleFromHost(hostHeader: string | null | undefined, base: string | null): string | null {
  const r = parseTrainerHost(hostHeader, base);
  return r.kind === "trainer" ? r.handle : null;
}

/**
 * Verejná adresa stránky trénera. Zapnuté: https://<handle>.<base>/ (v dev http://<handle>.localhost:3000/),
 * vypnuté: <site>/t/<handle>. `site` = kanonický host webu (siteUrl()).
 */
export function buildTrainerPublicUrl(handle: string, base: string | null, site: string): string {
  if (!base) return `${site.replace(/\/+$/, "")}/t/${handle}`;
  if (base === "localhost") return `http://${handle}.localhost:3000/`;
  return `https://${handle}.${base}/`;
}
