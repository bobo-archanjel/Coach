"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState, useTransition, type FormEvent } from "react";
import { ThinkingOrb } from "thinking-orbs";
import { AppLink as Link } from "../../components/AppLink";
import { useLoadingMessage } from "../../components/useLoadingMessage";
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
  isSingleDayFocus,
} from "@/lib/ai/planCategories";
import { defaultFocusForSex } from "@/lib/ai/planClientContext";
import { InfoTip } from "@/app/components/InfoTip";
import { ClientMultiSelect } from "../ClientMultiSelect";
import styles from "../dashboard.module.css";

const initialState: ActionState = { error: null };

/** Psychológia spinnerov (feature/navod) — rotujúci text namiesto statického
 * "Generujem…", zobrazí sa až po ~500ms (useLoadingMessage), takže rýchla
 * odpoveď nikdy nestihne mihnúť loading chrome. */

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
  const [state, formAction, singlePending] = useActionState(generatePlanWithAiAction, initialState);
  const t = useTranslations("plans.ai");
  const tl = useTranslations("labels");
  const loadingMessage = useLoadingMessage(singlePending, [t("msg1"), t("msg2"), t("msg3"), t("msg4")]);
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
    return <p className={styles.noWorkouts}>{t("noClients")}</p>;
  }

  const nameOf = (id: string) => clients.find((c) => c.id === id)?.full_name ?? t("clientFallback");

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
          res = { error: t("connectionFailed"), planId: null, warnings: [] };
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
    ? singleDay
      ? t("submitMultiDay", { count })
      : t("submitMultiPlan", { count })
    : singleDay
      ? t("submitDay")
      : t("submitPlan");
  const running = batch !== null && batch.current !== null;
  const failed = batch && !running ? batch.items.filter((it) => !it.planId) : [];
  const succeeded = batch ? batch.items.filter((it) => it.planId).length : 0;

  return (
    <form action={formAction} onSubmit={onSubmit} className={styles.addClientForm} aria-label={t("formLabel")}>
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
            {t("goal")}
          </option>
          <option value="chudnutie">{t("goalLose")}</option>
          <option value="hypertrofia">{t("goalHypertrophy")}</option>
          <option value="sila">{t("goalStrength")}</option>
          <option value="kondicia">{t("goalFitness")}</option>
        </select>
        <select name="experience" required disabled={pending} className={styles.addClientInput} defaultValue="">
          <option value="" disabled>
            {t("experience")}
          </option>
          <option value="zaciatocnik">{tl("experience.zaciatocnik")}</option>
          <option value="stredne_pokrocily">{tl("experience.stredne_pokrocily")}</option>
          <option value="pokrocily">{tl("experience.pokrocily")}</option>
        </select>
        <select name="equipment" required disabled={pending} className={styles.addClientInput} defaultValue="">
          <option value="" disabled>
            {t("equipment")}
          </option>
          <option value="plna_posilnovna">{t("equipmentGym")}</option>
          <option value="domace_vybavenie">{t("equipmentHome")}</option>
          <option value="len_telo">{t("equipmentBody")}</option>
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
          aria-label={t("focus")}
          title={t("focus")}
        >
          <optgroup label={t("wholePlan")}>
            {multi && <option value="auto">{t("bySex")}</option>}
            <option value="vyvazene">{tl("wholeFocus.vyvazene")}</option>
            <option value="horna">{tl("wholeFocus.horna")}</option>
            <option value="dolna">{tl("wholeFocus.dolna")}</option>
          </optgroup>
          <optgroup label={t("oneDay")}>
            {DAY_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {tl(`dayCategory.${cat}`)}
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
            placeholder={t("daysPlaceholder")}
            aria-label={t("daysAria")}
            title={t("daysTitle")}
          />
        )}
        <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
          {running
            ? t("generatingProgress", { current: batch.current! + 1, total: batch.total })
            : singlePending
              ? t("generating")
              : submitLabel}
        </button>
        <InfoTip title={t("howTitle")}>
          {singleDay
            ? t("howDay", { category: tl(`dayCategory.${focus as (typeof DAY_CATEGORIES)[number]}`) })
            : t("howPlan")}{" "}
          {t("howMulti")}
        </InfoTip>
      </div>
      {missingClient && <p className={styles.addClientError}>{t("chooseClient")}</p>}
      {singlePending && (
        <div className={styles.aiPlanResult}>
          <div className={styles.aiGeneratingRow}>
            <ThinkingOrb state="solving" size={64} />
            <p className={styles.aiGeneratingText}>{loadingMessage ?? t("generating")}</p>
          </div>
        </div>
      )}
      {state.error && <p className={styles.addClientError}>{state.error}</p>}
      {state.planId && (
        <div className={styles.aiPlanResult}>
          {state.warnings?.map((w, i) => (
            <p key={i} className={styles.aiPlanWarning}>
              {w}
            </p>
          ))}
          <Link href={`/dashboard/treningy/${state.planId}`} className="btn btn-primary btn-sm">
            {t("openDraft")}
          </Link>
        </div>
      )}

      {batch && (
        <div className={styles.aiBatch} aria-live="polite">
          {running ? (
            <>
              <p className={styles.aiBatchHead}>
                {t("generatingProgress", { current: batch.current! + 1, total: batch.total })}{" "}
                <span className={styles.aiBatchCurrent}>{batch.currentName}</span>
              </p>
              <div
                className={styles.aiBatchBar}
                role="progressbar"
                aria-label={t("progressLabel")}
                aria-valuemin={0}
                aria-valuemax={batch.total}
                aria-valuenow={batch.items.length - batch.kept}
              >
                <span style={{ width: `${((batch.items.length - batch.kept) / batch.total) * 100}%` }} />
              </div>
            </>
          ) : (
            <p className={styles.aiBatchHead}>
              {t("batchDone", { succeeded, count: batch.items.length })}
              {failed.length > 0 ? t("batchFailed", { count: failed.length }) : ""}.
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
                      {t("openDraft")}
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
              {t("retry", { count: failed.length })}
            </button>
          )}
        </div>
      )}
    </form>
  );
}
