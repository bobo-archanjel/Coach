"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import type { Locale } from "@/lib/i18n/locales";
import { WEEKDAY_SHORT } from "@/lib/i18n/dates";
import { dayTitle, type CalendarDay } from "@/lib/calendar/month";
import { AppLink as Link } from "@/app/components/AppLink";
import { BuilderDialog } from "@/app/components/BuilderDialog";
import { AppointmentForm } from "./AddAppointmentForm";
import { AppointmentRow } from "./AppointmentRow";
import type { AppointmentFormValues } from "./actions";
import styles from "../dashboard.module.css";
import c from "./calendar.module.css";

/** Termín dňa (čas a dátum už v Europe/Bratislava — page.tsx). */
export interface DayAppointment {
  id: string;
  time: string;
  endTime: string | null;
  title: string;
  clientName: string;
  note: string | null;
  editValues: AppointmentFormValues;
}

const EMPTY: AppointmentFormValues = { client_id: "", client_ids: [], title: "", date: "", time: "", end_time: "", note: "" };

const Chevron = ({ dir }: { dir: "left" | "right" }) => (
  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <path
      d={dir === "left" ? "M12 4.5 6.5 10l5.5 5.5" : "M8 4.5l5.5 5.5L8 15.5"}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const PlusIcon = () => (
  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
  </svg>
);

/**
 * Mesačný prehľad termínov trénera: mriežka po – ne, šípky na susedné mesiace (odkaz
 * `?mesiac=` — server načíta termíny celej mriežky jedným dopytom), bodka pri dni s termínom.
 * Ťuk na deň otvorí okno so zoznamom termínov (úprava / zmazanie ako doteraz) a „+“ s
 * formulárom nového termínu s predvyplneným dátumom. Po uložení akcia revaliduje stránku —
 * nové dáta prídu ako props, okno ostane otvorené a bodky sa prekreslia bez reloadu.
 */
export function MonthCalendar({
  title,
  prevHref,
  nextHref,
  todayHref,
  days,
  todayKey,
  appointments,
  clients,
}: {
  title: string;
  prevHref: string;
  nextHref: string;
  /** odkaz na aktuálny mesiac — len keď je zobrazený iný */
  todayHref: string | null;
  days: CalendarDay[];
  todayKey: string;
  /** termíny podľa dňa (kľúč YYYY-MM-DD v Europe/Bratislava), zoradené podľa času */
  appointments: Record<string, DayAppointment[]>;
  clients: { id: string; full_name: string }[];
}) {
  const t = useTranslations("calendar.month");
  const locale = useLocale() as Locale;
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const open = (key: string) => {
    setOpenKey(key);
    setAdding(false);
  };
  const close = () => {
    setOpenKey(null);
    setAdding(false);
  };

  const openItems = openKey ? (appointments[openKey] ?? []) : [];
  const openTitle = openKey ? dayTitle(openKey, locale) : "";

  return (
    <div className={`${styles.card} ${styles.cardFlatMobile} ${c.calendar}`} data-tour="calendar-month">
      <div className={c.head}>
        <Link href={prevHref} scroll={false} className={c.navBtn} aria-label={t("prev")}>
          <Chevron dir="left" />
        </Link>
        <h2 className={c.title} aria-live="polite">
          {title}
        </h2>
        <Link href={nextHref} scroll={false} className={c.navBtn} aria-label={t("next")}>
          <Chevron dir="right" />
        </Link>
        {todayHref && (
          <Link href={todayHref} scroll={false} className={c.todayBtn}>
            {t("today")}
          </Link>
        )}
      </div>

      <div className={c.weekdays} aria-hidden="true">
        {WEEKDAY_SHORT[locale].map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>

      <div className={c.grid} role="group" aria-label={title}>
        {days.map((day) => {
          const count = appointments[day.key]?.length ?? 0;
          const isToday = day.key === todayKey;
          return (
            <button
              key={day.key}
              type="button"
              className={`${c.day} ${day.inMonth ? "" : c.outside} ${isToday ? c.today : ""}`}
              onClick={() => open(day.key)}
              aria-label={
                count > 0
                  ? t("dayAria", { date: dayTitle(day.key, locale), count })
                  : dayTitle(day.key, locale)
              }
              aria-current={isToday ? "date" : undefined}
              data-date={day.key}
              data-count={count}
            >
              <span className={c.dayNum}>{day.day}</span>
              <span className={`${c.dot} ${count > 0 ? c.dotOn : ""}`} aria-hidden="true" />
            </button>
          );
        })}
      </div>

      {openKey && (
        <BuilderDialog
          title={openTitle}
          closeLabel={t("close")}
          onClose={close}
          wide
          headActions={
            !adding && clients.length > 0 ? (
              <button
                type="button"
                className={c.addBtn}
                onClick={() => setAdding(true)}
                aria-label={t("addAria", { date: openTitle })}
              >
                <PlusIcon />
              </button>
            ) : null
          }
        >
          {adding ? (
            <div className={c.formWrap}>
              <p className={c.formLabel}>{t("newAppointment")}</p>
              <AppointmentForm
                key={openKey}
                clients={clients}
                initial={{ ...EMPTY, date: openKey }}
                onDone={() => setAdding(false)}
              />
              <button type="button" className={`btn btn-ghost btn-sm ${c.backBtn}`} onClick={() => setAdding(false)}>
                {t("back")}
              </button>
            </div>
          ) : openItems.length > 0 ? (
            <div className={styles.appointmentList} data-testid="day-appointments">
              {openItems.map((a) => (
                <AppointmentRow
                  key={a.id}
                  id={a.id}
                  time={a.time}
                  endTime={a.endTime}
                  title={a.title}
                  clientName={a.clientName}
                  note={a.note}
                  clients={clients}
                  editValues={a.editValues}
                />
              ))}
            </div>
          ) : (
            <p className={c.empty}>{clients.length > 0 ? t("empty") : t("noClients")}</p>
          )}
        </BuilderDialog>
      )}
    </div>
  );
}
