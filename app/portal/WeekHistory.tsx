"use client";

import { useLocale, useTranslations } from "next-intl";
import { intlLocale, type Locale } from "@/lib/i18n/locales";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { deleteClientEventAction, getPortalWeekAction, saveClientEventAction } from "./actions";
import type { CalendarEvent, WeekDay, WeekView } from "@/lib/portal/types";
import { CompletedExercises } from "@/app/components/CompletedExercises";
import styles from "./portal.module.css";

/* Kalendár na karte Dnes (feature/kalendar-klient; predtým pás „Tento týždeň“) — 2 týždne
   (2 riadky Po–Ne), šípkami po 2 týždňoch dozadu aj dopredu. Bodky pod dňom: zelená =
   odcvičený tréning, červená = termín od trénera (appointments), oranžová = vlastná udalosť
   (client_events, 0072 — súkromná). Ťuk na deň otvorí okno dňa: tréningy (plán vs. skutočnosť),
   termíny trénera, vlastné udalosti (upraviť / zmazať) a „+ Pridať udalosť“.
   Dáta: lib/portal/data.ts → buildWeekView; iné obdobie cez getPortalWeekAction. */

const ChevronIcon = ({ dir }: { dir: "left" | "right" }) => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path
      d={dir === "left" ? "M9.5 3.5 5 8l4.5 4.5" : "M6.5 3.5 11 8l-4.5 4.5"}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
const CloseIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);
const CheckIcon = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" aria-hidden="true">
    <path d="M5 12.5l4.5 4.5L19 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const CALENDAR_DAYS = 14;

function shiftIso(mondayIso: string, deltaDays: number): string {
  const d = new Date(`${mondayIso}T12:00:00Z`);
  return new Date(d.getTime() + deltaDays * 86_400_000).toISOString().slice(0, 10);
}

