"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface ActionState {
  error: string | null;
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

export async function createAppointmentAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Nie si prihlásený." };

  const clientId = (formData.get("client_id") as string | null) ?? "";
  const title = ((formData.get("title") as string | null) ?? "").trim();
  const date = (formData.get("date") as string | null) ?? "";
  const time = (formData.get("time") as string | null) ?? "";
  const endTime = (formData.get("end_time") as string | null) ?? "";
  const note = ((formData.get("note") as string | null) ?? "").trim();

  if (!clientId) return { error: "Vyber klienta." };
  if (!title) return { error: "Zadaj názov termínu." };
  if (title.length > 200) return { error: "Názov je príliš dlhý (max 200 znakov)." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Zadaj dátum." };
  if (!/^\d{2}:\d{2}$/.test(time)) return { error: "Zadaj čas." };
  if (note.length > 1000) return { error: "Poznámka je príliš dlhá (max 1000 znakov)." };

  const { data: client } = await supabase
    .from("clients")
    .select("id")
    .eq("id", clientId)
    .eq("trainer_id", user.id)
    .maybeSingle();
  if (!client) return { error: "Tento klient nepatrí tebe." };

  const startsAt = bratislavaToUtcIso(date, time);
  const endsAt = /^\d{2}:\d{2}$/.test(endTime) ? bratislavaToUtcIso(date, endTime) : null;
  if (endsAt && endsAt <= startsAt) return { error: "Koniec termínu musí byť po jeho začiatku." };

  const { error } = await supabase.from("appointments").insert({
    trainer_id: user.id,
    client_id: clientId,
    title,
    starts_at: startsAt,
    ends_at: endsAt,
    note: note || null,
  });
  if (error) return { error: error.message };

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
