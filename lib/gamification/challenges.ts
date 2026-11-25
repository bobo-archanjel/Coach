// FitPilot — výzvy trénera (gamifikácia, fáza B). Čisté funkcie bez DB a bez servera
// (testy: e2e/gamification-b.spec.ts). Server ich len nakŕmi načítanými riadkami.
//
// Zásady: progres sa VŽDY počíta z dát (tréningy, zápisy jedla, rekordy), nikdy ho nehlási
// klient. Žiadna metrika nesúvisí s hmotnosťou ani kalóriami — výzvy sú len pozitívne
// (počet tréningov, dni so zápisom jedla, séria týždňov, rekordy, objem).

import { REPORT_TZ, addDaysIso, diffDays, todayIso, weekStartOf } from "@/lib/reports/period";
import { totalVolumeKg } from "./records";

export const CHALLENGE_METRICS = ["workouts", "food_days", "streak_weeks", "prs", "volume_kg"] as const;
export type ChallengeMetric = (typeof CHALLENGE_METRICS)[number];

export function isChallengeMetric(v: unknown): v is ChallengeMetric {
  return typeof v === "string" && (CHALLENGE_METRICS as readonly string[]).includes(v);
}

/** Najviac aktívnych výziev na trénera (zrkadlí trigger challenges_limit_guard v 0079). */
export const MAX_ACTIVE_CHALLENGES = 20;
/** Najdlhšie trvanie výzvy v dňoch (zrkadlí CHECK challenges_period). */
export const MAX_CHALLENGE_DAYS = 120;
/** Týždeň sa do série výzvy počíta, keď má aspoň toľko odlišných tréningových dní. */
export const CHALLENGE_WEEK_MIN_DAYS = 2;

export interface ChallengeInput {
  name: string;
  description: string;
  metric: ChallengeMetric;
  target: number;
  startsOn: string;
  endsOn: string;
}

export type ChallengeError =
  | "name"
  | "description"
  | "metric"
  | "target"
  | "dates"
  | "startPast"
  | "tooLong"
  | "endPast";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Inkluzívny počet dní obdobia. */
export function windowDays(startsOn: string, endsOn: string): number {
  return diffDays(startsOn, endsOn) + 1;
}

/** Počet týždňov (pondelkov), ktoré obdobie zasahuje. */
export function windowWeeks(startsOn: string, endsOn: string): number {
  return Math.floor(diffDays(weekStartOf(startsOn), weekStartOf(endsOn)) / 7) + 1;
}

/** Povolený rozsah cieľa pre metriku (rozumné hodnoty, nie zdravotné odporúčania). */
export function targetBounds(metric: ChallengeMetric, startsOn: string, endsOn: string): { min: number; max: number } {
  const days = windowDays(startsOn, endsOn);
  switch (metric) {
    case "workouts":
      return { min: 1, max: Math.min(200, Math.max(1, days)) };
    case "food_days":
      return { min: 1, max: Math.max(1, days) };
    case "streak_weeks":
      return { min: 2, max: Math.min(26, Math.max(2, windowWeeks(startsOn, endsOn))) };
    case "prs":
      return { min: 1, max: 50 };
    case "volume_kg":
      return { min: 100, max: 1_000_000 };
  }
}

/** Overenie vstupu trénera; vráti kód chyby (kľúč v gamification.challenges.errors) alebo null. */
export function validateChallenge(i: Partial<ChallengeInput>, today: string): ChallengeError | null {
  const name = (i.name ?? "").trim();
  if (name.length < 1 || name.length > 80) return "name";
  if ((i.description ?? "").length > 300) return "description";
  if (!isChallengeMetric(i.metric)) return "metric";
  if (typeof i.startsOn !== "string" || typeof i.endsOn !== "string" || !ISO.test(i.startsOn) || !ISO.test(i.endsOn)) return "dates";
  if (Number.isNaN(Date.parse(`${i.startsOn}T12:00:00Z`)) || Number.isNaN(Date.parse(`${i.endsOn}T12:00:00Z`))) return "dates";
  if (i.endsOn < i.startsOn) return "dates";
  // výzva sa počíta od svojho vytvorenia — začiatok v minulosti nedáva zmysel
  if (i.startsOn < today) return "startPast";
  if (i.endsOn < today) return "endPast";
  if (windowDays(i.startsOn, i.endsOn) > MAX_CHALLENGE_DAYS) return "tooLong";
  if (typeof i.target !== "number" || !Number.isInteger(i.target)) return "target";
  const b = targetBounds(i.metric, i.startsOn, i.endsOn);
  if (i.target < b.min || i.target > b.max) return "target";
  return null;
}

// ---------------------------------------------------------------- progres

