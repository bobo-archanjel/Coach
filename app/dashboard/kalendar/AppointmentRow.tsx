"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { deleteAppointmentAction, type AppointmentFormValues } from "./actions";
import { AppointmentForm } from "./AddAppointmentForm";
import styles from "../dashboard.module.css";

export function AppointmentRow({
  id,
  time,
  endTime,
  title,
  clientName,
  note,
  clients,
  editValues,
}: {
  id: string;
  time: string;
  endTime: string | null;
  title: string;
  clientName: string;
  note: string | null;
  clients: { id: string; full_name: string }[];
  /** hodnoty pre formulár úpravy (dátum/čas v Europe/Bratislava) */
  editValues: AppointmentFormValues;
}) {
  const t = useTranslations("calendar.row");
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <div className={styles.appointmentRow} style={{ display: "block" }}>
        <AppointmentForm clients={clients} appointmentId={id} initial={editValues} onDone={() => setEditing(false)} />
      </div>
    );
  }

  return (
    <div className={styles.appointmentRow}>
      <span className={styles.appointmentTime}>
        {time}
        {endTime && <span className={styles.appointmentTimeEnd}>–{endTime}</span>}
      </span>
      <div className={styles.appointmentBody}>
        <div className={styles.clientName}>{title}</div>
        <span className={styles.clientSince}>
          {clientName}
          {note ? ` · ${note}` : ""}
        </span>
      </div>
      {confirming ? (
        <div style={{ display: "flex", gap: 6 }}>
          <button
            type="button"
            className="btn btn-primary btn-sm btn-danger"
            disabled={pending}
            onClick={() => startTransition(() => deleteAppointmentAction(id))}
          >
            {pending ? t("deleting") : t("delete")}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirming(false)} disabled={pending}>
            {t("cancel")}
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 6 }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>
            {t("edit")}
          </button>
          <button type="button" className="btn btn-ghost btn-sm btn-danger" onClick={() => setConfirming(true)}>
            {t("remove")}
          </button>
        </div>
      )}
    </div>
  );
}
