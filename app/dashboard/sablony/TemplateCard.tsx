"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { deleteMealTemplateAction, deleteWorkoutTemplateAction } from "./actions";
import { ApplyTemplateDialog } from "./ApplyTemplateDialog";
import type { TemplateItem } from "./TemplatesList";
import styles from "./templates.module.css";

const ChevronIcon = ({ className }: { className?: string }) => (
  <svg className={className} width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <path d="M7 5l5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/**
 * Karta šablóny (tréningová aj jedálničková). Krátka: názov, počet dní a cieľ,
 * „Použiť“ (okno s výberom klienta → koncept v builderi), „Náhľad“ (dni a ich položky)
 * a „Zmazať“ s potvrdením druhým klikom — plány klientov to nezruší, ale je to nezvratné.
 */
export function TemplateCard({
  kind,
  item,
  clients,
}: {
  kind: "workout" | "meal";
  item: TemplateItem;
  clients: { id: string; full_name: string }[];
}) {
  const t = useTranslations("templates");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deletePending, startDelete] = useTransition();
  const dayCount = item.days.length;

  function handleDelete() {
    startDelete(async () => {
      if (kind === "workout") await deleteWorkoutTemplateAction(item.id);
      else await deleteMealTemplateAction(item.id);
    });
  }

  return (
    <article className={styles.card}>
      <div className={styles.cardHead}>
        <h3 className={styles.cardName}>{item.name}</h3>
        <p className={styles.cardMeta}>
          {t("days", { count: dayCount })}
        </p>
      </div>

      <div className={styles.cardActions}>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setApplyOpen(true)}>
          {t("use")}
        </button>
        <button
          type="button"
          className={styles.previewToggle}
          aria-expanded={previewOpen}
          aria-controls={`tpl-preview-${item.id}`}
          onClick={() => setPreviewOpen((o) => !o)}
        >
          {t("preview")}
          <ChevronIcon className={`${styles.chevron} ${previewOpen ? styles.chevronOpen : ""}`} />
        </button>
        {confirmingDelete ? (
          <span className={styles.deleteConfirm}>
            <button type="button" className="btn btn-primary btn-sm btn-danger" onClick={handleDelete} disabled={deletePending}>
              {deletePending ? t("deleting") : t("delete")}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmingDelete(false)} disabled={deletePending}>
              {t("no")}
            </button>
          </span>
        ) : (
          <button type="button" className={styles.deleteBtn} onClick={() => setConfirmingDelete(true)}>
            {t("delete")}
          </button>
        )}
      </div>

      {previewOpen && (
        <ol id={`tpl-preview-${item.id}`} className={styles.preview}>
          {item.days.length === 0 && <li className={styles.previewEmpty}>{t("noDays")}</li>}
          {item.days.map((day, i) => (
            <li key={i} className={styles.previewDay}>
              <span className={styles.previewDayName}>
                {day.name}
                <span className={styles.previewCount}>
                  {kind === "workout" ? t("exercises", { count: day.items.length }) : t("items", { count: day.items.length })}
                </span>
              </span>
              {day.items.length > 0 && <span className={styles.previewItems}>{day.items.join(" · ")}</span>}
            </li>
          ))}
        </ol>
      )}

      {applyOpen && (
        <ApplyTemplateDialog
          kind={kind}
          templateId={item.id}
          templateName={item.name}
          clients={clients}
          onClose={() => setApplyOpen(false)}
        />
      )}
    </article>
  );
}
