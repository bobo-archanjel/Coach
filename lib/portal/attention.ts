// FitPilot — zvonček upozornení pre KLIENTA (feature/AIupgrade). Doteraz mal
// túto funkciu len tréner (lib/dashboard/attention.ts, 0035) — klient mal len
// bodku na tabe Chat. Rovnaký princíp: žiadny vlastný výpočet "čo je nové", len
// zloženie z existujúcich zdrojov pravdy (neprečítané správy, zverejnené plány/
// jedálničky, blížiace sa termíny). Zámerne bez importu Supabase/servera — čisté
// funkcie, dáta zbiera lib/portal/attentionData.ts.
//
// Skrývanie (migrácia 0056, client_notification_dismissals) — kľúč nesie
// IDENTITU situácie, takže skrytie nikdy nezatieni novú situáciu:
//  - nový tréningový plán: `plan:<planId>`,
//  - nový jedálniček: `meal:<planId>`,
//  - blížiaci sa termín: `appt:<appointmentId>`.
// Neprečítané správy sa neskrývajú — "prečítať" znamená skutočné read_at
// (mark_messages_read), rovnako ako na strane trénera.

import { bellTranslator, formatApptWhen } from "@/lib/i18n/bell";
import type { Locale } from "@/lib/i18n/locales";

export const planDismissKey = (planId: string) => `plan:${planId}`;
export const mealDismissKey = (planId: string) => `meal:${planId}`;
export const apptDismissKey = (appointmentId: string) => `appt:${appointmentId}`;

const KEY_PATTERN = /^(plan|meal|appt):[\w-]{1,80}$/;
/** Server action neprijme ľubovoľný reťazec — len kľúče v tvare, ktorý vyrábajú funkcie vyššie. */
export function isValidClientDismissKey(key: unknown): key is string {
  return typeof key === "string" && key.length <= 120 && KEY_PATTERN.test(key);
}

/** Termín sa stáva "upozornením" (nie len pasívnou kartou na Dnes) od tohto počtu hodín vopred. */
export const APPOINTMENT_REMINDER_HOURS = 24; // deň vopred (rovnako ako u trénera)
/**
 * Plán/jedálniček sa počíta ako "nový" len do tohto počtu dní od vytvorenia —
 * BEZ tohto okna by pri prvom nasadení tejto featury vyskočili ako "nové"
 * VŠETKY historické plány klienta naraz (nájdené pri reálnom teste, zvonček
 * ukázal "9+" a desiatky položiek). `created_at` je najlepšia dostupná aproximácia
 * — `workout_plans`/`meal_plans` nemajú samostatný `published_at` stĺpec.
 */
export const NEW_PLAN_WINDOW_DAYS = 14;
/** Na koľko dní sa skryje pripomienka termínu, kým sa nevráti (termín medzitým neprejde). */
export const DISMISS_APPOINTMENT_DAYS = 2;

export interface AttentionNewPlan {
  id: string;
  name: string;
  key: string;
}

export interface AttentionAppointment {
  id: string;
  title: string;
  startsAt: string;
  key: string;
}

export interface PortalAttentionData {
  /** neprečítané správy od trénera ALEBO systémové (AI proaktívny check-in, GDPR notice...) */
  unread: number;
  newPlans: AttentionNewPlan[];
  newMealPlans: AttentionNewPlan[];
  /** termín(y) do APPOINTMENT_REMINDER_HOURS hodín, najbližší prvý */
  appointments: AttentionAppointment[];
}

/** Odstráni skryté upozornenia — vstup pre odznak aj zoznam zvončeka. */
export function applyPortalDismissals(
  data: PortalAttentionData,
  dismissed: ReadonlySet<string>,
): PortalAttentionData {
  return {
    unread: data.unread,
    newPlans: data.newPlans.filter((p) => !dismissed.has(p.key)),
    newMealPlans: data.newMealPlans.filter((p) => !dismissed.has(p.key)),
    appointments: data.appointments.filter((a) => !dismissed.has(a.key)),
  };
}

