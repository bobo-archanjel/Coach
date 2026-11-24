// i18n-ignore-file: testy pokročilých reportov — čisté funkcie bez siete a bez DB
import { test, expect } from "@playwright/test";
import {
  aggregateFoodDaily,
  assessRisk,
  compareSeries,
  countDistinctDays,
  dropWindows,
  epley1RM,
  monthlyCooperations,
  nutritionSummary,
  strengthSeries,
  strengthValueSeries,
  trainingSummary,
  weeklyActivity,
  weeklyTarget,
  weeklyTrainingAdherence,
} from "../lib/reports/aggregate";
import { buildCsv, csvCell, CSV_BOM, safeFileName } from "../lib/reports/csv";
import { addDaysIso, lastMonths, monthRange, parsePeriod, periodRange, previousMonth, weekStartOf, weekStartsBetween } from "../lib/reports/period";
import { reportsUnlocked } from "../lib/reports/access";
import { computeBilling, type SubscriptionRow } from "../lib/billing/entitlements";
import { computeTrainingStreak } from "../lib/portal/streak";
import { PDFDocument } from "pdf-lib";
import { generateClientReportPdf } from "../lib/pdf/clientReport";
import type { ClientReport } from "../lib/reports/types";

/** Pokročilé reporty: agregácie, obdobia, CSV a prístup podľa tarify. */

// streda 2026-11-25 → týždeň začína v pondelok 2026-11-23
const TODAY = "2026-11-25";

test.describe("obdobia a mesiace", () => {
  test("pondelok týždňa a týždne v rozsahu", () => {
    expect(weekStartOf("2026-11-25")).toBe("2026-11-23");
    expect(weekStartOf("2026-11-29")).toBe("2026-11-23"); // nedeľa patrí do týždňa pondelka
    expect(weekStartOf("2026-11-23")).toBe("2026-11-23");
    expect(weekStartsBetween("2026-11-01", "2026-11-30")).toEqual(["2026-10-26", "2026-11-02", "2026-11-09", "2026-11-16", "2026-11-23", "2026-11-30"]);
  });

  test("obdobie 4/12/26 týždňov končí dnes a začína pondelkom", () => {
    const r4 = periodRange("4", TODAY);
    expect(r4.from).toBe("2026-11-02");
    expect(r4.to).toBe(TODAY);
    expect(r4.weeks).toHaveLength(4);
    expect(periodRange("12", TODAY).weeks).toHaveLength(12);
    expect(periodRange("26", TODAY).weeks).toHaveLength(26);
  });

  test("celá história: od najstaršieho záznamu, najviac 52 týždňov", () => {
    expect(periodRange("all", TODAY, "2026-10-14").from).toBe("2026-10-12");
    const capped = periodRange("all", TODAY, "2020-01-01");
    expect(capped.weeks).toHaveLength(52);
    expect(periodRange("all", TODAY, null).weeks).toHaveLength(52);
  });

  test("parsePeriod odmietne neznáme hodnoty", () => {
    expect(parsePeriod("26")).toBe("26");
    expect(parsePeriod("all")).toBe("all");
    expect(parsePeriod("999")).toBe("12");
    expect(parsePeriod(undefined)).toBe("12");
  });

  test("monthRange: celý mesiac, prebiehajúci končí dnes, budúcnosť a nezmysly sú null", () => {
    const oct = monthRange("2026-10", TODAY)!;
    expect(oct.from).toBe("2026-10-01");
    expect(oct.to).toBe("2026-10-31");
    expect(oct.days).toBe(31);
    const nov = monthRange("2026-11", TODAY)!;
    expect(nov.to).toBe(TODAY);
    expect(nov.days).toBe(25);
    expect(monthRange("2026-12", TODAY)).toBeNull();
    expect(monthRange("2026-13", TODAY)).toBeNull();
    expect(monthRange("abc", TODAY)).toBeNull();
    expect(monthRange("2026-1", TODAY)).toBeNull();
    // priestupný rok
    expect(monthRange("2024-02", "2026-11-25")!.days).toBe(29);
  });

  test("previousMonth a lastMonths cez hranicu roka", () => {
    expect(previousMonth("2026-01")).toBe("2025-12");
    expect(previousMonth("2026-11")).toBe("2026-10");
    expect(lastMonths("2026-02-10", 4)).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });
});

