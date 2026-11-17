"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { deleteAppointmentAction, type AppointmentFormValues } from "./actions";
import { AppointmentForm } from "./AddAppointmentForm";
import styles from "../dashboard.module.css";
import pa from "@/app/components/planActions.module.css";
import { ActionEditIcon, ActionTrashIcon } from "@/app/components/ActionIcons";

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
      {/* rovnaký vzhľad akcií ako pod plánmi (app/components/planActions.module.css) */}
      {confirming ? (
        <div className={`${pa.confirm} ${styles.appointmentConfirm}`} role="alertdialog" aria-label={t("confirm", { title })}>
          <span className={pa.confirmText}>{t("confirm", { title })}</span>
          <span className={pa.confirmBtns}>
            <button type="button" className={pa.confirmNo} onClick={() => setConfirming(false)} disabled={pending}>
              {t("cancel")}
            </button>
            <button
              type="button"
              className={pa.confirmYes}
              disabled={pending}
              onClick={() => startTransition(() => deleteAppointmentAction(id))}
            >
              {pending ? t("deleting") : t("delete")}
            </button>
          </span>
        </div>
      ) : (
        <div className={styles.appointmentActions}>
          <button type="button" className={`${pa.action} ${pa.small}`} onClick={() => setEditing(true)}>
            <ActionEditIcon />
            {t("edit")}
          </button>
          <button type="button" className={`${pa.action} ${pa.small} ${pa.danger}`} onClick={() => setConfirming(true)}>
            <ActionTrashIcon />
            {t("remove")}
          </button>
        </div>
      )}
    </div>
  );
}
