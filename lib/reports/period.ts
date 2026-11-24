// FitPilot — Pokročilé reporty: obdobia a dátumy (čisté funkcie, bez DB a bez servera,
// aby ich vedel testovať e2e/reports.spec.ts). Všetky dátumy sú ISO "YYYY-MM-DD" v
// kalendári Europe/Bratislava (rovnaká konvencia ako lib/dashboard/adherence.ts).

const DAY_MS = 86_400_000;
export const REPORT_TZ = "Europe/Bratislava";

/** Obdobie reportu klienta: počet týždňov, alebo celá história. */
export const PERIOD_KEYS = ["4", "12", "26", "all"] as const;
export type PeriodKey = (typeof PERIOD_KEYS)[number];
export const DEFAULT_PERIOD: PeriodKey = "12";
/** „Celá história“ sa pri týždennej adherencii a strave kvôli objemu dát oreže na tento počet týždňov. */
export const MAX_ALL_WEEKS = 52;

export function parsePeriod(value: unknown): PeriodKey {
  return typeof value === "string" && (PERIOD_KEYS as readonly string[]).includes(value) ? (value as PeriodKey) : DEFAULT_PERIOD;
}

export function parseIso(isoDate: string): Date {
  return new Date(`${isoDate}T12:00:00Z`);
}

export function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDaysIso(isoDate: string, n: number): string {
  return toIso(new Date(parseIso(isoDate).getTime() + n * DAY_MS));
}

/** Počet dní od `a` po `b` (b − a); záporné, ak je b skôr. */
export function diffDays(a: string, b: string): number {
  return Math.round((parseIso(b).getTime() - parseIso(a).getTime()) / DAY_MS);
}

/** Dnešný dátum v Europe/Bratislava (`now` len pre testy). */
export function todayIso(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: REPORT_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Pondelok týždňa, do ktorého spadá dátum. */
export function weekStartOf(isoDate: string): string {
  const js = parseIso(isoDate).getUTCDay(); // 0 = nedeľa
  return addDaysIso(isoDate, -(js === 0 ? 6 : js - 1));
}

/** Pondelky všetkých týždňov, ktoré zasahujú do <from, to>, od najstaršieho. */
export function weekStartsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let w = weekStartOf(from); w <= to; w = addDaysIso(w, 7)) out.push(w);
  return out;
}

export interface ReportRange {
  /** prvý deň (vrátane) */
  from: string;
  /** posledný deň (vrátane), nikdy v budúcnosti */
  to: string;
  /** počet dní v rozsahu */
  days: number;
  /** pondelky týždňov zasahujúcich do rozsahu */
  weeks: string[];
}

/**
 * Rozsah dní pre obdobie. `4/12/26` = posledných N celých týždňov končiacich dnes
 * (od pondelka pred N−1 týždňami). `all` = od `earliest` (najstarší záznam klienta),
 * najviac však MAX_ALL_WEEKS týždňov dozadu.
 */
export function periodRange(period: PeriodKey, today: string, earliest?: string | null): ReportRange {
  const thisMonday = weekStartOf(today);
  let from: string;
  if (period === "all") {
    const cap = addDaysIso(thisMonday, -7 * (MAX_ALL_WEEKS - 1));
    from = earliest && earliest > cap ? weekStartOf(earliest) : cap;
    if (from > today) from = thisMonday;
  } else {
    from = addDaysIso(thisMonday, -7 * (Number(period) - 1));
  }
  return { from, to: today, days: diffDays(from, today) + 1, weeks: weekStartsBetween(from, today) };
}

// ---------- mesiac (PDF/CSV mesačný report) ----------

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function isValidMonth(value: unknown): value is string {
  return typeof value === "string" && MONTH_RE.test(value);
}

export function currentMonth(today: string): string {
  return today.slice(0, 7);
}

/** Predchádzajúci mesiac ("2026-01" → "2025-12"). */
export function previousMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

/**
 * Rozsah dní kalendárneho mesiaca; pre prebiehajúci mesiac končí dnes (nie v budúcnosti).
 * `null` pre neplatný mesiac alebo mesiac v budúcnosti.
 */
export function monthRange(month: string, today: string): ReportRange | null {
  if (!isValidMonth(month)) return null;
  if (month > currentMonth(today)) return null;
  const [y, m] = month.split("-").map(Number);
  const from = `${month}-01`;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const monthEnd = `${month}-${String(lastDay).padStart(2, "0")}`;
  const to = monthEnd > today ? today : monthEnd;
  return { from, to, days: diffDays(from, to) + 1, weeks: weekStartsBetween(from, to) };
}

/** Posledných `count` mesiacov končiacich mesiacom `today`, od najstaršieho ("2026-11" je posledný). */
export function lastMonths(today: string, count: number): string[] {
  const out: string[] = [];
  let m = currentMonth(today);
  for (let i = 0; i < count; i++) {
    out.unshift(m);
    m = previousMonth(m);
  }
  return out;
}
