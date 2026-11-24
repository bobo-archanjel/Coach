"use client";

import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { SwipeBack } from "@/app/components/SwipeBack";
import { FoodPickerSheet } from "@/app/components/food/FoodPickerSheet";
import { MealSlotSection } from "@/app/components/food/MealSlotSection";
import { EmptyDayCard } from "@/app/components/EmptyDayCard";
import { useActiveTabInView } from "@/app/components/useActiveTabInView";
// Riadok položky, akcie dňa, okno „+ deň“ a čipy makier sú tie isté ako v trénerovom builderi
// jedálnička (importované z jeho priečinka, nepresúvané) — klient tak vidí rovnaké ovládanie.
import { MealEntryRow } from "@/app/dashboard/jedalnicky/jedalnicek/[planId]/MealEntryRow";
import { MealDayActions } from "@/app/dashboard/jedalnicky/jedalnicek/[planId]/MealDayActions";
import { AddMealDayDialog } from "@/app/dashboard/jedalnicky/jedalnicek/[planId]/AddMealDayDialog";
import { MacroChips } from "@/app/dashboard/jedalnicky/jedalnicek/[planId]/MacroChips";
import type { MealEntry } from "@/app/dashboard/jedalnicky/jedalnicek/actions";
import mb from "@/app/dashboard/jedalnicky/jedalnicek/[planId]/builder.module.css";
import wb from "@/app/components/workoutBuilder.module.css";
import food from "@/app/components/food/food.module.css";
import { MEAL_SLOT_ORDER, scaleFoodMacros, sumMacros, type MealSlot } from "@/lib/meals";
import type { PortionUnit } from "@/lib/portions";
import type { EditableMealDay, MealPlanEntryData, PortalFoodOption, PortalMacroGoal, PortalMealTemplate } from "@/lib/portal/types";
import { MEAL_PLAN_MAX_DAYS, MEAL_PLAN_NAME_MAX } from "@/lib/portal/ownMealPlan";
import { saveClientMealPlanAction, type ClientMealDraft } from "./actions";
import styles from "../portal.module.css";
import pa from "@/app/components/planActions.module.css";
import { clearMealDraft, mealDraftSignature, saveMealDraft, type MealBuilderDraft } from "./mealDraft";

/* Builder vlastného jedálnička klienta (0067) — plne lokálny koncept, do DB ide jedným
   „Uložiť“ (saveClientMealPlanAction). Deň = 6 jedál (Raňajky … Iné) ako v Denníku;
   „+“ otvorí FoodPickerSheet v klientskom režime (základné potraviny, offline index,
   online vyhľadávanie, skener) — rovnaký panel ako pri zápise jedla. Súčet dňa sa
   porovnáva s makro cieľom klienta. Vzor: ClientPlanBuilder (vlastný tréning). */

type BDay = { key: string; id: string | null; name: string; meals: MealPlanEntryData[] };

// crypto.randomUUID existuje len v secure contexte (iPhone cez LAN by spadol)
function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const toDraft = (days: EditableMealDay[], keepIds: boolean): BDay[] =>
  days.map((d) => ({
    key: uid(),
    id: keepIds ? d.id : null,
    name: d.name,
    // zo šablóny nové entry_id — položky sú nové
    meals: d.meals.map((m) => (keepIds ? m : { ...m, entry_id: uid() })),
  }));

