// i18n-ignore-file: nálepky tém AI Kouča pre oba jazyky (kľúče sú slovenské hodnoty z DB)
/* Téma správy pre AI Kouča (ai_messages.topic) je v DB uložená ako slovenský kľúč —
   CHECK v 0036 povoľuje len tieto hodnoty (lib/ai/topicClassify.ts). Na zobrazenie
   v Analytike sa tu vyberie nálepka podľa jazyka trénera. */
import type { Locale } from "./locales";

const TOPIC_LABELS: Record<string, Record<Locale, string>> = {
  koleno: { sk: "bolesť/nepohodlie v kolene", cs: "bolest/nepohodlí v koleni" },
  chrbát: { sk: "bolesť chrbta", cs: "bolest zad" },
  rameno: { sk: "bolesť/nepohodlie v ramene", cs: "bolest/nepohodlí v rameni" },
  "členok/členky": { sk: "bolesť v členku", cs: "bolest v kotníku" },
  zápästie: { sk: "bolesť zápästia", cs: "bolest zápěstí" },
  "bedro/bok": { sk: "bolesť bedra/boku", cs: "bolest kyčle/boku" },
  lakeť: { sk: "bolesť lakťa", cs: "bolest lokte" },
  "iné zdravotné": { sk: "iná zdravotná téma", cs: "jiné zdravotní téma" },
  motivácia: { sk: "pokles motivácie", cs: "pokles motivace" },
  "spánok/únava": { sk: "spánok/únava", cs: "spánek/únava" },
  "stres/úzkosť": { sk: "stres/úzkosť", cs: "stres/úzkost" },
  "hlad/chute": { sk: "hlad/chute", cs: "hlad/chutě" },
};

export function aiTopicLabel(topic: string, locale: Locale): string {
  return TOPIC_LABELS[topic]?.[locale] ?? topic;
}
