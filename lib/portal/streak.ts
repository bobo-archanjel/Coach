// FitPilot — série (streaky) klienta na karte Dnes (feature/funkcionalita).
// Čisté funkcie nad zoznamom dátumov — žiadna DB, žiadny Supabase import, preto
// sa dajú testovať priamo (e2e/streak.spec.ts). Načítanie dát rieši lib/portal/data.ts.
//
// Zásady (dohodnuté s produktom):
// - Tréning sa počíta po TÝŽDŇOCH, nie po dňoch. Klient si sám volí, kedy cvičí
//   (rotačný model, bez fixného rozvrhu), oddychové dni sú súčasť tréningu —
//   denná séria by ich trestala.
// - Jedlo sa počíta po DNIACH a stačí zapísať aspoň jednu položku. Zámerne sa
//   NEhodnotí, či klient trafil kalórie — gamifikácia kalórií vedie k prehnanému
//   obmedzovaniu, čo je proti zdravotným hraniciam appky.
// - Jedno vynechanie sa toleruje: séria sa preruší až pri DRUHOM vynechaní v rade.
//   Vynechaná jednotka sa do série nezapočíta, len ju nepreruší.
// - Aktuálna jednotka (dnešok / tento týždeň) je ešte otvorená — jej nesplnenie
//   sériu nikdy nepreruší, kým neskončí.

const DAY_MS = 86_400_000;

/** Koľko odlišných tréningových dní v týždni sa počíta ako "splnený" týždeň. */
export const TRAINING_WEEK_TARGET = 2;
/** Okno, z ktorého sa séria počíta (dlhšia séria sa ukáže orezaná na toto okno). */
export const TRAINING_WINDOW_WEEKS = 52;
export const FOOD_WINDOW_DAYS = 60;
/** Séria sa ukáže až od tohto počtu — jedna jednotka nie je séria. */
export const MIN_VISIBLE_STREAK = 2;

export interface Streak {
  /** počet splnených jednotiek (týždňov/dní) v rade, tolerujúc jedno vynechanie */
  count: number;
  /**
   * Séria žije, ale aktuálna aj predošlá jednotka sú nesplnené — ďalšie
   * vynechanie ju preruší. UI to ukáže ako pokojnú pripomienku, nie ako varovanie.
   */
  atRisk: boolean;
}

export interface TrainingStreak extends Streak {
  /** odlišné tréningové dni v aktuálnom týždni (pondelok–nedeľa) */
  thisWeekDays: number;
  /** koľko dní ešte chýba do splnenia aktuálneho týždňa, 0 = už splnený */
  needThisWeek: number;
}

function parse(isoDate: string): Date {
  return new Date(`${isoDate}T12:00:00Z`);
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * DAY_MS);
}

/** Pondelok týždňa, do ktorého spadá dátum. */
function mondayIso(d: Date): string {
  const js = d.getUTCDay(); // 0 = nedeľa
  const fromMonday = js === 0 ? 6 : js - 1;
  return iso(addDays(d, -fromMonday));
}

/**
 * `qualifies[0]` = aktuálna (otvorená) jednotka, ďalej staršie. Vráti dĺžku série
 * podľa pravidiel hore.
 */
export function runLength(qualifies: boolean[]): Streak {
  const currentOk = qualifies[0] === true;
  let count = currentOk ? 1 : 0;
  let misses = 0;
  for (let i = 1; i < qualifies.length; i++) {
    if (qualifies[i]) {
      count++;
      misses = 0;
    } else {
      misses++;
      if (misses >= 2) break;
    }
  }
  const previousOk = qualifies[1] === true;
  return { count, atRisk: count > 0 && !currentOk && !previousOk };
}

/** Séria tréningových týždňov (≥ `target` odlišných dní v týždni). */
export function computeTrainingStreak(
  trainedDates: Iterable<string>,
  todayIso: string,
  target: number = TRAINING_WEEK_TARGET,
): TrainingStreak {
  const daysByWeek = new Map<string, Set<string>>();
  for (const date of trainedDates) {
    const week = mondayIso(parse(date));
    const set = daysByWeek.get(week) ?? new Set<string>();
    set.add(date);
    daysByWeek.set(week, set);
  }

  const thisMonday = parse(mondayIso(parse(todayIso)));
  const qualifies: boolean[] = [];
  for (let k = 0; k < TRAINING_WINDOW_WEEKS; k++) {
    const week = iso(addDays(thisMonday, -7 * k));
    qualifies.push((daysByWeek.get(week)?.size ?? 0) >= target);
  }

  const thisWeekDays = daysByWeek.get(iso(thisMonday))?.size ?? 0;
  return { ...runLength(qualifies), thisWeekDays, needThisWeek: Math.max(0, target - thisWeekDays) };
}

/** Séria dní so zapísanou aspoň jednou položkou jedla. */
export function computeFoodStreak(foodDates: Iterable<string>, todayIso: string): Streak {
  const logged = new Set(foodDates);
  const today = parse(todayIso);
  const qualifies: boolean[] = [];
  for (let k = 0; k < FOOD_WINDOW_DAYS; k++) {
    qualifies.push(logged.has(iso(addDays(today, -k))));
  }
  return runLength(qualifies);
}

export interface PortalStreaks {
  training: TrainingStreak;
  food: Streak;
}

/** Slovenské skloňovanie: 1 týždeň / 2–4 týždne / 0, 5+ týždňov. */
export function pluralSk(n: number, one: string, few: string, many: string): string {
  if (n === 1) return one;
  if (n >= 2 && n <= 4) return few;
  return many;
}