test.describe("sila: odhad 1RM a krivka", () => {
  test("Epley: 1 opakovanie = váha, inak váha × (1 + reps/30)", () => {
    expect(epley1RM(100, 1)).toBe(100);
    expect(epley1RM(100, 5)).toBe(116.7);
    expect(epley1RM(80, 10)).toBe(106.7);
  });

  test("Epley: neplatné vstupy a viac ako 12 opakovaní dajú null", () => {
    expect(epley1RM(0, 5)).toBeNull();
    expect(epley1RM(-20, 5)).toBeNull();
    expect(epley1RM(50, 0)).toBeNull();
    expect(epley1RM(50, 13)).toBeNull();
    expect(epley1RM(null, 5)).toBeNull();
    expect(epley1RM(50, null)).toBeNull();
  });

  test("strengthSeries: najťažšia séria a najvyšší 1RM za deň, jeden bod na deň a cvik", () => {
    const rows = [
      {
        performed_on: "2026-11-02",
        entries: [
          { name: "Drep", sets: [{ reps: 8, weight: 80 }, { reps: 5, weight: 100 }, { reps: 12, weight: 70 }] },
          { name: "Plank", sets: [{ reps: 1, weight: null }] },
        ],
      },
      { performed_on: "2026-11-09", entries: [{ name: "Drep", sets: [{ reps: 5, weight: 105 }] }] },
      // ten istý cvik dvakrát v jednom dni (duplicita knižnice) — ostane lepší
      {
        performed_on: "2026-11-16",
        entries: [
          { name: "Drep", sets: [{ reps: 5, weight: 100 }] },
          { name: "Drep", sets: [{ reps: 3, weight: 110 }] },
        ],
      },
    ];
    const s = strengthSeries(rows, (_r, e) => e.name ?? null);
    expect(Object.keys(s)).toEqual(["Drep"]); // Plank bez váhy sa preskočí
    expect(s.Drep).toHaveLength(3);
    expect(s.Drep[0]).toEqual({ date: "2026-11-02", bestWeightKg: 100, reps: 5, e1rm: 116.7 });
    expect(s.Drep[1].e1rm).toBe(122.5);
    expect(s.Drep[2].bestWeightKg).toBe(110);
    expect(s.Drep[2].e1rm).toBe(121);
  });

  test("strengthSeries: séria nad 12 opakovaní nemá 1RM, rad padá späť na pracovnú váhu", () => {
    const s = strengthSeries([{ performed_on: "2026-11-02", entries: [{ name: "Výpady", sets: [{ reps: 20, weight: 30 }] }] }], (_r, e) => e.name ?? null);
    expect(s["Výpady"][0].e1rm).toBeNull();
    expect(strengthValueSeries(s["Výpady"])).toEqual([{ date: "2026-11-02", value: 30 }]);
  });

  test("compareSeries: začiatok vs. koniec, zmena a percento; pod 2 bodmi null", () => {
    expect(compareSeries([{ date: "2026-11-01", value: 80 }])).toBeNull();
    expect(compareSeries([])).toBeNull();
    const c = compareSeries([
      { date: "2026-10-01", value: 82.4 },
      { date: "2026-10-15", value: 90 },
      { date: "2026-11-01", value: 80.1 },
    ])!;
    expect(c.start).toBe(82.4);
    expect(c.end).toBe(80.1);
    expect(c.delta).toBe(-2.3);
    expect(c.pct).toBe(-2.8);
    expect(compareSeries([{ date: "a", value: 0 }, { date: "b", value: 5 }])!.pct).toBeNull();
  });
});

