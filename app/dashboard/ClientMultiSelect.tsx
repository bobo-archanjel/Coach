"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import styles from "./clientPicker.module.css";

export interface PickerClient {
  id: string;
  full_name: string;
}

const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const CloseIcon = () => (
  <svg width="12" height="12" viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
  </svg>
);

const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <path d="M4.5 10.5l3.5 3.5 7.5-8" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ChevronIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <path d="M3 5.5L7 9.5L11 5.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/**
 * Výber jedného alebo viacerých klientov vo formulári (Tréningy → Nový plán, AI generátor):
 * vybraní ako čipy s ×, rozbaľovací panel s hľadaním podľa mena (bez diakritiky),
 * checkboxmi a „Vybrať všetkých“. Panel je v toku stránky (nie prekryv) — na mobile
 * odsunie obsah pod sebou. Do formulára posiela skryté polia `name` (FormData.getAll).
 */
export function ClientMultiSelect({
  clients,
  selected,
  onChange,
  disabled = false,
  name = "client_id",
  invalid = false,
}: {
  clients: PickerClient[];
  selected: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  name?: string;
  /** zvýrazniť pole (pokus o odoslanie bez klienta) */
  invalid?: boolean;
}) {
  const panelId = useId();
  const t = useTranslations("components.clientPicker");
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const selectedClients = useMemo(() => clients.filter((c) => selectedSet.has(c.id)), [clients, selectedSet]);
  const shown = useMemo(() => {
    const q = normalize(query.trim());
    return q ? clients.filter((c) => normalize(c.full_name).includes(q)) : clients;
  }, [clients, query]);
  const allShownSelected = shown.length > 0 && shown.every((c) => selectedSet.has(c.id));

  // poradie výberu = poradie v zozname klientov (prvý vybraný je hlavný klient konceptu)
  const emit = (next: Set<string>) => onChange(clients.filter((c) => next.has(c.id)).map((c) => c.id));
  const toggle = (id: string) => {
    const next = new Set(selectedSet);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    emit(next);
  };
  const toggleAllShown = () => {
    const next = new Set(selectedSet);
    for (const c of shown) {
      if (allShownSelected) next.delete(c.id);
      else next.add(c.id);
    }
    emit(next);
  };

  // Escape a klik mimo panel zavrú. `click`, nie `pointerdown` — zbalenie panela posunie
  // obsah pod ním; pri pointerdown by sa tlačidlo (napr. „Vytvoriť plán“) odsunulo spod
  // prsta/kurzora ešte pred dokončením kliknutia a formulár by sa neodoslal.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      // composedPath, nie e.target.contains — odobratý čip (×) už nie je v DOM, kým sem
      // klik dobuble, a vyzeral by ako klik mimo
      if (rootRef.current && !e.composedPath().includes(rootRef.current)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("click", onClick);
    };
  }, [open]);

  const count = selected.length;
  const triggerLabel = count === 0 ? t("choose") : clients.length > count ? t("addMore") : t("editSelection");

  return (
    <div ref={rootRef} className={styles.picker}>
      {selected.map((id) => (
        <input key={id} type="hidden" name={name} value={id} />
      ))}
      <div className={`${styles.field} ${invalid ? styles.fieldInvalid : ""} ${open ? styles.fieldOpen : ""}`}>
        {selectedClients.map((c) => (
          <span key={c.id} className={styles.chip}>
            {c.full_name}
            <button
              type="button"
              className={styles.chipRemove}
              onClick={() => toggle(c.id)}
              disabled={disabled}
              aria-label={t("remove", { name: c.full_name })}
            >
              <CloseIcon />
            </button>
          </span>
        ))}
        <button
          type="button"
          className={styles.trigger}
          onClick={() => setOpen((o) => !o)}
          disabled={disabled}
          aria-expanded={open}
          aria-controls={panelId}
        >
          <span className={count === 0 ? styles.placeholder : undefined}>{triggerLabel}</span>
          <span className={`${styles.chevron} ${open ? styles.chevronOpen : ""}`}>
            <ChevronIcon />
          </span>
        </button>
      </div>

      {open && (
        <div id={panelId} className={styles.panel}>
          {clients.length > 1 && (
            <>
              <input
                className={styles.search}
                type="search"
                placeholder={t("searchPlaceholder")}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label={t("search")}
              />
              <div className={styles.selectRow}>
                <span className={styles.selectCount}>{count === 0 ? t("noneSelected") : t("selected", { count })}</span>
                {shown.length > 0 && (
                  <button type="button" className={styles.selectAll} onClick={toggleAllShown} disabled={disabled}>
                    {allShownSelected ? t("clearSelection") : query.trim() ? t("selectFound") : t("selectAll")}
                  </button>
                )}
              </div>
            </>
          )}
          <div className={styles.list} role="group" aria-label={t("group")}>
            {shown.map((c) => {
              const on = selectedSet.has(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  className={`${styles.option} ${on ? styles.optionOn : ""}`}
                  onClick={() => toggle(c.id)}
                  disabled={disabled}
                >
                  <span className={styles.avatar} aria-hidden="true">
                    {c.full_name.trim().charAt(0).toUpperCase() || "?"}
                  </span>
                  <span className={styles.name}>{c.full_name}</span>
                  <span className={`${styles.check} ${on ? styles.checkOn : ""}`} aria-hidden="true">
                    {on && <CheckIcon />}
                  </span>
                </button>
              );
            })}
            {shown.length === 0 && <p className={styles.empty}>{t("noMatch")}</p>}
          </div>
          <div className={styles.panelFoot}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>
              {t("done")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
