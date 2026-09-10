"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { generatePlanWithAiAction, type ActionState } from "./actions";
import type { PlanFocus } from "@/lib/ai/planTaxonomy";
import styles from "../dashboard.module.css";

const initialState: ActionState = { error: null };

type ClientOption = { id: string; full_name: string; sex: "muz" | "zena" | null };

/** Predvyplnené zameranie podľa pohlavia — len návrh, tréner ho vždy prepíše. */
function defaultFocusForSex(sex: "muz" | "zena" | null): PlanFocus {
  if (sex === "zena") return "dolna";
  if (sex === "muz") return "horna";
  return "vyvazene";
}

export function AiPlanGeneratorForm({ clients }: { clients: ClientOption[] }) {
  const [state, formAction, pending] = useActionState(generatePlanWithAiAction, initialState);
  const [focus, setFocus] = useState<PlanFocus>("vyvazene");
  // Kým tréner sám nezmení zameranie, meníme ho podľa vybraného klienta.
  const [focusTouched, setFocusTouched] = useState(false);

  if (clients.length === 0) {
    return <p className={styles.noWorkouts}>Najprv pridaj klienta na stránke Klienti.</p>;
  }

  function onClientChange(id: string) {
    if (focusTouched) return;
    setFocus(defaultFocusForSex(clients.find((c) => c.id === id)?.sex ?? null));
  }

  return (
    <form action={formAction} className={styles.addClientForm}>
      <div className={styles.addClientFields}>
        <select
          name="client_id"
          required
          disabled={pending}
          className={styles.addClientInput}
          defaultValue=""
          onChange={(e) => onClientChange(e.target.value)}
        >
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
        <select
          name="focus"
          disabled={pending}
          className={styles.addClientInput}
          value={focus}
          onChange={(e) => {
            setFocus(e.target.value as PlanFocus);
            setFocusTouched(true);
          }}
          aria-label="Zameranie plánu"
          title="Zameranie plánu"
        >
          <option value="vyvazene">Vyvážene</option>
          <option value="horna">Viac horná časť tela</option>
          <option value="dolna">Viac dolná časť tela (zadok)</option>
        </select>
        <input
          name="days_per_week"
          type="number"
          min={1}
          max={7}
          required
          disabled={pending}
          className={styles.addClientInputSm}
          placeholder="počet dní"
          aria-label="Počet tréningových dní v týždni"
          title="Počet dní v týždni"
        />
        <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
          {pending ? "Generujem…" : "Navrhnúť plán s AI"}
        </button>
      </div>
      <p className={styles.aiPlanHint}>
        AI navrhne rozdelenie na dni a cviky z knižnice podľa cieľa a zamerania — plán sa otvorí ako koncept, pred
        publikovaním vieš čokoľvek upraviť. Zameranie sa predvyplní podľa pohlavia klienta, ak ho appka pozná.
      </p>
      {state.error && <p className={styles.addClientError}>{state.error}</p>}
      {state.planId && (
        <div className={styles.aiPlanResult}>
          {state.warnings?.map((w, i) => (
            <p key={i} className={styles.aiPlanWarning}>
              {w}
            </p>
          ))}
          <Link href={`/dashboard/treningy/${state.planId}`} className="btn btn-primary btn-sm">
            Otvoriť koncept →
          </Link>
        </div>
      )}
    </form>
  );
}
