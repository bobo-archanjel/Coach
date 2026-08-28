"use client";

import { startTransition, useActionState, useEffect, useMemo, useRef, useState } from "react";
import { MEAL_SLOT_LABELS, MEAL_SLOT_ORDER, type MealSlot } from "@/lib/meals";
import type { PortalFoodOption } from "@/lib/portal/types";
import { addFoodLogAction, type ActionState } from "../actions";
import styles from "../portal.module.css";

const initialState: ActionState = { error: null };

/** Predvolené jedlo dňa podľa hodiny — klient väčšinou loguje to, čo práve zjedol. */
function slotForHour(hour: number): MealSlot {
  if (hour < 10) return "ranajky";
  if (hour < 12) return "desiata";
  if (hour < 15) return "obed";
  if (hour < 18) return "olovrant";
  if (hour < 22) return "vecera";
  return "ine";
}

function buildFormData(option: PortalFoodOption, slot: MealSlot, grams: number): FormData {
  const fd = new FormData();
  fd.set("meal_slot", slot);
  fd.set("food_id", option.foodId ?? "");
  fd.set("food_name", option.name);
  fd.set("grams", String(grams));
  fd.set("kcal_100g", String(option.kcal100g));
  fd.set("protein_100g", String(option.protein100g));
  fd.set("carbs_100g", String(option.carbs100g));
  fd.set("fat_100g", String(option.fat100g));
  return fd;
}