export function ClientMealBuilder({
  initial,
  template = null,
  staples,
  macroGoal,
  onCancel,
  onSaved,
  draftOwner,
  resume = null,
}: {
  /** úprava existujúceho vlastného jedálnička */
  initial: { id: string; name: string; days: EditableMealDay[] } | null;
  /** „Použiť“ pri šablóne — nový jedálniček predvyplnený jej obsahom */
  template?: PortalMealTemplate | null;
  staples: PortalFoodOption[];
  macroGoal: PortalMacroGoal | null;
  onCancel: () => void;
  onSaved: () => void;
  /** komu patrí rozpracovaný koncept v prehliadači (mealDraft.ts) */
  draftOwner: string;
  /** „Pokračovať“ — rozpracovaný koncept z prehliadača namiesto východiska */
  resume?: MealBuilderDraft | null;
}) {
  const t = useTranslations("portal.nutrition.builder");
  const tb = useTranslations("mealPlans.builder");
  const tl = useTranslations("labels");
  // Východisko: úprava / šablóna / nový jedálniček s predvyplneným názvom a prvým dňom
  // („Deň 1“) — jedlá sa dajú pridávať hneď.
  const [fresh] = useState(() => ({
    name: initial?.name ?? template?.name ?? t("defaultPlanName"),
    days: initial
      ? toDraft(initial.days, true)
      : template
        ? toDraft(template.days, false)
        : [{ key: uid(), id: null, name: t("defaultDayName", { n: 1 }), meals: [] } as BDay],
  }));
  const [name, setName] = useState(resume?.name ?? fresh.name);
  const [days, setDays] = useState<BDay[]>(() =>
    resume ? resume.days.map((d) => ({ key: uid(), id: d.id, name: d.name, meals: d.meals })) : fresh.days,
  );
  // Rozpracovaný koncept v prehliadači: pri každej zmene oproti východisku sa uloží; keď sa
  // klient vráti k východisku, zmaže. Samotné otvorenie buildera starší koncept neprepíše.
  const stored = (list: BDay[]) => list.map((d) => ({ id: d.id, name: d.name, meals: d.meals }));
  const [freshSignature] = useState(() => mealDraftSignature({ name: fresh.name, days: stored(fresh.days) }));
  const touchedDraft = useRef(Boolean(resume));
  useEffect(() => {
    const list = stored(days);
    if (mealDraftSignature({ name, days: list }) !== freshSignature) {
      touchedDraft.current = true;
      saveMealDraft(draftOwner, { planId: initial?.id ?? null, name, days: list });
    } else if (touchedDraft.current) {
      clearMealDraft(draftOwner);
    }
  }, [name, days, freshSignature, draftOwner, initial?.id]);

  // „Zmazať koncept“ / „Zahodiť úpravy“ — potvrdenie v riadku tlačidiel (Esc = zrušiť)
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  useEffect(() => {
    if (!confirmDiscard) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setConfirmDiscard(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmDiscard]);
  const discard = () => {
    touchedDraft.current = false;
    clearMealDraft(draftOwner);
    onCancel();
  };
  const [activeKey, setActiveKey] = useState<string>(() => days[0]?.key ?? "");
  const [addingDay, setAddingDay] = useState(false);
  const [expanded, setExpanded] = useState<ReadonlySet<MealSlot>>(() => new Set());
  const [addSlot, setAddSlot] = useState<MealSlot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const tabsRef = useRef<HTMLDivElement>(null);

  const activeDay = days.find((d) => d.key === activeKey) ?? days[0] ?? null;
  useActiveTabInView(tabsRef, activeDay?.key ?? null);

  const editDay = (key: string, fn: (d: BDay) => BDay) => {
    setError(null);
    setDays((ds) => ds.map((d) => (d.key === key ? fn(d) : d)));
  };
  const toggleSlot = (slot: MealSlot) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(slot)) next.delete(slot);
      else next.add(slot);
      return next;
    });

  const addDay = (dayName: string) => {
    const key = uid();
    setError(null);
    setDays((ds) => [...ds, { key, id: null, name: dayName, meals: [] }]);
    setActiveKey(key);
  };

  const duplicateDay = (src: BDay) => {
    if (days.length >= MEAL_PLAN_MAX_DAYS) return;
    const key = uid();
    setDays((ds) => [
      ...ds,
      { key, id: null, name: tb("copyName", { name: src.name }).slice(0, 120), meals: src.meals.map((m) => ({ ...m, entry_id: uid() })) },
    ]);
    setActiveKey(key);
  };

  const removeDay = (key: string) => {
    setError(null);
    setDays((ds) => ds.filter((d) => d.key !== key));
    setActiveKey("");
  };

  /** Potravina z panela do jedla `slot` aktívneho dňa (food_id môže chýbať — offline / online produkt). */
  const addFood = (option: PortalFoodOption, grams: number, portion: { unit: PortionUnit; qty: number }, slot: MealSlot) => {
    if (!activeDay) return;
    const entry: MealPlanEntryData = {
      entry_id: uid(),
      food_id: option.foodId,
      food_name: option.name,
      meal_slot: slot,
      grams,
      portion_unit: portion.unit,
      portion_qty: portion.qty,
      portion_base: option.unitBase === "ml" ? "ml" : "g",
      kcal_100g: option.kcal100g,
      protein_100g: option.protein100g,
      carbs_100g: option.carbs100g,
      fat_100g: option.fat100g,
    };
    editDay(activeDay.key, (d) => ({ ...d, meals: [...d.meals, entry] }));
    setExpanded((prev) => (prev.has(slot) ? prev : new Set(prev).add(slot)));
  };

  const dayTotal = useMemo(
    () => (activeDay ? sumMacros(activeDay.meals.map((e) => scaleFoodMacros(e, e.grams))) : null),
    [activeDay],
  );

  const save = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError(t("nameRequired"));
      return;
    }
    if (days.length === 0) {
      setError(t("dayRequired"));
      return;
    }
    const draft: ClientMealDraft = {
      name: trimmed,
      days: days.map((d) => ({ id: d.id, name: d.name.trim(), meals: d.meals })),
    };
    setError(null);
    startTransition(async () => {
      const res = await saveClientMealPlanAction(JSON.stringify(draft), initial?.id);
      if (res.error) setError(res.error);
      else {
        clearMealDraft(draftOwner);
        onSaved();
      }
    });
  };

  return (
    // Späť bez uloženia: potiahnutie zľava na mobile, späť v prehliadači alebo „Strava“ v menu
    // (NutritionSection, ?tvorba) — ako builder vlastného tréningu.
    <SwipeBack onBack={onCancel}>
      <section aria-label={initial ? t("editAria") : t("newAria")} className={styles.trWrap}>
        <label className={styles.trNameField} data-tour="mbuilder-name">
          <span className={styles.panelLabel}>{t("planName")}</span>
          <input
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (error === t("nameRequired")) setError(null);
            }}
            placeholder={t("namePlaceholder")}
            maxLength={MEAL_PLAN_NAME_MAX}
            className={styles.trNameInput}
          />
        </label>

        {/* Rozloženie ako pri tréningu: pod názvom Uložiť (úpravy) + Zmazať koncept / Zahodiť
            úpravy, s potvrdením; dolné „Uložiť jedálniček“ už nie je. */}
        {confirmDiscard ? (
          <div className={pa.confirm} role="alertdialog" aria-labelledby="meal-discard-question">
            <p id="meal-discard-question" className={pa.confirmText}>
              {initial ? t("discardEditsConfirm") : t("deleteDraftConfirm")}
            </p>
            <span className={pa.confirmBtns}>
              <button type="button" className={pa.confirmNo} onClick={() => setConfirmDiscard(false)}>
                {t("cancel")}
              </button>
              <button type="button" className={pa.confirmYes} onClick={discard}>
                {initial ? t("yesDiscard") : t("yesDelete")}
              </button>
            </span>
          </div>
        ) : (
          <div className={styles.trActionsGrid}>
            <button type="button" className={styles.trSaveBtn} onClick={save} disabled={pending} data-tour="mbuilder-save">
              {pending ? t("saving") : initial ? t("saveEdits") : t("save")}
            </button>
            <button type="button" className={styles.trDiscardBtn} onClick={() => setConfirmDiscard(true)} disabled={pending}>
              {initial ? t("discardEdits") : t("deleteDraft")}
            </button>
          </div>
        )}

        {error && (
          <p className={styles.trError} role="alert">
            {error}
          </p>
        )}

        <div className={mb.canvas}>
          <div ref={tabsRef} className={wb.dayTabs} role="group" aria-label={tb("daysAria")} data-no-swipe data-tour="mbuilder-days">
            {days.map((d) => (
              <button
                key={d.key}
                type="button"
                className={`${wb.dayTab} ${d.key === activeDay?.key ? wb.dayTabActive : ""}`}
                onClick={() => setActiveKey(d.key)}
                aria-current={d.key === activeDay?.key ? "true" : undefined}
                title={d.name}
              >
                <span className={wb.dayTabName}>{d.name}</span>
                <span className={wb.dayTabCount} aria-hidden="true">
                  {d.meals.length}
                </span>
              </button>
            ))}
            {days.length < MEAL_PLAN_MAX_DAYS && (
              <button type="button" className={wb.addDayTab} onClick={() => setAddingDay(true)}>
                {tb("addDay")}
              </button>
            )}
          </div>

          {addingDay && <AddMealDayDialog nextDayNumber={days.length + 1} onAdd={addDay} onClose={() => setAddingDay(false)} />}

          {activeDay && (
            <MealDayActions
              key={`${activeDay.key}-${activeDay.name}`}
              name={activeDay.name}
              foodCount={activeDay.meals.length}
              canDuplicate={days.length < MEAL_PLAN_MAX_DAYS}
              onDuplicate={() => duplicateDay(activeDay)}
              onRename={(dayName) => editDay(activeDay.key, (d) => ({ ...d, name: dayName }))}
              onDelete={() => removeDay(activeDay.key)}
            />
          )}

          <div className={mb.dayPanel}>
            {activeDay ? (
              <>
                {dayTotal && activeDay.meals.length > 0 && (
                  <div className={mb.dayTotals} data-tour="mbuilder-total">
                    <span>
                      {macroGoal
                        ? t("kcalOfGoal", { kcal: dayTotal.kcal, goal: macroGoal.caloriesTarget })
                        : tb("kcalPerDay", { kcal: dayTotal.kcal })}
                    </span>
                    <MacroChips proteinG={dayTotal.proteinG} carbsG={dayTotal.carbsG} fatG={dayTotal.fatG} size="lg" />
                    {macroGoal && (
                      <span className={styles.mbGoalLine}>
                        {t("goalLine", { protein: macroGoal.proteinG, carbs: macroGoal.carbsG, fat: macroGoal.fatG })}
                      </span>
                    )}
                  </div>
                )}
                <div className={food.slots} data-tour="mbuilder-slots">
                  {MEAL_SLOT_ORDER.map((slot) => {
                    const entries = activeDay.meals.filter((m) => m.meal_slot === slot);
                    return (
                      <MealSlotSection
                        key={slot}
                        slot={slot}
                        label={tl(`mealSlot.${slot}`)}
                        kcal={sumMacros(entries.map((e) => scaleFoodMacros(e, e.grams))).kcal}
                        count={entries.length}
                        open={expanded.has(slot)}
                        onToggle={() => toggleSlot(slot)}
                        onAdd={() => setAddSlot(slot)}
                      >
                        {entries.map((entry) => (
                          <MealEntryRow
                            key={entry.entry_id}
                            // tvar je trénerov MealEntry; food_id (môže chýbať) riadok nepoužíva
                            entry={entry as MealEntry}
                            onUpdate={(patch) =>
                              editDay(activeDay.key, (d) => ({
                                ...d,
                                meals: d.meals.map((m) => (m.entry_id === entry.entry_id ? { ...m, ...patch } : m)),
                              }))
                            }
                            onRemove={() =>
                              editDay(activeDay.key, (d) => ({ ...d, meals: d.meals.filter((m) => m.entry_id !== entry.entry_id) }))
                            }
                          />
                        ))}
                      </MealSlotSection>
                    );
                  })}
                </div>
              </>
            ) : (
              <EmptyDayCard title={tb("noDays")} text={tb("noDaysText")} />
            )}
          </div>
        </div>


        {addSlot && activeDay && (
          <FoodPickerSheet
            title={`${activeDay.name} · ${tl(`mealSlot.${addSlot}`)}`}
            staples={staples}
            onSubmit={(option, grams, portion) => addFood(option, grams, portion, addSlot)}
            onClose={() => setAddSlot(null)}
          />
        )}
      </section>
    </SwipeBack>
  );
}
