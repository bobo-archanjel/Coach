import "server-only";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { resolveActivePlanId } from "@/lib/portal/activePlan";
import {
  DEFAULT_MEAL_TARGET,
  allRingsClosed,
  computeDailyRings,
  distinctMealSlots,
  mealTargetFromPlan,
  ringsXp,
  summarizeTodayFood,
  XP_RINGS_DAY,
  type DailyRing,
} from "./rings";

// FitPilot — denné prstence, serverová časť. Všetko sa PREPOČÍTAVA z dát (jedlo dnes, tréning dnes, odpočinok dnes,
// jedálniček, cieľ bielkovín); od klienta nikdy neprichádza číslo ani „uzavreté“. Tabuľky client_rest_days
// a client_ring_days (0087) sú voliteľné: kým migrácia nebeží, prstence Strava a Bielkoviny idú ďalej,
// odpočinok sa nedá označiť, XP za deň sa nepripisuje a oslava sa pamätá v prehliadači.

type Sb = SupabaseClient;

export interface TodayRingState {
  rings: DailyRing[];
  mealTarget: number;
  workoutToday: boolean;
  restToday: boolean;
  /** tabuľka client_rest_days existuje (0087) — inak sa tlačidlo „Dnes oddychujem“ neukáže */
  restAvailable: boolean;
  /** dnes už oslávené (riadok v client_ring_days) */
  celebratedToday: boolean;
  /** tabuľka client_ring_days existuje (0087) — inak sa „oslávené dnes“ pamätá v prehliadači */
  persistAvailable: boolean;
}

/** Cieľ jedál za deň z aktívneho jedálnička klienta (zverejnené plány; voľba clients.active_meal_plan_id, 0067). */
async function loadMealTarget(supabase: Sb, clientId: string): Promise<number> {
  try {
    const [plans, active] = await Promise.all([
      supabase
        .from("meal_plans")
        .select("id, meal_days(meals)")
        .eq("client_id", clientId)
        .eq("published", true)
        .order("created_at", { ascending: false }),
      // samostatne: pred migráciou 0067 stĺpec chýba — chyba sa len ignoruje a platí „najnovší“
      supabase.from("clients").select("active_meal_plan_id").eq("id", clientId).maybeSingle(),
    ]);
    if (plans.error) return DEFAULT_MEAL_TARGET;
    const list = (plans.data ?? []) as unknown as { id: string; meal_days: { meals: unknown }[] | null }[];
    const choice = active.error ? null : ((active.data as { active_meal_plan_id?: string | null } | null)?.active_meal_plan_id ?? null);
    const plan = list.find((p) => p.id === resolveActivePlanId(choice, list));
    return mealTargetFromPlan((plan?.meal_days ?? []).map((d) => distinctMealSlots(d.meals)));
  } catch {
    return DEFAULT_MEAL_TARGET;
  }
}

/** Stav dnešných prstencov klienta (RLS: klient číta len svoje riadky). */
export async function loadTodayRings(supabase: Sb, clientId: string, today: string): Promise<TodayRingState | null> {
  try {
    const [food, profile, workout, rest, celebrated, mealTarget] = await Promise.all([
      supabase.from("food_logs").select("meal_slot, grams, protein_100g").eq("client_id", clientId).eq("eaten_on", today).limit(500),
      supabase.from("nutrition_profiles").select("protein_g").eq("client_id", clientId).maybeSingle(),
      // počet dnešných tréningov — Pohyb ukáže 2/1, 3/1 pri viacerých tréningoch za deň
      supabase.from("workout_logs").select("id").eq("client_id", clientId).eq("performed_on", today).eq("status", "completed").limit(20),
      supabase.from("client_rest_days").select("day").eq("client_id", clientId).eq("day", today).maybeSingle(),
      supabase.from("client_ring_days").select("day").eq("client_id", clientId).eq("day", today).maybeSingle(),
      loadMealTarget(supabase, clientId),
    ]);
    if (food.error || workout.error) return null;
    const { mealSlots, foodItems, proteinG } = summarizeTodayFood((food.data ?? []) as { meal_slot: string; grams: number; protein_100g: number }[]);
    const proteinTarget = profile.data?.protein_g != null ? Number(profile.data.protein_g) : null;
    const workoutsToday = (workout.data ?? []).length;
    const workoutToday = workoutsToday > 0;
    const restToday = !rest.error && Boolean(rest.data);
    return {
      rings: computeDailyRings({ mealSlots, mealTarget, foodItems, proteinG, proteinTarget, workoutToday, workoutsToday, restToday }),
      mealTarget,
      workoutToday,
      restToday,
      restAvailable: !rest.error,
      celebratedToday: !celebrated.error && Boolean(celebrated.data),
      persistAvailable: !celebrated.error,
    };
  } catch {
    return null;
  }
}

/** Request-cache: karta Dnes aj oslava v layoute čítajú ten istý stav jedným súborom dopytov. */
export const loadTodayRingsCached = cache(async (clientId: string, today: string): Promise<TodayRingState | null> =>
  loadTodayRings(await createClient(), clientId, today),
);

/** XP za uzavreté dni (deterministicky z počtu riadkov); 0 bez migrácie. */
export async function loadRingsXp(supabase: Sb, clientId: string): Promise<number> {
  try {
    const { count, error } = await supabase.from("client_ring_days").select("day", { count: "exact", head: true }).eq("client_id", clientId);
    return error ? 0 : ringsXp(count ?? 0);
  } catch {
    return 0;
  }
}

export type ClaimResult =
  /** všetky prstence uzavreté a oslava sa práve pripísala (raz za deň) */
  | { status: "celebrate"; xp: number; persisted: boolean }
  | { status: "already" }
  | { status: "open" };

/**
 * Oslava „Všetky kruhy uzavreté!“: server SÁM prepočíta prstence; ak sú všetky uzavreté a dnes ešte nebolo
 * oslávené, zapíše deň (PRIMARY KEY = idempotentné aj pri súbehu dvoch kariet) a vráti XP. Bez migrácie
 * `persisted: false` — klient si deň zapamätá v prehliadači a XP sa nepripíše.
 */
export async function claimRingsCelebration(supabase: Sb, admin: Sb, clientId: string, today: string): Promise<ClaimResult> {
  const state = await loadTodayRings(supabase, clientId, today);
  if (!state || !allRingsClosed(state.rings)) return { status: "open" };
  if (state.celebratedToday) return { status: "already" };
  const { error } = await admin.from("client_ring_days").insert({ client_id: clientId, day: today });
  if (!error) return { status: "celebrate", xp: XP_RINGS_DAY, persisted: true };
  if (error.code === "23505") return { status: "already" };
  return { status: "celebrate", xp: 0, persisted: false };
}
