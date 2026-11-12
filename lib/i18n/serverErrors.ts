import "server-only";
import { getTranslations } from "next-intl/server";
import type { MessageKeys, NestedKeyOf } from "next-intl";
import type { Messages } from "@/messages";

type Errors = Messages["errors"];
/** Kľúč chybovej hlášky v messages/<jazyk>/errors.json, napr. "notSignedIn" alebo "db.generic". */
export type ErrorKey = MessageKeys<Errors, NestedKeyOf<Errors>>;

/**
 * Chybová hláška server action v jazyku používateľa (feature/cestina).
 * Použitie: `return { error: await tErr("notSignedIn") }`.
 */
export async function tErr(key: ErrorKey, values?: Record<string, string | number>): Promise<string> {
  const t = await getTranslations("errors");
  return (t as unknown as (k: string, v?: Record<string, string | number>) => string)(key, values);
}