test.describe("adherencia tréningu", () => {
  const weeks = ["2026-11-02", "2026-11-09", "2026-11-16", "2026-11-23"];

  test("týždenné splnenie: odlišné dni, strop 100 %, prebiehajúci týždeň", () => {
    const dates = [
      "2026-11-02", "2026-11-04", "2026-11-06", // týždeň 1: 3 dni
      "2026-11-10", // týždeň 2: 1 deň
      "2026-11-16", "2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", // týždeň 3: 5 odlišných dní (jeden duplicitný)
      "2026-11-24", // týždeň 4 (prebieha): 1
    ];
    const w = weeklyTrainingAdherence(dates, weeks, 3, TODAY);
    expect(w.map((x) => x.sessions)).toEqual([3, 1, 5, 1]);
    expect(w.map((x) => x.pct)).toEqual([100, 33, 100, 33]);
    expect(w.map((x) => x.met)).toEqual([true, false, true, false]);
    expect(w.map((x) => x.current)).toEqual([false, false, false, true]);
  });

  test("súhrn berie ukončené týždne; prebiehajúci len ak je jediný", () => {
    const w = weeklyTrainingAdherence(["2026-11-02", "2026-11-04", "2026-11-10", "2026-11-24"], weeks, 2, TODAY);
    const s = trainingSummary(w);
    expect(s.pct).toBe(50); // (100 + 50 + 0) / 3, prebiehajúci týždeň mimo
    expect(s.weeksMet).toBe(1);
    expect(s.weeksCounted).toBe(3);
    expect(s.sessions).toBe(4);
    const only = trainingSummary(weeklyTrainingAdherence(["2026-11-24"], ["2026-11-23"], 2, TODAY));
    expect(only.weeksCounted).toBe(1);
    expect(only.pct).toBe(50);
    expect(trainingSummary([]).pct).toBeNull();
  });

  test("cieľ týždňa z dní plánu: 1–7, bez plánu predvolený", () => {
    expect(weeklyTarget(4, 2)).toBe(4);
    expect(weeklyTarget(0, 2)).toBe(2);
    expect(weeklyTarget(null, 2)).toBe(2);
    expect(weeklyTarget(12, 2)).toBe(7);
    // cieľ 0 sa nikdy nedelí nulou
    expect(weeklyTrainingAdherence(["2026-11-24"], ["2026-11-23"], 0, TODAY)[0].target).toBe(1);
  });

  test("séria týždňov znovupoužíva pravidlá portálu (tolerancia jedného vynechania)", () => {
    // 3 splnené týždne v rade, minulý týždeň vynechaný, tento ešte otvorený
    const dates = ["2026-10-26", "2026-10-28", "2026-11-02", "2026-11-04", "2026-11-09", "2026-11-11"];
    const st = computeTrainingStreak(dates, "2026-11-25", 2);
    expect(st.count).toBe(3);
  });
});

