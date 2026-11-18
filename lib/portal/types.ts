// Typy klientskeho portálu /portal. Naplnené reálnymi Supabase dátami v lib/portal/data.ts
// (migrácia supabase/migrations/0002_workout_portal.sql). Viď DESIGN.md → Surfaces → Klientsky portál.

import type { MealSlot } from "@/lib/meals";
import type { PortionUnit } from "@/lib/portions";
import type { BodyMetricEntry } from "@/lib/dashboard/bodyMetrics";
import type { PortalStreaks } from "./streak";
import type { CompletedCompare } from "@/lib/workouts/completed";

// Rotačný model (2026-08-28): plán nemá pevný rozvrh podľa dňa v týždni — klient
// si sám vyberá kedy cvičí, "ďalší tréning" je vždy nasledujúci nedokončený deň
// v poradí (lib/portal/data.ts). Preto tu niet "missed" (vynechaný podľa rozvrhu)
// — len či sa v ten kalendárny deň odcvičilo (`done`), alebo nie (`none`);
// `future` je deň, ktorý ešte len príde (relevantné pri prezeraní minulých týždňov).
export type DayCellState = "done" | "today" | "future" | "none";

/** Jeden odcvičený tréning v konkrétny deň (jeden riadok workout_logs). */
export interface LoggedSessionView {
  /** názov dňa z workout_days, alebo "Tréning" ak deň medzitým zanikol */
  dayName: string;
  planName: string | null;
  /** plán vs. skutočnosť po sériách; prázdne pri starších (Fáza A) záznamoch bez zápisu sérií */
  compare: CompletedCompare;
}

export interface WeekDay {
  /** Po, Ut, St … */
  label: string;
  dayNum: number;
  /** kalendárny dátum bunky, YYYY-MM-DD */
  iso: string;
  state: DayCellState;
  /** odcvičené tréningy v tento kalendárny deň (zvyčajne 0 – 1, zriedka viac) */
  sessions: LoggedSessionView[];
}

/** Týždeň pre pás „Tento týždeň" — aktuálny aj ktorýkoľvek minulý (WeekHistory). */
export interface WeekView {
  /** pondelok tohto týždňa, YYYY-MM-DD */
  mondayIso: string;
  /** ľudský rozsah týždňa, napr. „18. – 24. aug" */
  rangeLabel: string;
  isCurrentWeek: boolean;
  days: WeekDay[];
}

export type PortalWeekResult =
  | { state: "ok"; week: WeekView }
  | { state: "error"; message?: string };

export interface PortalExercise {
  idx: string;
  name: string;
  /** série × opakovania, napr. "4 × 6" */
  scheme: string;
  /** záťaž, napr. "90 kg" alebo "vlastná váha" */
  load: string;
  /** pauza medzi sériami, napr. "150 s" */
  rest: string;
  /** tempo, voliteľné */
  tempo?: string;
  /** entry_id z workout_days.exercises — kľúč pre zápis skutočných hodnôt do workout_logs.entries (Fáza B) */
  entryId: string | null;
  /** plánovaný počet sérií z buildera — koľko riadkov sa predvyplní vo formulári "Ukončiť tréning" */
  plannedSets: number;
  /** plánované opakovania ako placeholder v riadku série, napr. "6" alebo "8-10" */
  plannedReps: string | null;
  /** surové hodnoty pre builder vlastného tréningu (úprava existujúceho plánu) */
  exerciseId: string | null;
  loadKg: number | null;
  restSeconds: number | null;
  /** cvik na čas bez plánovaného času — klient si ho pridal počas tréningu s voľbou „Čas“ */
  timed?: boolean;
  /** superséria — id skupiny (lib/workouts/superset.ts); null = samostatný cvik */
  superset?: string | null;
}

/** Jedna skutočne odcvičená séria — vyplní klient pri "Ukončiť tréning" (Fáza B).
 *  Čas/vzdialenosť/RPE sú voliteľné (lib/workouts/completed.ts). */
