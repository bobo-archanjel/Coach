// FitPilot — AI Kouč: výmena cviku v klientovom VLASTNOM pláne (feature/AIKoucAIJedlo).
// Čisté funkcie bez závislostí (testovateľné mimo Next.js): parsovanie markerov na konci
// odpovede modelu a OVEROVANIE navrhovaných výmen. Model nikdy nerozhoduje sám — appka
// prijme len výmenu, ktorú vie podložiť vlastnými dátami (plán klienta + výsledky nástroja).

export const MAX_SWAPS = 3;

/** Overená výmena cviku — ukladá sa k správe a posiela klientovi ako tlačidlo. */
export interface ExerciseSwapRef {
  dayId: string;
  dayName: string;
  oldId: string;
  oldName: string;
  newId: string;
  newName: string;
  /** výmena už bola v pláne vykonaná (dopĺňa sa po kliknutí, aby tlačidlo prežilo reload) */
  applied?: boolean;
}

/** Deň aktuálneho plánu klienta, ako ho pozná server (trainingContext.ts). */
export interface PlanDayForSwap {
  id: string;
  name: string;
  /** true = plán si vytvoril klient sám (workout_plans.trainer_id is null) */
  own: boolean;
  exercises: { id: string; name: string }[];
}

const ID = /^[A-Za-z0-9-]{1,64}$/;
// Oba markery tvoria súvislý chvost odpovede (poradie ľubovoľné):
//   [CVIKY: id1, id2]
//   [VYMENA: dayId|oldExerciseId>newExerciseId; dayId|old>new]
const TAIL = /(?:\s*\[(?:CVIKY|VYMENA):[^\]]*\])+\s*$/;
const MARKER = /\[(CVIKY|VYMENA):([^\]]*)\]/g;

/** Odtrhne markery z konca odpovede; vráti čistý text a surový obsah každého markera. */
export function splitReplyMarkers(raw: string): { text: string; cviky: string | null; vymena: string | null } {
  const tail = raw.match(TAIL);
  if (!tail || tail.index === undefined) return { text: raw, cviky: null, vymena: null };
  let cviky: string | null = null;
  let vymena: string | null = null;
  for (const m of tail[0].matchAll(MARKER)) {
    if (m[1] === "CVIKY") cviky = m[2];
    else vymena = m[2];
  }
  return { text: raw.slice(0, tail.index).trimEnd(), cviky, vymena };
}

/**
 * Rozdelí uložené jsonb `ai_messages.exercise_refs`: položky { id, name } sú odkazy na detail
 * cviku, položky { swap: {...} } návrhy výmeny. Nikdy nehádže — nevalidné položky zahodí.
 */
export function splitExerciseRefs(raw: unknown): { exerciseRefs?: { id: string; name: string }[]; swaps?: ExerciseSwapRef[] } {
  if (!Array.isArray(raw)) return {};
  const refs: { id: string; name: string }[] = [];
  const swaps: ExerciseSwapRef[] = [];
  const str = (v: unknown) => (typeof v === "string" ? v : null);
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (o.swap && typeof o.swap === "object") {
      const w = o.swap as Record<string, unknown>;
      const [dayId, dayName, oldId, oldName, newId, newName] = ["dayId", "dayName", "oldId", "oldName", "newId", "newName"].map((k) => str(w[k]));
      if (dayId && dayName && oldId && oldName && newId && newName) {
        swaps.push({ dayId, dayName, oldId, oldName, newId, newName, ...(w.applied === true ? { applied: true } : {}) });
      }
    } else if (str(o.id) && str(o.name)) {
      refs.push({ id: o.id as string, name: o.name as string });
    }
  }
  return { exerciseRefs: refs.length > 0 ? refs : undefined, swaps: swaps.length > 0 ? swaps : undefined };
}

export function parseSwapPayload(payload: string): { dayId: string; oldId: string; newId: string }[] {
  const out: { dayId: string; oldId: string; newId: string }[] = [];
  for (const part of payload.split(";")) {
    const m = part.trim().match(/^([^|>\s]+)\|([^|>\s]+)>([^|>\s]+)$/);
    if (m && ID.test(m[1]) && ID.test(m[2]) && ID.test(m[3])) out.push({ dayId: m[1], oldId: m[2], newId: m[3] });
  }
  return out;
}

/**
 * Pravidlá: deň patrí do klientovho VLASTNÉHO plánu, starý cvik je v ňom naozaj, nový cvik
 * vrátil search_exercises v tejto správe, nie je to ten istý cvik a nie je už v tom dni.
 * Čokoľvek iné sa potichu zahodí; max. MAX_SWAPS, jedna výmena na (deň, starý cvik).
 */
export function verifySwaps(
  payload: string | null,
  days: PlanDayForSwap[],
  foundExercises: Map<string, string>,
): ExerciseSwapRef[] {
  if (!payload) return [];
  const byDay = new Map(days.map((d) => [d.id, d]));
  const seen = new Set<string>();
  const out: ExerciseSwapRef[] = [];
  for (const s of parseSwapPayload(payload)) {
    if (out.length >= MAX_SWAPS) break;
    const day = byDay.get(s.dayId);
    if (!day || !day.own) continue;
    const old = day.exercises.find((e) => e.id === s.oldId);
    const newName = foundExercises.get(s.newId);
    if (!old || !newName || s.newId === s.oldId) continue;
    if (day.exercises.some((e) => e.id === s.newId)) continue;
    const key = `${s.dayId}|${s.oldId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ dayId: day.id, dayName: day.name, oldId: old.id, oldName: old.name, newId: s.newId, newName });
  }
  return out;
}

/**
 * Samotná výmena v poli cvikov dňa (jsonb workout_days.exercises): zachová všetko okrem
 * exercise_id + exercise_name (série, opakovania, záťaž, tempo, pauza, entry_id).
 * Vráti null, ak starý cvik v dni už nie je.
 */
export function applySwapToEntries(
  entries: unknown,
  swap: { oldId: string; newId: string; newName: string },
): { entries: Record<string, unknown>[]; changed: boolean; alreadyApplied: boolean } | null {
  if (!Array.isArray(entries)) return null;
  const list = entries as Record<string, unknown>[];
  const idx = list.findIndex((e) => e && e.exercise_id === swap.oldId);
  if (idx === -1) {
    const done = list.some((e) => e && e.exercise_id === swap.newId);
    return done ? { entries: list, changed: false, alreadyApplied: true } : null;
  }
  const next = list.map((e, i) => (i === idx ? { ...e, exercise_id: swap.newId, exercise_name: swap.newName } : e));
  return { entries: next, changed: true, alreadyApplied: false };
}
