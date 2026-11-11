// FitPilot — jednotné centrum upozornení pre trénera (zvonček, feature/funkcionalita).
// Zámerne bez importu Supabase/servera: typy + čisté funkcie, aby ich vedela
// použiť klientská komponenta aj unit test (e2e/attention.spec.ts). Dáta zbiera
// server action app/dashboard/attention/actions.ts z EXISTUJÚCICH zdrojov pravdy
// (lateStatus.ts, healthDigest.ts, počet neprečítaných správ) — zvonček nemá vlastnú
// definíciu "meškania" ani digestu, len ich zloží do jedného zoznamu.
//
// Skrývanie upozornení (migrácia 0035, tabuľka notification_dismissals) — nech
// upozornenie "nesvieti" donekonečna. Kľúč skrytia nesie IDENTITU situácie, takže
// skrytie nikdy nezaťaží novú situáciu:
//  - meškajúci klient: `late:<clientId>:<since>` na 7 dní (potom sa vráti, ak stále
//    mešká; po novom tréningu sa `since` zmení = nové meškanie svieti znova),
//  - týždenný digest: `digest:<weekStart>` (budúci týždeň príde nový),
//  - checklist prvých krokov: `onboarding`.
// Neprečítané správy sa neskrývajú — "prečítať" znamená skutočné read_at
// (mark_messages_read), inak by sa odznaky rozišli s realitou.

import { BUCKET_LABEL, type HealthBucket } from "./healthDigest";

/** Na koľko dní sa skryje meškajúci klient, kým sa upozornenie nevráti. */
export const DISMISS_LATE_DAYS = 7;
export const ONBOARDING_DISMISS_KEY = "onboarding";

export const lateDismissKey = (clientId: string, since: string) => `late:${clientId}:${since}`;
export const digestDismissKey = (weekStart: string) => `digest:${weekStart}`;
export const apptDismissKey = (appointmentId: string) => `appt:${appointmentId}`;

/** Termín sa ukáže vo zvončeku trénera (aj klienta) deň vopred — od tohto počtu hodín pred začiatkom. */
export const APPOINTMENT_REMINDER_HOURS = 24;

const KEY_PATTERN = /^(late:[\w-]{1,64}:\d{4}-\d{2}-\d{2}|digest:\d{4}-\d{2}-\d{2}|appt:[\w-]{1,64}|onboarding)$/;
/** Server action neprijme ľubovoľný reťazec — len kľúče v tvare, ktorý vyrábajú funkcie vyššie. */
export function isValidDismissKey(key: unknown): key is string {
  return typeof key === "string" && key.length <= 120 && KEY_PATTERN.test(key);
}

export interface AttentionLateClient {
  id: string;
  name: string;
  days: number;
  /** kľúč skrytia (lateDismissKey) */
  key: string;
}

/** Klient s neprečítanými správami (meno namiesto „od klientov“ vo zvončeku). */
export interface AttentionUnreadClient {
  id: string;
  name: string;
  count: number;
}

/** Termín trénera do APPOINTMENT_REMINDER_HOURS hodín. */
export interface AttentionAppointment {
  id: string;
  clientName: string;
  title: string;
  startsAt: string;
  /** kľúč skrytia (apptDismissKey) */
  key: string;
}

export interface AttentionData {
  /** neprečítané správy od klientov */
  unread: number;
  /** rozpis neprečítaných správ po klientoch (najviac správ prvý); bez neho všeobecný text */
  unreadByClient?: AttentionUnreadClient[];
  /** blížiace sa termíny (do APPOINTMENT_REMINDER_HOURS hodín), najbližší prvý */
  appointments?: AttentionAppointment[];
  /** meškajúci klienti (aktívni, ≥ LATE_THRESHOLD_DAYS bez tréningu), najdlhšie meškajúci prvý */
  late: AttentionLateClient[];
  /** týždenné zhoršenie portfolio-health (najväčšia skupina), null = nič / ešte málo snapshotov */
  digest: { from: HealthBucket; to: HealthBucket; count: number; key: string } | null;
}

/** Odstráni skryté upozornenia — vstup pre odznak aj zoznam zvončeka. */
export function applyDismissals(data: AttentionData, dismissed: ReadonlySet<string>): AttentionData {
  return {
    unread: data.unread,
    unreadByClient: data.unreadByClient,
    appointments: data.appointments?.filter((a) => !dismissed.has(a.key)),
    late: data.late.filter((c) => !dismissed.has(c.key)),
    digest: data.digest && !dismissed.has(data.digest.key) ? data.digest : null,
  };
}

export interface AttentionLink {
  label: string;
  meta: string;
  href: string;
  /** kľúč skrytia tejto konkrétnej podpoložky (skryť jedného klienta) */
  dismissKey?: string;
}

export interface AttentionItem {
  id: "messages" | "appointments" | "late" | "digest";
  tone: "alert" | "watch";
  title: string;
  /** null = nadpis nie je odkaz (klikateľné sú len podpoložky, napr. konkrétni meškajúci klienti) */
  href: string | null;
  /** podpoložky (napr. konkrétni meškajúci klienti), max MAX_LINKS */
  links: AttentionLink[];
  /** "Označiť ako prečítané" (len správy) — nastaví skutočné read_at */
  markRead: boolean;
  /** skrytie celej položky; `days` null = kým sa nezmení situácia (kľúč to rieši sám) */
  dismiss: { keys: string[]; days: number | null } | null;
}

