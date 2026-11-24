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
// - Zmrazenie (gamifikácia v2, lib/gamification/rewards.ts): odmena za úroveň alebo týždeň misií.
//   Zmrazená jednotka je „preskočená“ — nepripočíta sa do série, ale ani nepočíta ako vynechanie.
//   Použije sa AUTOMATICKY práve vtedy, keď by druhé vynechanie v rade sériu prerušilo
//   (planFreezes); použitie sa uloží (client_streak_freezes), takže história ostáva stabilná.

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
export function runLength(qualifies: boolean[], frozen?: ReadonlySet<number>): Streak {
  const currentOk = qualifies[0] === true;
  let count = currentOk ? 1 : 0;
  let misses = 0;
  for (let i = 1; i < qualifies.length; i++) {
    // zmrazená jednotka: preskočená (neznižuje ani nezvyšuje sériu, nepridáva vynechanie)
    if (frozen?.has(i)) continue;
    if (qualifies[i]) {
      count++;
      misses = 0;
    } else {
      misses++;
      if (misses >= 2) break;
    }
  }
  const previousOk = qualifies[1] === true || frozen?.has(1) === true;
  return { count, atRisk: count > 0 && !currentOk && !previousOk };
}

/** Do akého veku (v jednotkách) sa môže automaticky použiť zmrazenie — staré pauzy sa spätne „nezachraňujú“. */
export const FREEZE_MAX_AGE_WEEKS = 8;
export const FREEZE_MAX_AGE_DAYS = 5;

/**
 * Ktoré jednotky (indexy, 0 = aktuálna) má zmrazenie ochrániť, aby sa séria nepretrhla. Zmrazenie sa spotrebuje
 * len pri DRUHOM vynechaní v rade (prvé sa toleruje zadarmo), len pre zatvorenú jednotku nie staršiu než
 * `maxAge` a len ak za ňou séria pokračuje (aspoň jedna splnená jednotka). `tokens` = koľko zmrazení je k dispozícii.
 */
export function planFreezes(qualifies: boolean[], frozen: ReadonlySet<number>, tokens: number, maxAge: number): number[] {
  const used = new Set(frozen);
  const added: number[] = [];
  while (added.length < tokens) {
    let misses = 0;
    let breakAt = -1;
    for (let i = 1; i < qualifies.length; i++) {
      if (used.has(i)) continue;
      if (qualifies[i]) {
        misses = 0;
      } else {
        misses++;
        if (misses >= 2) {
          breakAt = i;
          break;
        }
      }
    }
    if (breakAt < 0 || breakAt > maxAge) break;
    // ochrana má zmysel, len keď za prerušením niečo je
    if (!qualifies.slice(breakAt + 1).some(Boolean)) break;
    used.add(breakAt);
    added.push(breakAt);
  }
  return added;
}

/** Séria tréningových týždňov (≥ `target` odlišných dní v týždni). */
export function computeTrainingStreak(
  trainedDates: Iterable<string>,
  todayIso: string,
  target: number = TRAINING_WEEK_TARGET,
  /** pondelky týždňov chránených zmrazením */
  frozenWeeks: Iterable<string> = [],
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
  const frozen = new Set<number>();
  for (const w of frozenWeeks) {
    const k = Math.round((thisMonday.getTime() - parse(w).getTime()) / (7 * DAY_MS));
    if (k >= 1 && k < TRAINING_WINDOW_WEEKS) frozen.add(k);
  }
  return { ...runLength(qualifies, frozen), thisWeekDays, needThisWeek: Math.max(0, target - thisWeekDays) };
}

/** Pondelky týždňov, ktoré má zmrazenie ochrániť (nové použitia; `frozenWeeks` sú už uložené). */
export function planTrainingFreezes(
  trainedDates: Iterable<string>,
  todayIso: string,
  tokens: number,
  target: number = TRAINING_WEEK_TARGET,
  frozenWeeks: Iterable<string> = [],
): string[] {
  const daysByWeek = new Map<string, Set<string>>();
  for (const date of trainedDates) {
    const week = mondayIso(parse(date));
    const set = daysByWeek.get(week) ?? new Set<string>();
    set.add(date);
    daysByWeek.set(week, set);
  }
  const thisMonday = parse(mondayIso(parse(todayIso)));
  const weeks: string[] = [];
  const qualifies: boolean[] = [];
  for (let k = 0; k < TRAINING_WINDOW_WEEKS; k++) {
    const week = iso(addDays(thisMonday, -7 * k));
    weeks.push(week);
    qualifies.push((daysByWeek.get(week)?.size ?? 0) >= target);
  }
  const frozen = new Set<number>();
  for (const w of frozenWeeks) {
    const k = weeks.indexOf(w);
    if (k >= 1) frozen.add(k);
  }
  return planFreezes(qualifies, frozen, tokens, FREEZE_MAX_AGE_WEEKS).map((k) => weeks[k]);
}

/** Dni, ktoré má zmrazenie ochrániť pri sérii zápisov jedla. */
export function planFoodFreezes(foodDates: Iterable<string>, todayIso: string, tokens: number, frozenDays: Iterable<string> = []): string[] {
  const logged = new Set(foodDates);
  const today = parse(todayIso);
  const days: string[] = [];
  const qualifies: boolean[] = [];
  for (let k = 0; k < FOOD_WINDOW_DAYS; k++) {
    const d = iso(addDays(today, -k));
    days.push(d);
    qualifies.push(logged.has(d));
  }
  const frozen = new Set<number>();
  for (const d of frozenDays) {
    const k = days.indexOf(d);
    if (k >= 1) frozen.add(k);
  }
  return planFreezes(qualifies, frozen, tokens, FREEZE_MAX_AGE_DAYS).map((k) => days[k]);
}

/** Séria dní so zapísanou aspoň jednou položkou jedla. */
export function computeFoodStreak(foodDates: Iterable<string>, todayIso: string, frozenDays: Iterable<string> = []): Streak {
  const logged = new Set(foodDates);
  const today = parse(todayIso);
  const qualifies: boolean[] = [];
  const index = new Map<string, number>();
  for (let k = 0; k < FOOD_WINDOW_DAYS; k++) {
    const d = iso(addDays(today, -k));
    index.set(d, k);
    qualifies.push(logged.has(d));
  }
  const frozen = new Set<number>();
  for (const d of frozenDays) {
    const k = index.get(d);
    if (k !== undefined && k >= 1) frozen.add(k);
  }
  return runLength(qualifies, frozen);
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
