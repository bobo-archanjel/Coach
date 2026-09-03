"use client";

import { startTransition, useActionState, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { MEAL_SLOT_LABELS, MEAL_SLOT_ORDER, type MealSlot } from "@/lib/meals";
import type { PortalFoodOption } from "@/lib/portal/types";
import { addFoodLogAction, getFoodLibraryAction, searchOnlineFoodAction, type ActionState } from "../actions";
import styles from "../portal.module.css";

/** Ako dlho čakať po poslednom stlačení klávesy, kým sa spustí online vyhľadávanie
    (Open Food Facts) — nech nevoláme API pri každom písmene. */
const SEARCH_DEBOUNCE_MS = 500;
const MIN_QUERY_LEN = 3;

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
  hour,
}: {
  planFoods: PortalFoodOption[];
  hour: number;
}) {
  const [open, setOpen] = useState(false);
  // Knižnica potravín (~80 riadkov) sa predtým ťahala pri KAŽDOM načítaní denníka,
  // aj keď je tento panel defaultne zbalený — teraz na požiadanie, len keď klient
  // panel reálne otvorí (rovnaký dôvod ako knižnica cvikov v TrainingSection).
  const [library, setLibrary] = useState<PortalFoodOption[]>([]);
  const [, startLibraryTransition] = useTransition();
  const openPanel = () => {
    setOpen(true);
    if (library.length === 0) {
      startLibraryTransition(async () => {
        setLibrary(await getFoodLibraryAction());
      });
    }
  };
  const [slot, setSlot] = useState<MealSlot>(slotForHour(hour));
  const [source, setSource] = useState<"library" | "plan" | "online">(planFoods.length > 0 ? "plan" : "library");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<PortalFoodOption | null>(null);
  const [grams, setGrams] = useState("100");
  const [attempted, setAttempted] = useState<string | null>(null);
  const [justAdded, setJustAdded] = useState<string | null>(null);

  // Online vyhľadávanie (Open Food Facts) — nezávislé od knižnice, volá sa naživo
  // s odstupom po dopísaní, nech to nie je kontraproduktívne (zbytočné volania pri
  // každom znaku, žiadny dopad na rýchlosť lokálnej knižnice/plánu).
  const [onlineQuery, setOnlineQuery] = useState("");
  const [onlineResults, setOnlineResults] = useState<PortalFoodOption[]>([]);
  const [onlineLoading, setOnlineLoading] = useState(false);
  const [onlineError, setOnlineError] = useState<string | null>(null);
  const onlineSeq = useRef(0);

  useEffect(() => {
    if (source !== "online") return;
    const q = onlineQuery.trim();
    if (q.length < MIN_QUERY_LEN) {
      setOnlineResults([]);
      setOnlineError(null);
      setOnlineLoading(false);
      return;
    }
    setOnlineLoading(true);
    const seq = ++onlineSeq.current;
    const timer = setTimeout(() => {
      searchOnlineFoodAction(q).then((res) => {
        if (onlineSeq.current !== seq) return; // medzitým prišiel novší dopyt
        setOnlineLoading(false);
        setOnlineError(res.error);
        setOnlineResults(res.results);
      });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [onlineQuery, source]);

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
      <button type="button" className={`btn btn-ghost ${styles.addToggle}`} onClick={openPanel}>
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
            setOnlineQuery("");
            setOnlineResults([]);
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
          <div className={styles.sourceTabs} role="tablist" aria-label="Zdroj potraviny">
            {planFoods.length > 0 && (
              <button
                type="button"
                role="tab"
                aria-selected={source === "plan"}
                className={`${styles.sourceTab} ${source === "plan" ? styles.sourceTabActive : ""}`}
                onClick={() => setSource("plan")}
              >
                Z jedálnička
              </button>
            )}
            <button
              type="button"
              role="tab"
              aria-selected={source === "library"}
              className={`${styles.sourceTab} ${source === "library" ? styles.sourceTabActive : ""}`}
              onClick={() => setSource("library")}
            >
              Knižnica
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={source === "online"}
              className={`${styles.sourceTab} ${source === "online" ? styles.sourceTabActive : ""}`}
              onClick={() => setSource("online")}
            >
              Značky (online)
            </button>
          </div>

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
          {source === "online" && (
            <input
              className={styles.foodSearch}
              type="search"
              placeholder="Napíš názov produktu, napr. „Rajo maslo“…"
              value={onlineQuery}
              onChange={(e) => setOnlineQuery(e.target.value)}
              aria-label="Hľadať značkový produkt online"
              autoFocus
            />
          )}

          {source === "online" ? (
            <ul className={styles.foodList}>
              {onlineResults.map((option, i) => (
                <li key={`${option.name}-${i}`}>
                  <button type="button" className={styles.foodPick} onClick={() => pickFromLibrary(option)}>
                    <span className={styles.foodPickName}>{option.name}</span>
                    <span className={styles.foodPickMacro}>{Math.round(option.kcal100g)} kcal / 100 g</span>
                  </button>
                </li>
              ))}
              {onlineQuery.trim().length < MIN_QUERY_LEN && (
                <li className={styles.foodEmpty}>Napíš aspoň {MIN_QUERY_LEN} znaky.</li>
              )}
              {onlineQuery.trim().length >= MIN_QUERY_LEN && onlineLoading && (
                <li className={styles.foodEmpty}>Hľadám…</li>
              )}
              {onlineQuery.trim().length >= MIN_QUERY_LEN && !onlineLoading && !onlineError && onlineResults.length === 0 && (
                <li className={styles.foodEmpty}>Nič sa nenašlo — skús iný názov.</li>
              )}
              {onlineError && <li className={styles.foodEmpty}>{onlineError}</li>}
            </ul>
          ) : (
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
          )}

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