/** Koľko konkrétnych klientov sa vypíše pod položkou "meškajú"; zvyšok je "a ďalší N". */
const MAX_LINKS = 4;

/** „št 13. 11. 14:00“ — čas termínu v zóne Europe/Bratislava. */
function formatApptWhen(startsAt: string): string {
  return new Date(startsAt).toLocaleString("sk-SK", {
    weekday: "short",
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Bratislava",
  });
}

function plural(n: number, one: string, few: string, many: string): string {
  if (n === 1) return one;
  if (n >= 2 && n <= 4) return few;
  return many;
}

/** Počet na odznaku zvončeka: neprečítané správy + blížiace sa termíny + meškajúci klienti + klienti so zhoršením. */
export function attentionTotal(data: AttentionData): number {
  return data.unread + (data.appointments?.length ?? 0) + data.late.length + (data.digest?.count ?? 0);
}

/**
 * Položky zvončeka v poradí naliehavosti: čakajúce správy (niekto čaká na
 * odpoveď a vybaví sa to za minútu), meškajúci klienti, týždenný digest.
 * Očakáva už odfiltrované skryté upozornenia (applyDismissals).
 */
export function buildAttentionItems(data: AttentionData): AttentionItem[] {
  const items: AttentionItem[] = [];

  if (data.unread > 0) {
    const msgs = (n: number) => `${n} ${plural(n, "neprečítaná správa", "neprečítané správy", "neprečítaných správ")}`;
    const byClient = data.unreadByClient ?? [];
    const threadHref = (clientId: string) => `/dashboard/spravy?client=${encodeURIComponent(clientId)}`;
    if (byClient.length === 1) {
      // jeden klient → jeho meno v nadpise a odkaz rovno do jeho vlákna
      items.push({
        id: "messages",
        tone: "alert",
        title: `${msgs(data.unread)} od ${byClient[0].name}`,
        href: threadHref(byClient[0].id),
        links: [],
        markRead: true,
        dismiss: null,
      });
    } else if (byClient.length > 1) {
      const shown = byClient.slice(0, MAX_LINKS);
      const links: AttentionLink[] = shown.map((c) => ({
        label: c.name,
        meta: `${c.count} ${plural(c.count, "správa", "správy", "správ")}`,
        href: threadHref(c.id),
      }));
      if (byClient.length > shown.length) {
        links.push({ label: `a ďalší ${byClient.length - shown.length}`, meta: "", href: "/dashboard/spravy" });
      }
      items.push({
        id: "messages",
        tone: "alert",
        title: msgs(data.unread),
        href: "/dashboard/spravy",
        links,
        markRead: true,
        dismiss: null,
      });
    } else {
      items.push({
        id: "messages",
        tone: "alert",
        title: `${msgs(data.unread)} od klientov`,
        href: "/dashboard/spravy",
        links: [],
        markRead: true,
        dismiss: null,
      });
    }
  }

  const appts = data.appointments ?? [];
  if (appts.length > 0) {
    const shown = appts.slice(0, MAX_LINKS);
    const links: AttentionLink[] = shown.map((a) => ({
      label: a.clientName,
      // názov len ak ho tréner zadal (bez neho je v DB predvolený „Termín“)
      meta: a.title && a.title !== "Termín" ? `${formatApptWhen(a.startsAt)} · ${a.title}` : formatApptWhen(a.startsAt),
      href: "/dashboard/kalendar",
      dismissKey: a.key,
    }));
    if (appts.length > shown.length) {
      links.push({ label: `a ďalší ${appts.length - shown.length}`, meta: "", href: "/dashboard/kalendar" });
    }
    items.push({
      id: "appointments",
      tone: "alert",
      // rovnaký text ako vo zvončeku klienta (lib/portal/attention.ts)
      title: `${appts.length} ${plural(appts.length, "blížiaci sa termín", "blížiace sa termíny", "blížiacich sa termínov")}`,
      href: null,
      links,
      markRead: false,
      // termín po čase sám zmizne (prejde), skrytie platí natrvalo
      dismiss: { keys: appts.map((a) => a.key), days: null },
    });
  }

  if (data.late.length > 0) {
    const n = data.late.length;
    const shown = data.late.slice(0, MAX_LINKS);
    const links: AttentionLink[] = shown.map((c) => ({
      label: c.name,
      meta: `${c.days} ${plural(c.days, "deň", "dni", "dní")} bez tréningu`,
      href: `/dashboard/klienti/${c.id}`,
      dismissKey: c.key,
    }));
    if (n > shown.length) {
      links.push({ label: `a ďalší ${n - shown.length}`, meta: "", href: "/dashboard" });
    }
    items.push({
      id: "late",
      tone: "alert",
      // slovenská zhoda: 1 klient mešká / 2–4 klienti meškajú / 5+ klientov mešká
      title: `${n} ${plural(n, "klient mešká", "klienti meškajú", "klientov mešká")} s tréningom`,
      href: null,
      links,
      markRead: false,
      dismiss: { keys: data.late.map((c) => c.key), days: DISMISS_LATE_DAYS },
    });
  }

  if (data.digest) {
    const { from, to, count, key } = data.digest;
    items.push({
      id: "digest",
      tone: "watch",
      title: `${count} ${plural(count, "klient klesol", "klienti klesli", "klientov kleslo")} zo „${BUCKET_LABEL[from]}“ do „${BUCKET_LABEL[to]}“ tento týždeň`,
      href: "/dashboard/analytika",
      links: [],
      markRead: false,
      dismiss: { keys: [key], days: null },
    });
  }

  return items;
}
