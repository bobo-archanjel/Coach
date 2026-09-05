import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AddAppointmentForm } from "./AddAppointmentForm";
import { AppointmentRow } from "./AppointmentRow";
import styles from "../dashboard.module.css";

interface AppointmentRow_ {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  note: string | null;
  clients: { full_name: string } | null;
}

/** YYYY-MM-DD v Europe/Bratislava (appka nemá timezone knižnicu — rovnaký trik ako rateLimit.ts). */
function dateKeyBratislava(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Bratislava",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function dayGroupLabel(dateKey: string, todayKey: string, tomorrowKey: string): string {
  if (dateKey === todayKey) return "Dnes";
  if (dateKey === tomorrowKey) return "Zajtra";
  const d = new Date(`${dateKey}T12:00:00Z`);
  const label = d.toLocaleDateString("sk-SK", { weekday: "long", day: "numeric", month: "numeric", timeZone: "UTC" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export default async function KalendarPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/prihlasenie");

  const nowIso = new Date().toISOString();

  const [{ data: clients }, { data: appointments }] = await Promise.all([
    supabase.from("clients").select("id, full_name").eq("trainer_id", user.id).order("full_name"),
    supabase
      .from("appointments")
      .select("id, title, starts_at, ends_at, note, clients(full_name)")
      .eq("trainer_id", user.id)
      .gte("starts_at", nowIso)
      .order("starts_at", { ascending: true })
      .limit(200),
  ]);

  const rows = (appointments ?? []) as unknown as AppointmentRow_[];

  const now = new Date();
  const todayKey = dateKeyBratislava(now);
  const tomorrowKey = dateKeyBratislava(new Date(now.getTime() + 86_400_000));

  const groups: { key: string; label: string; items: AppointmentRow_[] }[] = [];
  for (const row of rows) {
    const key = dateKeyBratislava(new Date(row.starts_at));
    let group = groups.find((g) => g.key === key);
    if (!group) {
      group = { key, label: dayGroupLabel(key, todayKey, tomorrowKey), items: [] };
      groups.push(group);
    }
    group.items.push(row);
  }

  return (
    <>
      <div className={styles.pageHead}>
        <h1>Kalendár</h1>
        <p>Voľné termíny s klientmi — konzultácie, tréningy alebo čokoľvek mimo bežného tréningového plánu.</p>
      </div>

      <div className={styles.card} style={{ marginBottom: 20 }}>
        <h3>Nový termín</h3>
        <AddAppointmentForm clients={clients ?? []} />
      </div>

      {groups.length > 0 ? (
        <div className={styles.cardStack}>
          {groups.map((group) => (
            <div key={group.key} className={styles.card}>
              <h3>{group.label}</h3>
              <div className={styles.appointmentList}>
                {group.items.map((a) => (
                  <AppointmentRow
                    key={a.id}
                    id={a.id}
                    time={new Date(a.starts_at).toLocaleTimeString("sk-SK", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Bratislava" })}
                    endTime={
                      a.ends_at
                        ? new Date(a.ends_at).toLocaleTimeString("sk-SK", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Bratislava" })
                        : null
                    }
                    title={a.title}
                    clientName={a.clients?.full_name ?? "?"}
                    note={a.note}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className={styles.emptyState}>
          <h2>Žiadne nadchádzajúce termíny</h2>
          <p>Pridaj prvý termín vyššie.</p>
        </div>
      )}
    </>
  );
}
