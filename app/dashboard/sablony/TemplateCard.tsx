"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { deleteMealTemplateAction, deleteWorkoutTemplateAction } from "./actions";
import { ApplyTemplateDialog } from "./ApplyTemplateDialog";
import type { TemplateItem } from "./TemplatesList";
import styles from "./templates.module.css";
import pa from "@/app/components/planActions.module.css";
import { ActionChevronIcon, ActionPreviewIcon, ActionTrashIcon, ActionUseIcon } from "@/app/components/ActionIcons";

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
    <article className={styles.card} data-tour="templates-card">
      <div className={styles.cardHead}>
        <h3 className={styles.cardName}>{item.name}</h3>
        <p className={styles.cardMeta}>
          {t("days", { count: dayCount })}
        </p>
      </div>

      {/* rovnaký vzhľad akcií ako pod plánmi v portáli (app/components/planActions.module.css):
          hlavná „Použiť“ hore na celú šírku, pod ňou Náhľad a Zmazať; zmazanie potvrdí červený pruh */}
      {confirmingDelete ? (
        <div className={pa.confirm}>
          <span className={pa.confirmText}>{t("deleteConfirm")}</span>
          <span className={pa.confirmBtns}>
            <button type="button" className={pa.confirmNo} onClick={() => setConfirmingDelete(false)} disabled={deletePending}>
              {t("no")}
            </button>
            <button type="button" className={pa.confirmYes} onClick={handleDelete} disabled={deletePending}>
              {deletePending ? t("deleting") : t("delete")}
            </button>
          </span>
        </div>
      ) : (
        <div className={pa.gridCard}>
          <button type="button" className={`${pa.action} ${pa.small} ${pa.primary}`} onClick={() => setApplyOpen(true)}>
            <ActionUseIcon />
            {t("use")}
          </button>
          <button
            type="button"
            className={`${pa.action} ${pa.small}`}
            aria-expanded={previewOpen}
            aria-controls={`tpl-preview-${item.id}`}
            onClick={() => setPreviewOpen((o) => !o)}
          >
            <ActionPreviewIcon />
            {t("preview")}
            <ActionChevronIcon className={pa.chevron} />
          </button>
          <button type="button" className={`${pa.action} ${pa.small} ${pa.danger}`} onClick={() => setConfirmingDelete(true)}>
            <ActionTrashIcon />
            {t("delete")}
          </button>
        </div>
      )}

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
