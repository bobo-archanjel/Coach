// FitPilot — limity odosielania e-mailov. Čisté rozhodnutie (testy: e2e/mail.spec.ts).
// Zrkadlí SQL reserve_mail_send() z migrácie 0082 — pri zmene pravidiel upraviť OBE miesta.
// Autoritatívne je SQL (atómové pod advisory lockom); toto slúži na zobrazenie zostatku
// v Nastaveniach a ako špecifikácia v testoch.

export const INVITE_LIMITS = {
  /** max. pozvánok na trénera za posledných 60 minút */
  perHour: 20,
  /** max. pozvánok na trénera za posledných 24 hodín */
  perDay: 50,
  /** tá istá adresa od toho istého trénera najviac raz za toľko hodín */
  recipientCooldownHours: 24,
  /** strop všetkých pozvánok všetkých trénerov za 24 h (poistka proti farme účtov) */
  globalPerDay: 500,
} as const;

export type InviteLimits = typeof INVITE_LIMITS;

export interface InviteCounts {
  /** odoslané tým trénerom za poslednú hodinu */
  hour: number;
  /** odoslané tým trénerom za 24 h */
  day: number;
  /** už tejto adrese tým trénerom v cooldown okne */
  recipientInWindow: number;
  /** všetky pozvánky všetkých trénerov za 24 h */
  global: number;
}

export type InviteDecision = "ok" | "recipient_cooldown" | "hour_limit" | "day_limit" | "global_limit";

/** Poradie kontrol je rovnaké ako v SQL: príjemca → hodina → deň → globálny strop. */
export function decideInviteSend(counts: InviteCounts, limits: InviteLimits = INVITE_LIMITS): InviteDecision {
  if (counts.recipientInWindow > 0) return "recipient_cooldown";
  if (counts.hour >= limits.perHour) return "hour_limit";
  if (counts.day >= limits.perDay) return "day_limit";
  if (counts.global >= limits.globalPerDay) return "global_limit";
  return "ok";
}

/** Zostávajúci počet pozvánok trénera teraz (užší z hodinového a denného limitu, nie menej než 0). */
export function remainingInvites(counts: Pick<InviteCounts, "hour" | "day">, limits: InviteLimits = INVITE_LIMITS): { hour: number; day: number; now: number } {
  const hour = Math.max(0, limits.perHour - counts.hour);
  const day = Math.max(0, limits.perDay - counts.day);
  return { hour, day, now: Math.min(hour, day) };
}
