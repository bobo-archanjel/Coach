// Ďalší príjemcovia konceptu plánu (migrácia 0052) — šablóna použitá pre viacerých
// klientov naraz vytvorí jeden koncept (pre prvého) a ostatní čakajú tu. Pri odoslaní
// (publish) dostane každý vlastnú zverejnenú kópiu plánu a riadky sa zmažú.
// Volá sa len zo serverových akcií trénera (RLS: plan_recipients vidí len tréner).

import { tErr } from "@/lib/i18n/serverErrors";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dbErr } from "@/lib/dbError";

export type PlanKind = "workout" | "meal";

/** Najviac klientov naraz pre jeden koncept (šablóna, Nový plán). */
export const MAX_PLAN_CLIENTS = 50;

/** Platné, unikátne ID klientov z formulára (FormData.getAll / pole z prehliadača). */
export function uniqueClientIds(raw: unknown[]): string[] {
  return [...new Set(raw.filter((id): id is string => typeof id === "string" && id !== ""))];
}

/** Patria všetci klienti trénerovi? (pred vytvorením konceptu — inak by vznikol zbytočne) */
export async function areTrainerClients(supabase: SupabaseClient, trainerId: string, clientIds: string[]): Promise<boolean> {
  if (clientIds.length === 0) return true;
  const { count } = await supabase
    .from("clients")
    .select("id", { count: "exact", head: true })
    .in("id", clientIds)
    .eq("trainer_id", trainerId);
  return count === clientIds.length;
}

const PLAN_COLUMN = { workout: "workout_plan_id", meal: "meal_plan_id" } as const;

export interface PlanRecipient {
  clientId: string;
  name: string;
}

/** Príjemcovia konceptu (okrem hlavného klienta plánu). Bez migrácie 0052 → prázdne. */
export async function listPlanRecipients(supabase: SupabaseClient, kind: PlanKind, planId: string): Promise<PlanRecipient[]> {
  const { data, error } = await supabase
    .from("plan_recipients")
    .select("client_id, clients(full_name)")
    .eq(PLAN_COLUMN[kind], planId)
    .order("created_at");
  if (error) return [];
  return (data ?? []).map((r) => ({
    clientId: r.client_id as string,
    name: (r.clients as unknown as { full_name: string } | null)?.full_name ?? "Klient",
  }));
}

export async function addPlanRecipients(
  supabase: SupabaseClient,
  trainerId: string,
  kind: PlanKind,
  planId: string,
  clientIds: string[],
): Promise<string | null> {
  if (clientIds.length === 0) return null;
  const { error } = await supabase
    .from("plan_recipients")
    .insert(clientIds.map((clientId) => ({ trainer_id: trainerId, client_id: clientId, [PLAN_COLUMN[kind]]: planId })));
  return error ? await dbErr(error, "templates") : null;
}

/**
 * Po odoslaní konceptu: každému príjemcovi zverejnená kópia plánu (názov + dni), riadok
 * príjemcu sa zmaže. Kópie sú samostatné plány — ďalšie úpravy sa už nezdieľajú.
 * Vráti, koľkým klientom sa poslalo, a prípadnú chybu (ostatným sa poslalo aj tak).
 */
export async function deliverPlanToRecipients(
  supabase: SupabaseClient,
  trainerId: string,
  kind: PlanKind,
  planId: string,
): Promise<{ delivered: string[]; error: string | null }> {
  const recipients = await listPlanRecipients(supabase, kind, planId);
  if (recipients.length === 0) return { delivered: [], error: null };

  const planTable = kind === "workout" ? "workout_plans" : "meal_plans";
  const dayTable = kind === "workout" ? "workout_days" : "meal_days";
  const content = kind === "workout" ? "exercises" : "meals";
  const [{ data: plan }, { data: days, error: daysErr }] = await Promise.all([
    supabase.from(planTable).select("name").eq("id", planId).eq("trainer_id", trainerId).maybeSingle(),
    supabase.from(dayTable).select(`day_number, name, ${content}`).eq("plan_id", planId).order("day_number"),
  ]);
  if (!plan) return { delivered: [], error: await tErr("planNotFound") };
  if (daysErr) return { delivered: [], error: await dbErr(daysErr, "templates") };

  const delivered: string[] = [];
  const failed: string[] = [];
  for (const r of recipients) {
    const { data: copy, error: copyErr } = await supabase
      .from(planTable)
      .insert({ client_id: r.clientId, trainer_id: trainerId, name: plan.name, published: true })
      .select("id")
      .single();
    if (copyErr || !copy) {
      failed.push(r.name);
      continue;
    }
    const rows = (days ?? []).map((d) => ({
      plan_id: copy.id,
      day_number: d.day_number,
      name: d.name,
      [content]: (d as Record<string, unknown>)[content],
    }));
    if (rows.length > 0) {
      const { error: insErr } = await supabase.from(dayTable).insert(rows);
      if (insErr) {
        await supabase.from(planTable).delete().eq("id", copy.id);
        failed.push(r.name);
        continue;
      }
    }
    await supabase.from("plan_recipients").delete().eq(PLAN_COLUMN[kind], planId).eq("client_id", r.clientId);
    delivered.push(r.clientId);
  }
  return { delivered, error: failed.length > 0 ? await tErr("sendFailedTo", { names: failed.join(", ") }) : null };
}
