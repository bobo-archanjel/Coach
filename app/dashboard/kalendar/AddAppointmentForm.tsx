"use client";

import { useActionState, useRef, useEffect, useState, type FormEvent } from "react";
import {
  createAppointmentAction,
  updateAppointmentAction,
  type ActionState,
  type AppointmentFormValues,
} from "./actions";
import styles from "../dashboard.module.css";

const initialState: ActionState = { error: null };

const EMPTY: AppointmentFormValues = { client_id: "", title: "", date: "", time: "", end_time: "", note: "" };

// Povinné polia — kontrolujú sa už v prehliadači, aby sa chýbajúce dali hneď zvýrazniť
// (serverová validácia v actions.ts ostáva ako poistka).
const REQUIRED = ["client_id", "date", "time"] as const;
type RequiredField = (typeof REQUIRED)[number];

/**
 * Formulár termínu — nový (`appointmentId` chýba) aj úprava existujúceho.
 * Polia sú zámerne bez HTML5 `required`: bublina by bola v jazyku prehliadača a
 * ukázala by len prvé chýbajúce pole — namiesto toho onSubmit zvýrazní všetky naraz. Pri chybe akcia vráti zadané hodnoty
 * (`state.values`) — React 19 po akcii formulár resetuje na defaultValue, bez
 * toho sa po chybe validácie vymazal názov aj čas (QA 2026-09-23).
 */
export function AppointmentForm({
  clients,
  appointmentId,
  initial,
  onDone,
}: {
  clients: { id: string; full_name: string }[];
  appointmentId?: string;
  initial?: AppointmentFormValues;
  onDone?: () => void;
}) {
  const editing = Boolean(appointmentId);
  const [state, formAction, pending] = useActionState(
    editing ? updateAppointmentAction : createAppointmentAction,
    initialState,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const wasPending = useRef(false);
  const [missing, setMissing] = useState<Set<RequiredField>>(new Set());

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    const data = new FormData(e.currentTarget);
    const empty = new Set(REQUIRED.filter((k) => !String(data.get(k) ?? "").trim()));
    setMissing(empty);
    if (empty.size > 0) e.preventDefault();
  };
  // Po vyplnení pole prestane svietiť hneď, nie až pri ďalšom odoslaní.
  const clear = (field: RequiredField) => () =>
    setMissing((m) => {
      if (!m.has(field)) return m;
      const next = new Set(m);
      next.delete(field);
      return next;
    });
  const invalid = (field: RequiredField) => (missing.has(field) ? styles.fieldMissing : "");

  useEffect(() => {
    if (wasPending.current && !pending && !state.error) {
      // Úspech: nový termín → prázdny formulár; úprava → zavrieť editor.
      if (editing) onDone?.();
      else formRef.current?.reset();
    }
    wasPending.current = pending;
  }, [pending, state.error, editing, onDone]);

  const v = state.values ?? initial ?? EMPTY;

  return (
    // key: po chybe sa formulár pre-renderuje s práve zadanými hodnotami ako defaultValue
    <form
      key={JSON.stringify(state.values ?? null)}
      ref={formRef}
      action={formAction}
      onSubmit={onSubmit}
      noValidate
      className={styles.addClientForm}
    >
      {appointmentId && <input type="hidden" name="appointment_id" value={appointmentId} />}
      <div className={styles.addClientFields}>
        <select
          name="client_id"
          disabled={pending}
          className={`${styles.addClientInput} ${invalid("client_id")}`}
          defaultValue={v.client_id}
          onChange={clear("client_id")}
          aria-invalid={missing.has("client_id") || undefined}
          aria-label="Klient (povinné)"
        >
          <option value="" disabled>
            Vyber klienta *
          </option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.full_name}
            </option>
          ))}
        </select>
        <input
          name="title"
          type="text"
          placeholder="Názov, napr. Konzultácia (voliteľné)"
          maxLength={200}
          defaultValue={v.title}
          disabled={pending}
          className={styles.addClientInput}
        />
      </div>
      <div className={styles.addClientFieldsRow}>
        <label className={styles.timeField}>
          <span className={styles.timeFieldLabel}>Dátum *</span>
          <input
            name="date"
            type="date"
            defaultValue={v.date}
            disabled={pending}
            className={`${styles.addClientInputSm} ${invalid("date")}`}
            onChange={clear("date")}
            aria-invalid={missing.has("date") || undefined}
          />
        </label>
        <label className={styles.timeField}>
          <span className={styles.timeFieldLabel}>Od *</span>
          <input
            name="time"
            type="time"
            defaultValue={v.time}
            disabled={pending}
            className={`${styles.addClientInputSm} ${invalid("time")}`}
            onChange={clear("time")}
            aria-invalid={missing.has("time") || undefined}
          />
        </label>
        <label className={styles.timeField}>
          <span className={styles.timeFieldLabel}>Do (voliteľné)</span>
          <input name="end_time" type="time" defaultValue={v.end_time} disabled={pending} className={styles.addClientInputSm} />
        </label>
      </div>
      <div className={styles.addClientFields}>
        <input
          name="note"
          type="text"
          placeholder="Poznámka (voliteľné)"
          maxLength={1000}
          defaultValue={v.note}
          disabled={pending}
          className={styles.addClientInput}
        />
        <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
          {pending ? "Ukladám…" : editing ? "Uložiť zmeny" : "Pridať termín"}
        </button>
        {editing && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={onDone} disabled={pending}>
            Zrušiť
          </button>
        )}
      </div>
      {missing.size > 0 ? (
        <p className={styles.noWorkouts} role="alert">
          Vyplň zvýraznené povinné polia.
        </p>
      ) : (
        state.error && <p className={styles.noWorkouts}>{state.error}</p>
      )}
    </form>
  );
}

export function AddAppointmentForm({ clients }: { clients: { id: string; full_name: string }[] }) {
  if (clients.length === 0) {
    return <p className={styles.noWorkouts}>Najprv pridaj klienta na stránke Klienti.</p>;
  }
  return <AppointmentForm clients={clients} />;
}
