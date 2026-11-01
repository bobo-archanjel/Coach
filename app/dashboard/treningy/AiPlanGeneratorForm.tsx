"use client";

import { useActionState, useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import {
  generatePlanWithAiAction,
  generateAiPlanForClientAction,
  type ActionState,
  type AiPlanParams,
  type AiPlanForClientResult,
} from "./actions";
import {
  type PlanFocus,
  DAY_CATEGORIES,
  DAY_CATEGORY_LABEL_SK,
  WHOLE_PLAN_FOCUS_LABEL_SK,
  isSingleDayFocus,
} from "@/lib/ai/planCategories";
import { defaultFocusForSex } from "@/lib/ai/planClientContext";
import { pluralSk } from "@/lib/portal/streak";
import { InfoTip } from "@/app/components/InfoTip";
import { ClientMultiSelect } from "../ClientMultiSelect";
import dashboardModule from "../dashboard.module.css";
import { useSkinStyles } from "@/app/components/uiSkin";

const initialState: ActionState = { error: null };

type ClientOption = { id: string; full_name: string; sex: "muz" | "zena" | null };
/** „auto“ = zameranie podľa pohlavia každého klienta zvlášť (len pri viacerých klientoch) */
type FocusChoice = PlanFocus | "auto";

interface BatchItem extends AiPlanForClientResult {
  clientId: string;
  name: string;
}
interface Batch {
  /** počet klientov v aktuálnom behu (pri „Skúsiť znova“ len neúspešní) */
  total: number;
  /** výsledky z predošlého behu, ktoré ostávajú v súhrne (úspešné pred „Skúsiť znova“) */
  kept: number;
  /** poradie práve generovaného klienta (0-based), null = hotovo */
  current: number | null;
  currentName: string | null;
  items: BatchItem[];
  params: AiPlanParams;
}

export function AiPlanGeneratorForm({ clients }: { clients: ClientOption[] }) {
  const styles = useSkinStyles("dashboard", dashboardModule);
  const [state, formAction, singlePending] = useActionState(generatePlanWithAiAction, initialState);
  const [batchPending, startBatch] = useTransition();
  const [selected, setSelected] = useState<string[]>(() => (clients.length === 1 ? [clients[0].id] : []));
  const [missingClient, setMissingClient] = useState(false);
  const [focus, setFocus] = useState<FocusChoice>(() =>
    clients.length === 1 ? defaultFocusForSex(clients[0].sex) : "vyvazene",
  );
  // Kým tréner sám nezmení zameranie, meníme ho podľa vybraných klientov.
  const [focusTouched, setFocusTouched] = useState(false);
  const [batch, setBatch] = useState<Batch | null>(null);
  const pending = singlePending || batchPending;
  const multi = selected.length > 1;
  const singleDay = focus !== "auto" && isSingleDayFocus(focus);

  if (clients.length === 0) {
    return <p className={styles.noWorkouts}>Najprv pridaj klienta na stránke Klienti.</p>;
  }

  const nameOf = (id: string) => clients.find((c) => c.id === id)?.full_name ?? "Klient";

  function onSelectionChange(ids: string[]) {
    setSelected(ids);
    if (ids.length > 0) setMissingClient(false);
    if (focusTouched && !(focus === "auto" && ids.length <= 1)) return;
    if (ids.length > 1) setFocus("auto");
    else setFocus(defaultFocusForSex(clients.find((c) => c.id === ids[0])?.sex ?? null));
  }

  /** Viacerí klienti: plán pre každého zvlášť, postupne — chyba jedného nezastaví ostatných. */
  function runBatch(clientIds: string[], params: AiPlanParams, kept: BatchItem[] = []) {
    setBatch({ total: clientIds.length, kept: kept.length, current: 0, currentName: nameOf(clientIds[0]), items: kept, params });
    startBatch(async () => {
      const items: BatchItem[] = [...kept];
      for (let i = 0; i < clientIds.length; i++) {
        const clientId = clientIds[i];
        setBatch((b) => b && { ...b, current: i, currentName: nameOf(clientId) });
        let res: AiPlanForClientResult;
        try {
          res = await generateAiPlanForClientAction(params, clientId);
        } catch {
          res = { error: "Spojenie so serverom zlyhalo.", planId: null, warnings: [] };
        }
        items.push({ ...res, clientId, name: nameOf(clientId) });
        setBatch((b) => b && { ...b, items: [...items] });
      }
      setBatch((b) => b && { ...b, current: null, currentName: null });
    });
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    if (selected.length === 0) {
      e.preventDefault();
      setMissingClient(true);
      return;
    }
    if (!multi) return; // jeden klient → formulárová akcia ako doteraz (presmerovanie do konceptu)
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    runBatch(selected, {
      goal: String(fd.get("goal") ?? ""),
      experience: String(fd.get("experience") ?? ""),
      equipment: String(fd.get("equipment") ?? ""),
      focus: String(fd.get("focus") ?? "vyvazene"),
      daysPerWeek: fd.get("days_per_week") ? Number(fd.get("days_per_week")) : null,
    });
  }

  const count = selected.length;
  const submitLabel = multi
    ? `${singleDay ? "Navrhnúť tréning" : "Navrhnúť plány"} pre ${count} ${pluralSk(count, "klienta", "klientov", "klientov")}`
    : singleDay
      ? "Navrhnúť tréning na jeden deň"
      : "Navrhnúť plán s AI";
  const running = batch !== null && batch.current !== null;
  const failed = batch && !running ? batch.items.filter((it) => !it.planId) : [];
  const succeeded = batch ? batch.items.filter((it) => it.planId).length : 0;

  return (
    <form action={formAction} onSubmit={onSubmit} className={styles.addClientForm} aria-label="AI generátor plánu">
      <ClientMultiSelect
        clients={clients}
        selected={selected}
        onChange={onSelectionChange}
        disabled={pending}
        invalid={missingClient}
      />
      <div className={styles.addClientFields}>
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
            setFocus(e.target.value as FocusChoice);
            setFocusTouched(true);
          }}
          aria-label="Zameranie"
          title="Zameranie"
        >
          <optgroup label="Celý plán">
            {multi && <option value="auto">Podľa pohlavia klienta</option>}
            <option value="vyvazene">{WHOLE_PLAN_FOCUS_LABEL_SK.vyvazene}</option>
            <option value="horna">{WHOLE_PLAN_FOCUS_LABEL_SK.horna}</option>
            <option value="dolna">{WHOLE_PLAN_FOCUS_LABEL_SK.dolna}</option>
          </optgroup>
          <optgroup label="Jeden deň na partiu">
            {DAY_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {DAY_CATEGORY_LABEL_SK[cat]}
              </option>
            ))}
          </optgroup>
        </select>
        {!singleDay && (
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
        )}
        <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
          {running ? `Generujem ${batch.current! + 1}/${batch.total}…` : singlePending ? "Generujem…" : submitLabel}
        </button>
        <InfoTip title="Ako funguje AI generátor">
          {singleDay
            ? `Appka vygeneruje presne 1 tréningový deň zameraný na „${DAY_CATEGORY_LABEL_SK[focus as (typeof DAY_CATEGORIES)[number]]}" — cviky výhradne z tejto partie, počet dní v týždni sa neberie do úvahy. Plán sa otvorí ako koncept, pred publikovaním vieš čokoľvek upraviť aj premenovať.`
            : "Appka vygeneruje plán na zadaný počet dní, AI vyberie konkrétne cviky z knižnice s ohľadom na zvolené zameranie — plán sa otvorí ako koncept, pred publikovaním vieš čokoľvek upraviť aj premenovať. Zameranie sa predvyplní podľa pohlavia klienta, ak ho appka pozná."}
          {" "}
          Pri viacerých klientoch vznikne pre každého samostatný koncept — AI zohľadní aj jeho údaje (cieľ z karty, vek,
          váhu, aktivitu a tvoju poznámku o obmedzeniach).
        </InfoTip>
      </div>
      {missingClient && <p className={styles.addClientError}>Vyber aspoň jedného klienta.</p>}
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

      {batch && (
        <div className={styles.aiBatch} aria-live="polite">
          {running ? (
            <>
              <p className={styles.aiBatchHead}>
                Generujem {batch.current! + 1}/{batch.total}… <span className={styles.aiBatchCurrent}>{batch.currentName}</span>
              </p>
              <div
                className={styles.aiBatchBar}
                role="progressbar"
                aria-label="Priebeh generovania"
                aria-valuemin={0}
                aria-valuemax={batch.total}
                aria-valuenow={batch.items.length - batch.kept}
              >
                <span style={{ width: `${((batch.items.length - batch.kept) / batch.total) * 100}%` }} />
              </div>
            </>
          ) : (
            <p className={styles.aiBatchHead}>
              Hotovo: {succeeded} z {batch.items.length} {pluralSk(batch.items.length, "plánu", "plánov", "plánov")} vygenerovaných
              {failed.length > 0 ? ` · ${failed.length} ${pluralSk(failed.length, "zlyhal", "zlyhali", "zlyhalo")}` : ""}.
            </p>
          )}
          {batch.items.length > 0 && (
            <ul className={styles.aiBatchList}>
              {batch.items.map((it) => (
                <li key={it.clientId} className={`${styles.aiBatchItem} ${it.planId ? "" : styles.aiBatchItemFailed}`}>
                  <span className={styles.aiBatchName}>
                    {it.planId ? "✓" : "✕"} {it.name}
                  </span>
                  {it.planId ? (
                    <Link href={`/dashboard/treningy/${it.planId}`} className={styles.aiBatchLink}>
                      Otvoriť koncept →
                    </Link>
                  ) : (
                    <span className={styles.aiBatchError}>{it.error}</span>
                  )}
                  {it.warnings.map((w, i) => (
                    <p key={i} className={styles.aiPlanWarning}>
                      {w}
                    </p>
                  ))}
                </li>
              ))}
            </ul>
          )}
          {!running && failed.length > 0 && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() =>
                runBatch(
                  failed.map((it) => it.clientId),
                  batch.params,
                  batch.items.filter((it) => it.planId),
                )
              }
              disabled={pending}
            >
              Skúsiť znova ({failed.length})
            </button>
          )}
        </div>
      )}
    </form>
  );
}