export interface LoggedSet {
  reps: number | null;
  weight: number | null;
  durationS?: number | null;
  distanceM?: number | null;
  rpe?: number | null;
}

/** Skutočné hodnoty jedného cviku v rámci workout_logs.entries (Fáza B). */
export interface LoggedExercise {
  entryId: string | null;
  name: string;
  /** poznámka klienta k cviku (0048) */
  note?: string | null;
  /** superséria, v ktorej sa cvik cvičil (plán alebo spojenie počas tréningu) */
  superset?: string | null;
  sets: LoggedSet[];
}

export interface CoachNote {
  /** null keď sa meno trénera nepodarilo zistiť (napr. chýbajúce full_name) — UI
   * má vtedy zobraziť len "Tréner" bez mena, nikdy nie zreťazené "Tréner tréner". */
  trainer: string | null;
  initials: string;
  text: string;
}

/** Najbližší nadchádzajúci termín klienta (appointments, 0026) — karta na Dnes. */
export interface PortalNextAppointment {
  title: string;
  startsAt: string; // ISO timestamptz
}

export interface TodaySession {
  /** training = pripravený ďalší tréning v poradí, done = dnes už odcvičené,
   *  complete = všetky dni plánu odcvičené (plán je jednorazový, dni sa neopakujú) */
  kind: "training" | "done" | "complete";
  title: string;
  focus: string;
  durationLabel: string;
  exercises: PortalExercise[];
  /**
   * Skutočne zadané hodnoty (Fáza B), keď je `kind: "done"` — "vrátiť sa do
   * tréningu" ukazuje toto namiesto `exercises` (plánu), nech klient vidí, čo
   * naozaj zapísal. `null` keď deň ešte nie je hotový, alebo klient nezadal
   * žiadne hodnoty (len odklikol) — vtedy sa použije `exercises` ako fallback.
   */
  loggedExercises: LoggedExercise[] | null;
  /** `kind: "done"` — plán vs. skutočnosť po sériách (farby ako u trénera) */
  compare?: CompletedCompare | null;
  /** `kind: "done"` — čas ukončenia (workout_logs.completed_at, 0048) */
  completedAt?: string | null;
  /** `kind: "done"` — id záznamu a do kedy ho klient smie opraviť (24 h, 0049) */
  logId?: string | null;
  editableUntil?: string | null;
  /** celkové RPE a poznámka klienta k tréningu (workout_logs.rpe / note) */
  sessionRpe?: number | null;
  sessionNote?: string | null;
  /** koľko cvikov je odškrtnutých (0 kým Fáza B nepostaví per-cvik odškrtávanie) */
  completedCount: number;
  /** id workout_day na zápis workout_logs pri "Ukončiť tréning" */
  dayId: string | null;
}

/** Klient je v GDPR grace period (0013_client_deletion.sql) — banner na karte Dnes. */
export interface PortalDeletionNotice {
  requestedBy: "trainer" | "client";
  requestedAt: string; // ISO timestamptz
}

/** Tréner ukončil spoluprácu (0015_client_cooperation_pause.sql) — banner na karte Dnes. */
export interface PortalCooperationNotice {
  endedAt: string; // ISO timestamptz
  /** tréner klienta odstránil z portfólia (0064) — klient už trénera nemá, spolupráca sa neobnoví */
  removed: boolean;
}

