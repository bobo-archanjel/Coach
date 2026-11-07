"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { scaleFoodMacros } from "@/lib/meals";
import type { BarcodeLookupResult, BarcodePrefill, PortalFoodOption } from "@/lib/portal/types";
import foodModule from "./food.module.css";
import { useSkinStyles } from "../uiSkin";
import { BarcodeScanner } from "./BarcodeScanner";
import { FoodCreateForm } from "./FoodCreateForm";

/** Ako dlho čakať po poslednom stlačení klávesy, kým sa spustí online vyhľadávanie
    (Open Food Facts) — nech nevoláme API pri každom písmene. */
const SEARCH_DEBOUNCE_MS = 500;
const MIN_QUERY_LEN = 3;

const ScanIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
    <path d="M2 5V3a1 1 0 011-1h2M13 2h2a1 1 0 011 1v2M16 13v2a1 1 0 01-1 1h-2M5 16H3a1 1 0 01-1-1v-2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <path d="M5 6v6M7.5 6v6M10 6v6M12.5 6v6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);

const CloseIcon = () => (
  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

type Source = "library" | "online" | "new";

/** Stav po skene / ručnom zadaní kódu (alebo uložení online produktu), kým nie je vybraná potravina. */
type ScanLookup =
  | { kind: "loading"; code: string }
  | { kind: "not_found"; prefill: BarcodePrefill }
  | { kind: "error"; code: string; message: string };

const emptyPrefill = (barcode: string): BarcodePrefill => ({
  barcode,
  name: null,
  brand: null,
  kcal100g: null,
  protein100g: null,
  carbs100g: null,
  fat100g: null,
});

/**
 * Panel „Pridať jedlo“ — na mobile zdola, na počítači okno v strede. Zdieľajú ho denník
 * klienta (riadok jedla → „+“) aj builder jedálnička trénera.
 *
 * Zdroje: značky online (Open Food Facts, GET /api/foods/search) a skener čiarových kódov
 * (GET /api/potraviny/kod/[ean] — DB, inak OFF; nenájdený kód → „Založiť potravinu“).
 * S `library` (tréner) navyše záložky Knižnica a Nová potravina a každá vybraná potravina
 * musí mať riadok v `foods` (jedálniček ukladá makrá podľa food_id) — online produkt sa
 * preto pri výbere uloží cez tú istú route ako sken.
 *
 * Vybraná potravina → gramáž → `onSubmit`. S `pending` (denník: server action) sa
 * potvrdenie ukáže po jej dobehnutí, bez neho (builder: lokálny koncept) hneď.
 * Po pridaní panel ostáva otvorený (celé jedlo naraz).
 */
export function FoodPickerSheet({
  title,
  note = null,
  library,
  pending,
  error = null,
  onSubmit,
  onFoodCreated,
  onClose,
}: {
  title: string;
  /** napr. "Zapisuješ za včera." */
  note?: string | null;
  /** knižnica potravín (tréner) — bez nej len značky online a skener (klient) */
  library?: PortalFoodOption[];
  pending?: boolean;
  error?: string | null;
  onSubmit: (food: PortalFoodOption, grams: number) => void;
  /** nová vlastná potravina (formulár) — builder si ju pridá do knižnice */
  onFoodCreated?: (food: PortalFoodOption) => void;
  onClose: () => void;
}) {
  const styles = useSkinStyles("food", foodModule);
  const withLibrary = library !== undefined;
  const [source, setSource] = useState<Source>(withLibrary ? "library" : "online");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PortalFoodOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const searchSeq = useRef(0);
  const [picked, setPicked] = useState<PortalFoodOption | null>(null);
  const [grams, setGrams] = useState("100");
  const [attempted, setAttempted] = useState<string | null>(null);
  const [justAdded, setJustAdded] = useState<string | null>(null);

  const libraryMatches = useMemo(() => {
    if (!library) return [];
    const q = query.trim().toLowerCase();
    return (q ? library.filter((f) => f.name.toLowerCase().includes(q)) : library).slice(0, 60);
  }, [library, query]);

  // Online vyhľadávanie — GET fetch, nie server action: nečaká vo fronte so zápisom
  // a ďalšie písanie predošlé hľadanie zruší (abort) namiesto čakania na jeho výsledok.
  useEffect(() => {
    if (source !== "online") return;
    const q = query.trim();
    if (q.length < MIN_QUERY_LEN) {
      setResults([]);
      setSearchError(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    const seq = ++searchSeq.current;
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/foods/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        .then((r) => r.json() as Promise<{ error: string | null; results: PortalFoodOption[] }>)
        .catch((err: unknown) =>
          err instanceof DOMException && err.name === "AbortError"
            ? null
            : { error: "Vyhľadávanie momentálne nefunguje, skús to o chvíľu.", results: [] },
        )
        .then((res) => {
          if (!res || searchSeq.current !== seq) return; // zrušené / medzitým prišiel novší dopyt
          setSearching(false);
          setSearchError(res.error);
          setResults(res.results ?? []);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [query, source]);

  // Skener čiarových kódov: overlay s kamerou / ručným zadaním, potom vyhľadanie kódu.
  const [scanOpen, setScanOpen] = useState(false);
  const [lookup, setLookup] = useState<ScanLookup | null>(null);
  const lookupSeq = useRef(0);

  function lookupCode(code: string) {
    setScanOpen(false);
    setPicked(null);
    setJustAdded(null);
    setLookup({ kind: "loading", code });
    const seq = ++lookupSeq.current;
    fetch(`/api/potraviny/kod/${encodeURIComponent(code)}`)
      .then((r) => r.json() as Promise<BarcodeLookupResult>)
      .catch((): BarcodeLookupResult => ({ status: "error", error: "Vyhľadanie kódu zlyhalo, skontroluj pripojenie." }))
      .then((res) => {
        if (lookupSeq.current !== seq) return; // medzitým zrušené / nový sken
        if (res.status === "found") {
          setLookup(null);
          pick(res.food, res.food.servingGrams ?? 100);
        } else if (res.status === "not_found") {
          setLookup({ kind: "not_found", prefill: res.food });
        } else {
          setLookup({ kind: "error", code, message: res.error });
        }
      });
  }

  function cancelLookup() {
    lookupSeq.current++;
    setLookup(null);
  }

  function pick(option: PortalFoodOption, defaultGrams = 100) {
    setPicked(option);
    setJustAdded(null);
    setGrams(String(defaultGrams));
  }

  /** Klik na výsledok. Tréner potrebuje potravinu v DB — online produkt sa uloží cez sken route. */
  function choose(option: PortalFoodOption) {
    if (withLibrary && !option.foodId) {
      if (option.barcode) lookupCode(option.barcode);
      else
        setLookup({
          kind: "error",
          code: "—",
          message: "Tento produkt nemá čiarový kód, nedá sa uložiť. Vyber iný alebo ho založ ako novú potravinu.",
        });
      return;
    }
    pick(option);
  }

  function submitPicked() {
    if (!picked) return;
    const g = Number(grams);
    const grams_ = Number.isFinite(g) ? g : 0;
    setAttempted(picked.name);
    onSubmit(picked, grams_);
    if (pending === undefined) {
      // lokálny koncept (builder) — pridané hneď
      setJustAdded(picked.name);
      setPicked(null);
    }
  }

  function created(food: PortalFoodOption) {
    setLookup(null);
    onFoodCreated?.(food);
    pick(food);
  }

  // Po úspešnom zápise na serveri (denník): potvrď a vyčisti výber — panel ostáva otvorený.
  const wasPending = useRef(false);
  useEffect(() => {
    if (pending === undefined) return;
    if (wasPending.current && !pending && !error) {
      setJustAdded(attempted);
      setPicked(null);
    }
    wasPending.current = pending;
  }, [pending, error, attempted]);

  // Escape zavrie (skener má vlastný), stránka pod panelom sa neposúva.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  const scanOpenRef = useRef(scanOpen);
  useEffect(() => {
    scanOpenRef.current = scanOpen;
  }, [scanOpen]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !scanOpenRef.current) onCloseRef.current();
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  const pickedPreview = picked
    ? scaleFoodMacros(
        { kcal_100g: picked.kcal100g, protein_100g: picked.protein100g, carbs_100g: picked.carbs100g, fat_100g: picked.fat100g },
        Number(grams) > 0 ? Number(grams) : 0,
      )
    : null;
  const shortQuery = query.trim().length < MIN_QUERY_LEN;
  const resultRow = (option: PortalFoodOption, i: number) => (
    <li key={`${option.foodId ?? option.name}-${i}`}>
      <button type="button" className={styles.pick} onClick={() => choose(option)}>
        <span className={styles.pickName}>{option.name}</span>
        <span className={styles.pickMacro}>{Math.round(option.kcal100g)} kcal / 100 g</span>
      </button>
    </li>
  );

  const sheet = (
    <div className={styles.sheetLayer}>
      <button type="button" className={styles.sheetScrim} aria-label="Zavrieť" tabIndex={-1} onClick={onClose} />
      <div className={styles.sheet} role="dialog" aria-modal="true" aria-labelledby="add-food-title">
        <div className={styles.sheetHead}>
          <h2 id="add-food-title" className={styles.sheetTitle}>
            {title}
          </h2>
          <button type="button" className={styles.sheetClose} onClick={onClose} aria-label="Zavrieť">
            <CloseIcon />
          </button>
        </div>
        {note && <p className={styles.meta}>{note}</p>}

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
            {pickedPreview && (
              <p className={styles.meta}>
                ≈ {pickedPreview.kcal} kcal · {pickedPreview.proteinG}g B · {pickedPreview.carbsG}g S · {pickedPreview.fatG}g T
              </p>
            )}
            {picked.barcode && (
              <p className={styles.meta}>
                Na 100 g: {Math.round(picked.kcal100g)} kcal · {picked.protein100g}g B · {picked.carbs100g}g S ·{" "}
                {picked.fat100g}g T{picked.servingGrams ? ` · porcia ${picked.servingGrams} g` : ""}
              </p>
            )}
            {picked.source === "off" && <p className={styles.source}>Zdroj: Open Food Facts</p>}
            <button type="button" className={styles.textBtn} style={{ alignSelf: "flex-start" }} onClick={() => setPicked(null)}>
              ← iné jedlo
            </button>
            {error && <p className={styles.error}>{error}</p>}
          </>
        ) : lookup ? (
          lookup.kind === "not_found" ? (
            <FoodCreateForm prefill={lookup.prefill} onCreated={created} onCancel={cancelLookup} />
          ) : lookup.kind === "loading" ? (
            <div className={styles.scanResult} role="status">
              <p className={styles.scanResultTitle}>Hľadám produkt…</p>
              <p className={styles.scanCode}>Kód {lookup.code}</p>
              <button type="button" className={styles.textBtn} onClick={cancelLookup}>
                Zrušiť
              </button>
            </div>
          ) : (
            <div className={styles.scanResult}>
              <p className={styles.error} role="alert">
                {lookup.message}
              </p>
              {lookup.code !== "—" && <p className={styles.scanCode}>Kód {lookup.code}</p>}
              <div className={styles.scanActions}>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => setScanOpen(true)}>
                  Skenovať znova
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() =>
                    setLookup({ kind: "not_found", prefill: emptyPrefill(lookup.code === "—" ? "" : lookup.code) })
                  }
                >
                  Založiť potravinu
                </button>
                <button type="button" className={styles.textBtn} onClick={cancelLookup}>
                  Späť
                </button>
              </div>
            </div>
          )
        ) : (
          <>
            {withLibrary && (
              <div className={styles.tabs} role="tablist" aria-label="Zdroj potraviny">
                {(
                  [
                    ["library", "Knižnica"],
                    ["online", "Značky (online)"],
                    ["new", "Nová potravina"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="tab"
                    aria-selected={source === value}
                    className={`${styles.tab} ${source === value ? styles.tabActive : ""}`}
                    onClick={() => setSource(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            {source === "new" ? (
              <FoodCreateForm prefill={null} onCreated={created} />
            ) : (
              <>
                <div className={styles.searchRow}>
                  <input
                    className={styles.search}
                    type="search"
                    placeholder={source === "library" ? "Hľadať v knižnici…" : "Hľadaj značku, napr. „Rajo maslo“…"}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    aria-label={source === "library" ? "Hľadať potravinu v knižnici" : "Hľadať značkový produkt online"}
                    autoFocus
                  />
                  <button type="button" className={styles.scanBtn} onClick={() => setScanOpen(true)}>
                    <ScanIcon />
                    Skenovať
                  </button>
                </div>
                {source === "library" ? (
                  <ul className={styles.list}>
                    {libraryMatches.map(resultRow)}
                    {libraryMatches.length === 0 && <li className={styles.empty}>V knižnici sa nič nenašlo.</li>}
                  </ul>
                ) : (
                  // zoznam až pri hľadaní — dovtedy len pole a Skenovať, bez prázdneho rámika
                  !shortQuery && (
                    <ul className={styles.list}>
                      {results.map(resultRow)}
                      {searching && <li className={styles.empty}>Hľadám…</li>}
                      {!searching && !searchError && results.length === 0 && (
                        <li className={styles.empty}>Nič sa nenašlo — skús iný názov alebo naskenuj kód.</li>
                      )}
                      {searchError && <li className={styles.empty}>{searchError}</li>}
                    </ul>
                  )
                )}
              </>
            )}
            {error && <p className={styles.error}>{error}</p>}
            {justAdded && !error && <p className={styles.ok}>{`„${justAdded}“ pridané.`}</p>}
          </>
        )}
      </div>
      {scanOpen && <BarcodeScanner onDetected={lookupCode} onClose={() => setScanOpen(false)} />}
    </div>
  );

  // Nad celou stránkou (aj nad spodnou lištou); v dizajne v6 do jeho koreňa kvôli tokenom témy.
  return createPortal(sheet, document.querySelector("[data-v6-root]") ?? document.body);
}
