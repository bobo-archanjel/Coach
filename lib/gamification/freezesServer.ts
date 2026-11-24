import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { tryCreateAdminClient } from "@/lib/supabase/admin";
import { planFoodFreezes, planTrainingFreezes, TRAINING_WEEK_TARGET } from "@/lib/portal/streak";
import { MAX_STORED_FREEZES } from "./rewards";

// FitPilot — zmrazenia série, serverová časť (gamifikácia v2).
//
// Zmrazenie sa zarobí (úroveň 4/8/12/16/20, týždeň so všetkými tromi misiami) a uloží ako riadok v
// streak_freezes (UNIQUE client_id + zdroj → raz za zdroj, najviac 2 nepoužité naraz). Použije sa AUTOMATICKY
// práve vtedy, keď by druhé vynechanie v rade sériu prerušilo (lib/portal/streak.ts → planFreezes). Použitie
// sa zapíše (used_kind/used_for), takže história ostáva stabilná a je vidieť „🧊 Zmrazenie použité“.
// Zápis robí výlučne service role; chyby (migrácia 0084 ešte nebeží) sa ticho pohltia — séria sa vtedy
// počíta bez zmrazení.

type Sb = SupabaseClient;

export interface FreezeState {
  /** nepoužité zmrazenia */
  available: number;
  /** pondelky týždňov chránených zmrazením */
  frozenWeeks: string[];
  /** dni (zápis jedla) chránené zmrazením */
  frozenDays: string[];
  /** história použitia (najnovšie prvé) */
  uses: { kind: "week" | "day"; unit: string; usedAt: string }[];
}

export const NO_FREEZES: FreezeState = { available: 0, frozenWeeks: [], frozenDays: [], uses: [] };

interface FreezeRow {
  id: string;
  source: string;
  earned_at: string;
  used_kind: "week" | "day" | null;
  used_for: string | null;
  used_at: string | null;
}

async function loadRows(supabase: Sb, clientId: string): Promise<FreezeRow[] | null> {
  const { data, error } = await supabase
    .from("streak_freezes")
    .select("id, source, earned_at, used_kind, used_for, used_at")
    .eq("client_id", clientId)
    .order("earned_at", { ascending: true })
    .limit(200);
  if (error) return null;
  return (data ?? []) as FreezeRow[];
}

function toState(rows: FreezeRow[]): FreezeState {
  const used = rows.filter((r) => r.used_at && r.used_kind && r.used_for);
  return {
    available: rows.filter((r) => !r.used_at).length,
    frozenWeeks: used.filter((r) => r.used_kind === "week").map((r) => r.used_for!),
    frozenDays: used.filter((r) => r.used_kind === "day").map((r) => r.used_for!),
    uses: used
      .map((r) => ({ kind: r.used_kind!, unit: r.used_for!, usedAt: r.used_at! }))
      .sort((a, b) => b.usedAt.localeCompare(a.usedAt)),
  };
}

/** Stav zmrazení klienta (RLS: vlastné riadky); bez migrácie prázdny. */
export async function loadFreezes(supabase: Sb, clientId: string): Promise<FreezeState> {
  try {
    const rows = await loadRows(supabase, clientId);
    return rows ? toState(rows) : NO_FREEZES;
  } catch {
    return NO_FREEZES;
  }
}

/**
 * Pripíše zmrazenia za zadané zdroje, ktoré klient ešte nemá, kým nie je plný sklad (max. 2 nepoužité).
 * Vráti, koľko sa pripísalo. Idempotentné (UNIQUE client_id + source).
 */
export async function grantFreezes(supabase: Sb, clientId: string, sources: string[]): Promise<number> {
  if (sources.length === 0) return 0;
  try {
    const admin = tryCreateAdminClient();
    if (!admin) return 0;
    const rows = await loadRows(supabase, clientId);
    if (!rows) return 0;
    const have = new Set(rows.map((r) => r.source));
    let room = MAX_STORED_FREEZES - rows.filter((r) => !r.used_at).length;
    let granted = 0;
    for (const source of sources) {
      if (room <= 0) break;
      if (have.has(source)) continue;
      const { error } = await admin.from("streak_freezes").insert({ client_id: clientId, source });
      if (error) {
        if (error.code === "23505") continue;
        break;
      }
      have.add(source);
      room--;
      granted++;
    }
    return granted;
  } catch {
    return 0;
  }
}

/**
 * Načíta zmrazenia a prípadne ich AUTOMATICKY použije tam, kde by sa séria pretrhla. Vráti aktuálny stav
 * (už s novými použitiami), ktorý sa podáva do computeTrainingStreak / computeFoodStreak.
 */
export async function resolveFreezes(
  supabase: Sb,
  clientId: string,
  input: { trainedDates: string[]; foodDates: string[]; today: string; trainingTarget?: number },
): Promise<FreezeState> {
  try {
    const rows = await loadRows(supabase, clientId);
    if (!rows) return NO_FREEZES;
    let state = toState(rows);
    if (state.available <= 0) return state;
    const admin = tryCreateAdminClient();
    if (!admin) return state;

    const weeks = planTrainingFreezes(input.trainedDates, input.today, state.available, input.trainingTarget ?? TRAINING_WEEK_TARGET, state.frozenWeeks);
    const left = state.available - weeks.length;
    const days = left > 0 ? planFoodFreezes(input.foodDates, input.today, left, state.frozenDays) : [];
    const plan = [...weeks.map((w) => ({ kind: "week" as const, unit: w })), ...days.map((d) => ({ kind: "day" as const, unit: d }))];
    if (plan.length === 0) return state;

    const free = rows.filter((r) => !r.used_at);
    let applied = 0;
    for (const p of plan) {
      const token = free[applied];
      if (!token) break;
      // podmienka used_at is null → súbeh dvoch požiadaviek jedno zmrazenie nespotrebuje dvakrát;
      // UNIQUE (client_id, used_kind, used_for) navyše zabráni chrániť tú istú jednotku dvakrát
      const { error } = await admin
        .from("streak_freezes")
        .update({ used_kind: p.kind, used_for: p.unit, used_at: new Date().toISOString() })
        .eq("id", token.id)
        .eq("client_id", clientId)
        .is("used_at", null);
      if (!error) applied++;
    }
    if (applied > 0) {
      const fresh = await loadRows(supabase, clientId);
      if (fresh) state = toState(fresh);
    }
    return state;
  } catch {
    return NO_FREEZES;
  }
}
