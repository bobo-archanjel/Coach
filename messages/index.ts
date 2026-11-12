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
import skLanding from "./sk/landing.json";
import skTheme from "./sk/theme.json";
import skPassword from "./sk/password.json";
import skAuth from "./sk/auth.json";
import skNav from "./sk/nav.json";
import skBell from "./sk/bell.json";
import skTour from "./sk/tour.json";
import skComponents from "./sk/components.json";
import skChat from "./sk/chat.json";
import skFood from "./sk/food.json";
import skErrors from "./sk/errors.json";
import skClients from "./sk/clients.json";
import skClientDetail from "./sk/clientDetail.json";
import skLabels from "./sk/labels.json";
import skPlans from "./sk/plans.json";
import skMealPlans from "./sk/mealPlans.json";
import skCalendar from "./sk/calendar.json";
import skTemplates from "./sk/templates.json";
import skInbox from "./sk/inbox.json";
import skAnalytics from "./sk/analytics.json";
import skToday from "./sk/today.json";
import skPortalData from "./sk/portalData.json";
import skStopwatch from "./sk/stopwatch.json";
import skWorkout from "./sk/workout.json";
import skClientBuilder from "./sk/clientBuilder.json";
import skTraining from "./sk/training.json";
import skPortal from "./sk/portal.json";
import skPdf from "./sk/pdf.json";
import skAi from "./sk/ai.json";
import skSystem from "./sk/system.json";
import skLegal from "./sk/legal.json";

import csCommon from "./cs/common.json";
import csMeta from "./cs/meta.json";
import csLanguage from "./cs/language.json";
import csSettings from "./cs/settings.json";
import csProfile from "./cs/profile.json";
import csLanding from "./cs/landing.json";
import csTheme from "./cs/theme.json";
import csPassword from "./cs/password.json";
import csAuth from "./cs/auth.json";
import csNav from "./cs/nav.json";
import csBell from "./cs/bell.json";
import csTour from "./cs/tour.json";
import csComponents from "./cs/components.json";
import csChat from "./cs/chat.json";
import csFood from "./cs/food.json";
import csErrors from "./cs/errors.json";
import csClients from "./cs/clients.json";
import csClientDetail from "./cs/clientDetail.json";
import csLabels from "./cs/labels.json";
import csPlans from "./cs/plans.json";
import csMealPlans from "./cs/mealPlans.json";
import csCalendar from "./cs/calendar.json";
import csTemplates from "./cs/templates.json";
import csInbox from "./cs/inbox.json";
import csAnalytics from "./cs/analytics.json";
import csToday from "./cs/today.json";
import csPortalData from "./cs/portalData.json";
import csStopwatch from "./cs/stopwatch.json";
import csWorkout from "./cs/workout.json";
import csClientBuilder from "./cs/clientBuilder.json";
import csTraining from "./cs/training.json";
import csPortal from "./cs/portal.json";
import csPdf from "./cs/pdf.json";
import csAi from "./cs/ai.json";
import csSystem from "./cs/system.json";
import csLegal from "./cs/legal.json";

export const sk = {
  common: skCommon,
  meta: skMeta,
  language: skLanguage,
  settings: skSettings,
  profile: skProfile,
  landing: skLanding,
  theme: skTheme,
  password: skPassword,
  auth: skAuth,
  nav: skNav,
  bell: skBell,
  tour: skTour,
  components: skComponents,
  chat: skChat,
  food: skFood,
  errors: skErrors,
  clients: skClients,
  clientDetail: skClientDetail,
  labels: skLabels,
  plans: skPlans,
  mealPlans: skMealPlans,
  calendar: skCalendar,
  templates: skTemplates,
  inbox: skInbox,
  analytics: skAnalytics,
  today: skToday,
  portalData: skPortalData,
  stopwatch: skStopwatch,
  workout: skWorkout,
  clientBuilder: skClientBuilder,
  training: skTraining,
  portal: skPortal,
  pdf: skPdf,
  ai: skAi,
  system: skSystem,
  legal: skLegal,
};

export type Messages = typeof sk;

export const cs: Messages = {
  common: csCommon,
  meta: csMeta,
  language: csLanguage,
  settings: csSettings,
  profile: csProfile,
  landing: csLanding,
  theme: csTheme,
  password: csPassword,
  auth: csAuth,
  nav: csNav,
  bell: csBell,
  tour: csTour,
  components: csComponents,
  chat: csChat,
  food: csFood,
  errors: csErrors,
  clients: csClients,
  clientDetail: csClientDetail,
  labels: csLabels,
  plans: csPlans,
  mealPlans: csMealPlans,
  calendar: csCalendar,
  templates: csTemplates,
  inbox: csInbox,
  analytics: csAnalytics,
  today: csToday,
  portalData: csPortalData,
  stopwatch: csStopwatch,
  workout: csWorkout,
  clientBuilder: csClientBuilder,
  training: csTraining,
  portal: csPortal,
  pdf: csPdf,
  ai: csAi,
  system: csSystem,
  legal: csLegal,
};

export const MESSAGES: Record<Locale, Messages> = { sk, cs };