export interface PortalData {
  clientFirstName: string;
  today: string; // ISO (YYYY-MM-DD), v zóne Europe/Bratislava
  /** hodina dňa (0-23) pre pozdrav, v zóne Europe/Bratislava */
  hour: number;
  coachNote: CoachNote | null;
  /** ďalší / dnešný tréning aktívneho plánu; null = klient plán nemá (alebo je prázdny) —
   *  Dnes vtedy ukáže prázdnu kartu plánu, prehľad a týždeň ostávajú */
  session: TodaySession | null;
  /** má priradeného trénera — prázdna karta plánu: „plán je na ceste“ vs. „vytvor si vlastný“ */
  hasTrainer: boolean;
  week: WeekView;
  /** série (týždne tréningu, dni zápisu jedla) — pravidlá v lib/portal/streak.ts */
  streaks: PortalStreaks;
  /** null, kým nie je podaná žiadosť o zmazanie klienta (viď DeleteAccountSection na /portal/profil) */
  deletionNotice: PortalDeletionNotice | null;
  /** null, kým tréner neukončil spoluprácu (0020) — na rozdiel od deletionNotice dáta ostávajú */
  cooperationEndedNotice: PortalCooperationNotice | null;
  /** História vlastných meraní (BodyMetricForm), najstaršie prvé — rovnaký tvar ako trénerov graf. */
  bodyMetrics: BodyMetricEntry[];
  /** Najbližší budúci termín (appointments, 0026), null = žiadny naplánovaný. */
  nextAppointment: PortalNextAppointment | null;
  /** Aktívny plán (riadi túto kartu) a všetky zverejnené plány klienta pre prepínač „Zmeniť“;
   *  null = klient nemá žiadny zverejnený plán */
  planChoice: PortalPlanChoice | null;
}

/** Zverejnený plán klienta v prepínači aktívneho plánu na Dnes (PlanSwitchSheet). */
export interface PortalPlanOption {
  id: string;
  name: string;
  source: PlanSource;
  dayCount: number;
}

/** Aktívny plán + zoznam na výber (najnovší prvý) — clients.active_plan_id, inak najnovší (0056). */
export interface PortalPlanChoice {
  activePlanId: string;
  activePlanName: string;
  plans: PortalPlanOption[];
}

/** Výsledok načítania portálu — buď dáta, alebo dôvod prázdneho stavu. */
export type PortalResult =
  | { state: "ok"; data: PortalData }
  | { state: "unlinked"; firstName: string | null }
  | { state: "error"; message?: string };

// ---------- Tréning (zoznam plánov klienta — od trénera aj vlastné) ----------

export interface PortalTrainingDay {
  id: string;
  name: string;
  exercises: PortalExercise[];
  /** klient tento deň už niekedy odcvičil (aspoň 1 záznam vo workout_logs) — badge „Hotovo" v zozname dní */
  done: boolean;
  /** klient tento deň odcvičil DNES */
  doneToday: boolean;
  /** posledný odcvičený záznam dňa — pre "Upraviť hodnoty" (24 h okno, 0049) */
  lastLog: PortalDayLog | null;
}

/** Odcvičený záznam dňa (workout_logs) v sekcii Tréning. */
export interface PortalDayLog {
  id: string;
  completedAt: string | null;
  /** do kedy ho klient smie opraviť; null = už nie */
  editableUntil: string | null;
  entries: LoggedExercise[];
  rpe: number | null;
  note: string | null;
  /** plán vs. skutočnosť po sériách (Tréning → deň Hotovo → Odcvičené) */
  compare: CompletedCompare;
}

/** Zdroj plánu: od trénera, alebo si ho klient vytvoril sám. */
export type PlanSource = "trainer" | "client";

export interface PortalPlan {
  id: string;
  name: string;
  source: PlanSource;
  /** true pre plán, ktorý riadi kartu Dnes (clients.active_plan_id, inak najnovší) */
  isActive: boolean;
  days: PortalTrainingDay[];
}

/** Šablóna z vlastného tréningu klienta (plan_templates, vlastník = klient) — "Použiť" otvorí builder s jej obsahom. */
export interface PortalTemplate {
  id: string;
  name: string;
  days: { name: string; exercises: PortalExercise[] }[];
}

export interface PortalTrainingData {
  plans: PortalPlan[];
  activePlanId: string | null;
  templates: PortalTemplate[];
}

export interface ExerciseOption {
  id: string;
  name: string;
  /** slovenský preklad názvu, ak existuje (Free Exercise DB import) — inak zobraz `name` */
  nameSk: string | null;
  muscleGroup: string | null;
  /** prvý obrázok cviku (miniatúra) — externé URL, Free Exercise DB */
  imageUrl: string | null;
  /** štruktúrovaný filter vybavenia (migrácia 0031) — null = appka ho berie ako "plná posilňovňa". */
  equipment: string | null;
}

