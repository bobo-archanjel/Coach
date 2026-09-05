"use client";

import { useState, useTransition } from "react";
import { deleteAppointmentAction } from "./actions";
import styles from "../dashboard.module.css";

export function AppointmentRow({
  id,
  time,
  endTime,
  title,
  clientName,
  note,
}: {
  id: string;
  time: string;
  endTime: string | null;
  title: string;
  clientName: string;
  note: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

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
            className="btn btn-ghost btn-sm"
            disabled={pending}
            onClick={() => startTransition(() => deleteAppointmentAction(id))}
          >
            {pending ? "Mažem…" : "Naozaj"}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirming(false)} disabled={pending}>
            Zrušiť
          </button>
        </div>
      ) : (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirming(true)}>
          Zmazať
        </button>
      )}
    </div>
  );
}
