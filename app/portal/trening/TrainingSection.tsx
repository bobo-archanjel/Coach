"use client";

import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import type { ExerciseOption, PortalPlan, PortalTemplate, PortalTrainingData } from "@/lib/portal/types";
import {
  chooseActivePlanAction,
  deleteClientPlanAction,
  deleteOwnTemplateAction,
  getExerciseLibraryAction,
  saveOwnTemplateAction,
  setActivePlanAction,
} from "./actions";
import { ExercisePreviewList } from "../ExercisePreviewList";
import { CompletedExercises } from "@/app/components/CompletedExercises";
import { PlansTabs, type PlansTab } from "../PlansTabs";
import { clearBuilderDraft, loadBuilderDraft, type PlanBuilderDraft } from "./builderDraft";
import { clearWorkoutStarted, markWorkoutStarted } from "../workoutSession";
import { LoggedWorkoutEditor } from "../LoggedWorkoutEditor";
import { formatCompletedDate, formatEditDeadline, isStillEditable } from "@/lib/workouts/completed";
import { ActionEditIcon, ActionPreviewIcon, ActionTemplateIcon, ActionTrashIcon, ActionUseIcon } from "@/app/components/ActionIcons";
import pa from "@/app/components/planActions.module.css";
import styles from "../portal.module.css";

/** ?tvorba=1 = otvorený builder vlastného tréningu (záznam v histórii — späť ho zavrie). */
const BUILDER_PARAM = "tvorba";

function urlWithBuilder(open: boolean): string {
  const url = new URL(window.location.href);
  if (open) url.searchParams.set(BUILDER_PARAM, "1");
  else url.searchParams.delete(BUILDER_PARAM);
  return `${url.pathname}${url.search}${url.hash}`;
}

// Builder (432 riadkov aj s pickrom cvikov) potrebuje len klient, ktorý si
// naozaj stavia vlastný tréning — väčšina návštev /portal/trening len prezerá
// existujúce plány. Vlastný chunk, stiahne sa až pri "Vlastný tréning"/"Upraviť".
const ClientPlanBuilder = dynamic(() => import("./ClientPlanBuilder").then((m) => m.ClientPlanBuilder), {
  loading: () => <BuilderLoading />,
});

function BuilderLoading() {
  const tr = useTranslations("training");
  return <p className={styles.trEmptyDay}>{tr("loading")}</p>;
}

/* Zoznam tréningových plánov klienta + vstup do buildera vlastného tréningu.
   Ťuk na plán rozbalí zoznam jeho dní; ťuk na deň ukáže jeho cviky a akčné
   tlačidlo — nastaví plán (a tento deň) ako aktívny, ktorý potom karta Dnes
   berie ako "dnešný tréning" presne ako plán od trénera. Ak je deň už DNES
   odcvičený (badge "Hotovo"), plán je jednorazový — namiesto "Začať tréning"
   je nefarebné "Upraviť hodnoty" (24 h po ukončení, 0049) priamo tu v paneli,
   po uplynutí okna už len informácia, že záznam je uzavretý. */

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