export function AddFoodDiaryEntry({
  planFoods,
  library,
  hour,
}: {
  planFoods: PortalFoodOption[];
  library: PortalFoodOption[];
  hour: number;
}) {
  const [open, setOpen] = useState(false);
  const [slot, setSlot] = useState<MealSlot>(slotForHour(hour));
  const [source, setSource] = useState<"library" | "plan">(planFoods.length > 0 ? "plan" : "library");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<PortalFoodOption | null>(null);
  const [grams, setGrams] = useState("100");
  const [attempted, setAttempted] = useState<string | null>(null);
  const [justAdded, setJustAdded] = useState<string | null>(null);

  const [state, formAction, pending] = useActionState(addFoodLogAction, initialState);
  const wasPending = useRef(false);

  // Po úspešnom pridaní: potvrď, vyčisti výber, panel ostáva otvorený (logovanie celého jedla).
  useEffect(() => {
    if (wasPending.current && !pending && !state.error) {
      setJustAdded(attempted);
      setPicked(null);
      setQuery("");
    }
    wasPending.current = pending;
  }, [pending, state.error, attempted]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? library.filter((f) => f.name.toLowerCase().includes(q)) : library;
    return list.slice(0, 40);
  }, [query, library]);

  /** Položka z plánu — gramáž aj jedlo dňa sú známe, zaloguj jedným ťukom. */
  function logFromPlan(option: PortalFoodOption) {
    const s = option.plannedSlot ?? slot;
    setSlot(s);
    setJustAdded(null);
    setAttempted(option.name);
    startTransition(() => formAction(buildFormData(option, s, option.plannedGrams ?? 100)));
  }

  /** Položka z knižnice — gramáž nepoznáme, doplň ju pred zápisom. */
  function pickFromLibrary(option: PortalFoodOption) {
    setPicked(option);
    setJustAdded(null);
    setGrams("100");
  }

  function submitPicked() {
    if (!picked) return;
    const g = Number(grams);
    setAttempted(picked.name);
    startTransition(() => formAction(buildFormData(picked, slot, Number.isFinite(g) ? g : 0)));
  }

  if (!open) {
    return (
      <button type="button" className={`btn btn-ghost ${styles.addToggle}`} onClick={() => setOpen(true)}>
        + Pridať jedlo
      </button>
    );
  }

  return (
    <div className={styles.addPanel}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <span className={styles.addPanelLabel}>Pridať jedlo</span>
        <button
          type="button"
          className={styles.sourceTab}
          onClick={() => {
            setOpen(false);
            setPicked(null);
            setJustAdded(null);
          }}
        >
          Zavrieť
        </button>
      </div>

      <div className={styles.slotChips} role="group" aria-label="Jedlo dňa">
        {MEAL_SLOT_ORDER.map((s) => (
          <button
            key={s}
            type="button"
            className={`${styles.slotChip} ${s === slot ? styles.slotChipActive : ""}`}
            aria-pressed={s === slot}
            onClick={() => setSlot(s)}
          >
            {MEAL_SLOT_LABELS[s]}
          </button>
        ))}
      </div>

      {picked ? (
        <>
          <div className={styles.gramRow}>
            <span className={styles.gramPicked}>{picked.name}</span>
            <label className={styles.gramField}>
              <input
                className={styles.gramInput}
                type="number"
                inputMode="numeric"
                min={1}
                max={5000}
                value={grams}
                onChange={(e) => setGrams(e.target.value)}
                aria-label="Gramáž v gramoch"
              />
              <span className={styles.gramUnit}>g</span>
            </label>
            <button type="button" className="btn btn-primary btn-sm" disabled={pending} onClick={submitPicked}>
              {pending ? "…" : "Pridať"}
            </button>
          </div>
          <button type="button" className={styles.sourceTab} style={{ marginTop: 8 }} onClick={() => setPicked(null)}>
            ← iné jedlo
          </button>
          {state.error && <p className={styles.addError}>{state.error}</p>}
        </>
      ) : (
        <>
          {planFoods.length > 0 && (
            <div className={styles.sourceTabs} role="tablist" aria-label="Zdroj potraviny">
              <button
                type="button"
                role="tab"
                aria-selected={source === "plan"}
                className={`${styles.sourceTab} ${source === "plan" ? styles.sourceTabActive : ""}`}
                onClick={() => setSource("plan")}
              >
                Z jedálnička
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={source === "library"}
                className={`${styles.sourceTab} ${source === "library" ? styles.sourceTabActive : ""}`}
                onClick={() => setSource("library")}
              >
                Knižnica
              </button>
            </div>
          )}

          {source === "library" && (
            <input
              className={styles.foodSearch}
              type="search"
              placeholder="Hľadať potravinu…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Hľadať potravinu"
            />
          )}

          <ul className={styles.foodList}>
            {source === "plan"
              ? planFoods.map((option, i) => (
                  <li key={`${option.name}-${i}`}>
                    <button
                      type="button"
                      className={styles.foodPick}
                      disabled={pending}
                      onClick={() => logFromPlan(option)}
                    >
                      <span className={styles.foodPickName}>{option.name}</span>
                      <span className={styles.foodPickMacro}>
                        + {option.plannedGrams ?? 100} g
                        {option.plannedSlot ? ` · ${MEAL_SLOT_LABELS[option.plannedSlot]}` : ""}
                      </span>
                    </button>
                  </li>
                ))
              : filtered.map((option, i) => (
                  <li key={`${option.name}-${i}`}>
                    <button type="button" className={styles.foodPick} onClick={() => pickFromLibrary(option)}>
                      <span className={styles.foodPickName}>{option.name}</span>
                      <span className={styles.foodPickMacro}>{Math.round(option.kcal100g)} kcal / 100 g</span>
                    </button>
                  </li>
                ))}
            {(source === "plan" ? planFoods : filtered).length === 0 && (
              <li className={styles.foodEmpty}>
                {source === "library" ? "Nič sa nenašlo." : "Tréner ti nezostavil jedálniček."}
              </li>
            )}
          </ul>

          {state.error && <p className={styles.addError}>{state.error}</p>}
          {justAdded && !state.error && (
            <p style={{ fontSize: 12, color: "var(--moss)", fontWeight: 600 }}>
              {`„${justAdded}“ pridané do denníka.`}
            </p>
          )}
        </>
      )}
    </div>
  );
}
