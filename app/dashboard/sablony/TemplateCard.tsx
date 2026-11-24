"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { deleteMealTemplateAction, deleteWorkoutTemplateAction } from "./actions";
import { ApplyTemplateDialog } from "./ApplyTemplateDialog";
import type { TemplateItem } from "./TemplatesList";
import styles from "./templates.module.css";
import pa from "@/app/components/planActions.module.css";
import { ActionPreviewIcon, ActionTrashIcon, ActionUseIcon } from "@/app/components/ActionIcons";
import { PlanBand } from "@/app/components/PlanBand";

/**
 * Karta šablóny (tréningová aj jedálničková) v štýle kariet plánov: hlavička (názov + počet
 * dní), súhrn, dni v krúžkoch; „Náhľad“ rozbalí položky dní, „Použiť“ (okno s výberom
 * klienta → koncept v builderi) a „Zmazať“ s potvrdením — plány klientov to nezruší.
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

  const itemTotal = item.days.reduce((n, d) => n + d.items.length, 0);

  return (
    <article className={styles.card} data-tour="templates-card">
      {/* hlavička ako karty tréningových plánov (PlanBand): názov + počet dní */}
      <PlanBand name={item.name} countLabel={t("days", { count: dayCount })} activeLabel={null} chips={[]} />

      <div className={styles.cardBody}>
        <p className={styles.summary}>
          {kind === "workout" ? t("exercisesTotal", { count: itemTotal }) : t("itemsTotal", { count: itemTotal })}
        </p>

        {/* dni v krúžkoch; „Náhľad“ rozbalí pri každom dni jeho cviky / potraviny */}
        {item.days.length === 0 ? (
          <p className={styles.previewEmpty}>{t("noDays")}</p>
        ) : (
          <ol id={`tpl-preview-${item.id}`} className={styles.days} data-open={previewOpen || undefined}>
            {item.days.map((day, i) => (
              <li key={i} className={styles.day}>
                <span className={styles.dayMark} aria-hidden="true">
                  {i + 1}
                </span>
                <span className={styles.dayText}>
                  <span className={styles.dayName}>{day.name}</span>
                  {previewOpen && day.items.length > 0 && <span className={styles.previewItems}>{day.items.join(" · ")}</span>}
                </span>
                <span className={styles.dayCount}>
                  {kind === "workout" ? t("exercises", { count: day.items.length }) : t("items", { count: day.items.length })}
                </span>
              </li>
            ))}
          </ol>
        )}

        {/* rad akcií ako pod plánmi (app/components/planActions.module.css); zmazanie potvrdí červený pruh */}
        <div className={styles.foot}>
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
            <div className={pa.row}>
              <button
                type="button"
                className={pa.action}
                aria-expanded={previewOpen}
                aria-controls={`tpl-preview-${item.id}`}
                onClick={() => setPreviewOpen((o) => !o)}
              >
                <ActionPreviewIcon />
                {t("preview")}
              </button>
              <button type="button" className={`${pa.action} ${pa.primary}`} onClick={() => setApplyOpen(true)}>
                <ActionUseIcon />
                {t("use")}
              </button>
              <button type="button" className={`${pa.action} ${pa.danger}`} onClick={() => setConfirmingDelete(true)}>
                <ActionTrashIcon />
                {t("delete")}
              </button>
            </div>
          )}
        </div>
      </div>

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
