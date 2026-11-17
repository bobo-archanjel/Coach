"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import type { PortalFoodOption, PortalMealPlanOption, PortalMealTemplate, PortalNutritionData } from "@/lib/portal/types";
import { usePortionLabel } from "@/app/components/food/usePortionLabel";
import { FoodIcon } from "@/app/portal/icons";
import {
  chooseActiveMealPlanAction,
  deleteClientMealPlanAction,
  deleteOwnMealTemplateAction,
  getMealStaplesAction,
  saveOwnMealTemplateAction,
} from "./actions";
import styles from "../portal.module.css";

/* /portal/strava — makro cieľ, aktívny jedálniček (od trénera alebo vlastný, prepínač
   „Zmeniť“), vlastné šablóny a builder vlastného jedálnička (0067). Vzor: TrainingSection —
   builder je v histórii ako ?tvorba=1 (späť / potiahnutie / „Strava“ v menu ho zavrie). */

const BUILDER_PARAM = "tvorba";

function urlWithBuilder(open: boolean): string {
  const url = new URL(window.location.href);
  if (open) url.searchParams.set(BUILDER_PARAM, "1");
  else url.searchParams.delete(BUILDER_PARAM);
  return `${url.pathname}${url.search}${url.hash}`;
}

// Builder s panelom potravín potrebuje len klient, ktorý si jedálniček naozaj zostavuje.
const ClientMealBuilder = dynamic(() => import("./ClientMealBuilder").then((m) => m.ClientMealBuilder), {
  loading: () => <BuilderLoading />,
});

function BuilderLoading() {
  const t = useTranslations("portal.nutrition");
  return <p className={styles.trEmptyDay}>{t("loading")}</p>;
}