function fullDate(iso: string, locale: Locale): string {
  const label = new Date(`${iso}T12:00:00Z`).toLocaleDateString(intlLocale(locale), {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

const timeRange = (e: CalendarEvent) => (e.endTime ? `${e.time} – ${e.endTime}` : e.time);

/** `footer` — počet tréningov a série pod kalendárom (karta Dnes, StreakChips). `preview` = DEV náhľad bez servera. */
export function WeekHistory({ initial, footer, preview = false }: { initial: WeekView; footer?: ReactNode; preview?: boolean }) {
  const t = useTranslations("today.calendar");
  const tw = useTranslations("today.week");
  const locale = useLocale() as Locale;
  const [week, setWeek] = useState<WeekView>(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openIso, setOpenIso] = useState<string | null>(null);
  // obdobie s dneškom — „Dnes“ sa doň vráti z iných týždňov
  const homeMonday = useRef(initial.mondayIso);

  const load = useCallback(
    async (mondayIso: string) => {
      if (preview) return;
      setLoading(true);
      setError(null);
      const res = await getPortalWeekAction(mondayIso);
      setLoading(false);
      if (res.state === "ok") setWeek(res.week);
      else setError(res.message ?? tw("loadFailed"));
    },
    [preview, tw],
  );

  // náhľad: udalosti len v pamäti (bez servera)
  const applyLocal = (dayIso: string, fn: (events: CalendarEvent[]) => CalendarEvent[]) =>
    setWeek((w) => ({ ...w, days: w.days.map((d) => (d.iso === dayIso ? { ...d, events: fn(d.events) } : d)) }));

  const openDay = openIso ? (week.days.find((d) => d.iso === openIso) ?? null) : null;
  const weekdayLabels = week.days.slice(0, 7).map((d) => d.label);

  const dayAria = (day: WeekDay) => {
    const own = day.events.filter((e) => e.kind === "own").length;
    const trainer = day.events.length - own;
    const parts = [
      day.sessions.length ? t("countTrainings", { count: day.sessions.length }) : null,
      trainer ? t("countTrainer", { count: trainer }) : null,
      own ? t("countOwn", { count: own }) : null,
    ].filter(Boolean);
    return parts.length ? `${fullDate(day.iso, locale)} — ${parts.join(", ")}` : fullDate(day.iso, locale);
  };

  return (
    <div className={styles.panel} data-tour="today-week" data-testid="client-calendar">
      <div className={styles.weekHead}>
        <p className={styles.panelLabel}>{t("title")}</p>
        <div className={styles.weekPager}>
          <button
            type="button"
            className={styles.weekNav}
            onClick={() => load(shiftIso(week.mondayIso, -CALENDAR_DAYS))}
            disabled={loading || preview}
            aria-label={t("prev")}
          >
            <ChevronIcon dir="left" />
          </button>
          <span className={styles.weekRange}>{week.rangeLabel}</span>
          <button
            type="button"
            className={styles.weekNav}
            onClick={() => load(shiftIso(week.mondayIso, CALENDAR_DAYS))}
            disabled={loading || preview}
            aria-label={t("next")}
          >
            <ChevronIcon dir="right" />
          </button>
        </div>
      </div>

      <div className={`${styles.calGrid} ${loading ? styles.weekLoading : ""}`}>
        {weekdayLabels.map((label) => (
          <span key={label} className={styles.calWeekday} aria-hidden="true">
            {label}
          </span>
        ))}
        {week.days.map((day) => {
          const hasOwn = day.events.some((e) => e.kind === "own");
          const hasTrainer = day.events.some((e) => e.kind === "trainer");
          return (
            <button
              key={day.iso}
              type="button"
              className={`${styles.calCell} ${day.state === "today" ? styles.calCellToday : ""} ${
                day.state === "none" || day.state === "done" ? styles.calCellPast : ""
              }`}
              onClick={() => setOpenIso(day.iso)}
              aria-label={dayAria(day)}
              aria-current={day.state === "today" ? "date" : undefined}
              data-iso={day.iso}
            >
              <span className={styles.calNum}>{day.dayNum}</span>
              <span className={styles.calDots} aria-hidden="true">
                {day.sessions.length > 0 && <span className={styles.calDot} data-kind="training" />}
                {hasTrainer && <span className={styles.calDot} data-kind="trainer" />}
                {hasOwn && <span className={styles.calDot} data-kind="own" />}
              </span>
            </button>
          );
        })}
      </div>

      <div className={styles.calLegend} aria-hidden="true">
        <span>
          <span className={styles.calDot} data-kind="training" /> {t("legendTraining")}
        </span>
        <span>
          <span className={styles.calDot} data-kind="own" /> {t("legendOwn")}
        </span>
        <span>
          <span className={styles.calDot} data-kind="trainer" /> {t("legendTrainer")}
        </span>
      </div>

      {error && (
        <p className={styles.weekNote}>
          {error}{" "}
          <button type="button" className={styles.weekRetry} onClick={() => load(week.mondayIso)}>
            {tw("retry")}
          </button>
        </p>
      )}
      {!week.isCurrentWeek && !preview && (
        <p className={styles.weekNote}>
          <button type="button" className={styles.weekRetry} onClick={() => load(homeMonday.current)}>
            {t("backToToday")}
          </button>
        </p>
      )}

      {footer}

      {openDay && (
        <DayDialog
          day={openDay}
          onClose={() => setOpenIso(null)}
          onSave={async (input) => {
            if (preview) {
              const ev: CalendarEvent = {
                id: input.id ?? `local-${Date.now()}`,
                kind: "own",
                title: input.title.trim() || t("defaultTitle"),
                startsAt: `${input.date}T${input.time}:00`,
                endsAt: input.endTime ? `${input.date}T${input.endTime}:00` : null,
                time: input.time,
                endTime: input.endTime || null,
                note: input.note.trim() || null,
              };
              applyLocal(openDay.iso, (evs) =>
                [...evs.filter((e) => e.id !== ev.id), ev].sort((a, b) => a.time.localeCompare(b.time)),
              );
              return null;
            }
            const res = await saveClientEventAction(input);
            if (res.error) return res.error;
            await load(week.mondayIso);
            return null;
          }}
          onDelete={async (id) => {
            if (preview) {
              applyLocal(openDay.iso, (evs) => evs.filter((e) => e.id !== id));
              return null;
            }
            const res = await deleteClientEventAction(id);
            if (res.error) return res.error;
            await load(week.mondayIso);
            return null;
          }}
        />
      )}
    </div>
  );
}

type EventDraft = { id?: string; title: string; date: string; time: string; endTime: string; note: string };

function DayDialog({
  day,
  onClose,
  onSave,
  onDelete,
}: {
  day: WeekDay;
  onClose: () => void;
  onSave: (input: EventDraft) => Promise<string | null>;
  onDelete: (id: string) => Promise<string | null>;
}) {
  const t = useTranslations("today.calendar");
  const tw = useTranslations("today.week");
  const locale = useLocale() as Locale;
  const [form, setForm] = useState<EventDraft | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (form) setForm(null);
      else if (confirmDelete) setConfirmDelete(null);
      else onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, form, confirmDelete]);

  const trainerEvents = day.events.filter((e) => e.kind === "trainer");
  const ownEvents = day.events.filter((e) => e.kind === "own");
  const empty = day.sessions.length === 0 && day.events.length === 0;
  const multi = day.sessions.length > 1;

  const submit = async () => {
    if (!form) return;
    setBusy(true);
    setError(null);
    const err = await onSave(form);
    setBusy(false);
    if (err) setError(err);
    else setForm(null);
  };
  const remove = async (id: string) => {
    setBusy(true);
    setError(null);
    const err = await onDelete(id);
    setBusy(false);
    if (err) setError(err);
    setConfirmDelete(null);
  };

  return (
    <>
      <button type="button" className={styles.whScrim} aria-label={tw("closePreview")} onClick={onClose} />
      <div className={styles.whPanel} role="dialog" aria-modal="true" aria-label={t("dialog", { date: fullDate(day.iso, locale) })}>
        <div className={styles.whHead}>
          <div>
            <h3 className={styles.whTitle}>{fullDate(day.iso, locale)}</h3>
            {empty && !form && <p className={styles.whSub}>{t("nothing")}</p>}
          </div>
          <button type="button" className={styles.whClose} onClick={onClose} aria-label={tw("close")}>
            <CloseIcon />
          </button>
        </div>

        <div className={styles.whBody}>
          {day.sessions.length > 0 && (
            <section className={styles.calSection} aria-label={t("sectionTrainings")}>
              <p className={styles.calSectionTitle}>
                <span className={styles.calDot} data-kind="training" /> {t("sectionTrainings")}
              </p>
              {day.sessions.map((session, si) => (
                <div key={si} className={styles.whSession}>
                  <div className={styles.whSessionHead}>
                    {(multi || session.dayName) && <p className={styles.whSessionName}>{session.dayName}</p>}
                    {session.planName && <span className={styles.whPlan}>{session.planName}</span>}
                  </div>
                  {session.compare.exercises.length > 0 ? (
                    <CompletedExercises exercises={session.compare.exercises} hasPlan={session.compare.hasPlan} flat />
                  ) : (
                    <p className={styles.whNoEntries}>
                      <CheckIcon /> {tw("doneNoSets")}
                    </p>
                  )}
                </div>
              ))}
            </section>
          )}

          {trainerEvents.length > 0 && (
            <section className={styles.calSection} aria-label={t("sectionTrainer")}>
              <p className={styles.calSectionTitle}>
                <span className={styles.calDot} data-kind="trainer" /> {t("sectionTrainer")}
              </p>
              <ul className={styles.calEvents}>
                {trainerEvents.map((e) => (
                  <li key={e.id} className={styles.calEvent} data-kind="trainer">
                    <span className={styles.calEventTime}>{timeRange(e)}</span>
                    <span className={styles.calEventBody}>
                      <strong>{e.title}</strong>
                      {e.note && <span className={styles.calEventNote}>{e.note}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {ownEvents.length > 0 && (
            <section className={styles.calSection} aria-label={t("sectionOwn")}>
              <p className={styles.calSectionTitle}>
                <span className={styles.calDot} data-kind="own" /> {t("sectionOwn")}
              </p>
              <ul className={styles.calEvents}>
                {ownEvents.map((e) => (
                  <li key={e.id} className={styles.calEvent} data-kind="own">
                    <span className={styles.calEventTime}>{timeRange(e)}</span>
                    <span className={styles.calEventBody}>
                      <strong>{e.title}</strong>
                      {e.note && <span className={styles.calEventNote}>{e.note}</span>}
                      {confirmDelete === e.id ? (
                        <span className={styles.calEventActions}>
                          <span className={styles.calConfirm}>{t("deleteConfirm")}</span>
                          <button type="button" className={styles.calLink} onClick={() => setConfirmDelete(null)} disabled={busy}>
                            {t("cancel")}
                          </button>
                          <button type="button" className={`${styles.calLink} ${styles.calLinkDanger}`} onClick={() => remove(e.id)} disabled={busy}>
                            {t("yesDelete")}
                          </button>
                        </span>
                      ) : (
                        <span className={styles.calEventActions}>
                          <button
                            type="button"
                            className={styles.calLink}
                            onClick={() =>
                              setForm({ id: e.id, title: e.title, date: day.iso, time: e.time, endTime: e.endTime ?? "", note: e.note ?? "" })
                            }
                            aria-label={t("editAria", { title: e.title })}
                          >
                            {t("edit")}
                          </button>
                          <button
                            type="button"
                            className={`${styles.calLink} ${styles.calLinkDanger}`}
                            onClick={() => setConfirmDelete(e.id)}
                            aria-label={t("deleteAria", { title: e.title })}
                          >
                            {t("delete")}
                          </button>
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {form ? (
            <form
              className={styles.calForm}
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
              <p className={styles.calSectionTitle}>{form.id ? t("editEvent") : t("newEvent")}</p>
              <label className={styles.calField}>
                <span>{t("fieldTitle")}</span>
                <input
                  type="text"
                  value={form.title}
                  maxLength={200}
                  placeholder={t("fieldTitlePlaceholder")}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  autoFocus
                />
              </label>
              <div className={styles.calFieldRow}>
                <label className={styles.calField}>
                  <span>{t("fieldTime")}</span>
                  <input type="time" value={form.time} required onChange={(e) => setForm({ ...form, time: e.target.value })} />
                </label>
                <label className={styles.calField}>
                  <span>{t("fieldEndTime")}</span>
                  <input type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
                </label>
              </div>
              <label className={styles.calField}>
                <span>{t("fieldNote")}</span>
                <textarea rows={2} maxLength={1000} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
              </label>
              <div className={styles.calFormActions}>
                <button type="button" className={styles.trGhostBtn} onClick={() => setForm(null)} disabled={busy}>
                  {t("cancel")}
                </button>
                <button type="submit" className={styles.trSaveBtn} disabled={busy}>
                  {busy ? t("saving") : t("save")}
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              className={styles.calAddBtn}
              onClick={() => setForm({ title: "", date: day.iso, time: "18:00", endTime: "", note: "" })}
            >
              {t("addEvent")}
            </button>
          )}

          {error && (
            <p className={styles.trError} role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
    </>
  );
}
