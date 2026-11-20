/*
 * Mesačný kalendár trénera (app/dashboard/kalendar) — čistá logika bez next/supabase,
 * zdieľaná so serverovou akciou termínov a e2e testom (e2e/kalendar-mesiac.spec.ts).
 *
 * Všetko je v Europe/Bratislava: deň termínu = dátum jeho začiatku v tejto zóne (termín
 * o 23:30 SEČ = 22:30 UTC patrí ešte na ten deň, nie na nasledujúci). Appka nemá timezone
 * knižnicu — prepočty cez Intl (rovnaký trik ako lib/rateLimit.ts). Dni mriežky sú kľúče
 * „YYYY-MM-DD“ — kalendárne dátumy bez času, počítané v UTC (žiadny posun cez DST).
 */
import type { Locale } from "@/lib/i18n/locales";
import { MONTH_GENITIVE, MONTH_NOMINATIVE, WEEKDAY_LONG } from "@/lib/i18n/dates";

export const CALENDAR_TZ = "Europe/Bratislava";

/** „YYYY-MM-DD“ okamihu `d` v Europe/Bratislava. */
export function dateKeyInTz(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: CALENDAR_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** „HH:MM“ okamihu v Europe/Bratislava — rovnaký formát ako <input type="time">. */
export function timeInTz(iso: string): string {
  // i18n: „HH:MM“ pre <input type="time"> — formát nezávisí od jazyka
  return new Date(iso).toLocaleTimeString("sk-SK", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: CALENDAR_TZ });
}

/**
 * „Wall-clock“ dátum + čas v Europe/Bratislava → UTC ISO. Naformátuje ten istý okamih do
 * oboch zón cez Intl; rozdiel je presný posun vrátane letného času.
 */
export function bratislavaToUtcIso(dateStr: string, timeStr: string): string {
  const naive = new Date(`${dateStr}T${timeStr}:00Z`);
  const asUtc = new Date(naive.toLocaleString("en-US", { timeZone: "UTC" }));
  const asBratislava = new Date(naive.toLocaleString("en-US", { timeZone: CALENDAR_TZ }));
  const offsetMs = asBratislava.getTime() - asUtc.getTime();
  return new Date(naive.getTime() - offsetMs).toISOString();
}

export interface YearMonth {
  year: number;
  /** 1 – 12 */
  month: number;
}

/** „2026-11“ */
export function monthParam({ year, month }: YearMonth): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** `?mesiac=2026-11` → mesiac; neplatné / chýbajúce → mesiac dňa `todayKey`. */
export function parseMonthParam(value: string | undefined, todayKey: string): YearMonth {
  const m = /^(\d{4})-(\d{2})$/.exec(value ?? "");
  if (m) {
    const year = Number(m[1]);
    const month = Number(m[2]);
    if (year >= 2000 && year <= 2100 && month >= 1 && month <= 12) return { year, month };
  }
  return { year: Number(todayKey.slice(0, 4)), month: Number(todayKey.slice(5, 7)) };
}

export function shiftMonth({ year, month }: YearMonth, delta: number): YearMonth {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

const keyOfUtc = (d: Date) => d.toISOString().slice(0, 10);

/** kalendárny posun „YYYY-MM-DD“ o `days` dní */
export function addDaysToKey(key: string, days: number): string {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return keyOfUtc(d);
}

export interface CalendarDay {
  key: string;
  day: number;
  /** patrí do zobrazeného mesiaca (inak doplnok mriežky z vedľajšieho mesiaca) */
  inMonth: boolean;
}

/** Celé týždne (po – ne) pokrývajúce mesiac: 4 – 6 riadkov po 7 dňoch. */
export function monthGrid({ year, month }: YearMonth): CalendarDay[] {
  const first = new Date(Date.UTC(year, month - 1, 1, 12));
  const daysInMonth = new Date(Date.UTC(year, month, 0, 12)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7; // pondelok = 0
  const total = Math.ceil((lead + daysInMonth) / 7) * 7;
  const start = addDaysToKey(keyOfUtc(first), -lead);
  return Array.from({ length: total }, (_, i) => {
    const key = addDaysToKey(start, i);
    return { key, day: Number(key.slice(8, 10)), inMonth: i >= lead && i < lead + daysInMonth };
  });
}

/** UTC rozsah [od, do) termínov mriežky — jeden dopyt na celý zobrazený mesiac. */
export function gridRangeUtc(grid: CalendarDay[]): { from: string; to: string } {
  return {
    from: bratislavaToUtcIso(grid[0].key, "00:00"),
    to: bratislavaToUtcIso(addDaysToKey(grid[grid.length - 1].key, 1), "00:00"),
  };
}

/** „November 2026“ */
export function monthTitle({ year, month }: YearMonth, locale: Locale): string {
  return `${MONTH_NOMINATIVE[locale][month - 1]} ${year}`;
}

const WEEKDAY_EN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/** „Piatok 20. novembra“ — hlavička okna dňa (ručné tabuľky, rovnaký text na serveri aj v prehliadači). */
export function dayTitle(key: string, locale: Locale): string {
  const d = new Date(`${key}T12:00:00Z`);
  const weekday = WEEKDAY_LONG[locale][WEEKDAY_EN[(d.getUTCDay() + 6) % 7]];
  const label = `${weekday} ${d.getUTCDate()}. ${MONTH_GENITIVE[locale][d.getUTCMonth()]}`;
  return label.charAt(0).toUpperCase() + label.slice(1);
}
