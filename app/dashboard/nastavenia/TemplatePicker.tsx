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

/** Schematický náhľad webu šablóny (lišta, hrdina, ceny) v jej farbách — čisté SVG, bez obrázkov. */
function Thumb({ id }: { id: TemplateId }) {
  const common = { viewBox: "0 0 120 84", width: "100%", height: "100%", "aria-hidden": true, focusable: false } as const;
  if (id === "sport") {
    return (
      <svg {...common}>
        <rect width="120" height="84" fill="#0b0b0c" />
        <rect width="120" height="8" fill="#0b0b0c" />
        <rect x="6" y="3" width="22" height="2.4" fill="#fff" />
        <rect x="92" y="2" width="22" height="4.4" fill="#c8f031" />
        <rect y="8" width="120" height="40" fill="#34343a" />
        <rect x="58" y="8" width="62" height="40" fill="#4a4a52" />
        <rect y="8" width="120" height="40" fill="url(#sg)" />
        <defs>
          <linearGradient id="sg" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#0b0b0c" stopOpacity="0.95" />
            <stop offset="1" stopColor="#0b0b0c" stopOpacity="0.15" />
          </linearGradient>
        </defs>
        <rect x="8" y="22" width="12" height="2.6" fill="#c8f031" />
        <rect x="8" y="27" width="62" height="9" fill="#fff" />
        <rect x="8" y="39" width="22" height="5" fill="#c8f031" />
        <rect x="8" y="54" width="34" height="22" fill="#19191c" stroke="#2a2a30" strokeWidth="0.6" />
        <rect x="8" y="54" width="34" height="1.8" fill="#c8f031" />
        <rect x="45" y="54" width="34" height="22" fill="#19191c" stroke="#2a2a30" strokeWidth="0.6" />
        <rect x="45" y="54" width="34" height="1.8" fill="#c8f031" />
        <rect x="82" y="54" width="30" height="22" fill="#19191c" stroke="#2a2a30" strokeWidth="0.6" />
        <rect x="82" y="54" width="30" height="1.8" fill="#c8f031" />
        <rect x="12" y="60" width="14" height="5" fill="none" stroke="#c8f031" strokeWidth="0.7" />
      </svg>
    );
  }
  if (id === "minimal") {
    return (
      <svg {...common}>
        <rect width="120" height="84" fill="#faf8f4" />
        <rect x="8" y="5" width="22" height="3" fill="#151515" />
        <rect x="76" y="5" width="8" height="2" fill="#6b675f" />
        <rect x="88" y="5" width="8" height="2" fill="#6b675f" />
        <rect x="0" y="12" width="120" height="0.6" fill="#ddd7cb" />
        <rect x="8" y="20" width="22" height="1.6" fill="#6b675f" />
        <rect x="8" y="26" width="60" height="7" fill="#151515" />
        <rect x="8" y="36" width="40" height="7" fill="#151515" />
        <rect x="8" y="47" width="30" height="2.4" fill="#6b675f" />
        <rect x="8" y="54" width="16" height="5" fill="#1d4a3c" />
        <rect x="80" y="18" width="32" height="42" fill="#d9d1c3" />
        <rect x="83" y="21" width="32" height="42" fill="none" stroke="#bfb8a9" strokeWidth="0.6" />
        <rect x="8" y="66" width="104" height="0.6" fill="#151515" />
        <rect x="8" y="70" width="36" height="2.6" fill="#151515" />
        <rect x="96" y="70" width="16" height="2.6" fill="#151515" />
        <rect x="8" y="76" width="104" height="0.6" fill="#bfb8a9" />
      </svg>
    );
  }
  if (id === "wellness") {
    return (
      <svg {...common}>
        <rect width="120" height="84" fill="#fbf6ee" />
        <circle cx="108" cy="12" r="22" fill="#f8e4dc" />
        <circle cx="6" cy="50" r="18" fill="#e2ebdc" />
        <rect x="8" y="5" width="24" height="3.4" rx="1.7" fill="#2b3a31" />
        <rect x="84" y="3.5" width="28" height="7" rx="3.5" fill="#4a7a5d" />
        <rect x="8" y="20" width="52" height="6" rx="3" fill="#2b3a31" />
        <rect x="8" y="30" width="38" height="6" rx="3" fill="#2b3a31" />
        <rect x="8" y="41" width="44" height="2.6" rx="1.3" fill="#66726a" />
        <rect x="8" y="48" width="22" height="7" rx="3.5" fill="#4a7a5d" />
        <path d="M70 52V30a15 15 0 0 1 30 0v22a3 3 0 0 1-3 3H73a3 3 0 0 1-3-3Z" fill="#dcb9a5" />
        <rect x="8" y="62" width="32" height="16" rx="6" fill="#fff" />
        <rect x="44" y="62" width="32" height="16" rx="6" fill="#e2ebdc" />
        <rect x="80" y="62" width="32" height="16" rx="6" fill="#f8e4dc" />
        <rect x="12" y="66" width="12" height="4" rx="2" fill="#4a7a5d" />
        <rect x="48" y="66" width="12" height="4" rx="2" fill="#4a7a5d" />
        <rect x="84" y="66" width="12" height="4" rx="2" fill="#4a7a5d" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <rect width="120" height="84" fill="#fff" />
      <rect x="8" y="5" width="22" height="3.4" rx="1" fill="#0f1b33" />
      <rect x="60" y="5.4" width="8" height="2" rx="1" fill="#62708a" />
      <rect x="72" y="5.4" width="8" height="2" rx="1" fill="#62708a" />
      <rect x="88" y="3" width="24" height="7.4" rx="2.5" fill="#2f5bea" />
      <rect y="12.4" width="120" height="0.6" fill="#e3e8f1" />
      <rect y="13" width="120" height="40" fill="#f3f6fb" />
      <rect x="8" y="22" width="50" height="5.6" rx="1.5" fill="#0f1b33" />
      <rect x="8" y="30" width="36" height="5.6" rx="1.5" fill="#0f1b33" />
      <rect x="8" y="39" width="44" height="2.4" rx="1.2" fill="#62708a" />
      <rect x="8" y="45" width="18" height="6" rx="2.5" fill="#2f5bea" />
      <rect x="78" y="20" width="34" height="30" rx="5" fill="#2f5bea" opacity="0.14" />
      <rect x="74" y="17" width="34" height="30" rx="5" fill="#cbd5e8" />
      <rect x="8" y="58" width="32" height="20" rx="4" fill="#fff" stroke="#e3e8f1" />
      <rect x="44" y="58" width="32" height="20" rx="4" fill="#fff" stroke="#2f5bea" />
      <rect x="80" y="58" width="32" height="20" rx="4" fill="#fff" stroke="#e3e8f1" />
      <rect x="12" y="62" width="14" height="4" rx="1.5" fill="#2f5bea" />
      <rect x="48" y="62" width="14" height="4" rx="1.5" fill="#2f5bea" />
      <rect x="84" y="62" width="14" height="4" rx="1.5" fill="#2f5bea" />
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
