import { getLocale, getTranslations } from "next-intl/server";
import { intlLocale, type Locale } from "@/lib/i18n/locales";
import { createClient, getUser } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AddAppointmentForm } from "./AddAppointmentForm";
import { AppointmentRow } from "./AppointmentRow";
import { InfoTip } from "@/app/components/InfoTip";
import styles from "@/app/dashboard/dashboard.module.css";

interface AppointmentRow_ {
  id: string;
  client_id: string;
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

/** HH:MM v Europe/Bratislava — rovnaký formát ako <input type="time">. */
function timeBratislava(iso: string): string {
  // i18n: „HH:MM“ pre <input type="time"> — formát nezávisí od jazyka
  return new Date(iso).toLocaleTimeString("sk-SK", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Europe/Bratislava" });
}

function dayGroupLabel(
  dateKey: string,
  todayKey: string,
  tomorrowKey: string,
  words: { today: string; tomorrow: string },
  locale: Locale,
): string {
  if (dateKey === todayKey) return words.today;
  if (dateKey === tomorrowKey) return words.tomorrow;
  const d = new Date(`${dateKey}T12:00:00Z`);
  const label = d.toLocaleDateString(intlLocale(locale), { weekday: "long", day: "numeric", month: "numeric", timeZone: "UTC" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export default async function KalendarPage() {
  const [t, locale] = await Promise.all([getTranslations("calendar"), getLocale()]);
  const {
    data: { user },
  } = await getUser();
  if (!user) redirect("/prihlasenie");
  const supabase = await createClient();

  const nowIso = new Date().toISOString();

  const [{ data: clients }, { data: appointments }] = await Promise.all([
    supabase.from("clients").select("id, full_name").eq("trainer_id", user.id).order("full_name"),
    supabase
      .from("appointments")
      .select("id, client_id, title, starts_at, ends_at, note, clients(full_name)")
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
      group = { key, label: dayGroupLabel(key, todayKey, tomorrowKey, { today: t("today"), tomorrow: t("tomorrow") }, locale), items: [] };
      groups.push(group);
    }
    group.items.push(row);
  }

  return (
    <>
      <div className={styles.pageHead}>
        <h1>
          {t("title")} <InfoTip title={t("title")}>{t("tip")}</InfoTip>
        </h1>
      </div>

      <div className={`${styles.card} ${styles.cardFlatMobile}`} style={{ marginBottom: 20 }}>
        <h3>{t("newAppointment")}</h3>
        <AddAppointmentForm clients={clients ?? []} />
      </div>

      {groups.length > 0 ? (
        <div className={styles.cardStack}>
          {groups.map((group) => (
            <div key={group.key} className={`${styles.card} ${styles.cardFlatMobile}`}>
              <h3>{group.label}</h3>
              <div className={styles.appointmentList}>
                {group.items.map((a) => (
                  <AppointmentRow
                    key={a.id}
                    id={a.id}
                    time={timeBratislava(a.starts_at)}
                    endTime={a.ends_at ? timeBratislava(a.ends_at) : null}
                    title={a.title}
                    clientName={a.clients?.full_name ?? "?"}
                    note={a.note}
                    clients={clients ?? []}
                    editValues={{
                      client_id: a.client_id,
                      title: a.title,
                      date: dateKeyBratislava(new Date(a.starts_at)),
                      time: timeBratislava(a.starts_at),
                      end_time: a.ends_at ? timeBratislava(a.ends_at) : "",
                      note: a.note ?? "",
                    }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className={styles.emptyState}>
          <h2>{t("emptyTitle")}</h2>
          <p>{(clients ?? []).length > 0 ? t("emptyText") : t("noClients")}</p>
        </div>
      )}
    </>
  );
}
