// FitPilot — bezpečné chybové hlášky z databázy (feature/security).
// Surové `error.message` z Supabase/PostgREST/Postgresu (napr. "new row violates
// row-level security policy for table \"nutrition_profiles\"", "duplicate key value
// violates unique constraint …") prezrádza názvy tabuliek, politík a obmedzení, čo
// pomáha útočníkovi mapovať schému. Používateľ dostane zrozumiteľný text, pôvodná
// chyba ide len do serverového logu.

interface DbErrorLike {
  message?: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
}

/** Text hlášky, ktorý sme v DB napísali PRE používateľa (trigger flood guardu,
 *  zámok dokončeného tréningu 0048). */
const FRIENDLY_PREFIXES = ["rate_limited:", "locked:"];

export function dbErr(err: DbErrorLike | null | undefined, context?: string): string {
  if (!err) return "Nepodarilo sa dokončiť akciu. Skús to prosím znova.";

  console.error(`${context ?? "db"}: [${err.code ?? "?"}] ${err.message ?? ""}`);

  const msg = err.message ?? "";
  const prefix = FRIENDLY_PREFIXES.find((p) => msg.startsWith(p));
  if (prefix) return msg.slice(prefix.length).trim();

  switch (err.code) {
    case "42501": // insufficient_privilege / RLS
      return "Na túto akciu nemáš oprávnenie.";
    case "23505": // unique_violation
      return "Takýto záznam už existuje.";
    case "23514": // check_violation
    case "22P02": // invalid_text_representation
    case "22003": // numeric_value_out_of_range
    case "22001": // string_data_right_truncation
      return "Zadaná hodnota nie je platná.";
    case "23503": // foreign_key_violation
      return "Súvisiaci záznam neexistuje alebo už nie je dostupný.";
    case "PGRST116": // .single() bez riadku
      return "Záznam sa nenašiel.";
    default:
      return "Nepodarilo sa dokončiť akciu. Skús to prosím znova.";
  }
}
