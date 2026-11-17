/*
 * Supersérie v tréningu: cviky idúce po sebe s rovnakým `superset` (krátke id skupiny,
 * nie písmeno) sa cvičia striedavo — A1 → A2 (→ A3), potom pauza. Písmeno skupiny
 * (A, B, …) aj poradie v nej sa počíta pri zobrazení podľa poradia v dni, takže presun
 * či zmazanie cviku nič neprečísluje ručne. Pauza po kole = pauza posledného cviku
 * skupiny; medzi cvikmi skupiny sa nepauzuje. Ukladá sa v jsonb workout_days.exercises
 * (`superset`), v šablónach aj v zápise tréningu — bez migrácie.
 *
 * Čisté funkcie, zdieľa ich builder trénera (server akcie), builder klienta, portál aj PDF.
 */

export type SupersetItem = { superset?: string | null };

export const SUPERSET_ID_MAX = 16;

/** krátke id skupiny (nemusí byť globálne unikátne — stačí v rámci dňa) */
export function newSupersetId(): string {
  return `s${Date.now().toString(36).slice(-4)}${Math.random().toString(36).slice(2, 6)}`;
}

/** platné id zo vstupu (prehliadač / jsonb) alebo null */
export function cleanSupersetId(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s && s.length <= SUPERSET_ID_MAX && /^[A-Za-z0-9_-]+$/.test(s) ? s : null;
}

/** súvislé úseky s rovnakým id (aj jednoprvkové) — [start, end] vrátane */
function runs<T extends SupersetItem>(list: readonly T[]): { id: string | null; start: number; end: number }[] {
  const out: { id: string | null; start: number; end: number }[] = [];
  list.forEach((item, i) => {
    const id = item.superset ?? null;
    const last = out[out.length - 1];
    if (last && id !== null && last.id === id) last.end = i;
    else out.push({ id, start: i, end: i });
  });
  return out;
}

/**
 * Upratanie: skupina musí mať aspoň 2 cviky po sebe. Osamotený člen skupinu stratí,
 * rovnaké id na dvoch nesúvislých miestach sa rozdelí (druhý úsek dostane nové id).
 */
export function normalizeSupersets<T extends SupersetItem>(list: readonly T[], makeId: () => string = newSupersetId): T[] {
  const seen = new Set<string>();
  const result = list.map((item) => ({ ...item }));
  for (const run of runs(list)) {
    if (run.id === null) continue;
    const size = run.end - run.start + 1;
    const id = size < 2 ? null : seen.has(run.id) ? makeId() : run.id;
    if (id) seen.add(id);
    for (let i = run.start; i <= run.end; i++) result[i].superset = id;
  }
  return result;
}

/** cvik `i` a nasledujúci sú v tej istej supersérii */
export function isLinkedToNext(list: readonly SupersetItem[], i: number): boolean {
  const a = list[i]?.superset ?? null;
  return a !== null && a === (list[i + 1]?.superset ?? null);
}

/**
 * Prepne spojenie cviku `i` s nasledujúcim: nespojené → spojí (pridá do skupiny niektorého
 * z nich, prípadne zlúči dve skupiny); spojené → rozdelí skupinu medzi nimi.
 */
export function toggleLinkWithNext<T extends SupersetItem>(list: readonly T[], i: number, makeId: () => string = newSupersetId): T[] {
  if (i < 0 || i >= list.length - 1) return [...list];
  const result = list.map((item) => ({ ...item }));
  const all = runs(list);
  const runOf = (idx: number) => all.find((r) => idx >= r.start && idx <= r.end)!;
  if (isLinkedToNext(list, i)) {
    // za `i` nová skupina (alebo žiadna, ak by ostal jeden)
    const run = runOf(i);
    const rightId = makeId();
    for (let k = i + 1; k <= run.end; k++) result[k].superset = rightId;
    return normalizeSupersets(result, makeId);
  }
  const left = runOf(i);
  const right = runOf(i + 1);
  const id = left.id ?? right.id ?? makeId();
  for (let k = left.start; k <= right.end; k++) result[k].superset = id;
  return normalizeSupersets(result, makeId);
}

/** cvik po presune šípkami vypadne zo supersérie (skupina ostane súvislá) */
export function detachFromSuperset<T extends SupersetItem>(list: readonly T[], i: number): T[] {
  const result = list.map((item, k) => (k === i ? { ...item, superset: null } : { ...item }));
  return normalizeSupersets(result);
}

export interface SupersetPos {
  /** písmeno skupiny: A, B, … podľa poradia v dni */
  letter: string;
  /** poradie v skupine od 1 */
  index: number;
  size: number;
  first: boolean;
  last: boolean;
}

/** pozícia každého cviku v supersérii (null = samostatný cvik) — pre štítky A1 / A2 */
export function supersetPositions(list: readonly SupersetItem[]): (SupersetPos | null)[] {
  const out: (SupersetPos | null)[] = list.map(() => null);
  let n = 0;
  for (const run of runs(list)) {
    const size = run.end - run.start + 1;
    if (run.id === null || size < 2) continue;
    const letter = String.fromCharCode(65 + (n++ % 26));
    for (let i = run.start; i <= run.end; i++) {
      out[i] = { letter, index: i - run.start + 1, size, first: i === run.start, last: i === run.end };
    }
  }
  return out;
}
