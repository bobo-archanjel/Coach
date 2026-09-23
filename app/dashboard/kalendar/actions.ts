"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { dbErr } from "@/lib/dbError";

/** Hodnoty formulára termínu — pri chybe sa vracajú späť, nech sa po validácii nevymažú polia. */
export interface AppointmentFormValues {
  client_id: string;
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
  return {
    client_id: str("client_id"),
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
  if (!v.client_id) return { error: "Vyber klienta." };
  if (!v.title) return { error: "Zadaj názov termínu." };
  if (v.title.length > 200) return { error: "Názov je príliš dlhý (max 200 znakov)." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.date)) return { error: "Zadaj dátum." };
  if (!/^\d{2}:\d{2}$/.test(v.time)) return { error: "Zadaj čas." };
  if (v.note.length > 1000) return { error: "Poznámka je príliš dlhá (max 1000 znakov)." };

  const { data: client } = await supabase
    .from("clients")
    .select("id")
    .eq("id", v.client_id)
    .eq("trainer_id", trainerId)
    .maybeSingle();
  if (!client) return { error: "Tento klient nepatrí tebe." };

  const startsAt = bratislavaToUtcIso(v.date, v.time);
  const endsAt = /^\d{2}:\d{2}$/.test(v.end_time) ? bratislavaToUtcIso(v.date, v.end_time) : null;
  if (endsAt && endsAt <= startsAt) return { error: "Koniec termínu musí byť po jeho začiatku." };

  return { row: { client_id: v.client_id, title: v.title, starts_at: startsAt, ends_at: endsAt, note: v.note || null } };
}

export async function createAppointmentAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Nie si prihlásený." };

  const values = readValues(formData);
  const checked = await validateAppointment(supabase, user.id, values);
  if ("error" in checked) return { error: checked.error, values };

  const { error } = await supabase.from("appointments").insert({ trainer_id: user.id, ...checked.row });
  if (error) return { error: dbErr(error, "actions"), values };

  revalidatePath("/dashboard/kalendar");
  return ok;
}

/** Úprava existujúceho termínu (QA 2026-09-23 — dal sa len vytvoriť a zmazať). */
export async function updateAppointmentAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Nie si prihlásený." };

  const appointmentId = (formData.get("appointment_id") as string | null) ?? "";
  const values = readValues(formData);
  if (!appointmentId) return { error: "Chýba termín.", values };

  const checked = await validateAppointment(supabase, user.id, values);
  if ("error" in checked) return { error: checked.error, values };

  const { data, error } = await supabase
    .from("appointments")
    .update(checked.row)
    .eq("id", appointmentId)
    .eq("trainer_id", user.id)
    .select("id")
    .maybeSingle();
  if (error) return { error: dbErr(error, "actions"), values };
  if (!data) return { error: "Termín sa nenašiel.", values };

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
