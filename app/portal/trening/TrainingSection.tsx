"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ExerciseOption, PortalPlan, PortalTrainingData } from "@/lib/portal/types";
import { deleteClientPlanAction, getExerciseLibraryAction, setActivePlanAction } from "./actions";
import { ClientPlanBuilder } from "./ClientPlanBuilder";
import { ExercisePreviewList } from "../ExercisePreviewList";
import styles from "../portal.module.css";

/* Zoznam tréningových plánov klienta + vstup do buildera vlastného tréningu.
   Ťuk na plán rozbalí zoznam jeho dní; ťuk na deň ukáže jeho cviky a akčné
   tlačidlo — nastaví plán (a tento deň) ako aktívny, ktorý potom karta Dnes
   berie ako "dnešný tréning" presne ako plán od trénera. Ak je deň už DNES
   odcvičený ("doneToday", odlišné od "niekedy odcvičený" badge "Hotovo"),
   tlačidlo namiesto "Začať tréning" ponúka "Upraviť tréning" — klik aj tak
   vedie na kartu Dnes, len tam už čaká hotový deň s "Upraviť hodnoty", nie
   prázdny formulár sérií. */

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

const PencilIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M4 20l1-4.2L15.6 5.2a1.5 1.5 0 0 1 2.1 0l1.1 1.1a1.5 1.5 0 0 1 0 2.1L8.2 19l-4.2 1Z"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

function dayWord(n: number): string {
  if (n === 1) return "deň";
  if (n >= 2 && n <= 4) return "dni";
  return "dní";
}

function exWord(n: number): string {
  if (n === 1) return "cvik";
  if (n >= 2 && n <= 4) return "cviky";
  return "cvikov";
}

export function TrainingSection({ data }: { data: PortalTrainingData }) {
  const router = useRouter();
  const { plans } = data;

  const [mode, setMode] = useState<"list" | "build">("list");
  const [editing, setEditing] = useState<PortalPlan | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(data.activePlanId);
  // Vybraný deň v rámci rozbaleného tréningu — samostatný krok pred zobrazením
  // cvikov a tlačidla "Začať tréning" (predtým sa všetky dni so všetkými cvikmi
  // vypísali naraz, pôsobilo to chaoticky).
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Knižnica cvikov (~900 riadkov, cca 300 kB) sa predtým ťahala pri KAŽDOM
  // načítaní /portal/trening, aj keď väčšina návštev builder vôbec neotvorí —
  // teraz až tu, na požiadanie, keď klient reálne klikne "Vlastný tréning"/"Upraviť".
  const [library, setLibrary] = useState<ExerciseOption[]>([]);
  const [, startLibraryTransition] = useTransition();

  const openBuilder = (plan: PortalPlan | null) => {
    setEditing(plan);
    setError(null);
    setMode("build");
    // Znova sa nepýta, ak už raz v tejto relácii prišla (zatvorenie a opätovné
    // otvorenie buildera v rámci tej istej návštevy /portal/trening).
    if (library.length === 0) {
      startLibraryTransition(async () => {
        setLibrary(await getExerciseLibraryAction());
      });
    }
  };
  const closeBuilder = () => {
    setMode("list");
    setEditing(null);
  };
  const onSaved = () => {
    closeBuilder();
    router.refresh();
  };

  // Ťuk na tréning len rozbalí/zbalí zoznam jeho dní — nemení, čo beží na karte
  // Dnes. Aktívny plán sa nastaví až pri "Začať tréning" pre konkrétny deň.
  const tapPlan = (plan: PortalPlan) => {
    setError(null);
    setSelectedDayId(null);
    setExpandedId((id) => (id === plan.id ? null : plan.id));
  };

  const selectDay = (dayId: string) => {
    setError(null);
    setSelectedDayId(dayId);
  };

  const backToDays = () => {
    setError(null);
    setSelectedDayId(null);
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

  // "Začať tréning" — nastaví plán aj presne tento deň ako aktívny (0022: bez
  // dayId by karta Dnes aj tak dopočítala "ďalší deň v rotácii" sama, čo sa
  // nemusí zhodovať s dňom, ktorý si tu klient vybral a odcvičil) a prejde na
  // kartu Dnes, kde beží ten istý flow ako pri pláne od trénera (formulár sérií
  // + plávajúce stopky, logovanie cez finishWorkoutAction).
  const startPlan = (plan: PortalPlan, dayId: string) => {
    setError(null);
    startTransition(async () => {
      const res = await setActivePlanAction(plan.id, dayId);
      if (res.error) setError(res.error);
      else router.push("/portal");
    });
  };

  if (mode === "build") {
    return (
      <ClientPlanBuilder library={library} initial={editing} onCancel={closeBuilder} onSaved={onSaved} />
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
            const selectedDay = expanded && selectedDayId ? (plan.days.find((d) => d.id === selectedDayId) ?? null) : null;
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
                    ) : selectedDay ? (
                      <>
                        <button type="button" className={styles.trDayBack} onClick={backToDays}>
                          <ChevronIcon className={styles.trDayBackIcon} /> Všetky dni
                        </button>
                        <div className={styles.trDay}>
                          <p className={styles.panelLabel}>
                            {selectedDay.name}
                            {selectedDay.done && <span className={styles.trDoneBadge}>Hotovo</span>}
                          </p>
                          {selectedDay.exercises.length > 0 ? (
                            <ExercisePreviewList exercises={selectedDay.exercises} />
                          ) : (
                            <p className={styles.trEmptyDay}>Žiadne cviky.</p>
                          )}
                        </div>

                        <div className={styles.trPlanActions}>
                          <button
                            type="button"
                            className={styles.trStartBtn}
                            onClick={() => startPlan(plan, selectedDay.id)}
                            disabled={pending}
                          >
                            {selectedDay.doneToday ? (
                              <>
                                <PencilIcon /> Upraviť tréning
                              </>
                            ) : (
                              "Začať tréning"
                            )}
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <ul className={styles.trDayList}>
                          {plan.days.map((day) => (
                            <li key={day.id}>
                              <button type="button" className={styles.trDayBtn} onClick={() => selectDay(day.id)}>
                                <span className={styles.trDayBtnName}>{day.name}</span>
                                <span className={styles.trDayBtnMeta}>
                                  <span className={`${styles.trDoneBadge} ${!day.done ? styles.trDoneBadgeHidden : ""}`}>
                                    Hotovo
                                  </span>
                                  <span className={styles.chip}>
                                    {day.exercises.length} {exWord(day.exercises.length)}
                                  </span>
                                  <ChevronIcon className={styles.trDayBtnChevron} />
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>

                        {plan.source === "client" && (
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
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {plans.length > 1 && (
        <p className={styles.trHint}>Ťukni na tréning a vyber si deň — „Začať tréning“ ho nastaví ako aktívny na karte Dnes.</p>
      )}
    </section>
  );
}