export function TrainingSection({ data }: { data: PortalTrainingData }) {
  const tr = useTranslations("training");
  const locale = useLocale();
  const { plans, templates } = data;

  const [mode, setMode] = useState<"list" | "build">("list");
  const [editing, setEditing] = useState<PortalPlan | null>(null);
  // "Použiť" pri šablóne — builder nového tréningu predvyplnený jej obsahom.
  const [fromTemplate, setFromTemplate] = useState<PortalTemplate | null>(null);
  // Rozpracovaný vlastný tréning v prehliadači (builderDraft.ts) — karta „Pokračovať“ v zozname;
  // `resumeDraft` = koncept, s ktorým sa builder práve otvoril.
  const [savedDraft, setSavedDraft] = useState<PlanBuilderDraft | null>(null);
  const [resumeDraft, setResumeDraft] = useState<PlanBuilderDraft | null>(null);
  useEffect(() => {
    setSavedDraft(loadBuilderDraft(data.draftOwner));
  }, [data.draftOwner]);
  // Výsledok "Uložiť ako šablónu" pri konkrétnom tréningu (potvrdenie alebo chyba).
  const [templateNote, setTemplateNote] = useState<{ planId: string; text: string; error: boolean } | null>(null);
  const [confirmTplDelete, setConfirmTplDelete] = useState<string | null>(null);
  // Tréningové plány / Moje šablóny — prepínač v hlavičke sekcie
  const [tab, setTab] = useState<PlansTab>("plans");
  // ?plan=<id> (odkaz z upozornenia „Nový tréningový plán“) rozbalí presne ten plán,
  // inak aktívny plán (karta Dnes)
  const searchParams = useSearchParams();
  const linkedPlanId = searchParams.get("plan");
  const linkedPlan = linkedPlanId && plans.some((p) => p.id === linkedPlanId) ? linkedPlanId : null;
  const [expandedId, setExpandedId] = useState<string | null>(linkedPlan ?? data.activePlanId);
  // Vybraný deň v rámci rozbaleného tréningu — samostatný krok pred zobrazením
  // cvikov a tlačidla "Začať tréning" (predtým sa všetky dni so všetkými cvikmi
  // vypísali naraz, pôsobilo to chaoticky).
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  // Odcvičený deň otvorený v editore "Upraviť hodnoty" (id záznamu workout_logs).
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  // Odcvičený deň: posledný tréning (plán vs. skutočnosť) alebo plán dňa — prepínač.
  const [dayView, setDayView] = useState<"done" | "plan">("done");
  const [error, setError] = useState<string | null>(null);
  // Potvrdenie po „Nastaviť ako aktívny“ (pri pláne, ktorý sa práve stal aktívnym).
  const [activeNote, setActiveNote] = useState<{ planId: string; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  // Knižnica cvikov (~900 riadkov, cca 300 kB) sa predtým ťahala pri KAŽDOM
  // načítaní /portal/trening, aj keď väčšina návštev builder vôbec neotvorí —
  // teraz až tu, na požiadanie, keď klient reálne klikne "Vlastný tréning"/"Upraviť".
  const [library, setLibrary] = useState<ExerciseOption[]>([]);
  const [, startLibraryTransition] = useTransition();

  const openBuilder = (
    plan: PortalPlan | null,
    template: PortalTemplate | null = null,
    resume: PlanBuilderDraft | null = null,
  ) => {
    setEditing(plan);
    setFromTemplate(template);
    setResumeDraft(resume);
    setError(null);
    setMode("build");
    // Záznam v histórii (bez načítania stránky): späť v prehliadači, potiahnutie na mobile
    // (SwipeBack) aj „Tréning“ v menu builder zavrú — tlačidlo „Späť“ v ňom už nie je.
    if (!new URLSearchParams(window.location.search).has(BUILDER_PARAM)) {
      window.history.pushState(null, "", urlWithBuilder(true));
    }
    // Znova sa nepýta, ak už raz v tejto relácii prišla (zatvorenie a opätovné
    // otvorenie buildera v rámci tej istej návštevy /portal/trening).
    const viewOnly = Boolean(plan && plan.days.length > 0 && plan.days.every((d) => d.done));
    if (library.length === 0 && !viewOnly) {
      startLibraryTransition(async () => {
        setLibrary(await getExerciseLibraryAction());
      });
    }
  };
  const closeBuilder = useCallback(() => {
    setMode("list");
    setEditing(null);
    setFromTemplate(null);
    setResumeDraft(null);
    // odchod bez uloženia → koncept ostal v prehliadači, karta „Pokračovať“ ho ponúkne
    setSavedDraft(loadBuilderDraft(data.draftOwner));
  }, [data.draftOwner]);
  const continueDraft = () => {
    if (!savedDraft) return;
    const plan = savedDraft.planId ? (plans.find((p) => p.id === savedDraft.planId) ?? null) : null;
    // upravovaný tréning medzitým zmizol (zmazaný) — koncept nemá k čomu patriť
    if (savedDraft.planId && !plan) {
      clearBuilderDraft(data.draftOwner);
      setSavedDraft(null);
      return;
    }
    openBuilder(plan, null, savedDraft);
  };
  const discardDraft = () => {
    clearBuilderDraft(data.draftOwner);
    setSavedDraft(null);
  };
  /** Odchod z buildera (potiahnutie späť, uloženie): krok späť v histórii — ?tvorba zmizne
      a efekt nižšie builder zavrie; bez záznamu (napr. po obnovení stránky) rovno zavrie. */
  const leaveBuilder = () => {
    if (new URLSearchParams(window.location.search).has(BUILDER_PARAM)) window.history.back();
    else closeBuilder();
  };
  // ?tvorba zmizlo (späť v prehliadači / potiahnutie / „Tréning“ v menu) → zatvoriť builder.
  const hasBuilderParam = searchParams.has(BUILDER_PARAM);
  const hadBuilderParam = useRef(hasBuilderParam);
  useEffect(() => {
    if (hadBuilderParam.current && !hasBuilderParam) closeBuilder();
    hadBuilderParam.current = hasBuilderParam;
  }, [hasBuilderParam, closeBuilder]);
  // ?tvorba po obnovení stránky (builder je zatvorený) — z adresy preč, nech späť nevedie nikam.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has(BUILDER_PARAM)) {
      window.history.replaceState(null, "", urlWithBuilder(false));
    }
  }, []);
  // Uloženie aj zmazanie revalidujú /portal — čerstvý zoznam prichádza v odpovedi
  // akcie; router.refresh() navyše by celú stránku vykreslil zo servera druhýkrát.
  const onSaved = () => {
    leaveBuilder();
  };

  useEffect(() => {
    if (!linkedPlan) return;
    setExpandedId(linkedPlan);
    setSelectedDayId(null);
    setMode("list");
    // po vykreslení rozbaleného plánu — posun naň (pod hlavičkou)
    const t = window.setTimeout(() => {
      document.getElementById(`plan-${linkedPlan}`)?.scrollIntoView({ block: "start", behavior: "smooth" });
    }, 60);
    return () => window.clearTimeout(t);
  }, [linkedPlan]);

  // Ťuk na tréning len rozbalí/zbalí zoznam jeho dní — nemení, čo beží na karte
  // Dnes. Aktívny plán sa mení „Nastaviť ako aktívny“ alebo „Začať tréning“ pri dni.
  const tapPlan = (plan: PortalPlan) => {
    setError(null);
    setActiveNote(null);
    setEditingLogId(null);
    setSelectedDayId(null);
    setExpandedId((id) => (id === plan.id ? null : plan.id));
  };

  const selectDay = (dayId: string) => {
    setError(null);
    setEditingLogId(null);
    setDayView("done");
    setSelectedDayId(dayId);
  };

  const backToDays = () => {
    setError(null);
    setEditingLogId(null);
    setSelectedDayId(null);
  };

  // „Nastaviť ako aktívny“ — len prepne plán na karte Dnes, tréning nespustí (0056).
  const makeActive = (plan: PortalPlan) => {
    setError(null);
    setActiveNote(null);
    startTransition(async () => {
      const res = await chooseActivePlanAction(plan.id);
      if (res.error) setError(res.error);
      else setActiveNote({ planId: plan.id, text: `Na karte Dnes je teraz „${plan.name}“.` });
    });
  };

  const removePlan = (planId: string) => {
    setError(null);
    startTransition(async () => {
      const res = await deleteClientPlanAction(planId);
      if (res.error) setError(res.error);
      else {
        setConfirmDelete(null);
      }
    });
  };

  const saveTemplate = (planId: string) => {
    setError(null);
    setTemplateNote(null);
    startTransition(async () => {
      const res = await saveOwnTemplateAction(planId);
      setTemplateNote({
        planId,
        text: res.error ?? tr("templateSaved"),
        error: Boolean(res.error),
      });
    });
  };

  const removeTemplate = (templateId: string) => {
    setError(null);
    startTransition(async () => {
      const res = await deleteOwnTemplateAction(templateId);
      if (res.error) setError(res.error);
      else setConfirmTplDelete(null);
    });
  };

  // "Začať tréning" — nastaví plán aj presne tento deň ako aktívny (0022: bez
  // dayId by karta Dnes aj tak dopočítala "ďalší deň v rotácii" sama, čo sa
  // nemusí zhodovať s dňom, ktorý si tu klient vybral a odcvičil) a prejde na
  // kartu Dnes, kde beží ten istý flow ako pri pláne od trénera (formulár sérií
  // + plávajúce stopky, logovanie cez finishWorkoutAction).
  // Tréning sa tu aj rovno ZAČNE (príznak "tréning začatý", workoutSession.ts) —
  // predtým karta Dnes ukázala znova "Začať tréning" a klient musel ťukať 2×.
  // Príznak sa nastaví PRED requestom, nech ho karta Dnes pozná hneď pri prvom
  // vykreslení (žiadny záblesk "Začať tréning"); akcia potom sama presmeruje
  // (redirect → jeden round-trip). Pri chybe sa príznak vráti späť.
  const startPlan = (plan: PortalPlan, dayId: string) => {
    setError(null);
    markWorkoutStarted(dayId);
    startTransition(async () => {
      const res = await setActivePlanAction(plan.id, dayId);
      // Úspech → redirect vnútri akcie, sem sa vrátime len pri chybe.
      if (res?.error) {
        clearWorkoutStarted();
        setError(res.error);
      }
    });
  };

  if (mode === "build") {
    // celý odcvičený vlastný plán = len náhľad (nič sa v ňom nedá zmeniť) + Analytika tréningu
    const viewOnly = Boolean(editing && editing.days.length > 0 && editing.days.every((d) => d.done));
    return (
      <ClientPlanBuilder
        // „Zopakovať s progresiou“ prepne z náhľadu na nový plán — builder začne odznova
        key={editing?.id ?? fromTemplate?.id ?? "new"}
        library={library}
        initial={editing}
        template={fromTemplate}
        onCancel={leaveBuilder}
        onSaved={onSaved}
        draftOwner={data.draftOwner}
        resume={resumeDraft}
        readOnly={viewOnly}
        reviewPreview={viewOnly && editing ? (data.previewReview?.[editing.id] ?? null) : null}
        // plán od trénera sa neopakuje — nový plán klientovi zostaví tréner (u neho „Zopakovať s progresiou“)
        onRepeat={editing?.source === "client" ? (template) => openBuilder(null, template) : undefined}
      />
    );
  }

  return (
    <section aria-label={tr("plans")} className={styles.trWrap}>
      <div className={`${styles.trHead} ${styles.trHeadTabs}`}>
        <PlansTabs
          value={tab}
          onChange={(next) => {
            setTab(next);
            setConfirmTplDelete(null);
          }}
          plansLabel={tr("plans")}
          templatesLabel={tr("myTemplates")}
          plansCount={plans.length}
          templatesCount={templates.length}
          ariaLabel={tr("tabsAria")}
          templatesTour="training-templates"
        />
        <button
          type="button"
          className={plans.length > 0 ? styles.trBuildBtnGhost : styles.trBuildBtn}
          onClick={() => openBuilder(null)}
          data-tour="training-own"
        >
          <PlusIcon /> {tr("ownWorkout")}
        </button>
      </div>

      {error && (
        <p className={styles.trError} role="alert">
          {error}
        </p>
      )}

      {/* rozpracovaný vlastný tréning (odchod z buildera bez uloženia — iný tab, refresh) */}
      {savedDraft && (
        <div className={styles.trDraft} role="status" data-testid="builder-draft">
          <p className={styles.trDraftText}>
            <span className={styles.trDraftLabel}>{savedDraft.planId ? tr("draftEditTitle") : tr("draftTitle")}</span>
            <span className={styles.trDraftName}>{savedDraft.name.trim() || tr("draftUnnamed")}</span>
          </p>
          <div className={pa.gridRow}>
            <button type="button" className={`${pa.action} ${pa.small} ${pa.primary}`} onClick={continueDraft}>
              <ActionEditIcon />
              {tr("draftContinue")}
            </button>
            <button type="button" className={`${pa.action} ${pa.small} ${pa.danger}`} onClick={discardDraft}>
              <ActionTrashIcon />
              {tr("draftDiscard")}
            </button>
          </div>
        </div>
      )}

      {tab === "templates" ? (
        templates.length === 0 ? (
          <div className={styles.panel}>
            <p className={styles.trEmptyBody}>{tr("templatesEmpty")}</p>
          </div>
        ) : (
          <div className={styles.trTplBox}>
            <ul id="moje-sablony" className={styles.trTplList}>
              {templates.map((t) => {
                const exCount = t.days.reduce((n, d) => n + d.exercises.length, 0);
                return (
                  <li key={t.id} className={styles.trTpl}>
                    <span className={styles.trTplText}>
                      <span className={styles.trTplName}>{t.name}</span>
                      <span className={styles.trTplMeta}>
                        {tr("tplMeta", { days: t.days.length, exercises: exCount })}
                      </span>
                    </span>
                    {/* Nový tréning predvyplnený šablónou — uloží sa ako nový, šablóna ostane. */}
                    {confirmTplDelete === t.id ? (
                      <div className={`${pa.confirm} ${pa.confirmWide}`}>
                        <span className={pa.confirmText}>{tr("deleteTemplate")}</span>
                        <span className={pa.confirmBtns}>
                          <button type="button" className={pa.confirmNo} onClick={() => setConfirmTplDelete(null)} disabled={pending}>
                            {tr("no")}
                          </button>
                          <button type="button" className={pa.confirmYes} onClick={() => removeTemplate(t.id)} disabled={pending}>
                            {tr("delete")}
                          </button>
                        </span>
                      </div>
                    ) : (
                      <div className={pa.gridRow}>
                        <button type="button" className={`${pa.action} ${pa.small} ${pa.primary}`} onClick={() => openBuilder(null, t)}>
                          <ActionUseIcon />
                          {tr("use")}
                        </button>
                        <button type="button" className={`${pa.action} ${pa.small} ${pa.danger}`} onClick={() => setConfirmTplDelete(t.id)}>
                          <ActionTrashIcon />
                          {tr("delete")}
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )
      ) : plans.length === 0 ? (
        <div className={styles.panel}>
          <p className={styles.trEmptyLead}>{tr("emptyLead")}</p>
          <p className={styles.trEmptyBody}>
            {tr("emptyText")} {tr("trainerHint")}
          </p>
        </div>
      ) : (
        <ul className={styles.trPlanList} data-tour="training-plans">
          {plans.map((plan) => {
            const expanded = expandedId === plan.id;
            const selectedDay = expanded && selectedDayId ? (plan.days.find((d) => d.id === selectedDayId) ?? null) : null;
            // celý plán odcvičený — „Hotovo“, aktívnym sa už nastaviť nedá (callSetActivePlan to odmietne)
            const planDone = plan.days.length > 0 && plan.days.every((d) => d.done);
            return (
              <li
                key={plan.id}
                id={`plan-${plan.id}`}
                className={`${styles.trPlan} ${plan.isActive ? styles.trPlanActive : ""}`}
              >
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
                    {plan.isActive && <span className={styles.trActivePill}>{tr("active")}</span>}
                    {planDone && <span className={styles.trDoneBadge}>{tr("done")}</span>}
                    <span className={styles.trSrcChip} data-src={plan.source}>
                      {plan.source === "trainer" ? tr("fromTrainer") : tr("own")}
                    </span>
                    {/* „Plán na 3 dni" — samotné „3 dni" klienti nechápali (koľko dní v týždni? trvanie?). */}
                    <span className={styles.chip}>
                      {plan.days.length > 0
                        ? tr("planDays", { count: plan.days.length })
                        : tr("planDays", { count: 0 })}
                    </span>
                  </span>
                </button>

                {expanded && (
                  <div className={styles.trPlanBody}>
                    {!selectedDay && !plan.isActive && planDone && (
                      <p className={`${styles.trHint} ${styles.trDoneHint}`}>{tr("planDoneHint")}</p>
                    )}
                    {!selectedDay && !plan.isActive && !planDone && plan.days.length > 0 && (
                      <div className={styles.trActiveRow}>
                        <button type="button" className={styles.trGhostBtn} onClick={() => makeActive(plan)} disabled={pending}>
                          {tr("setActive")}
                        </button>
                        <span className={styles.trHint}>{tr("showsOnToday")}</span>
                      </div>
                    )}
                    {!selectedDay && plan.isActive && activeNote?.planId === plan.id && (
                      <p className={styles.trActiveNote} role="status">
                        {activeNote.text}
                      </p>
                    )}
                    {plan.days.length === 0 ? (
                      <p className={styles.trEmptyDay}>{tr("noDays")}</p>
                    ) : selectedDay ? (
                      <>
                        <button type="button" className={styles.trDayBack} onClick={backToDays}>
                          <ChevronIcon className={styles.trDayBackIcon} /> {tr("allDays")}
                        </button>
                        <div className={styles.trDay}>
                          <p className={styles.panelLabel}>
                            {selectedDay.name}
                            {selectedDay.done && <span className={styles.trDoneBadge}>{tr("done")}</span>}
                          </p>
                          {selectedDay.lastLog &&
                          editingLogId === selectedDay.lastLog.id &&
                          isStillEditable(selectedDay.lastLog.editableUntil) ? (
                            <LoggedWorkoutEditor
                              logId={selectedDay.lastLog.id}
                              exercises={selectedDay.exercises}
                              logged={selectedDay.lastLog.entries}
                              rpe={selectedDay.lastLog.rpe}
                              note={selectedDay.lastLog.note}
                              editableUntil={selectedDay.lastLog.editableUntil!}
                              onClose={() => setEditingLogId(null)}
                            />
                          ) : selectedDay.lastLog ? (
                            <>
                              <div
                                className={`${styles.modeToggle} ${styles.mpTabs}`}
                                role="radiogroup"
                                aria-label={tr("dayViewAria")}
                              >
                                {(["done", "plan"] as const).map((v) => (
                                  <button
                                    key={v}
                                    type="button"
                                    role="radio"
                                    aria-checked={dayView === v}
                                    className={dayView === v ? styles.modeOn : undefined}
                                    onClick={() => setDayView(v)}
                                  >
                                    {v === "done" ? tr("dayViewDone") : tr("dayViewPlan")}
                                  </button>
                                ))}
                              </div>
                              {dayView === "plan" ? (
                                selectedDay.exercises.length > 0 ? (
                                  <ExercisePreviewList exercises={selectedDay.exercises} />
                                ) : (
                                  <p className={styles.trEmptyDay}>{tr("noExercises")}</p>
                                )
                              ) : selectedDay.lastLog.compare.exercises.length > 0 ? (
                                <CompletedExercises
                                  exercises={selectedDay.lastLog.compare.exercises}
                                  hasPlan={selectedDay.lastLog.compare.hasPlan}
                                  flat
                                />
                              ) : (
                                <p className={styles.trEmptyDay}>{tr("doneNoValues")}</p>
                              )}
                            </>
                          ) : selectedDay.exercises.length > 0 ? (
                            <ExercisePreviewList exercises={selectedDay.exercises} />
                          ) : (
                            <p className={styles.trEmptyDay}>{tr("noExercises")}</p>
                          )}
                        </div>

                        {!selectedDay.done ? (
                          <div className={styles.trPlanActions}>
                            <button
                              type="button"
                              className={styles.trStartBtn}
                              onClick={() => startPlan(plan, selectedDay.id)}
                              disabled={pending}
                            >
                              {tr("start")}
                            </button>
                          </div>
                        ) : editingLogId === null &&
                          selectedDay.lastLog &&
                          isStillEditable(selectedDay.lastLog.editableUntil) ? (
                          <div className={styles.trPlanActions}>
                            <button
                              type="button"
                              className={styles.editValuesBtn}
                              onClick={() => setEditingLogId(selectedDay.lastLog!.id)}
                            >
                              <PencilIcon /> {tr("editValues")}
                            </button>
                            <p className={styles.lockNote}>
                              {tr("editUntil", { deadline: formatEditDeadline(selectedDay.lastLog.editableUntil!, undefined, locale) })}
                            </p>
                          </div>
                        ) : editingLogId === null ? (
                          <p className={styles.lockNote}>
                            {tr("doneLocked", {
                              date: selectedDay.lastLog?.completedAt
                                ? ` ${formatCompletedDate(selectedDay.lastLog.completedAt, locale)}`
                                : "",
                            })}
                          </p>
                        ) : null}
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
                                    {tr("done")}
                                  </span>
                                  <span className={styles.chip}>
                                    {tr("exercises", { count: day.exercises.length })}
                                  </span>
                                  <ChevronIcon className={styles.trDayBtnChevron} />
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>

                        {/* akcie pod plánom — rovnaký panel ako pod jedálničkom (mriežka tlačidiel
                            s ikonami): vlastný tréning Upraviť / Uložiť ako šablónu / Zmazať, od
                            trénera len Uložiť ako šablónu (klient si zaň platí — kópia mu ostane aj
                            po zmene / zmazaní trénerom) */}
                        <div className={styles.trPlanFoot}>
                          {plan.source === "client" && confirmDelete === plan.id ? (
                            <div className={pa.confirm}>
                              <span className={pa.confirmText}>{tr("deleteWorkout")}</span>
                              <span className={pa.confirmBtns}>
                                <button
                                  type="button"
                                  className={pa.confirmNo}
                                  onClick={() => setConfirmDelete(null)}
                                  disabled={pending}
                                >
                                  {tr("no")}
                                </button>
                                <button
                                  type="button"
                                  className={pa.confirmYes}
                                  onClick={() => removePlan(plan.id)}
                                  disabled={pending}
                                >
                                  {tr("delete")}
                                </button>
                              </span>
                            </div>
                          ) : (
                            <div className={pa.grid}>
                              {planDone ? (
                                // celý odcvičený plán (vlastný aj od trénera) — nič sa nemení, len vyhodnotenie
                                <button type="button" className={pa.action} onClick={() => openBuilder(plan)}>
                                  <ActionPreviewIcon />
                                  {tr("viewPlan")}
                                </button>
                              ) : (
                                plan.source === "client" && (
                                  <button type="button" className={pa.action} onClick={() => openBuilder(plan)}>
                                    <ActionEditIcon />
                                    {tr("edit")}
                                  </button>
                                )
                              )}
                              <button
                                type="button"
                                className={pa.action}
                                onClick={() => saveTemplate(plan.id)}
                                disabled={pending}
                              >
                                <ActionTemplateIcon />
                                {tr("saveTemplate")}
                              </button>
                              {plan.source === "client" && (
                                <button
                                  type="button"
                                  className={`${pa.action} ${pa.danger}`}
                                  onClick={() => setConfirmDelete(plan.id)}
                                >
                                  <ActionTrashIcon />
                                  {tr("delete")}
                                </button>
                              )}
                            </div>
                          )}
                          {templateNote?.planId === plan.id && (
                            <p
                              className={`${styles.trTplNote} ${templateNote.error ? styles.trTplNoteError : ""}`}
                              role="status"
                            >
                              {templateNote.text}
                            </p>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {tab === "plans" && plans.length > 1 && <p className={styles.trHint}>{tr("hint")}</p>}
    </section>
  );
}
