"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import type { PortalPlanChoice } from "@/lib/portal/types";
import { chooseActivePlanAction } from "@/app/portal/trening/actions";
import { clearWorkoutStarted, isWorkoutStarted } from "@/app/portal/workoutSession";
import s from "./portal.module.css";

const CloseIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
    <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);
const CheckIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
    <path d="M5 12.5l4.5 4.5L19 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);


/**
 * Karta Dnes: „Plán: <názov>“ a pri viacerých zverejnených plánoch „Zmeniť“ — spodný
 * panel so zoznamom plánov, ťuk prepne aktívny plán (chooseActivePlanAction, bez
 * spustenia tréningu). Rozbehnutý tréning (príznak z workoutSession) sa prepnutím
 * preruší — rozpísané hodnoty ostávajú uložené pri svojom dni.
 */
export function PlanSwitch({ choice, dayId = null }: { choice: PortalPlanChoice; dayId?: string | null }) {
  const t = useTranslations("today.planSwitch");
  const [open, setOpen] = useState(false);
  const changeRef = useRef<HTMLButtonElement>(null);
  const canChange = choice.plans.length > 1;

  const close = () => {
    setOpen(false);
    changeRef.current?.focus();
  };

  return (
    <>
      <div className={s.psRow}>
        <span className={s.psLabel}>{t("plan")}</span>
        <span className={s.psName}>{choice.activePlanName}</span>
        {canChange && (
          <button
            ref={changeRef}
            type="button"
            className={s.psChange}
            onClick={() => setOpen(true)}
            aria-haspopup="dialog"
          >
            {t("change")}
          </button>
        )}
      </div>
      {open && <PlanSwitchSheet choice={choice} dayId={dayId} onClose={close} />}
    </>
  );
}

function PlanSwitchSheet({
  choice,
  dayId,
  onClose,
}: {
  choice: PortalPlanChoice;
  dayId: string | null;
  onClose: () => void;
}) {
  const t = useTranslations("today.planSwitch");
  const [pending, startTransition] = useTransition();
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // tréning práve beží (Začať tréning na Dnes) — prepnutie ho preruší
  const [running] = useState(() => (dayId ? isWorkoutStarted(dayId) : false));
  const activeRef = useRef<HTMLButtonElement>(null);

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  // Escape zavrie, stránka pod panelom sa neposúva, fokus na aktuálne aktívny plán.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    activeRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  const pick = (planId: string) => {
    if (planId === choice.activePlanId) {
      onClose();
      return;
    }
    setError(null);
    setPickedId(planId);
    startTransition(async () => {
      const res = await chooseActivePlanAction(planId);
      if (res.error) {
        setError(res.error);
        setPickedId(null);
        return;
      }
      if (running) clearWorkoutStarted();
      onClose();
    });
  };

  const sheet = (
    <div className={s.psLayer}>
      <button type="button" className={s.psScrim} aria-label={t("close")} tabIndex={-1} onClick={onClose} />
      <div className={s.psSheet} role="dialog" aria-modal="true" aria-labelledby="plan-switch-title">
        <div className={s.psHead}>
          <h2 id="plan-switch-title" className={s.psTitle}>
            {t("title")}
          </h2>
          <button type="button" className={s.psClose} onClick={onClose} aria-label={t("close")}>
            <CloseIcon />
          </button>
        </div>
        <p className={s.psHint}>{t("hint")}</p>
        {running && (
          <p className={s.psWarn} role="note">
            {t("inProgress")}
          </p>
        )}
        <ul className={s.psList}>
          {choice.plans.map((plan) => {
            const active = plan.id === choice.activePlanId;
            // plán bez cvikov sa odcvičiť nedá — rovnako ako v Tréningu ho nejde zvoliť
            const empty = plan.dayCount === 0 && !active;
            return (
              <li key={plan.id}>
                <button
                  ref={active ? activeRef : undefined}
                  type="button"
                  className={`${s.psItem} ${active ? s.psItemOn : ""}`}
                  onClick={() => pick(plan.id)}
                  disabled={pending || empty}
                  data-empty={empty || undefined}
                  aria-current={active ? "true" : undefined}
                >
                  <span className={s.psItemText}>
                    <span className={s.psItemName}>{plan.name}</span>
                    <span className={s.psItemMeta}>
                      <span className={s.trSrcChip} data-src={plan.source}>
                        {plan.source === "trainer" ? t("fromTrainer") : t("own")}
                      </span>
                      <span className={s.chip}>{t("days", { count: plan.dayCount })}</span>
                    </span>
                  </span>
                  <span className={s.psItemEnd} aria-hidden={!active && pickedId !== plan.id}>
                    {active ? <CheckIcon /> : pending && pickedId === plan.id ? t("switching") : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {error && (
          <p className={s.psError} role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );

  return createPortal(sheet, document.querySelector("[data-v6-root]") ?? document.body);
}