test.describe("adherencia stravy", () => {
  const rows = [
    // 2026-11-02: 2000 kcal, 100 g bielkovín
    { eaten_on: "2026-11-02", grams: 200, kcal_100g: 500, protein_100g: 25 },
    { eaten_on: "2026-11-02", grams: 100, kcal_100g: 1000, protein_100g: 50 },
    // 2026-11-03: 2150 kcal (7,5 % nad)
    { eaten_on: "2026-11-03", grams: 100, kcal_100g: 2150, protein_100g: 80 },
    // 2026-11-04: 1500 kcal (25 % pod)
    { eaten_on: "2026-11-04", grams: 100, kcal_100g: 1500, protein_100g: 60 },
    // mimo rozsahu
    { eaten_on: "2026-12-01", grams: 100, kcal_100g: 2000, protein_100g: 50 },
  ];

  test("denné súčty kcal a bielkovín", () => {
    const d = aggregateFoodDaily(rows);
    expect(d.get("2026-11-02")).toEqual({ kcal: 2000, protein: 100 });
    expect(d.size).toBe(4);
  });

  test("súhrn: dni so zápisom, priemer, dni v ±10 % cieľa, % cieľa", () => {
    const s = nutritionSummary(aggregateFoodDaily(rows), { from: "2026-11-01", to: "2026-11-07" }, { kcal: 2000, protein: 100 });
    expect(s.daysTotal).toBe(7);
    expect(s.daysLogged).toBe(3);
    expect(s.loggedPct).toBe(43);
    expect(s.avgKcal).toBe(1883); // (2000 + 2150 + 1500) / 3
    expect(s.avgKcalPct).toBe(94);
    expect(s.daysWithin).toBe(2); // 2000 a 2150, nie 1500
    expect(s.withinPct).toBe(67);
    expect(s.avgProtein).toBe(80);
    expect(s.avgProteinPct).toBe(80);
  });

  test("hranica ±10 % je vrátane", () => {
    const d = aggregateFoodDaily([
      { eaten_on: "2026-11-02", grams: 100, kcal_100g: 2200, protein_100g: 0 }, // +10 %
      { eaten_on: "2026-11-03", grams: 100, kcal_100g: 1800, protein_100g: 0 }, // −10 %
      { eaten_on: "2026-11-04", grams: 100, kcal_100g: 2201, protein_100g: 0 }, // tesne mimo
    ]);
    expect(nutritionSummary(d, { from: "2026-11-01", to: "2026-11-07" }, { kcal: 2000, protein: null }).daysWithin).toBe(2);
  });

  test("bez cieľa a bez záznamov: žiadne percentá, žiadne delenie nulou", () => {
    const noGoal = nutritionSummary(aggregateFoodDaily(rows), { from: "2026-11-01", to: "2026-11-07" }, { kcal: null, protein: null });
    expect(noGoal.hasGoal).toBe(false);
    expect(noGoal.withinPct).toBeNull();
    expect(noGoal.avgKcalPct).toBeNull();
    expect(noGoal.daysLogged).toBe(3);
    const empty = nutritionSummary(new Map(), { from: "2026-11-01", to: "2026-11-07" }, { kcal: 2000, protein: 100 });
    expect(empty.daysLogged).toBe(0);
    expect(empty.avgKcal).toBeNull();
    expect(empty.withinPct).toBeNull();
  });
});

test.describe("riziko klienta", () => {
  const base = { today: TODAY, lastWorkoutOn: null, lastFoodOn: null, pairedOn: "2026-01-01", recentSessions: 0, previousSessions: 0 };

  test("7+ dní bez tréningu aj jedla = v riziku; 6 dní nie", () => {
    expect(assessRisk({ ...base, lastWorkoutOn: "2026-11-18", lastFoodOn: "2026-11-17" })).toMatchObject({ atRisk: true, reasons: ["inactive"], daysInactive: 7 });
    expect(assessRisk({ ...base, lastWorkoutOn: "2026-11-19", lastFoodOn: "2026-11-10" }).atRisk).toBe(false);
  });

  test("zápis jedla stačí na aktivitu (aj bez tréningu)", () => {
    expect(assessRisk({ ...base, lastWorkoutOn: "2026-10-01", lastFoodOn: "2026-11-24" }).atRisk).toBe(false);
  });

  test("nový klient: počíta sa od spárovania, nie od nuly", () => {
    expect(assessRisk({ ...base, pairedOn: "2026-11-22" }).atRisk).toBe(false);
    expect(assessRisk({ ...base, pairedOn: "2026-11-10" }).atRisk).toBe(true);
    // bez akéhokoľvek dátumu sa riziko neurčuje
    expect(assessRisk({ ...base, pairedOn: null })).toMatchObject({ atRisk: false, daysInactive: null });
  });

  test("pokles tréningov pod polovicu predošlých 14 dní", () => {
    const active = { ...base, lastWorkoutOn: "2026-11-24", lastFoodOn: "2026-11-24" };
    expect(assessRisk({ ...active, recentSessions: 1, previousSessions: 4 })).toMatchObject({ atRisk: true, reasons: ["trainingDrop"] });
    expect(assessRisk({ ...active, recentSessions: 2, previousSessions: 4 }).atRisk).toBe(false); // presne polovica
    expect(assessRisk({ ...active, recentSessions: 0, previousSessions: 1 }).atRisk).toBe(false); // málo dát
  });

  test("nízka celková adherencia pridá dôvod", () => {
    const r = assessRisk({ ...base, lastWorkoutOn: "2026-11-24", lowAdherence: true });
    expect(r.reasons).toEqual(["lowAdherence"]);
  });

  test("okná poklesu a počet odlišných dní", () => {
    const w = dropWindows(TODAY);
    expect(w.recent).toEqual({ from: "2026-11-12", to: TODAY });
    expect(w.previous).toEqual({ from: "2026-10-29", to: "2026-11-11" });
    expect(countDistinctDays(["2026-11-12", "2026-11-12", "2026-11-13", "2026-11-11"], w.recent.from, w.recent.to)).toBe(2);
  });
});

