// i18n-ignore-file: tabuľky dní a mesiacov pre oba jazyky (nie text v jednom jazyku)
/* Ručné tabuľky dní a mesiacov (feature/cestina). Intl vracia v rôznych prostrediach
   rozdielny text (napr. ICU servera vs. Safari: „utorok 22. septembra“ vs. „utorok,
   22. septembra“) a popisky sa vykresľujú na serveri aj v prehliadači — musia vyjsť
   rovnako, inak React hlási hydration mismatch. Z Intl sa preto berú len čísla. */
import type { Locale } from "./locales";

/** Celé názvy dní podľa skratky z Intl en-US („Mon“…). */
export const WEEKDAY_LONG: Record<Locale, Record<string, string>> = {
  sk: { Mon: "pondelok", Tue: "utorok", Wed: "streda", Thu: "štvrtok", Fri: "piatok", Sat: "sobota", Sun: "nedeľa" },
  cs: { Mon: "pondělí", Tue: "úterý", Wed: "středa", Thu: "čtvrtek", Fri: "pátek", Sat: "sobota", Sun: "neděle" },
};

/** Krátke názvy dní, pondelok prvý (týždenné prehľady). */
export const WEEKDAY_SHORT: Record<Locale, readonly string[]> = {
  sk: ["Po", "Ut", "St", "Št", "Pi", "So", "Ne"],
  cs: ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"],
};

/** Mesiace v 2. páde („22. septembra“ / „22. září“). */
export const MONTH_GENITIVE: Record<Locale, readonly string[]> = {
  sk: ["januára", "februára", "marca", "apríla", "mája", "júna", "júla", "augusta", "septembra", "októbra", "novembra", "decembra"],
  cs: ["ledna", "února", "března", "dubna", "května", "června", "července", "srpna", "září", "října", "listopadu", "prosince"],
};
