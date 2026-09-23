// FitPilot — ktorý deň denníka jedla smie klient zobraziť/zapisovať (QA 2026-09-23:
// dalo sa zapisovať len za dnešok). Čistá logika bez importov — používa ju
// načítanie (getPortalFoodDiary) aj zápis (addFoodLogAction), aby sa nerozišli.

/** Koľko dní dozadu môže klient doplniť/prezrieť denník. */
export const DIARY_MAX_DAYS_BACK = 30;

function shiftIso(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Najstarší povolený deň pre daný "dnes" (YYYY-MM-DD, Europe/Bratislava). */
export function diaryMinDate(today: string): string {
  return shiftIso(today, -DIARY_MAX_DAYS_BACK);
}

/** Platný deň denníka, alebo null (zlý formát, budúcnosť, príliš ďaleko dozadu). */
export function validDiaryDate(input: string | null | undefined, today: string): string | null {
  if (!input || !/^\d{4}-\d{2}-\d{2}$/.test(input)) return null;
  if (Number.isNaN(Date.parse(`${input}T12:00:00Z`))) return null;
  if (input > today || input < diaryMinDate(today)) return null;
  return input;
}

/** Deň o `days` posunutý (na navigáciu ◀ ▶). */
export function shiftDiaryDate(iso: string, days: number): string {
  return shiftIso(iso, days);
}
