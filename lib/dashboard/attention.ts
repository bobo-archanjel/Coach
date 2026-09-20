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

const KEY_PATTERN = /^(late:[\w-]{1,64}:\d{4}-\d{2}-\d{2}|digest:\d{4}-\d{2}-\d{2}|onboarding)$/;
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

export interface AttentionData {
  /** neprečítané správy od klientov */
  unread: number;
  /** meškajúci klienti (aktívni, ≥ LATE_THRESHOLD_DAYS bez tréningu), najdlhšie meškajúci prvý */
  late: AttentionLateClient[];
  /** týždenné zhoršenie portfolio-health (najväčšia skupina), null = nič / ešte málo snapshotov */
  digest: { from: HealthBucket; to: HealthBucket; count: number; key: string } | null;
}

/** Odstráni skryté upozornenia — vstup pre odznak aj zoznam zvončeka. */
export function applyDismissals(data: AttentionData, dismissed: ReadonlySet<string>): AttentionData {
  return {
    unread: data.unread,
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
  id: "messages" | "late" | "digest";
  tone: "alert" | "watch";
  title: string;
  href: string;
  /** podpoložky (napr. konkrétni meškajúci klienti), max MAX_LINKS */
  links: AttentionLink[];
  /** "Označiť ako prečítané" (len správy) — nastaví skutočné read_at */
  markRead: boolean;
  /** skrytie celej položky; `days` null = kým sa nezmení situácia (kľúč to rieši sám) */
  dismiss: { keys: string[]; days: number | null } | null;
}

/** Koľko konkrétnych klientov sa vypíše pod položkou "meškajú"; zvyšok je "a ďalší N". */
const MAX_LINKS = 4;

function plural(n: number, one: string, few: string, many: string): string {
  if (n === 1) return one;
  if (n >= 2 && n <= 4) return few;
  return many;
}

/** Počet na odznaku zvončeka: neprečítané správy + meškajúci klienti + klienti so zhoršením. */
export function attentionTotal(data: AttentionData): number {
  return data.unread + data.late.length + (data.digest?.count ?? 0);
}

/**
 * Položky zvončeka v poradí naliehavosti: čakajúce správy (niekto čaká na
 * odpoveď a vybaví sa to za minútu), meškajúci klienti, týždenný digest.
 * Očakáva už odfiltrované skryté upozornenia (applyDismissals).
 */
export function buildAttentionItems(data: AttentionData): AttentionItem[] {
  const items: AttentionItem[] = [];

  if (data.unread > 0) {
    items.push({
      id: "messages",
      tone: "alert",
      title: `${data.unread} ${plural(data.unread, "neprečítaná správa", "neprečítané správy", "neprečítaných správ")} od klientov`,
      href: "/dashboard/spravy",
      links: [],
      markRead: true,
      dismiss: null,
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
      href: "/dashboard",
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
