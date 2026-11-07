"use client";

import { useActionState, useState, useRef, useEffect } from "react";
import { bulkSendTrainerMessageAction, type BulkMessageState } from "../klienti/actions";
import styles from "../dashboard.module.css";

const initialState: BulkMessageState = { error: null, sentCount: null };

export function BulkMessageForm({ clients }: { clients: { id: string; full_name: string }[] }) {
  const [state, formAction, pending] = useActionState(bulkSendTrainerMessageAction, initialState);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const formRef = useRef<HTMLFormElement>(null);
  const wasPending = useRef(false);

  // Po úspešnom odoslaní vyčisti text aj výber — nech sa dá hneď poslať ďalšia,
  // nezávislá hromadná správa bez rizika omylom odoslať tú istú druhýkrát.
  useEffect(() => {
    if (wasPending.current && !pending && !state.error && state.sentCount != null) {
      formRef.current?.reset();
      setSelected(new Set());
    }
    wasPending.current = pending;
  }, [pending, state.error, state.sentCount]);

  const allSelected = clients.length > 0 && selected.size === clients.length;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(clients.map((c) => c.id)));
  }

  if (clients.length === 0) {
    return <p className={styles.noWorkouts}>Zatiaľ nemáš žiadnych klientov.</p>;
  }

  return (
    <form ref={formRef} action={formAction}>
      <label className={styles.bulkClientRow}>
        <input type="checkbox" checked={allSelected} onChange={toggleAll} />
        <strong>Vybrať všetkých ({clients.length})</strong>
      </label>

      <div className={styles.bulkClientList}>
        {clients.map((c) => (
          <label key={c.id} className={styles.bulkClientRow}>
            <input type="checkbox" name="client_id" value={c.id} checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
            {c.full_name}
          </label>
        ))}
      </div>

      <textarea
        name="body"
        placeholder="Text správy pre vybraných klientov…"
        required
        maxLength={4000}
        rows={4}
        disabled={pending}
        className={styles.bulkTextarea}
      />

      <div className={styles.bulkFooter}>
        <button type="submit" className="btn btn-primary btn-sm" disabled={pending || selected.size === 0}>
          {pending ? "Odosielam…" : selected.size > 0 ? `Odoslať ${selected.size} klientom` : "Odoslať"}
        </button>
        {state.sentCount != null && !state.error && <span className={styles.clientSince}>Odoslané {state.sentCount} klientom.</span>}
        {state.error && <span className={styles.noWorkouts}>{state.error}</span>}
      </div>
    </form>
  );
}