test.describe("portfólio", () => {
  test("nové a ukončené spolupráce po mesiacoch", () => {
    const months = ["2026-09", "2026-10", "2026-11"];
    const m = monthlyCooperations(
      [
        { paired_at: "2026-09-03T10:00:00Z", ended_at: null },
        { paired_at: "2026-10-01T00:00:00Z", ended_at: "2026-11-05T00:00:00Z" },
        { paired_at: "2026-10-20T00:00:00Z", ended_at: null },
        { paired_at: "2025-01-01T00:00:00Z", ended_at: "2026-10-30T00:00:00Z" }, // začiatok mimo okna
        { paired_at: null, ended_at: null },
      ],
      months,
    );
    expect(m).toEqual([
      { month: "2026-09", started: 1, ended: 0 },
      { month: "2026-10", started: 2, ended: 1 },
      { month: "2026-11", started: 0, ended: 1 },
    ]);
  });

  test("aktivita po týždňoch: tréningy (klient × deň) a počet cvičiacich", () => {
    const logs = [
      { client_id: "a", performed_on: "2026-11-02" },
      { client_id: "a", performed_on: "2026-11-02" }, // duplicitný záznam toho istého dňa
      { client_id: "a", performed_on: "2026-11-04" },
      { client_id: "b", performed_on: "2026-11-03" },
      { client_id: "b", performed_on: "2026-11-10" },
    ];
    const w = weeklyActivity(logs, ["2026-11-02", "2026-11-09", "2026-11-16"]);
    expect(w).toEqual([
      { weekStart: "2026-11-02", workouts: 3, trainedClients: 2 },
      { weekStart: "2026-11-09", workouts: 1, trainedClients: 1 },
      { weekStart: "2026-11-16", workouts: 0, trainedClients: 0 },
    ]);
  });

  test("addDaysIso cez hranicu mesiaca a roka", () => {
    expect(addDaysIso("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysIso("2026-03-01", -1)).toBe("2026-02-28");
  });
});

test.describe("CSV: bezpečnosť a formát", () => {
  test("bunky začínajúce = + - @ dostanú apostrof (formula injection)", () => {
    expect(csvCell("=SUM(A1:A9)")).toBe("'=SUM(A1:A9)");
    expect(csvCell("+421900123456")).toBe("'+421900123456");
    expect(csvCell("-2+3")).toBe("'-2+3");
    expect(csvCell("@cmd")).toBe("'@cmd");
    expect(csvCell("	=1+1")).toBe("'	=1+1");
    expect(csvCell("=HYPERLINK(\"http://x\";\"y\")")).toBe("\"'=HYPERLINK(\"\"http://x\"\";\"\"y\"\")\"");
  });

  test("bežný text zostane, špeciálne znaky sa uzavrú do úvodzoviek", () => {
    expect(csvCell("Ľubica Šťastná")).toBe("Ľubica Šťastná");
    expect(csvCell("a;b")).toBe("\"a;b\"");
    expect(csvCell("riadok\nzalomenie")).toBe("\"riadok\nzalomenie\"");
    expect(csvCell("povedal \"ahoj\"")).toBe("\"povedal \"\"ahoj\"\"\"");
    expect(csvCell(" medzera na kraji ")).toBe("\" medzera na kraji \"");
  });

  test("čísla sa píšu s desatinnou čiarkou a záporné číslo nie je vzorec; null je prázdne", () => {
    expect(csvCell(-2.3)).toBe("-2,3");
    expect(csvCell(80.1)).toBe("80,1");
    expect(csvCell(0)).toBe("0");
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
    expect(csvCell(Number.NaN)).toBe("");
    expect(csvCell(true)).toBe("1");
  });

  test("dokument: UTF-8 BOM, oddeľovač ; a CRLF", () => {
    const csv = buildCsv([["Klient", "Váha"], ["=evil", 80.5]]);
    expect(csv.startsWith(CSV_BOM)).toBe(true);
    expect(csv).toBe(`${CSV_BOM}Klient;Váha\r\n'=evil;80,5\r\n`);
  });

  test("názov súboru bez diakritiky a špeciálnych znakov", () => {
    expect(safeFileName("Ľubica Šťastná", "klient")).toBe("Lubica-Stastna");
    expect(safeFileName("../../etc/passwd", "klient")).toBe("etcpasswd");
    expect(safeFileName("😀", "klient")).toBe("klient");
    expect(safeFileName("a\"b\r\nc.csv", "klient")).toBe("abccsv");
  });
});

test.describe("prístup podľa tarify", () => {
  const NOW = new Date("2026-12-01T12:00:00Z");
  const DAY = 86_400_000;
  const row = (over: Partial<SubscriptionRow>): SubscriptionRow => ({
    trainer_id: "t",
    stripe_customer_id: null,
    stripe_subscription_id: null,
    tier: "pro",
    status: "active",
    trial_ends_at: null,
    current_period_end: null,
    cancel_at_period_end: false,
    past_due_since: null,
    comped: false,
    client_limit: null,
    scheduled_tier: null,
    scheduled_client_limit: null,
    scheduled_change_at: null,
    ...over,
  });
  const access = (r: SubscriptionRow | null, clients = 3) => reportsUnlocked(computeBilling(r, clients, NOW));

  test("Pro a Business odomknuté, Starter a skúška zamknuté", () => {
    expect(access(row({ tier: "pro" }))).toBe(true);
    expect(access(row({ tier: "business" }))).toBe(true);
    expect(access(row({ tier: "starter" }))).toBe(false);
    expect(access(row({ tier: "starter", status: "app_trial", trial_ends_at: new Date(NOW.getTime() + 5 * DAY).toISOString() }))).toBe(false);
  });

  test("bez prístupu (skúška skončila, zrušené, žiadny riadok) je zamknuté", () => {
    expect(access(null)).toBe(false);
    expect(access(row({ tier: "pro", status: "canceled" }))).toBe(false);
    expect(access(row({ tier: "pro", status: "past_due", past_due_since: new Date(NOW.getTime() - 20 * DAY).toISOString() }))).toBe(false);
  });

  test("read-only nad limitom klientov: tarifa Pro reporty zachová (čítanie je povolené)", () => {
    const state = computeBilling(row({ tier: "pro", client_limit: 5 }), 9, NOW);
    expect(state.readOnly).toBe(true);
    expect(state.features.advancedReports).toBe(false); // funkcie sú pri read-only vypnuté (AI, zápis)…
    expect(reportsUnlocked(state)).toBe(true); // …ale reporty sú len na čítanie
    // Starter nad limitom reporty nedostane
    expect(reportsUnlocked(computeBilling(row({ tier: "starter", client_limit: 5 }), 9, NOW))).toBe(false);
  });

  test("odklad po zlyhanej platbe: reporty ostanú do vypršania odkladu", () => {
    expect(access(row({ tier: "pro", status: "past_due", past_due_since: new Date(NOW.getTime() - 3 * DAY).toISOString() }))).toBe(true);
  });
});

test.describe("mesačný report PDF (bez servera)", () => {
  const emptyMeasures = { weight: [], waist: [], chest: [], hips: [], arm: [], thigh: [] };
  const noCmp = { weight: null, waist: null, chest: null, hips: null, arm: null, thigh: null };
  const baseReport = (over: Partial<ClientReport>): ClientReport => ({
    clientId: "c",
    clientName: "Ľubica Šťastná",
    period: "month",
    from: "2026-10-01",
    to: "2026-10-31",
    today: TODAY,
    measures: emptyMeasures,
    comparisons: noCmp,
    strength: [],
    training: { weeks: [], summary: { pct: null, sessions: 0, weeksMet: 0, weeksCounted: 0 }, weeklyTarget: 2, hasPlan: false, streakWeeks: 0, lastWorkoutOn: null },
    nutrition: { ...nutritionSummary(new Map(), { from: "2026-10-01", to: "2026-10-31" }, { kcal: null, protein: null }), weekly: [], daily: [] },
    lastFoodOn: null,
    risk: { atRisk: false, reasons: [], daysInactive: null },
    ...over,
  });

  test("klient bez dát: platné PDF (prázdne stavy), SK aj CS", async () => {
    for (const locale of ["sk", "cs"] as const) {
      const bytes = await generateClientReportPdf({ report: baseReport({}), month: "2026-10" }, locale);
      expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThanOrEqual(1);
    }
  });

  test("klient s dátami: grafy váhy, týždňov a stravy, sila, miery, riziko", async () => {
    const weight = Array.from({ length: 8 }, (_, i) => ({ date: addDaysIso("2026-10-01", i * 4), value: 82 - i * 0.4 }));
    const weeks = weeklyTrainingAdherence(["2026-10-01", "2026-10-03", "2026-10-08", "2026-10-15", "2026-10-16", "2026-10-22"], weekStartsBetween("2026-10-01", "2026-10-31"), 2, TODAY);
    const daily = Array.from({ length: 25 }, (_, i) => ({ date: addDaysIso("2026-10-01", i), kcal: 1800 + (i % 5) * 120, protein: 110 }));
    const report = baseReport({
      measures: { ...emptyMeasures, weight, waist: [{ date: "2026-10-01", value: 90 }, { date: "2026-10-30", value: 88.5 }] },
      comparisons: { ...noCmp, weight: compareSeries(weight), waist: compareSeries([{ date: "2026-10-01", value: 90 }, { date: "2026-10-30", value: 88.5 }]) },
      strength: [
        { name: "Drep s veľkou činkou — dlhý názov cviku, ktorý sa musí skrátiť, aby sa zmestil do stĺpca", points: [], comparison: compareSeries([{ date: "2026-10-01", value: 100 }, { date: "2026-10-29", value: 112.5 }]), bestWeightKg: 100 },
      ],
      training: { weeks, summary: trainingSummary(weeks), weeklyTarget: 2, hasPlan: true, streakWeeks: 3, lastWorkoutOn: "2026-10-22" },
      nutrition: { ...nutritionSummary(new Map(daily.map((d) => [d.date, { kcal: d.kcal, protein: d.protein }])), { from: "2026-10-01", to: "2026-10-31" }, { kcal: 2000, protein: 120 }), weekly: [], daily },
      risk: { atRisk: true, reasons: ["inactive", "trainingDrop"], daysInactive: 9 },
    });
    const bytes = await generateClientReportPdf({ report, month: "2026-10" }, "sk");
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThanOrEqual(1);
  });
});