const MACRO_TILES = [
  { key: "proteinG", label: "protein", color: "var(--accent)" },
  { key: "carbsG", label: "carbs", color: "var(--plate-yellow)" },
  { key: "fatG", label: "fat", color: "var(--moss)" },
] as const;

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
const CheckIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
    <path d="M5 12.5l4.5 4.5L19 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export function NutritionSection({
  data,
  initialStaples = [],
}: {
  data: PortalNutritionData;
  /** DEV náhľad bez session — potraviny pre panel (inak sa načítajú pri otvorení buildera) */
  initialStaples?: PortalFoodOption[];
}) {
  const t = useTranslations("portal.nutrition");
  const portionLabel = usePortionLabel();
  const { macroGoal, mealPlanId, mealPlanName, mealDays, plans, activeSource, editableDays, templates } = data;

  const [mode, setMode] = useState<"list" | "build">("list");
  const [editing, setEditing] = useState(false);
  const [fromTemplate, setFromTemplate] = useState<PortalMealTemplate | null>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmTplDelete, setConfirmTplDelete] = useState<string | null>(null);
  const [note, setNote] = useState<{ text: string; error: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Generické potraviny (~2000) až pri otvorení buildera, raz za návštevu.
  const [staples, setStaples] = useState<PortalFoodOption[]>(initialStaples);
  const [, startStaples] = useTransition();

  const openBuilder = (edit: boolean, template: PortalMealTemplate | null = null) => {
    setEditing(edit);
    setFromTemplate(template);
    setError(null);
    setNote(null);
    setMode("build");
    if (!new URLSearchParams(window.location.search).has(BUILDER_PARAM)) {
      window.history.pushState(null, "", urlWithBuilder(true));
    }
    if (staples.length === 0) {
      startStaples(async () => setStaples(await getMealStaplesAction()));
    }
  };
  const closeBuilder = useCallback(() => {
    setMode("list");
    setEditing(false);
    setFromTemplate(null);
  }, []);
  const leaveBuilder = () => {
    if (new URLSearchParams(window.location.search).has(BUILDER_PARAM)) window.history.back();
    else closeBuilder();
  };
  // ?tvorba zmizlo (späť v prehliadači / potiahnutie / „Strava“ v menu) → zatvoriť builder.
  const searchParams = useSearchParams();
  const hasBuilderParam = searchParams.has(BUILDER_PARAM);
  const hadBuilderParam = useRef(hasBuilderParam);
  useEffect(() => {
    if (hadBuilderParam.current && !hasBuilderParam) closeBuilder();
    hadBuilderParam.current = hasBuilderParam;
  }, [hasBuilderParam, closeBuilder]);
  // ?tvorba po obnovení stránky (builder je zatvorený) — z adresy preč.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has(BUILDER_PARAM)) {
      window.history.replaceState(null, "", urlWithBuilder(false));
    }
  }, []);

  const removePlan = () => {
    if (!mealPlanId) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteClientMealPlanAction(mealPlanId);
      if (res.error) setError(res.error);
      else setConfirmDelete(false);
    });
  };

  const saveTemplate = () => {
    if (!mealPlanId) return;
    setError(null);
    setNote(null);
    startTransition(async () => {
      const res = await saveOwnMealTemplateAction(mealPlanId);
      setNote({ text: res.error ?? t("templateSaved"), error: Boolean(res.error) });
      if (!res.error) setTemplatesOpen(true);
    });
  };

  const removeTemplate = (templateId: string) => {
    setError(null);
    startTransition(async () => {
      const res = await deleteOwnMealTemplateAction(templateId);
      if (res.error) setError(res.error);
      else setConfirmTplDelete(null);
    });
  };

  if (mode === "build") {
    return (
      <ClientMealBuilder
        initial={editing && mealPlanId && editableDays ? { id: mealPlanId, name: mealPlanName ?? "", days: editableDays } : null}
        template={fromTemplate}
        staples={staples}
        macroGoal={macroGoal}
        onCancel={leaveBuilder}
        onSaved={leaveBuilder}
      />
    );
  }

  const isOwn = activeSource === "client" && Boolean(editableDays);

  return (
    <>
      <div className={styles.panel} data-tour="nutrition-goal">
        <div className={styles.panelHead}>
          <p className={styles.panelLabel}>{t("macroGoal")}</p>
          <span className={styles.panelIcon}>
            <FoodIcon />
          </span>
        </div>
        {macroGoal ? (
          <>
            <div className={styles.kcalBig}>
              {macroGoal.caloriesTarget}
              <span className={styles.kcalUnit}>{t("kcalPerDay")}</span>
            </div>
            <p className={styles.kcalSub}>
              BMR {macroGoal.bmr} kcal · TDEE {macroGoal.tdee} kcal
            </p>
            <div className={styles.macroGrid}>
              {MACRO_TILES.map(({ key, label, color }) => (
                <div key={key} className={styles.macroTile}>
                  <div className={styles.macroTileVal}>
                    {macroGoal[key]}
                    <small>g</small>
                  </div>
                  <div className={styles.macroTileLabel}>{t(label)}</div>
                  <span className={styles.macroTileBar} style={{ background: color }} aria-hidden="true" />
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className={styles.sessionQuiet}>
            <p>{t("noGoal")}</p>
          </div>
        )}
      </div>

      <section aria-label={t("mealPlan")} className={styles.trWrap} data-tour="nutrition-plan">
        <div className={styles.trHead}>
          <h2 className={styles.sectionTitle}>{t("mealPlan")}</h2>
          <button
            type="button"
            className={plans.length > 0 ? styles.trBuildBtnGhost : styles.trBuildBtn}
            onClick={() => openBuilder(false)}
            data-tour="nutrition-own"
          >
            <PlusIcon /> {t("ownMealPlan")}
          </button>
        </div>

        {error && (
          <p className={styles.trError} role="alert">
            {error}
          </p>
        )}

        {/* Moje šablóny — zbalené, nech neodtlačia jedálniček nižšie */}
        {templates.length > 0 && (
          <div className={styles.trTplBox} data-tour="nutrition-templates">
            <button
              type="button"
              className={styles.trTplToggle}
              onClick={() => setTemplatesOpen((o) => !o)}
              aria-expanded={templatesOpen}
              aria-controls="moje-sablony-jedalnicka"
            >
              <span className={styles.trTplToggleLabel}>{t("myTemplates")}</span>
              <span className={styles.trTplCount}>{templates.length}</span>
              <ChevronIcon className={`${styles.trChev} ${templatesOpen ? styles.trChevOpen : ""}`} />
            </button>
            {templatesOpen && (
              <ul id="moje-sablony-jedalnicka" className={styles.trTplList}>
                {templates.map((tpl) => (
                  <li key={tpl.id} className={styles.trTpl}>
                    <span className={styles.trTplText}>
                      <span className={styles.trTplName}>{tpl.name}</span>
                      <span className={styles.trTplMeta}>
                        {t("tplMeta", { days: tpl.days.length, foods: tpl.days.reduce((n, d) => n + d.meals.length, 0) })}
                      </span>
                    </span>
                    <span className={styles.trTplActions}>
                      {confirmTplDelete === tpl.id ? (
                        <>
                          <span className={styles.trConfirmText}>{t("deleteTemplate")}</span>
                          <button type="button" className={styles.trDangerBtn} onClick={() => removeTemplate(tpl.id)} disabled={pending}>
                            {t("delete")}
                          </button>
                          <button type="button" className={styles.trGhostBtn} onClick={() => setConfirmTplDelete(null)} disabled={pending}>
                            {t("no")}
                          </button>
                        </>
                      ) : (
                        <>
                          <button type="button" className={styles.trGhostBtn} onClick={() => openBuilder(false, tpl)}>
                            {t("use")}
                          </button>
                          <button type="button" className={`${styles.trGhostBtn} btn-danger`} onClick={() => setConfirmTplDelete(tpl.id)}>
                            {t("delete")}
                          </button>
                        </>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* viac jedálničkov: všetky na očiach, ťuk na iný ho spraví aktívnym (predtým len
            v okne za „Zmeniť“, klient o ďalších jedálničkoch nevedel) */}
        {mealPlanId && plans.length > 1 && <MealPlanPicker plans={plans} activeId={mealPlanId} />}

        {/* aktívny jedálniček: zdroj a názov — nadpis dní nižšie */}
        {mealPlanId && (
          <div className={styles.psRow} data-tour="nutrition-active">
            <span className={styles.trSrcChip} data-src={activeSource ?? "trainer"}>
              {activeSource === "client" ? t("own") : t("fromTrainer")}
            </span>
            <h3 className={styles.psName}>{mealPlanName}</h3>
          </div>
        )}

        {mealDays.length === 0 ? (
          <div className={styles.panel}>
            <div className={styles.sessionQuiet}>
              <p>{mealPlanId ? t("noMeals") : t("noMealPlan")}</p>
            </div>
          </div>
        ) : (
          <div className={styles.stack}>
            {mealDays.map((day) => (
              <div key={day.id} className={styles.panel}>
                <div className={styles.mealDayHead}>
                  <span className={styles.mealDayName}>{day.name}</span>
                  <span className={styles.chip}>{day.totalKcal} kcal</span>
                </div>
                {day.groups.length === 0 ? (
                  <div className={styles.sessionQuiet}>
                    <p>{t("noMeals")}</p>
                  </div>
                ) : (
                  day.groups.map((group) => (
                    <div key={group.slotLabel}>
                      <p className={styles.mealSlot}>{group.slotLabel}</p>
                      <ol className={styles.mealList}>
                        {group.entries.map((entry, i) => (
                          <li key={i} className={styles.mealRow}>
                            <span>
                              <span className={styles.mealName}>{entry.name}</span>
                              <span className={styles.mealMeta}>
                                {portionLabel({ grams: entry.grams, unit: entry.portionUnit, qty: entry.portionQty, base: entry.portionBase })} ·{" "}
                                {entry.proteinG}g B · {entry.carbsG}g S · {entry.fatG}g T
                              </span>
                            </span>
                            <span className={styles.mealKcal}>{entry.kcal} kcal</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  ))
                )}
              </div>
            ))}
          </div>
        )}

        {/* vlastný jedálniček: úprava, šablóna, zmazanie */}
        {isOwn && (
          <div className={styles.trPlanActions} data-tour="nutrition-own-actions">
            {confirmDelete ? (
              <>
                <span className={styles.trConfirmText}>{t("deleteConfirm")}</span>
                <button type="button" className={styles.trDangerBtn} onClick={removePlan} disabled={pending}>
                  {t("delete")}
                </button>
                <button type="button" className={styles.trGhostBtn} onClick={() => setConfirmDelete(false)} disabled={pending}>
                  {t("no")}
                </button>
              </>
            ) : (
              <>
                <button type="button" className={styles.trGhostBtn} onClick={() => openBuilder(true)}>
                  {t("edit")}
                </button>
                <button type="button" className={styles.trGhostBtn} onClick={saveTemplate} disabled={pending}>
                  {t("saveTemplate")}
                </button>
                <button type="button" className={`${styles.trGhostBtn} btn-danger`} onClick={() => setConfirmDelete(true)}>
                  {t("delete")}
                </button>
              </>
            )}
            {note && (
              <p className={`${styles.trTplNote} ${note.error ? styles.trTplNoteError : ""}`} role="status">
                {note.text}
              </p>
            )}
          </div>
        )}

        {/* PDF až pod jedálničkom (nie v hlavičke sekcie) */}
        {mealPlanId && mealDays.length > 0 && (
          <div className={styles.mealPdfRow} data-tour="nutrition-pdf">
            <a href={`/api/export/meal-plan/${mealPlanId}/pdf`} className="btn btn-ghost btn-sm">
              {t("downloadPdf")}
            </a>
          </div>
        )}
      </section>
    </>
  );
}

/**
 * „Tvoje jedálničky“ — zoznam všetkých zverejnených jedálničkov (od trénera aj vlastných)
 * priamo v sekcii, aktívny zvýraznený; ťuk na iný ho nastaví ako aktívny (RPC 0067) a jeho
 * dni sa ukážu nižšie. Štýl riadkov zhodný s výberom plánu na karte Dnes (ps*).
 */
function MealPlanPicker({ plans, activeId }: { plans: PortalMealPlanOption[]; activeId: string }) {
  const t = useTranslations("portal.nutrition");
  const [pending, startTransition] = useTransition();
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pick = (planId: string) => {
    if (planId === activeId || pending) return;
    setError(null);
    setPickedId(planId);
    startTransition(async () => {
      const res = await chooseActiveMealPlanAction(planId);
      if (res.error) setError(res.error);
      setPickedId(null);
    });
  };

  return (
    <div className={styles.mpPicker} data-tour="nutrition-switch">
      <p className={styles.mpPickerHead}>
        <span className={styles.panelLabel}>{t("myPlans")}</span>
        <span className={styles.trTplCount}>{plans.length}</span>
      </p>
      <ul className={styles.psList} aria-label={t("myPlans")}>
        {plans.map((plan) => {
          const active = plan.id === activeId;
          const switching = pending && pickedId === plan.id;
          return (
            <li key={plan.id}>
              <button
                type="button"
                className={`${styles.psItem} ${active ? styles.psItemOn : ""}`}
                onClick={() => pick(plan.id)}
                disabled={pending && !active}
                aria-current={active ? "true" : undefined}
              >
                <span className={styles.psItemText}>
                  <span className={styles.psItemName}>{plan.name}</span>
                  <span className={styles.psItemMeta}>
                    <span className={styles.trSrcChip} data-src={plan.source}>
                      {plan.source === "trainer" ? t("fromTrainer") : t("own")}
                    </span>
                    <span className={styles.chip}>{t("days", { count: plan.dayCount })}</span>
                  </span>
                </span>
                <span className={active ? styles.mpActive : styles.mpSwitch}>
                  {active ? (
                    <>
                      <CheckIcon /> {t("activeBadge")}
                    </>
                  ) : switching ? (
                    t("switching")
                  ) : (
                    t("switchTo")
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {error && (
        <p className={styles.psError} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
