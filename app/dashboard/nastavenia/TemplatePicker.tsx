"use client";

// Nastavenia → „Verejná stránka“ → výber šablóny vzhľadu. Šablóna mení len prezentáciu (obsah ostáva),
// takže prepnutie o nič nepripraví. Skupina rádiových volieb (šípky/Tab fungujú natívne), „Náhľad“
// otvorí vlastné dáta v danej šablóne bez uloženia. Pravidlá (Business, existujúca stránka, hodnota)
// znova overuje server (saveTemplateAction).

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { AppLink as Link } from "@/app/components/AppLink";
import { TEMPLATE_IDS, type TemplateId } from "@/lib/publicPage/templates";
import { saveTemplateAction, type TemplateState } from "./publicPageActions";
import b from "./branding.module.css";
import tp from "./templatePicker.module.css";

const initialState: TemplateState = { error: null, saved: false };

/** Schematický náhľad rozloženia a tónu šablóny — čisté SVG, bez obrázkov. */
function Thumb({ id }: { id: TemplateId }) {
  const common = { viewBox: "0 0 120 84", width: "100%", height: "100%", "aria-hidden": true, focusable: false } as const;
  if (id === "sport") {
    return (
      <svg {...common}>
        <rect width="120" height="84" fill="#14100e" />
        <rect width="120" height="40" fill="#3a2a22" />
        <rect y="14" width="120" height="26" fill="url(#sg)" />
        <defs>
          <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#14100e" stopOpacity="0" />
            <stop offset="1" stopColor="#14100e" />
          </linearGradient>
        </defs>
        <rect x="8" y="22" width="58" height="9" rx="1.5" fill="#fff" />
        <rect x="8" y="34" width="26" height="5" rx="1.5" fill="var(--accent)" />
        <rect x="8" y="46" width="34" height="14" rx="2" fill="#241d1a" stroke="var(--accent)" strokeWidth="0.8" />
        <rect x="46" y="46" width="34" height="14" rx="2" fill="#241d1a" />
        <rect x="84" y="46" width="34" height="14" rx="2" fill="#241d1a" />
        <rect x="8" y="66" width="30" height="14" rx="2" fill="#241d1a" />
        <rect x="42" y="66" width="30" height="14" rx="2" fill="#241d1a" />
        <rect x="76" y="66" width="30" height="14" rx="2" fill="#241d1a" />
      </svg>
    );
  }
  if (id === "minimal") {
    return (
      <svg {...common}>
        <rect width="120" height="84" fill="#fbf8f5" />
        <circle cx="16" cy="14" r="5" fill="#d9cfc6" />
        <rect x="10" y="24" width="52" height="6" rx="1" fill="#2a1e18" />
        <rect x="10" y="34" width="70" height="3" rx="1" fill="#b8aca2" />
        <rect x="10" y="40" width="24" height="7" rx="3.5" fill="var(--accent)" />
        <rect x="10" y="53" width="100" height="0.8" fill="#d9cfc6" />
        <rect x="10" y="58" width="40" height="3" rx="1" fill="#6b5f57" />
        <rect x="92" y="58" width="18" height="3" rx="1" fill="#6b5f57" />
        <rect x="10" y="64" width="100" height="0.8" fill="#d9cfc6" />
        <rect x="10" y="69" width="46" height="3" rx="1" fill="#6b5f57" />
        <rect x="92" y="69" width="18" height="3" rx="1" fill="#6b5f57" />
        <rect x="10" y="75" width="100" height="0.8" fill="#d9cfc6" />
      </svg>
    );
  }
  if (id === "wellness") {
    return (
      <svg {...common}>
        <rect width="120" height="84" fill="#f6ede6" />
        <rect x="8" y="8" width="44" height="6" rx="3" fill="#2a1e18" />
        <rect x="8" y="19" width="40" height="3" rx="1.5" fill="#b8aca2" />
        <rect x="8" y="25" width="30" height="3" rx="1.5" fill="#b8aca2" />
        <rect x="8" y="33" width="26" height="9" rx="4.5" fill="var(--accent)" />
        <rect x="68" y="6" width="44" height="40" rx="10" fill="var(--accent)" opacity="0.28" />
        <rect x="70" y="8" width="40" height="36" rx="9" ry="9" fill="#e6c9b8" />
        <rect x="8" y="52" width="104" height="24" rx="10" fill="var(--accent)" opacity="0.14" />
        <rect x="13" y="57" width="30" height="14" rx="6" fill="#fff" />
        <rect x="45" y="57" width="30" height="14" rx="6" fill="#fff" />
        <rect x="77" y="57" width="30" height="14" rx="6" fill="#fff" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <rect width="120" height="84" fill="#f2ece6" />
      <rect x="8" y="7" width="104" height="26" rx="7" fill="#fff" stroke="#e6ddd5" />
      <circle cx="22" cy="20" r="7" fill="#d9cfc6" />
      <rect x="34" y="14" width="46" height="5" rx="1.5" fill="#2a1e18" />
      <rect x="34" y="22" width="30" height="3" rx="1.5" fill="#b8aca2" />
      <rect x="8" y="38" width="104" height="14" rx="5" fill="#fff" stroke="#e6ddd5" />
      <rect x="14" y="43" width="40" height="3" rx="1.5" fill="#6b5f57" />
      <rect x="92" y="43" width="14" height="3" rx="1.5" fill="var(--accent)" />
      <rect x="8" y="56" width="104" height="20" rx="6" fill="#fff" stroke="#e6ddd5" />
      <rect x="14" y="62" width="26" height="8" rx="2" fill="#e9dfd6" />
      <rect x="44" y="62" width="26" height="8" rx="2" fill="#e9dfd6" />
      <rect x="74" y="62" width="26" height="8" rx="2" fill="#e9dfd6" />
    </svg>
  );
}

export type PickerDisabled = "locked" | null;

export function TemplatePicker({ initial, ready, hasPage, disabledReason }: { initial: TemplateId; ready: boolean; hasPage: boolean; disabledReason: PickerDisabled }) {
  const t = useTranslations("publicPage.templates");
  const [state, formAction, pending] = useActionState(saveTemplateAction, initialState);
  const active: TemplateId = state.saved && state.template ? state.template : initial;
  const [picked, setPicked] = useState<TemplateId>(initial);

  // dôvod vypnutia: tarifa → ešte neuložená stránka → databáza bez migrácie
  const reason = disabledReason === "locked" ? t("disabled.locked") : !hasPage ? t("disabled.needPage") : !ready ? t("disabled.notReady") : null;
  const disabled = reason !== null;
  const dirty = picked !== active;

  return (
    <section className={tp.wrap} aria-labelledby="tpl-title" data-testid="template-picker">
      <h4 id="tpl-title" className={tp.title}>
        {t("title")}
      </h4>
      <p className={b.sub}>{t("subtitle")}</p>
      {reason && (
        <p className={tp.note} role="note" data-testid="template-picker-note">
          {reason}
        </p>
      )}
      <form action={formAction}>
        <fieldset className={tp.group} disabled={disabled || pending}>
          <legend className={tp.legend}>{t("legend")}</legend>
          {TEMPLATE_IDS.map((id) => {
            const isActive = id === active;
            return (
              <div key={id} className={`${tp.option} ${picked === id ? tp.optionOn : ""}`} data-template-option={id}>
                <label className={tp.label}>
                  <input type="radio" name="template" value={id} checked={picked === id} onChange={() => setPicked(id)} className={tp.radio} />
                  <span className={tp.thumb}>
                    <Thumb id={id} />
                  </span>
                  <span className={tp.name}>
                    {t(`names.${id}`)}
                    {isActive && <span className={tp.badge}>{t("active")}</span>}
                  </span>
                  <span className={tp.desc}>{t(`descriptions.${id}`)}</span>
                </label>
                {hasPage && (
                  <Link href={`/dashboard/nastavenia/stranka-nahlad?sablona=${id}`} className={tp.preview} data-testid={`template-preview-${id}`}>
                    {t("preview")}
                  </Link>
                )}
              </div>
            );
          })}
        </fieldset>
        <div className={tp.actions}>
          <button type="submit" className="btn btn-primary" disabled={disabled || pending || !dirty} data-testid="template-save">
            {pending ? t("saving") : t("save")}
          </button>
          <span role="status" aria-live="polite" className={tp.status}>
            {state.error ? <span className={tp.err}>{state.error}</span> : state.saved && !dirty ? t("saved") : null}
          </span>
        </div>
      </form>
    </section>
  );
}
