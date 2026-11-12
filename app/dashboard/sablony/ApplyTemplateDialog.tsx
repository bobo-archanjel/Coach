"use client";

import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { applyTemplateToClientsAction } from "./actions";
import styles from "./templates.module.css";

const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

const CloseIcon = () => (
  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <path d="M4.5 10.5l3.5 3.5 7.5-8" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/**
 * „Použiť“ šablónu: výber jedného alebo viacerých klientov (hľadanie v zozname) →
 * applyTemplateToClientsAction vytvorí JEDEN koncept a rovno otvorí builder. Ostatní
 * vybraní sú jeho ďalší príjemcovia — po odoslaní konceptu dostane plán každý z nich.
 * Dovtedy sa klientom nič neposiela.
 */
export function ApplyTemplateDialog({
  kind,
  templateId,
  templateName,
  clients,
  onClose,
}: {
  kind: "workout" | "meal";
  templateId: string;
  templateName: string;
  clients: { id: string; full_name: string }[];
  onClose: () => void;
}) {
  const t = useTranslations("templates.apply");
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<ReadonlySet<string>>(
    () => new Set(clients.length === 1 ? [clients[0].id] : []),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const shown = useMemo(() => {
    const q = normalize(query.trim());
    return q ? clients.filter((c) => normalize(c.full_name).includes(q)) : clients;
  }, [clients, query]);
  const allShownSelected = shown.length > 0 && shown.every((c) => selected.has(c.id));

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAllShown = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const c of shown) {
        if (allShownSelected) next.delete(c.id);
        else next.add(c.id);
      }
      return next;
    });

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await applyTemplateToClientsAction(kind, templateId, [...selected]);
      if (res.error || !res.href) {
        setError(res.error ?? t("failed"));
        return;
      }
      router.push(res.href);
    });
  }

  // Escape zavrie, stránka pod oknom sa neposúva.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  const count = selected.size;
  const submitLabel = count <= 1 ? t("create") : t("createFor", { count });

  const dialog = (
    <div className={styles.dialogLayer}>
      <button type="button" className={styles.dialogScrim} aria-label={t("close")} tabIndex={-1} onClick={onClose} />
      <div className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="apply-tpl-title">
        <div className={styles.dialogHead}>
          <div>
            <h2 id="apply-tpl-title" className={styles.dialogTitle}>
              {t("title")}
            </h2>
            <p className={styles.dialogSub}>
              {t("sub", { name: templateName })}
            </p>
          </div>
          <button type="button" className={styles.dialogClose} onClick={onClose} aria-label={t("close")}>
            <CloseIcon />
          </button>
        </div>

        {clients.length === 0 ? (
          <p className={styles.empty}>{t("noClients")}</p>
        ) : (
          <>
            {clients.length > 6 && (
              <input
                className={styles.search}
                type="search"
                placeholder={t("searchPlaceholder")}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label={t("search")}
                autoFocus
              />
            )}
            {clients.length > 1 && (
              <div className={styles.selectRow}>
                <span className={styles.selectCount}>
                  {count === 0 ? t("chooseClients") : t("selected", { count })}
                </span>
                {shown.length > 0 && (
                  <button type="button" className={styles.selectAll} onClick={toggleAllShown}>
                    {allShownSelected ? t("clearSelection") : query.trim() ? t("selectFound") : t("selectAll")}
                  </button>
                )}
              </div>
            )}
            <div className={styles.clientList} role="group" aria-label={t("clients")}>
              {shown.map((c) => {
                const on = selected.has(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    className={`${styles.clientOption} ${on ? styles.clientOptionOn : ""}`}
                    onClick={() => toggle(c.id)}
                  >
                    <span className={styles.clientAvatar} aria-hidden="true">
                      {c.full_name.trim().charAt(0).toUpperCase() || "?"}
                    </span>
                    <span className={styles.clientName}>{c.full_name}</span>
                    <span className={`${styles.clientCheck} ${on ? styles.clientCheckOn : ""}`} aria-hidden="true">
                      {on && <CheckIcon />}
                    </span>
                  </button>
                );
              })}
              {shown.length === 0 && <p className={styles.empty}>{t("noMatch")}</p>}
            </div>
          </>
        )}

        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <div className={styles.dialogActions}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} disabled={pending}>
            {t("cancel")}
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={submit} disabled={count === 0 || pending}>
            {pending ? t("creating") : submitLabel}
          </button>
        </div>
      </div>
    </div>
  );

  // Nad celou stránkou; v dizajne v6 do jeho koreňa kvôli tokenom témy.
  return createPortal(dialog, document.querySelector("[data-v6-root]") ?? document.body);
}
