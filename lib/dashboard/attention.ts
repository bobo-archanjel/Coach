// FitPilot — jednotné centrum upozornení pre trénera (zvonček, feature/funkcionalita).
// Zámerne bez importu Supabase/servera: typy + čistý builder položiek, aby ho vedela
// použiť klientská komponenta aj unit test (e2e/attention.spec.ts). Dáta zbiera
// server action app/dashboard/attention/actions.ts z EXISTUJÚCICH zdrojov pravdy
// (lateStatus.ts, healthDigest.ts, počet neprečítaných správ) — zvonček nemá vlastnú
// definíciu "meškania" ani digestu, len ich zloží do jedného zoznamu.
//
// Zámerne bez "zatvárania" upozornení (rozhodnuté): zvonček je index AKTUÁLNEHO
// stavu — položka zmizne, keď sa problém vyrieši (klient odcvičí, správy sa
// prečítajú), nie keď ju tréner odklikne.

import { BUCKET_LABEL, type HealthBucket } from "./healthDigest";

export interface AttentionLateClient {
  id: string;
  name: string;
  days: number;
}

export interface AttentionData {
  /** neprečítané správy od klientov */
  unread: number;
  /** meškajúci klienti (aktívni, ≥ LATE_THRESHOLD_DAYS bez tréningu), najdlhšie meškajúci prvý */
  late: AttentionLateClient[];
  /** týždenné zhoršenie portfolio-health (najväčšia skupina), null = nič / ešte málo snapshotov */
  digest: { from: HealthBucket; to: HealthBucket; count: number } | null;
}

export interface AttentionLink {
  label: string;
  meta: string;
  href: string;
}

export interface AttentionItem {
  id: "messages" | "late" | "digest";
  tone: "alert" | "watch";
  title: string;
  href: string;
  /** podpoložky (napr. konkrétni meškajúci klienti), max MAX_LINKS */
  links: AttentionLink[];
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
    });
  }

  if (data.late.length > 0) {
    const n = data.late.length;
    const shown = data.late.slice(0, MAX_LINKS);
    const links: AttentionLink[] = shown.map((c) => ({
      label: c.name,
      meta: `${c.days} ${plural(c.days, "deň", "dni", "dní")} bez tréningu`,
      href: `/dashboard/klienti/${c.id}`,
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
    });
  }

  if (data.digest) {
    const { from, to, count } = data.digest;
    items.push({
      id: "digest",
      tone: "watch",
      title: `${count} ${plural(count, "klient klesol", "klienti klesli", "klientov kleslo")} zo „${BUCKET_LABEL[from]}“ do „${BUCKET_LABEL[to]}“ tento týždeň`,
      href: "/dashboard/analytika",
      links: [],
    });
  }

  return items;
}
