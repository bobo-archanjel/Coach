"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PortalPlan, PortalTrainingData } from "@/lib/portal/types";
import { deleteClientPlanAction, setActivePlanAction } from "./actions";
import { ClientPlanBuilder } from "./ClientPlanBuilder";
import styles from "../portal.module.css";

/* Zoznam tréningových plánov klienta + vstup do buildera vlastného tréningu.
   Ťuk na plán = rozbalí dni a (ak ešte nie je) nastaví ho ako aktívny — potom
   ho karta Dnes berie ako "dnešný tréning" presne ako plán od trénera. */

const PlusIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
  </svg>
);

const ChevronIcon = ({ className }: { className?: string }) => (
  <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

function dayWord(n: number): string {
  if (n === 1) return "deň";
  if (n >= 2 && n <= 4) return "dni";
  return "dní";
}

export function TrainingSection({ data }: { data: PortalTrainingData }) {
  const router = useRouter();
  const { plans, exerciseLibrary } = data;

  const [mode, setMode] = useState<"list" | "build">("list");
  const [editing, setEditing] = useState<PortalPlan | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(data.activePlanId);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const openBuilder = (plan: PortalPlan | null) => {
    setEditing(plan);
    setError(null);
    setMode("build");
  };
  const closeBuilder = () => {
    setMode("list");
    setEditing(null);
  };
  const onSaved = () => {
    closeBuilder();
    router.refresh();
  };

  const tapPlan = (plan: PortalPlan) => {
    setError(null);
    if (plan.isActive) {
      setExpandedId((id) => (id === plan.id ? null : plan.id));
      return;
    }
    setExpandedId(plan.id);
    startTransition(async () => {
      const res = await setActivePlanAction(plan.id);
      if (res.error) setError(res.error);
      else router.refresh();
    });
  };

  const removePlan = (planId: string) => {
    setError(null);
    startTransition(async () => {
      const res = await deleteClientPlanAction(planId);
      if (res.error) setError(res.error);
      else {
        setConfirmDelete(null);
        router.refresh();
      }
    });
  };

  // "Začať tréning" — nastaví plán ako aktívny a prejde na kartu Dnes, kde beží
  // presne ten istý štart tréningu ako pri pláne od trénera (Začať tréning →
  // formulár sérií + plávajúce stopky, logovanie cez finishWorkoutAction).
  const startPlan = (plan: PortalPlan) => {
    setError(null);
    if (plan.isActive) {
      router.push("/portal");
      return;
    }
    startTransition(async () => {
      const res = await setActivePlanAction(plan.id);
      if (res.error) setError(res.error);
      else router.push("/portal");
    });
  };

  if (mode === "build") {
    return (
      <ClientPlanBuilder library={exerciseLibrary} initial={editing} onCancel={closeBuilder} onSaved={onSaved} />
    );
  }

  return (
    <section aria-label="Tréningové plány" className={styles.trWrap}>
      <div className={styles.trHead}>
        <p className={styles.panelLabel}>Tréningové plány</p>
        <button
          type="button"
          className={plans.length > 0 ? styles.trBuildBtnGhost : styles.trBuildBtn}
          onClick={() => openBuilder(null)}
        >
          <PlusIcon /> Vlastný tréning
        </button>
      </div>

      {error && (
        <p className={styles.trError} role="alert">
          {error}
        </p>
      )}

      {plans.length === 0 ? (
        <div className={styles.panel}>
          <p className={styles.trEmptyLead}>Zatiaľ tu nič nie je</p>
          <p className={styles.trEmptyBody}>
            Vytvor si vlastný tréning — naklikáš cviky, uložíš a bude ti fungovať rovnako ako plán od trénera.
            Ak máš trénera, tvoj plán sa tu objaví hneď, ako ti ho pridá.
          </p>
        </div>
      ) : (
        <ul className={styles.trPlanList}>
          {plans.map((plan) => {
            const expanded = expandedId === plan.id;
            return (
              <li key={plan.id} className={`${styles.trPlan} ${plan.isActive ? styles.trPlanActive : ""}`}>
                <button
                  type="button"
                  className={styles.trPlanHead}
                  onClick={() => tapPlan(plan)}
                  aria-expanded={expanded}
                  disabled={pending}
                >
                  <span className={styles.trPlanTop}>
                    <span className={styles.trPlanName}>{plan.name}</span>
                    <ChevronIcon className={`${styles.trChev} ${expanded ? styles.trChevOpen : ""}`} />
                  </span>
                  <span className={styles.trPlanChips}>
                    {plan.isActive && <span className={styles.trActivePill}>Aktívny</span>}
                    <span className={styles.trSrcChip} data-src={plan.source}>
                      {plan.source === "trainer" ? "Od trénera" : "Vlastný"}
                    </span>
                    <span className={styles.chip}>
                      {plan.days.length} {dayWord(plan.days.length)}
                    </span>
                  </span>
                </button>

                {expanded && (
                  <div className={styles.trPlanBody}>
                    {plan.days.length === 0 ? (
                      <p className={styles.trEmptyDay}>Tento tréning nemá žiadne dni.</p>
                    ) : (
                      plan.days.map((day) => (
                        <div key={day.id} className={styles.trDay}>
                          <p className={styles.panelLabel}>{day.name}</p>
                          {day.exercises.length > 0 ? (
                            <ol className={styles.exList}>
                              {day.exercises.map((ex, i) => (
                                <li key={`${ex.idx}-${i}`} className={styles.exRow}>
                                  <span className={styles.exIdx}>{ex.idx}</span>
                                  <span className={styles.exBody}>
                                    <span className={styles.exName}>{ex.name}</span>
                                    <span className={styles.exMeta}>
                                      {[ex.scheme, ex.rest && `pauza ${ex.rest}`, ex.tempo && `tempo ${ex.tempo}`]
                                        .filter(Boolean)
                                        .join(" · ")}
                                    </span>
                                  </span>
                                  {ex.load && <span className={styles.exLoad}>{ex.load}</span>}
                                </li>
                              ))}
                            </ol>
                          ) : (
                            <p className={styles.trEmptyDay}>Žiadne cviky.</p>
                          )}
                        </div>
                      ))
                    )}

                    <div className={styles.trPlanActions}>
                      {confirmDelete === plan.id ? (
                        <>
                          <span className={styles.trConfirmText}>Naozaj zmazať tento tréning?</span>
                          <button
                            type="button"
                            className={styles.trDangerBtn}
                            onClick={() => removePlan(plan.id)}
                            disabled={pending}
                          >
                            Zmazať
                          </button>
                          <button
                            type="button"
                            className={styles.trGhostBtn}
                            onClick={() => setConfirmDelete(null)}
                            disabled={pending}
                          >
                            Nie
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            className={styles.trStartBtn}
                            onClick={() => startPlan(plan)}
                            disabled={pending}
                          >
                            Začať tréning
                          </button>
                          {plan.source === "client" && (
                            <>
                              <button type="button" className={styles.trGhostBtn} onClick={() => openBuilder(plan)}>
                                Upraviť
                              </button>
                              <button
                                type="button"
                                className={styles.trGhostBtn}
                                onClick={() => setConfirmDelete(plan.id)}
                              >
                                Zmazať
                              </button>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {plans.length > 1 && (
        <p className={styles.trHint}>Ťukni na tréning a nastaví sa ako aktívny — ten sa potom zobrazuje na karte Dnes.</p>
      )}
    </section>
  );
}
