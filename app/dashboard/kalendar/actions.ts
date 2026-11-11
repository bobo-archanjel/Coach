"use server";

import { tErr } from "@/lib/i18n/serverErrors";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { dbErr } from "@/lib/dbError";
import { MAX_PLAN_CLIENTS, areTrainerClients, uniqueClientIds } from "@/lib/planRecipients";

/** Hodnoty formulára termínu — pri chybe sa vracajú späť, nech sa po validácii nevymažú polia. */
export interface AppointmentFormValues {
  client_id: string;
  /** nový termín — vybraní klienti (ClientMultiSelect posiela viac polí `client_id`) */
  client_ids?: string[];
  title: string;
  date: string;
  time: string;
  end_time: string;
  note: string;
}

export interface ActionState {
  error: string | null;
  /** vyplnené len pri chybe — React 19 po akcii formulár resetuje na defaultValue */
  values?: AppointmentFormValues;
}
const ok: ActionState = { error: null };

/**
 * Prevedie "wall-clock" dátum+čas v Europe/Bratislava (z <input type="date">/"time",
 * appka nemá timezone knižnicu) na UTC ISO string. Trik: naformátuje ten istý
 * okamih do oboch zón cez Intl, rozdiel časov (parsovaný ako string → Date, systémová
 * lokálna interpretácia sa pri odčítaní vyruší) je presný posun vrátane DST.
 */
function bratislavaToUtcIso(dateStr: string, timeStr: string): string {
  const naive = new Date(`${dateStr}T${timeStr}:00Z`);
  const asUtc = new Date(naive.toLocaleString("en-US", { timeZone: "UTC" }));
  const asBratislava = new Date(naive.toLocaleString("en-US", { timeZone: "Europe/Bratislava" }));
  const offsetMs = asBratislava.getTime() - asUtc.getTime();
  return new Date(naive.getTime() - offsetMs).toISOString();
}

function readValues(formData: FormData): AppointmentFormValues {
  const str = (k: string) => ((formData.get(k) as string | null) ?? "").trim();
  const clientIds = uniqueClientIds(formData.getAll("client_id"));
  return {
    client_id: clientIds[0] ?? "",
    client_ids: clientIds,
    title: str("title"),
    date: str("date"),
    time: str("time"),
    end_time: str("end_time"),
    note: str("note"),
  };
}

type ValidatedAppointment = {
  client_id: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  note: string | null;
};

/** Spoločná validácia pre vytvorenie aj úpravu termínu (vrátane vlastníctva klienta). */
async function validateAppointment(
  supabase: Awaited<ReturnType<typeof createClient>>,
  trainerId: string,
  v: AppointmentFormValues,
): Promise<{ error: string } | { row: ValidatedAppointment }> {
  if (!v.client_id) return { error: await tErr("chooseClient") };
  if (v.title.length > 200) return { error: await tErr("calendar.titleTooLong") };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.date)) return { error: await tErr("calendar.dateRequired") };
  if (!/^\d{2}:\d{2}$/.test(v.time)) return { error: await tErr("calendar.timeRequired") };
  if (v.note.length > 1000) return { error: await tErr("calendar.noteTooLong") };

  const { data: client } = await supabase
    .from("clients")
    .select("id")
    .eq("id", v.client_id)
    .eq("trainer_id", trainerId)
    .maybeSingle();
  if (!client) return { error: await tErr("notYourClient") };

  const startsAt = bratislavaToUtcIso(v.date, v.time);
  const endsAt = /^\d{2}:\d{2}$/.test(v.end_time) ? bratislavaToUtcIso(v.date, v.end_time) : null;
  if (endsAt && endsAt <= startsAt) return { error: await tErr("calendar.endAfterStart") };

  // Názov je voliteľný (povinné sú klient, dátum a čas) — stĺpec je NOT NULL, preto fallback.
  // i18n-ignore — predvolený názov termínu v DB (kľúč aj v lib/dashboard/attention.ts)
  return { row: { client_id: v.client_id, title: v.title || "Termín", starts_at: startsAt, ends_at: endsAt, note: v.note || null } };
}

export async function createAppointmentAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: await tErr("notSignedIn") };

  // Nový termín môže byť pre viacerých klientov naraz (rovnako ako tréningový plán) —
  // každý dostane vlastný riadok s rovnakým časom, názvom a poznámkou.
  const values = readValues(formData);
  const clientIds = values.client_ids ?? [];
  if (clientIds.length === 0) return { error: await tErr("chooseAtLeastOneClient"), values };
  if (clientIds.length > MAX_PLAN_CLIENTS) return { error: await tErr("maxClients", { max: MAX_PLAN_CLIENTS }), values };
  if (!(await areTrainerClients(supabase, user.id, clientIds))) return { error: await tErr("someClientNotYours"), values };

  const checked = await validateAppointment(supabase, user.id, values);
  if ("error" in checked) return { error: checked.error, values };

  const rows = clientIds.map((client_id) => ({ trainer_id: user.id, ...checked.row, client_id }));
  const { error } = await supabase.from("appointments").insert(rows);
  if (error) return { error: await dbErr(error, "actions"), values };

  revalidatePath("/dashboard/kalendar");
  return ok;
}

/** Úprava existujúceho termínu (QA 2026-09-23 — dal sa len vytvoriť a zmazať). */
export async function updateAppointmentAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: await tErr("notSignedIn") };

  const appointmentId = (formData.get("appointment_id") as string | null) ?? "";
  const values = readValues(formData);
  if (!appointmentId) return { error: await tErr("calendar.missingAppointment"), values };

  const checked = await validateAppointment(supabase, user.id, values);
  if ("error" in checked) return { error: checked.error, values };

  const { data, error } = await supabase
    .from("appointments")
    .update(checked.row)
    .eq("id", appointmentId)
    .eq("trainer_id", user.id)
    .select("id")
    .maybeSingle();
  if (error) return { error: await dbErr(error, "actions"), values };
  if (!data) return { error: await tErr("calendar.appointmentNotFound"), values };

  revalidatePath("/dashboard/kalendar");
  return ok;
}

export async function deleteAppointmentAction(appointmentId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !appointmentId) return;

  const { error } = await supabase.from("appointments").delete().eq("id", appointmentId).eq("trainer_id", user.id);
  if (!error) revalidatePath("/dashboard/kalendar");
}
