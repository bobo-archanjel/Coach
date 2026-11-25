import type { User } from "@supabase/supabase-js";

/** Po koľkých dňoch sa neoverený účet maže (cron /api/cron/unconfirmed-purge). */
export const UNCONFIRMED_RETENTION_DAYS = 7;

const isEmpty = (v: unknown) => v === null || v === undefined || v === "";

/**
 * Je účet neoverená registrácia, ktorú treba zmazať? Konzervatívne — pri akejkoľvek pochybnosti
 * (chýbajúce/neplatné pole) false, lebo chybné zmazanie je nevratné.
 * Čistá funkcia (bez DB), aby sa dala testovať.
 */
export function isPurgeableUnconfirmedUser(user: User, now: Date, days = UNCONFIRMED_RETENTION_DAYS): boolean {
  if (!user || typeof user !== "object") return false;
  // Čokoľvek, čo dokazuje, že účet niekto reálne používa / bol pozvaný, ho chráni.
  if (!isEmpty(user.email_confirmed_at) || !isEmpty(user.confirmed_at) || !isEmpty(user.phone_confirmed_at)) return false;
  if (!isEmpty(user.invited_at) || !isEmpty(user.last_sign_in_at)) return false;
  if (user.is_anonymous) return false;

  // OAuth (Google…) účty nemažeme nikdy; chýbajúce identities = len e-mailová registrácia.
  const identities = user.identities;
  if (identities !== undefined && identities !== null) {
    if (!Array.isArray(identities)) return false;
    if (identities.some((i) => i?.provider !== "email")) return false;
  }

  const created = Date.parse(String(user.created_at ?? ""));
  const nowMs = now.getTime();
  if (!Number.isFinite(created) || !Number.isFinite(nowMs)) return false;
  return nowMs - created > days * 86_400_000;
}
