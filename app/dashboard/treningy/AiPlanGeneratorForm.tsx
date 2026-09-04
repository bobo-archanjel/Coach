"use client";

import { useActionState } from "react";
import { generatePlanWithAiAction, type ActionState } from "./actions";
import styles from "../dashboard.module.css";

const initialState: ActionState = { error: null };

export function AiPlanGeneratorForm({ clients }: { clients: { id: string; full_name: string }[] }) {
  const [state, formAction, pending] = useActionState(generatePlanWithAiAction, initialState);

  if (clients.length === 0) {
    return <p className={styles.noWorkouts}>Najprv pridaj klienta na stránke Klienti.</p>;
  }

  return (
    <form action={formAction} className={styles.addClientForm}>
      <div className={styles.addClientFields}>
        <select name="client_id" required disabled={pending} className={styles.addClientInput} defaultValue="">
          <option value="" disabled>
            Vyber klienta
          </option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.full_name}
            </option>
          ))}
        </select>
        <select name="goal" required disabled={pending} className={styles.addClientInput} defaultValue="">
          <option value="" disabled>
            Cieľ
          </option>
          <option value="chudnutie">Chudnutie</option>
          <option value="hypertrofia">Hypertrofia (nárast svalov)</option>
          <option value="sila">Sila</option>
          <option value="kondicia">Všeobecná kondícia</option>
        </select>
        <select name="experience" required disabled={pending} className={styles.addClientInput} defaultValue="">
          <option value="" disabled>
            Skúsenosť
          </option>
          <option value="zaciatocnik">Začiatočník</option>
          <option value="stredne_pokrocily">Stredne pokročilý</option>
          <option value="pokrocily">Pokročilý</option>
        </select>
        <select name="equipment" required disabled={pending} className={styles.addClientInput} defaultValue="">
          <option value="" disabled>
            Vybavenie
          </option>
          <option value="plna_posilnovna">Plná posilňovňa</option>
          <option value="domace_vybavenie">Domáce vybavenie</option>
          <option value="len_telo">Len vlastná váha</option>
        </select>
        <input
          name="days_per_week"
          type="number"
          min={1}
          max={7}
          defaultValue={3}
          required
          disabled={pending}
          className={styles.addClientInputSm}
          aria-label="Počet tréningových dní v týždni"
          title="Počet dní v týždni"
        />
        <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
          {pending ? "Generujem…" : "Navrhnúť plán s AI"}
        </button>
      </div>
      <p className={styles.aiPlanHint}>
        AI navrhne rozdelenie na dni a cviky z knižnice podľa cieľa — plán sa otvorí ako koncept, pred publikovaním
        vieš čokoľvek upraviť.
      </p>
      {state.error && <p className={styles.addClientError}>{state.error}</p>}
    </form>
  );
}
