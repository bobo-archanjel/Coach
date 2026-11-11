// i18n-ignore-file: preklad hodnôt svalových partií z DB (slovenské kľúče → čeština)
/* Svalová partia cviku (exercises.muscle_group) je v DB uložená po slovensky — hodnoty
   z importu knižnice (scripts/import-exercises.mjs MUSCLE_SK) slúžia aj ako kľúče filtrov
   (lib/exerciseFilters.ts). Na zobrazenie v češtine ich tu preložíme; vlastné partie,
   ktoré tréner napísal sám, sa ukážu tak, ako ich zadal. */
import type { Locale } from "./locales";

const MUSCLE_CS: Record<string, string> = {
  brucho: "břicho",
  "abduktory (vonkajšie stehná)": "abduktory (vnější stehna)",
  "adduktory (vnútorné stehná)": "adduktory (vnitřní stehna)",
  biceps: "biceps",
  lýtka: "lýtka",
  hrudník: "hrudník",
  predlaktia: "předloktí",
  zadok: "hýždě",
  "zadné stehná": "zadní stehna",
  "chrbát (širák)": "záda (široký sval zádový)",
  "spodný chrbát": "spodní záda",
  "stredný chrbát": "střední záda",
  krk: "krk",
  "stehná (kvadriceps)": "stehna (kvadriceps)",
  ramená: "ramena",
  trapézy: "trapézy",
  triceps: "triceps",
};

export function muscleGroupLabel(raw: string | null | undefined, locale: Locale): string {
  if (!raw) return "";
  if (locale !== "cs") return raw;
  return MUSCLE_CS[raw.trim().toLowerCase()] ?? raw;
}