export type PortalTrainingResult =
  | { state: "ok"; data: PortalTrainingData }
  | { state: "error"; message?: string };

// ---------- Strava (makro cieľ + jedálniček) ----------

export interface PortalMacroGoal {
  bmr: number;
  tdee: number;
  caloriesTarget: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface PortalMealEntry {
  name: string;
  grams: number;
  /** ako to tréner zadal (0066) — null/chýba = len gramy; zobrazenie: lib/portions.ts formatPortion */
  portionUnit?: PortionUnit | null;
  portionQty?: number | null;
  portionBase?: "g" | "ml" | null;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface PortalMealGroup {
  /** už lokalizovaný label, napr. "Raňajky" */
  slotLabel: string;
  entries: PortalMealEntry[];
}

export interface PortalMealDay {
  id: string;
  name: string;
  groups: PortalMealGroup[];
  totalKcal: number;
}

/** Jedálniček v prepínači aktívneho (Strava) — zverejnený, od trénera alebo vlastný. */
export interface PortalMealPlanOption {
  id: string;
  name: string;
  source: PlanSource;
  dayCount: number;
}

/**
 * Položka jedálnička tak, ako je v `meal_days.meals` (JSONB) — tvar trénerovho
 * `MealEntry` (app/dashboard/jedalnicky/jedalnicek/actions.ts). Vo vlastnom
 * jedálničku klienta môže chýbať `food_id` (offline / online produkt bez riadku
 * v `foods`, rovnako ako v denníku) — názov a makrá nesie snapshot.
 */
export interface MealPlanEntryData {
  entry_id: string;
  food_id: string | null;
  food_name: string;
  meal_slot: MealSlot;
  grams: number;
  portion_unit?: PortionUnit;
  portion_qty?: number;
  portion_base?: "g" | "ml";
  kcal_100g: number;
  protein_100g: number;
  carbs_100g: number;
  fat_100g: number;
}

/** Deň jedálnička pre builder klienta; `id` null = nový (zo šablóny / ešte neuložený). */
export interface EditableMealDay {
  id: string | null;
  name: string;
  meals: MealPlanEntryData[];
}

/** Vlastná šablóna jedálnička klienta (meal_templates, vlastník = klient). */
export interface PortalMealTemplate {
  id: string;
  name: string;
  days: EditableMealDay[];
}

export interface PortalNutritionData {
  macroGoal: PortalMacroGoal | null;
  /** ID aktívneho jedálnička — pre odkaz na PDF export (api/export/meal-plan). */
  mealPlanId: string | null;
  mealPlanName: string | null;
  mealDays: PortalMealDay[];
  /** zverejnené jedálničky klienta, najnovšie prvé — prepínač „Zmeniť“ */
  plans: PortalMealPlanOption[];
  /** od koho je aktívny jedálniček (null = žiadny) */
  activeSource: PlanSource | null;
  /** dni aktívneho jedálnička pre „Upraviť“ — len pri vlastnom (tréner ho upravuje sám) */
  editableDays: EditableMealDay[] | null;
  templates: PortalMealTemplate[];
}

export type PortalNutritionResult =
  | { state: "ok"; data: PortalNutritionData }
  | { state: "unlinked"; firstName: string | null }
  | { state: "error"; message?: string };

// ---------- Denník (čo klient skutočne zjedol dnes) ----------

/** Jedna položka na výber v pridávaní jedla — z knižnice `foods` alebo z trénerovho plánu. */
export interface PortalFoodOption {
  foodId: string | null;
  name: string;
  kcal100g: number;
  protein100g: number;
  carbs100g: number;
  fat100g: number;
  /** skener (0050): pôvod potraviny — pri 'off' karta ukáže „Zdroj: Open Food Facts“ */
  source?: FoodSource;
  barcode?: string | null;
  /** veľkosť porcie v g — predvyplnená gramáž po skene (inak 100 g) */
  servingGrams?: number | null;
  /** základná jednotka na 100: g (predvolene) alebo ml — tekutiny (0066) */
  unitBase?: "g" | "ml";
  /** hmotnosť jedného kusu (ks) — null/chýba = potravina sa po kusoch nezadáva */
  pieceGrams?: number | null;
  /** hmotnosť celého balenia */
  packageGrams?: number | null;
  fiber100g?: number | null;
  sugars100g?: number | null;
  salt100g?: number | null;
}

export type FoodSource = "import" | "off" | "user";

/** Čo o kóde vieme, keď produkt nemáme celý — predvyplní formulár „Založiť potravinu“. */
export interface BarcodePrefill {
  barcode: string;
  name: string | null;
  brand: string | null;
  kcal100g: number | null;
  protein100g: number | null;
  carbs100g: number | null;
  fat100g: number | null;
}

/** Odpoveď GET /api/potraviny/kod/[ean]. */
export type BarcodeLookupResult =
  | { status: "found"; food: PortalFoodOption }
  | { status: "not_found"; food: BarcodePrefill }
  | { status: "invalid" | "error"; error: string };

export interface PortalDiaryEntry {
  id: string;
  slot: MealSlot;
  name: string;
  grams: number;
  /** ako to klient zadal (food_logs.portion_unit/qty, 0066) — null = len gramy */
  portionUnit?: PortionUnit | null;
  portionQty?: number | null;
  portionBase?: "g" | "ml" | null;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface PortalDiaryGroup {
  slot: MealSlot;
  slotLabel: string;
  entries: PortalDiaryEntry[];
  kcal: number;
}

export interface PortalDiaryData {
  today: string; // ISO (YYYY-MM-DD), Europe/Bratislava
  /** zobrazený deň denníka (YYYY-MM-DD) — dnešok alebo deň zvolený cez ?date= */
  date: string;
  goal: PortalMacroGoal | null;
  groups: PortalDiaryGroup[];
  totals: { kcal: number; proteinG: number; carbsG: number; fatG: number };
}

export type PortalDiaryResult =
  | { state: "ok"; data: PortalDiaryData }
  | { state: "unlinked"; firstName: string | null }
  | { state: "error"; message?: string };

// ---------- Chat tréner ↔ klient ----------

export interface PortalChatMessage {
  id: string;
  /** "system" = automatická správa (napr. GDPR zmazanie, 0019), nepatrí ani trénerovi ani klientovi */
  sender: "trainer" | "client" | "system";
  body: string;
  createdAt: string; // ISO
}

export interface PortalChatData {
  messages: PortalChatMessage[];
  /** null keď sa meno trénera nepodarilo zistiť — šablóny majú fallback text bez mena. */
  trainerName: string | null;
}

export type PortalChatResult =
  | { state: "ok"; data: PortalChatData }
  | { state: "unlinked"; firstName: string | null }
  /** klient bez trénera (feature/registracia-update) — chat s trénerom ešte nemá s kým prebiehať */
  | { state: "no_trainer"; firstName: string | null }
  | { state: "error"; message?: string };

// ---------- AI Kouč (AI blok, Krok 4b) ----------

export interface PortalAiChatMessage {
  id: string;
  role: "user" | "assistant";
  body: string;
  createdAt: string; // ISO
  escalated?: boolean;
  /** Cviky, ktoré AI spomenula pri náhrade (migrácia 0057) — klik otvorí detail s fotkami. */
  exerciseRefs?: { id: string; name: string }[];
  /** Overené návrhy výmeny cviku vo vlastnom pláne (tlačidlo "Vymeniť v pláne"). */
  swaps?: { dayId: string; dayName: string; oldId: string; oldName: string; newId: string; newName: string }[];
}

export interface PortalAiChatData {
  messages: PortalAiChatMessage[];
}

export type PortalAiChatResult =
  | { state: "ok"; data: PortalAiChatData }
  | { state: "unlinked"; firstName: string | null }
  /** klient nemá prideleného trénera (self-klient) — AI Kouč zatiaľ funguje len s trénerom priradeným. */
  | { state: "no_trainer" }
  | { state: "error"; message?: string };
