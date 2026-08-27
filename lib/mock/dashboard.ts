// Mock dáta pre frontend-only dashboard (bez backendu) — nahradiť reálnymi Supabase queries,
// keď bude postavené pridávanie klientov (viď DESIGN.md "Open decisions").

export type ClientStatus = "active" | "late";

export interface MockWorkout {
  day: string;
  date: string; // ISO
  exercises: { idx: string; name: string; load: string; rest: string }[];
}

export interface MockClient {
  id: string;
  name: string;
  goal: string;
  status: ClientStatus;
  lastLogLabel: string;
  memberSince: string; // ISO
  notes: string;
  macros: {
    protein: [number, number];
    carbs: [number, number];
    fat: [number, number];
  };
  recentWorkouts: MockWorkout[];
}

export const mockClients: MockClient[] = [
  {
    id: "jan-n",
    name: "Ján N.",
    goal: "Naberanie svalovej hmoty",
    status: "active",
    lastLogLabel: "posl. log dnes",
    memberSince: "2025-11-03",
    notes: "Bez zdravotných obmedzení. Preferuje tréning 4× týždenne.",
    macros: { protein: [156, 200], carbs: [230, 280], fat: [60, 70] },
    recentWorkouts: [
      {
        day: "Deň A — Push",
        date: "2026-08-26",
        exercises: [
          { idx: "A1", name: "Bench press", load: "4× 8 @ 80 kg", rest: "pauza 120s" },
          { idx: "A2", name: "Tlaky nad hlavu", load: "3× 10 @ 45 kg", rest: "pauza 90s" },
        ],
      },
      {
        day: "Deň B — Pull",
        date: "2026-08-24",
        exercises: [
          { idx: "B1", name: "Zhyby", load: "4× 10", rest: "pauza 90s" },
          { idx: "B2", name: "Veslovanie v predklone", load: "3× 12 @ 60 kg", rest: "pauza 75s" },
        ],
      },
    ],
  },
  {
    id: "lucia-k",
    name: "Lucia K.",
    goal: "Chudnutie",
    status: "late",
    lastLogLabel: "posl. log pred 4d",
    memberSince: "2026-05-12",
    notes: "3× vynechala tréning tento týždeň — poslať pripomienku.",
    macros: { protein: [98, 150], carbs: [90, 180], fat: [40, 55] },
    recentWorkouts: [
      {
        day: "Deň A — Full body",
        date: "2026-08-20",
        exercises: [{ idx: "A1", name: "Drep s činkou", load: "3× 10 @ 40 kg", rest: "pauza 90s" }],
      },
    ],
  },
  {
    id: "peter-s",
    name: "Peter S.",
    goal: "Rehabilitácia kolena",
    status: "active",
    lastLogLabel: "posl. log dnes",
    memberSince: "2026-02-20",
    notes: "Vyhýbať sa hlbokým drepom — fyzioterapeut povolil izolované cviky.",
    macros: { protein: [120, 180], carbs: [160, 220], fat: [55, 65] },
    recentWorkouts: [
      {
        day: "Rehab — dolná časť",
        date: "2026-08-26",
        exercises: [{ idx: "A1", name: "Leg extension", load: "3× 15 @ ľahká záťaž", rest: "pauza 60s" }],
      },
    ],
  },
  {
    id: "zuzana-h",
    name: "Zuzana H.",
    goal: "Naberanie svalovej hmoty",
    status: "active",
    lastLogLabel: "posl. log včera",
    memberSince: "2026-06-01",
    notes: "",
    macros: { protein: [140, 190], carbs: [210, 260], fat: [58, 68] },
    recentWorkouts: [
      {
        day: "Deň C — Legs",
        date: "2026-08-25",
        exercises: [{ idx: "A1", name: "Bulharský drep", load: "3× 12 @ 20 kg", rest: "pauza 75s" }],
      },
    ],
  },
  {
    id: "martin-b",
    name: "Martin B.",
    goal: "Sila — 1RM drep",
    status: "late",
    lastLogLabel: "posl. log pred 6d",
    memberSince: "2025-09-15",
    notes: "Dlhšia pauza kvôli pracovnej vyťaženosti — treba sa ozvať.",
    macros: { protein: [80, 190], carbs: [100, 260], fat: [30, 68] },
    recentWorkouts: [],
  },
  {
    id: "eva-t",
    name: "Eva T.",
    goal: "Kondícia a mobilita",
    status: "active",
    lastLogLabel: "posl. log dnes",
    memberSince: "2026-07-08",
    notes: "",
    macros: { protein: [90, 130], carbs: [140, 190], fat: [45, 55] },
    recentWorkouts: [
      {
        day: "Mobilita + kardio",
        date: "2026-08-27",
        exercises: [{ idx: "A1", name: "Intervalový beh", load: "6× 400 m", rest: "pauza 90s" }],
      },
    ],
  },
];

export function getMockClient(id: string) {
  return mockClients.find((c) => c.id === id) ?? null;
}