export interface ChallengeWindow {
  startsOn: string;
  endsOn: string;
  /**
   * Okamih vytvorenia výzvy (ISO, challenges.created_at). Počíta sa len aktivita PO ňom (a po
   * začiatku dňa `startsOn`, ak je začiatok v budúcnosti) — staršie tréningy/jedlo/rekordy sa
   * nezarátajú. Bez neho sa berie len začiatok dňa `startsOn`.
   */
  createdAt?: string | null;
}

export interface ProgressLog {
  performedOn: string;
  /** okamih dokončenia tréningu (workout_logs.completed_at); bez neho sa berie začiatok dňa performedOn */
  completedAt?: string | null;
  entries?: unknown;
}

/** Deň zápisu jedla; `at` = posledný zápis toho dňa (food_logs.created_at). Holý reťazec = len dátum. */
export type FoodDay = string | { day: string; at: string | null };

export interface ProgressData {
  /** dokončené tréningy klienta (workout_logs) — stačí obdobie výzvy, prípadne širšie */
  logs: ProgressLog[];
  /** dni so zápisom jedla */
  foodDates: Iterable<FoodDay>;
  /** osobné rekordy (client_achievements kind 'pr'): dátum achieved_on, alebo ISO okamih achieved_at */
  prDates: Iterable<string>;
}

// ---------------------------------------------------------------- okamih začiatku

function tzOffsetMs(utcMs: number): number {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: REPORT_TZ,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const g = (t: string) => Number(p.find((x) => x.type === t)?.value ?? 0);
  return Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second")) - Math.floor(utcMs / 1000) * 1000;
}

/** Začiatok dňa (00:00) v Europe/Bratislava ako epoch ms. */
export function startOfDayMs(isoDate: string): number {
  const [y, m, d] = isoDate.split("-").map(Number);
  const utcMidnight = Date.UTC(y, m - 1, d);
  const cand = utcMidnight - tzOffsetMs(utcMidnight);
  return utcMidnight - tzOffsetMs(cand);
}

/**
 * Efektívny začiatok výzvy: neskorší z okamihu vytvorenia a začiatku dňa `startsOn`
 * (Europe/Bratislava). Výzva vytvorená dnes o 10:00 počíta od 10:00; s budúcim začiatkom od 00:00 toho dňa.
 */
export function effectiveStartMs(w: ChallengeWindow): number {
  const day = startOfDayMs(w.startsOn);
  const created = w.createdAt ? Date.parse(w.createdAt) : Number.NaN;
  return Number.isNaN(created) ? day : Math.max(day, created);
}

/** Okamih tréningu: completed_at, inak (konzervatívne) začiatok dňa performed_on. */
function logMs(l: ProgressLog): number {
  const t = l.completedAt ? Date.parse(l.completedAt) : Number.NaN;
  return Number.isNaN(t) ? startOfDayMs(l.performedOn) : t;
}

/** Kalendárny deň (Bratislava) tréningu — podľa completed_at, inak performed_on. */
function logDay(l: ProgressLog): string {
  const t = l.completedAt ? Date.parse(l.completedAt) : Number.NaN;
  return Number.isNaN(t) ? l.performedOn : todayIso(new Date(t));
}

/** Okamih záznamu: dátum (YYYY-MM-DD) = začiatok dňa, inak ISO okamih. */
function stampMs(s: string): number {
  return s.length <= 10 ? startOfDayMs(s) : Date.parse(s);
}

/** Je okamih v okne výzvy: od efektívneho začiatku po koniec dňa `endsOn` a nie neskôr než koniec dňa `today`. */
function inWindow(ms: number, w: ChallengeWindow, today: string): boolean {
  if (Number.isNaN(ms)) return false;
  const endMs = startOfDayMs(addDaysIso(w.endsOn < today ? w.endsOn : today, 1));
  return ms >= effectiveStartMs(w) && ms < endMs;
}

/** Najdlhší beh po sebe idúcich splnených týždňov (bez tolerancie — pravidlo je v popise výzvy). */
export function longestWeekRun(trainedDates: Iterable<string>, w: ChallengeWindow, today: string): number {
  const days = new Map<string, Set<string>>();
  for (const d of trainedDates) {
    const wk = weekStartOf(d);
    const s = days.get(wk) ?? new Set<string>();
    s.add(d);
    days.set(wk, s);
  }
  const last = weekStartOf(w.endsOn < today ? w.endsOn : today);
  // týždne sa počítajú od týždňa efektívneho začiatku (nie od týždňa `startsOn`)
  const first = weekStartOf(todayIso(new Date(effectiveStartMs(w))));
  let best = 0;
  let run = 0;
  for (let wk = first; wk <= last; wk = addDaysIso(wk, 7)) {
    if ((days.get(wk)?.size ?? 0) >= CHALLENGE_WEEK_MIN_DAYS) {
      run++;
      if (run > best) best = run;
    } else {
      run = 0;
    }
  }
  return best;
}