export interface PortalAttentionLink {
  label: string;
  meta: string;
  href: string;
  dismissKey?: string;
}

export interface PortalAttentionItem {
  id: "messages" | "plans" | "meals" | "appointments";
  tone: "alert" | "watch";
  title: string;
  /** null = nadpis nie je odkaz (klikateľné sú len podpoložky) */
  href: string | null;
  links: PortalAttentionLink[];
  /** "Označiť ako prečítané" (len správy) — nastaví skutočné read_at */
  markRead: boolean;
  dismiss: { keys: string[]; days: number | null } | null;
  /** klik na nadpis (odkaz) upozornenie zároveň skryje — nový plán/jedálniček je „videný“ */
  dismissOnOpen?: boolean;
}

/** Odkaz na konkrétny plán v sekcii Tréning — rozbalí ho a posunie sa naň (TrainingSection). */
export const portalPlanHref = (planId: string) => `/portal/trening?plan=${encodeURIComponent(planId)}`;

/** Počet na odznaku zvončeka: neprečítané správy + nové plány/jedálničky + blížiace sa termíny. */
export function portalAttentionTotal(data: PortalAttentionData): number {
  return data.unread + data.newPlans.length + data.newMealPlans.length + data.appointments.length;
}

/**
 * Položky zvončeka v poradí naliehavosti: čakajúce správy, blížiace sa termíny
 * (časovo najkritickejšie), nové plány, nové jedálničky. Očakáva už odfiltrované
 * skryté upozornenia (applyPortalDismissals).
 */
export function buildPortalAttentionItems(data: PortalAttentionData, locale: Locale = "sk"): PortalAttentionItem[] {
  const items: PortalAttentionItem[] = [];
  const t = bellTranslator(locale);

  if (data.unread > 0) {
    items.push({
      id: "messages",
      tone: "alert",
      title: t("client.unreadFromTrainer", { count: data.unread }),
      href: "/portal/chat",
      links: [],
      markRead: true,
      dismiss: null,
    });
  }

  if (data.appointments.length > 0) {
    items.push({
      id: "appointments",
      tone: "alert",
      title: t("upcoming", { count: data.appointments.length }),
      href: null,
      links: data.appointments.map((a) => ({
        label: a.title,
        meta: formatApptWhen(a.startsAt, locale),
        href: "/portal",
        dismissKey: a.key,
      })),
      markRead: false,
      dismiss: { keys: data.appointments.map((a) => a.key), days: DISMISS_APPOINTMENT_DAYS },
    });
  }

  if (data.newPlans.length > 0) {
    items.push({
      id: "plans",
      tone: "watch",
      title:
        data.newPlans.length === 1
          ? t("client.newPlan", { name: data.newPlans[0].name })
          : t("client.newPlans", { count: data.newPlans.length }),
      href: data.newPlans.length === 1 ? portalPlanHref(data.newPlans[0].id) : null,
      links:
        data.newPlans.length === 1
          ? []
          : data.newPlans.map((p) => ({ label: p.name, meta: "", href: portalPlanHref(p.id), dismissKey: p.key })),
      markRead: false,
      dismiss: { keys: data.newPlans.map((p) => p.key), days: null },
      dismissOnOpen: true,
    });
  }

  if (data.newMealPlans.length > 0) {
    items.push({
      id: "meals",
      tone: "watch",
      title:
        data.newMealPlans.length === 1
          ? t("client.newMealPlan", { name: data.newMealPlans[0].name })
          : t("client.newMealPlans", { count: data.newMealPlans.length }),
      href: data.newMealPlans.length === 1 ? "/portal/strava" : null,
      links:
        data.newMealPlans.length === 1
          ? []
          : data.newMealPlans.map((p) => ({ label: p.name, meta: "", href: "/portal/strava", dismissKey: p.key })),
      markRead: false,
      dismiss: { keys: data.newMealPlans.map((p) => p.key), days: null },
      dismissOnOpen: true,
    });
  }

  return items;
}
