"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState, type FormEvent } from "react";
import { ThinkingOrb } from "thinking-orbs";
import { AppLink as Link } from "../../components/AppLink";
import { InfoTip } from "@/app/components/InfoTip";
import { useLoadingMessage } from "../../components/useLoadingMessage";
import { generateMealPlanWithAiAction, type MealAiState } from "./aiActions";
import { EXCLUDED_TEXT_MAX } from "@/lib/ai/mealPlanValidation";
import styles from "../dashboard.module.css";

const initialState: MealAiState = { error: null };

export interface MealAiClient {
  id: string;
  full_name: string;
  /** makro cieľ z nutrition_profiles; null = ešte nenastavený */
  target: { kcal: number; protein: number; carbs: number; fat: number } | null;
}

/**
 * AI generátor jedálnička na /dashboard/jedalnicky (rovnako ako AI generátor plánu v Tréningoch) —
 * pre JEDNÉHO klienta. Vznikne koncept, ktorý sa otvorí v builderi. Bez makro cieľa klienta
 * sa negeneruje — formulár namiesto toho odkáže na jeho nastavenie.
 */
export function AiMealGeneratorForm({ clients }: { clients: MealAiClient[] }) {
  const t = useTranslations("mealPlans.ai");
  const [state, formAction, pending] = useActionState(generateMealPlanWithAiAction, initialState);
  const loadingMessage = useLoadingMessage(pending, [t("msg1"), t("msg2"), t("msg3"), t("msg4"), t("msg5")]);
  const [clientId, setClientId] = useState(() => (clients.length === 1 ? clients[0].id : ""));
  const [missingClient, setMissingClient] = useState(false);

  if (clients.length === 0) return <p className={styles.noWorkouts}>{t("noClients")}</p>;

  const selected = clients.find((c) => c.id === clientId) ?? null;
  const noProfile = selected !== null && selected.target === null;

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    if (!clientId) {
      e.preventDefault();
      setMissingClient(true);
    }
  }

  return (
    <form action={formAction} onSubmit={onSubmit} className={styles.addClientForm} aria-label={t("formLabel")}>
      <div className={styles.fieldGrid}>
        <label className={styles.fieldGridFull}>
          {t("client")}
          <select
            name="client_id"
            value={clientId}
            onChange={(e) => {
              setClientId(e.target.value);
              setMissingClient(false);
            }}
            disabled={pending}
            className={styles.addClientInput}
            aria-invalid={missingClient || undefined}
          >
            <option value="" disabled>
              {t("chooseClientOption")}
            </option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.full_name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("days")}
          <input
            name="days"
            type="number"
            min={1}
            max={7}
            defaultValue={3}
            required
            disabled={pending}
            className={styles.addClientInput}
          />
        </label>
        <label>
          {t("mealsPerDay")}
          <select name="meals_per_day" defaultValue="4" disabled={pending} className={styles.addClientInput}>
            {[3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>
                {t("mealsOption", { count: n })}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("diet")}
          <select name="diet" defaultValue="none" disabled={pending} className={styles.addClientInput}>
            <option value="none">{t("dietNone")}</option>
            <option value="vegetarian">{t("dietVegetarian")}</option>
            <option value="vegan">{t("dietVegan")}</option>
            <option value="lactose_free">{t("dietLactoseFree")}</option>
            <option value="gluten_free">{t("dietGlutenFree")}</option>
          </select>
        </label>
        <label>
          {t("repeat")}
          <select name="repeat" defaultValue="varied" disabled={pending} className={styles.addClientInput}>
            <option value="varied">{t("repeatVaried")}</option>
            <option value="meal_prep">{t("repeatPrep")}</option>
          </select>
        </label>
        <label className={styles.fieldGridFull}>
          {t("excluded")}
          <input
            name="excluded"
            type="text"
            maxLength={EXCLUDED_TEXT_MAX}
            placeholder={t("excludedPlaceholder")}
            disabled={pending}
            className={styles.addClientInput}
          />
        </label>
      </div>

      {selected?.target && (
        <p className={styles.formHint}>
          {t("target", {
            kcal: selected.target.kcal,
            protein: selected.target.protein,
            carbs: selected.target.carbs,
            fat: selected.target.fat,
          })}
        </p>
      )}
      {noProfile && selected && (
        <p className={styles.aiPlanWarning}>
          {t("noProfile", { name: selected.full_name })}{" "}
          <Link href={`/dashboard/klienti/${selected.id}?sekcia=jedalnicky`}>{t("setProfile")}</Link>
        </p>
      )}

      <div className={styles.addClientFields} style={{ marginTop: 10 }}>
        <button type="submit" className="btn btn-primary btn-sm" disabled={pending || noProfile}>
          {pending ? t("generating") : t("submit")}
        </button>
        <InfoTip title={t("howTitle")}>{t("how")}</InfoTip>
      </div>

      {missingClient && <p className={styles.addClientError}>{t("chooseClient")}</p>}
      {pending && (
        <div className={styles.aiPlanResult} aria-live="polite">
          <div className={styles.aiGeneratingRow}>
            <ThinkingOrb state="solving" size={64} />
            <p className={styles.aiGeneratingText}>{loadingMessage ?? t("generating")}</p>
          </div>
        </div>
      )}
      {state.error && <p className={styles.addClientError}>{state.error}</p>}
      {state.planId && !pending && (
        <div className={styles.aiPlanResult}>
          {state.warnings?.map((w, i) => (
            <p key={i} className={styles.aiPlanWarning}>
              {w}
            </p>
          ))}
          <Link href={`/dashboard/jedalnicky/jedalnicek/${state.planId}`} className="btn btn-primary btn-sm">
            {t("openDraft")}
          </Link>
        </div>
      )}
    </form>
  );
}