/**
 * Hodnota metriky klienta. Počíta sa LEN aktivita po efektívnom začiatku výzvy (viď effectiveStartMs):
 *  - workouts / volume_kg: tréningy s completed_at ≥ začiatok (bez completed_at: začiatok dňa performed_on),
 *  - food_days: deň sa počíta, ak má zápis jedla vytvorený po začiatku (a jedlo je z dňa začiatku či neskôr),
 *  - prs: rekordy s achieved_at ≥ začiatok,
 *  - streak_weeks: týždne od týždňa začiatku; v prvom týždni sa počítajú len tréningové dni po začiatku
 *    (týždeň sa počíta pri ≥ CHALLENGE_WEEK_MIN_DAYS dňoch).
 */
export function challengeValue(metric: ChallengeMetric, w: ChallengeWindow, data: ProgressData, today: string): number {
  const logs = () => data.logs.filter((l) => inWindow(logMs(l), w, today));
  switch (metric) {
    case "workouts":
      return logs().length;
    case "food_days": {
      const startDay = todayIso(new Date(effectiveStartMs(w)));
      const days = new Set<string>();
      for (const f of data.foodDates) {
        const day = typeof f === "string" ? f : f.day;
        const at = typeof f === "string" ? startOfDayMs(f) : f.at ? Date.parse(f.at) : startOfDayMs(day);
        if (day >= startDay && day <= w.endsOn && day <= today && inWindow(at, w, today)) days.add(day);
      }
      return days.size;
    }
    case "prs":
      return [...data.prDates].filter((d) => inWindow(stampMs(d), w, today)).length;
    case "volume_kg":
      return totalVolumeKg(logs().map((l) => ({ entries: l.entries })));
    case "streak_weeks":
      return longestWeekRun(new Set(logs().map(logDay)), w, today);
  }
}

export interface ChallengeProgress {
  value: number;
  target: number;
  /** 0–1 (orezané) */
  fraction: number;
  done: boolean;
}

export function challengeProgress(
  c: ChallengeWindow & { metric: ChallengeMetric; target: number },
  data: ProgressData,
  today: string,
): ChallengeProgress {
  const value = challengeValue(c.metric, c, data, today);
  const target = Math.max(1, c.target);
  return { value, target, fraction: Math.min(1, value / target), done: value >= target };
}

// ---------------------------------------------------------------- stav a dokončenie

export type ChallengeStatus = "upcoming" | "active" | "over";

/** Stav podľa dátumov (ručne ukončená výzva sa rieši zvlášť — `ended`). */
export function challengeStatus(c: ChallengeWindow & { status?: "active" | "ended" }, today: string): ChallengeStatus | "ended" {
  if (c.status === "ended") return "ended";
  if (today < c.startsOn) return "upcoming";
  if (today > c.endsOn) return "over";
  return "active";
}

/** Dá sa o výzve ešte rozhodnúť (pripísať dokončenie)? Len bežiaca a neukončená. */
export function canComplete(c: ChallengeWindow & { status?: "active" | "ended" }, today: string): boolean {
  return challengeStatus(c, today) === "active";
}

export interface ParticipantState {
  challengeId: string;
  completedAt: string | null;
}

/**
 * Ktoré výzvy sa PRÁVE dokončili: bežiace, ešte nedokončené, s progresom na cieli.
 * Idempotentné — už dokončené (completedAt) sa nikdy nevrátia, takže opakované vyhodnotenie
 * nič nezdvojí (server navyše prechod chráni podmienkou `completed_at is null` a UNIQUE indexom).
 */
export function newlyCompleted(
  challenges: (ChallengeWindow & { id: string; metric: ChallengeMetric; target: number; status: "active" | "ended" })[],
  participants: ParticipantState[],
  dataFor: (challengeId: string) => ProgressData,
  today: string,
): string[] {
  const done = new Set(participants.filter((p) => p.completedAt).map((p) => p.challengeId));
  const mine = new Set(participants.map((p) => p.challengeId));
  const out: string[] = [];
  for (const c of challenges) {
    if (!mine.has(c.id) || done.has(c.id) || !canComplete(c, today)) continue;
    if (challengeProgress(c, dataFor(c.id), today).done) out.push(c.id);
  }
  return out;
}

/** Dátum začiatku načítania histórie pre výzvy (deň efektívneho začiatku; o deň skôr pre rozdiely časových pásiem). */
export function dataSince(w: ChallengeWindow): string {
  return addDaysIso(todayIso(new Date(effectiveStartMs(w))), -1);
}
