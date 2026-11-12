/* Automatické správy v chate (sender = 'system') sa do DB zapisujú po slovensky:
   SQL funkcie z migrácií 0019 (zmazanie dát), 0020 (pozastavenie spolupráce), 0032/0036
   („… ťa pridal/-a ako svojho klienta“) a AI upozornenia trénerovi z lib/ai/healthFilter.ts
   (pevné prefixy, ktoré kontrolujú 0036/0046). SQL sa nemení — text sa preloží až pri
   zobrazení, podľa jazyka toho, kto ho číta (aj staré správy). Vzory sa skladajú zo
   slovenských textov v messages/sk/system.json, takže tie musia presne sedieť s DB
   (overuje e2e/i18n.spec.ts). Neznámy text sa zobrazí tak, ako je.

   Čistý modul bez Reactu a next/headers — beží v klientskom ChatThread aj na serveri. */
import { createTranslator } from "next-intl";
import skSystem from "@/messages/sk/system.json";
import csSystem from "@/messages/cs/system.json";
import type { Locale } from "./locales";

type SystemMessages = typeof skSystem;
type MessageKey = Exclude<keyof SystemMessages, "trainerFallback">;

const SYSTEM: Record<Locale, SystemMessages> = { sk: skSystem, cs: csSystem };

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Slovenská šablóna → regex nad textom z DB; {parametre} sa zachytia ako skupiny. */
const PATTERNS = (Object.keys(skSystem) as (keyof SystemMessages)[])
  .filter((key): key is MessageKey => key !== "trainerFallback")
  .map((key) => {
    const params: string[] = [];
    const source = skSystem[key]
      .split(/(\{\w+\})/)
      .map((part) => {
        const param = /^\{(\w+)\}$/.exec(part);
        if (!param) return escapeRegExp(part);
        params.push(param[1]);
        return "([\\s\\S]+?)";
      })
      .join("");
    return { key, params, re: new RegExp(`^${source}$`) };
  });

/** Text systémovej správy v jazyku čitateľa; neznámy text (napr. budúca správa) ostane bez zmeny. */
export function localizeSystemMessage(body: string, locale: Locale): string {
  if (locale === "sk") return body;
  const text = body.trim();
  for (const { key, params, re } of PATTERNS) {
    const match = re.exec(text);
    if (!match) continue;
    const values: Record<string, string> = {};
    params.forEach((name, i) => {
      values[name] = match[i + 1];
    });
    // náhradné meno trénera zo SQL (coalesce(…, 'Tréner')) sa tiež prekladá
    if (values.name === skSystem.trainerFallback) values.name = SYSTEM[locale].trainerFallback;
    const t = createTranslator({ locale, messages: { system: SYSTEM[locale] }, namespace: "system" });
    return (t as unknown as (k: string, v: Record<string, string>) => string)(key, values);
  }
  return body;
}
