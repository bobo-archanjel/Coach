import { getLocale, getTranslations } from "next-intl/server";
import type { Locale } from "@/lib/i18n/locales";
import { createClient, getUser } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import {
  dateKeyInTz,
  gridRangeUtc,
  monthGrid,
  monthParam,
  monthTitle,
  parseMonthParam,
  shiftMonth,
  timeInTz,
} from "@/lib/calendar/month";
import { MonthCalendar, type DayAppointment } from "./MonthCalendar";
import { InfoTip } from "@/app/components/InfoTip";
import styles from "@/app/dashboard/dashboard.module.css";

interface AppointmentDbRow {
  id: string;
  client_id: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  note: string | null;
  clients: { full_name: string } | null;
}

/**
 * Kalendár trénera — mesačný prehľad (MonthCalendar). Zobrazený mesiac je v URL
 * (`?mesiac=2026-11`, inak aktuálny v Europe/Bratislava); termíny celej mriežky (aj dni
 * susedných mesiacov) jedným dopytom. RLS appointments_* — tréner vidí len svoje termíny;
 * `trainer_id` filter navyše.
 */
export default async function KalendarPage({ searchParams }: { searchParams: Promise<{ mesiac?: string }> }) {
  const [t, locale, { mesiac }] = await Promise.all([getTranslations("calendar"), getLocale(), searchParams]);
  const {
    data: { user },
  } = await getUser();
  if (!user) redirect("/prihlasenie");
  const supabase = await createClient();

  const todayKey = dateKeyInTz(new Date());
  const current = parseMonthParam(undefined, todayKey);
  const shown = parseMonthParam(mesiac, todayKey);
  const grid = monthGrid(shown);
  const range = gridRangeUtc(grid);

  const [{ data: clients }, { data: appointments }] = await Promise.all([
    supabase.from("clients").select("id, full_name").eq("trainer_id", user.id).order("full_name"),
    supabase
      .from("appointments")
      .select("id, client_id, title, starts_at, ends_at, note, clients(full_name)")
      .eq("trainer_id", user.id)
      .gte("starts_at", range.from)
      .lt("starts_at", range.to)
      .order("starts_at", { ascending: true }),
  ]);

  // deň termínu = dátum začiatku v Europe/Bratislava (23:30 SEČ ostáva na svojom dni)
  const byDay: Record<string, DayAppointment[]> = {};
  for (const a of (appointments ?? []) as unknown as AppointmentDbRow[]) {
    const key = dateKeyInTz(new Date(a.starts_at));
    const time = timeInTz(a.starts_at);
    const endTime = a.ends_at ? timeInTz(a.ends_at) : null;
    (byDay[key] ??= []).push({
      id: a.id,
      time,
      endTime,
      title: a.title,
      clientName: a.clients?.full_name ?? "?",
      note: a.note,
      editValues: {
        client_id: a.client_id,
        title: a.title,
        date: key,
        time,
        end_time: endTime ?? "",
        note: a.note ?? "",
      },
    });
  }

  const href = (m: { year: number; month: number }) => `/dashboard/kalendar?mesiac=${monthParam(m)}`;
  const isCurrent = shown.year === current.year && shown.month === current.month;

  return (
    <>
      <div className={styles.pageHead}>
        <h1>
          {t("title")} <InfoTip title={t("title")}>{t("tip")}</InfoTip>
        </h1>
      </div>

      <MonthCalendar
        key={monthParam(shown)}
        title={monthTitle(shown, locale as Locale)}
        prevHref={href(shiftMonth(shown, -1))}
        nextHref={href(shiftMonth(shown, 1))}
        todayHref={isCurrent ? null : href(current)}
        days={grid}
        todayKey={todayKey}
        appointments={byDay}
        clients={clients ?? []}
      />
    </>
  );
}
