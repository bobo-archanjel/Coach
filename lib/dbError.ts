// FitPilot — bezpečné chybové hlášky z databázy (feature/security).
// Surové `error.message` z Supabase/PostgREST/Postgresu (napr. "new row violates
// row-level security policy for table \"nutrition_profiles\"", "duplicate key value
// violates unique constraint …") prezrádza názvy tabuliek, politík a obmedzení, čo
// pomáha útočníkovi mapovať schému. Používateľ dostane zrozumiteľný text, pôvodná
// chyba ide len do serverového logu.

import { tErr, type ErrorKey } from "@/lib/i18n/serverErrors";

interface DbErrorLike {
  message?: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
}

/** Hlášky, ktoré sme v DB napísali PRE používateľa (trigger flood guardu 0036, zámok
 *  dokončeného tréningu 0048/0049) — v DB sú po slovensky, preto sa tu podľa prefixu
 *  (a pri zámku podľa okna 24 h) vyberie preložený text. */
function friendlyKey(msg: string): ErrorKey | null {
  if (msg.startsWith("rate_limited:")) return "db.rateLimited";
  if (msg.startsWith("locked:")) return /24/.test(msg) ? "db.lockedEditWindow" : "db.locked";
  return null;
}

/** Bezpečná chybová hláška v jazyku používateľa — `return { error: await dbErr(error, "actions") }`. */
export async function dbErr(err: DbErrorLike | null | undefined, context?: string): Promise<string> {
  if (!err) return tErr("db.generic");

  console.error(`${context ?? "db"}: [${err.code ?? "?"}] ${err.message ?? ""}`);

  const friendly = friendlyKey(err.message ?? "");
  if (friendly) return tErr(friendly);

  switch (err.code) {
    case "42501": // insufficient_privilege / RLS
      return tErr("db.forbidden");
    case "23505": // unique_violation
      return tErr("db.duplicate");
    case "23514": // check_violation
    case "22P02": // invalid_text_representation
    case "22003": // numeric_value_out_of_range
    case "22001": // string_data_right_truncation
      return tErr("db.invalidValue");
    case "23503": // foreign_key_violation
      return tErr("db.missingRelated");
    case "PGRST116": // .single() bez riadku
      return tErr("db.notFound");
    default:
      return tErr("db.generic");
  }
}
