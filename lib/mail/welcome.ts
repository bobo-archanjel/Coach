// FitPilot — uvítacia správa trénera (chat pri spárovaní klienta). Čistý modul bez I/O
// (testy: e2e/mail.spec.ts). Zrkadlí SQL send_trainer_welcome() z migrácie 0082: nahradenie
// {meno} krstným menom klienta a úprava textu, keď meno chýba.

import { charLength, cleanMultiline } from "@/lib/branding/validation";

export const WELCOME_MESSAGE_MAX = 1000;
export const WELCOME_PLACEHOLDER = "{meno}";

export type WelcomeValidation = { ok: true; value: string } | { ok: false; code: "welcomeMessageTooLong" };

/** Očistí a overí text uvítacej správy (prázdny text je platný = uvítanie sa neposiela). */
export function validateWelcomeMessage(raw: unknown): WelcomeValidation {
  const value = cleanMultiline(raw);
  if (charLength(value) > WELCOME_MESSAGE_MAX) return { ok: false, code: "welcomeMessageTooLong" };
  return { ok: true, value };
}

/** Krstné meno z celého mena (prvé slovo). */
export function firstNameOf(fullName: string | null | undefined): string {
  return (fullName ?? "").trim().split(/\s+/)[0] ?? "";
}

/**
 * Výsledný text správy pre klienta. Bez mena sa {meno} vynechá a pred interpunkciou
 * ostane len jedna medzera („Ahoj {meno}!“ → „Ahoj!“) — rovnako ako v SQL.
 */
export function renderWelcomeMessage(body: string, clientFullName: string | null | undefined): string {
  const first = firstNameOf(clientFullName);
  let text = body.split(WELCOME_PLACEHOLDER).join(first);
  if (first === "") {
    text = text.replace(/\s+([,.!?;:])/g, "$1").replace(/[ \t]{2,}/g, " ");
  }
  return text.trim();
}
