/* Texty appky po jazykoch (feature/cestina). Slovenčina je vzor: typ `Messages` sa
   berie z nej (global.d.ts) a čeština musí mať tie isté kľúče — chýbajúci kľúč je
   chyba v tsc, úplnosť navyše stráži e2e/i18n.spec.ts. Menné priestory = súbory
   messages/<jazyk>/<oblasť>.json. */
import type { Locale } from "@/lib/i18n/locales";

import skCommon from "./sk/common.json";
import skMeta from "./sk/meta.json";
import skLanguage from "./sk/language.json";
import skSettings from "./sk/settings.json";
import skProfile from "./sk/profile.json";

import csCommon from "./cs/common.json";
import csMeta from "./cs/meta.json";
import csLanguage from "./cs/language.json";
import csSettings from "./cs/settings.json";
import csProfile from "./cs/profile.json";

export const sk = {
  common: skCommon,
  meta: skMeta,
  language: skLanguage,
  settings: skSettings,
  profile: skProfile,
};

export type Messages = typeof sk;

export const cs: Messages = {
  common: csCommon,
  meta: csMeta,
  language: csLanguage,
  settings: csSettings,
  profile: csProfile,
};

export const MESSAGES: Record<Locale, Messages> = { sk, cs };
