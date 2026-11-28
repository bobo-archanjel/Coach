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

/** Farebná škvrna za sklom (radiálny prechod) — rovnaký princíp ako pozadie webu. */
function Blob({ id, cx, cy, r, color, opacity }: { id: string; cx: number; cy: number; r: number; color: string; opacity: number }) {
  return (
    <>
      <defs>
        <radialGradient id={id}>
          <stop offset="0" stopColor={color} stopOpacity={opacity} />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx={cx} cy={cy} r={r} fill={`url(#${id})`} />
    </>
  );
}

/** Sklenený panel: priesvitná výplň + svetlá hrana (v miniatúre bez rozostrenia). */
function Pane(p: { x: number; y: number; w: number; h: number; r: number; fill: string; op: number; edge: string; edgeOp: number }) {
  return (
    <>
      <rect x={p.x} y={p.y} width={p.w} height={p.h} rx={p.r} fill={p.fill} fillOpacity={p.op} />
      <rect x={p.x + 0.4} y={p.y + 0.4} width={p.w - 0.8} height={p.h - 0.8} rx={p.r} fill="none" stroke={p.edge} strokeOpacity={p.edgeOp} strokeWidth="0.8" />
    </>
  );
}

/** Schematický náhľad webu šablóny (plávajúca lišta, hrdina, ceny — sklo nad farebnými škvrnami) — čisté SVG, bez obrázkov. */
function Thumb({ id }: { id: TemplateId }) {
  const common = { viewBox: "0 0 120 84", width: "100%", height: "100%", "aria-hidden": true, focusable: false } as const;
  if (id === "sport") {
    return (
      <svg {...common}>
        <rect width="120" height="84" fill="#07070d" />
        <Blob id="tsa" cx={20} cy={8} r={46} color="#702ae1" opacity={0.75} />
        <Blob id="tsb" cx={112} cy={30} r={34} color="#22d3ee" opacity={0.4} />
        <Blob id="tsc" cx={104} cy={80} r={30} color="#c8f031" opacity={0.3} />
        <Blob id="tsd" cx={10} cy={74} r={32} color="#c026d3" opacity={0.4} />
        <Pane x={6} y={4} w={108} h={10} r={5} fill="#18162a" op={0.7} edge="#fff" edgeOp={0.3} />
        <rect x={12} y={8} width={20} height={2.4} rx={1.2} fill="#fff" />
        <rect x={88} y={6.4} width={22} height={5.2} rx={2.6} fill="#c8f031" />
        <rect x={50} y={8.4} width={7} height={1.6} rx={0.8} fill="#a9a9c2" />
        <rect x={60} y={8.4} width={7} height={1.6} rx={0.8} fill="#a9a9c2" />
        <rect x={6} y={18} width="108" height="32" rx="8" fill="#2c2a46" />
        <Pane x={10} y={26} w={64} h={20} r={7} fill="#18162a" op={0.7} edge="#fff" edgeOp={0.35} />
        <rect x={15} y={30} width={10} height={1.8} rx={0.9} fill="#c8f031" />
        <rect x={15} y={34} width={46} height={6} rx={1.5} fill="#fff" />
        <rect x={15} y={42} width={16} height={2.6} rx={1.3} fill="#c8f031" />
        <Pane x={6} y={56} w={34} h={22} r={7} fill="#18162a" op={0.7} edge="#fff" edgeOp={0.28} />
        <Pane x={43} y={56} w={34} h={22} r={7} fill="#18162a" op={0.7} edge="#fff" edgeOp={0.28} />
        <Pane x={80} y={56} w={34} h={22} r={7} fill="#18162a" op={0.7} edge="#fff" edgeOp={0.28} />
        <rect x={14} y={56.4} width={18} height={1.2} rx={0.6} fill="#c8f031" />
        <rect x={51} y={56.4} width={18} height={1.2} rx={0.6} fill="#c8f031" />
        <rect x={88} y={56.4} width={18} height={1.2} rx={0.6} fill="#c8f031" />
        <rect x={11} y={62} width={14} height={4.6} rx={1} fill="none" stroke="#c8f031" strokeWidth="0.7" />
        <rect x={48} y={62} width={14} height={4.6} rx={1} fill="none" stroke="#c8f031" strokeWidth="0.7" />
        <rect x={85} y={62} width={14} height={4.6} rx={1} fill="none" stroke="#c8f031" strokeWidth="0.7" />
      </svg>
    );
  }
  if (id === "minimal") {
    return (
      <svg {...common}>
        <rect width="120" height="84" fill="#f4f0e8" />
        <Blob id="tma" cx={18} cy={6} r={44} color="#e8d6b6" opacity={0.95} />
        <Blob id="tmb" cx={110} cy={36} r={32} color="#c2d0b8" opacity={0.7} />
        <Blob id="tmc" cx={14} cy={80} r={34} color="#eed0c0" opacity={0.7} />
        <Pane x={8} y={4} w={104} h={10} r={5} fill="#fffcf5" op={0.7} edge="#fff" edgeOp={0.9} />
        <rect x={14} y={7.6} width={20} height={2.6} rx={1} fill="#15140f" />
        <rect x={64} y={8} width={8} height={1.6} rx={0.8} fill="#686356" />
        <rect x={76} y={8} width={8} height={1.6} rx={0.8} fill="#686356" />
        <rect x={92} y={6} width={16} height={5.4} rx={2.7} fill="#1f4a3a" />
        <Pane x={8} y={20} w={22} h={5} r={2.5} fill="#fffcf5" op={0.7} edge="#fff" edgeOp={0.9} />
        <rect x={8} y={29} width={58} height={6.4} rx={1} fill="#15140f" />
        <rect x={8} y={38} width={40} height={6.4} rx={1} fill="#15140f" />
        <rect x={8} y={48} width={32} height={2.2} rx={1.1} fill="#686356" />
        <rect x={8} y={54} width={20} height={5.4} rx={2.7} fill="#1f4a3a" />
        <Pane x={80} y={18} w={32} h={42} r={7} fill="#fffcf5" op={0.65} edge="#fff" edgeOp={0.95} />
        <rect x={83} y={21} width={26} height={36} rx={4.5} fill="#d4c9b6" />
        <Pane x={8} y={65} w={104} h={15} r={6} fill="#fffcf5" op={0.7} edge="#fff" edgeOp={0.95} />
        <rect x={14} y={68} width={34} height={2.4} rx={1.2} fill="#15140f" />
        <rect x={92} y={68} width={14} height={2.4} rx={1.2} fill="#15140f" />
        <rect x={14} y={73.4} width={92} height={0.5} fill="#3c3219" fillOpacity="0.3" />
      </svg>
    );
  }
  if (id === "wellness") {
    return (
      <svg {...common}>
        <rect width="120" height="84" fill="#fdf3ec" />
        <Blob id="twa" cx={14} cy={6} r={42} color="#ffbe96" opacity={0.9} />
        <Blob id="twb" cx={112} cy={22} r={32} color="#ffa5c8" opacity={0.65} />
        <Blob id="twc" cx={20} cy={62} r={30} color="#c4afff" opacity={0.7} />
        <Blob id="twd" cx={108} cy={74} r={32} color="#aadab6" opacity={0.8} />
        <Pane x={8} y={4} w={104} h={10} r={5} fill="#fffaf6" op={0.7} edge="#fff" edgeOp={0.95} />
        <rect x={14} y={7.8} width={22} height={2.6} rx={1.3} fill="#3a2a31" />
        <rect x={86} y={6} width={22} height={5.4} rx={2.7} fill="#3f7a5c" />
        <rect x={8} y={21} width={50} height={6.4} rx={3.2} fill="#3a2a31" />
        <rect x={8} y={30} width={36} height={6.4} rx={3.2} fill="#3a2a31" />
        <rect x={8} y={40} width={42} height={2.4} rx={1.2} fill="#735e68" />
        <rect x={8} y={47} width={22} height={6.4} rx={3.2} fill="#3f7a5c" />
        <path d="M70 53V30a15 15 0 0 1 30 0v23a3 3 0 0 1-3 3H73a3 3 0 0 1-3-3Z" fill="#e4b9a4" />
        <path d="M70 53V30a15 15 0 0 1 30 0v23a3 3 0 0 1-3 3H73a3 3 0 0 1-3-3Z" fill="none" stroke="#fff" strokeOpacity="0.8" strokeWidth="1.6" />
        <Pane x={8} y={60} w={32} h={18} r={8} fill="#fffaf6" op={0.7} edge="#fff" edgeOp={0.95} />
        <Pane x={44} y={60} w={32} h={18} r={8} fill="#e0f0e4" op={0.75} edge="#fff" edgeOp={0.95} />
        <Pane x={80} y={60} w={32} h={18} r={8} fill="#e8dcff" op={0.75} edge="#fff" edgeOp={0.95} />
        <rect x={12} y={64} width={13} height={4} rx={2} fill="#3f7a5c" />
        <rect x={48} y={64} width={13} height={4} rx={2} fill="#3f7a5c" />
        <rect x={84} y={64} width={13} height={4} rx={2} fill="#3f7a5c" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <rect width="120" height="84" fill="#e9f0fb" />
      <Blob id="tka" cx={14} cy={8} r={46} color="#6ebeff" opacity={0.85} />
      <Blob id="tkb" cx={112} cy={22} r={36} color="#8c87ff" opacity={0.7} />
      <Blob id="tkc" cx={18} cy={66} r={30} color="#6ee8dc" opacity={0.55} />
      <Blob id="tkd" cx={108} cy={74} r={30} color="#beaaff" opacity={0.6} />
      <Pane x={8} y={4} w={104} h={10} r={5} fill="#fff" op={0.7} edge="#fff" edgeOp={1} />
      <rect x={14} y={7.8} width={20} height={2.6} rx={1.3} fill="#0c1a3a" />
      <rect x={58} y={8.2} width={8} height={1.8} rx={0.9} fill="#4f628b" />
      <rect x={70} y={8.2} width={8} height={1.8} rx={0.9} fill="#4f628b" />
      <rect x={88} y={6} width={20} height={5.4} rx={2.7} fill="#4258f0" />
      <Pane x={8} y={20} w={20} h={5} r={2.5} fill="#fff" op={0.7} edge="#fff" edgeOp={1} />
      <rect x={8} y={29} width={50} height={5.8} rx={2} fill="#0c1a3a" />
      <rect x={8} y={37} width={36} height={5.8} rx={2} fill="#0c1a3a" />
      <rect x={8} y={46} width={44} height={2.4} rx={1.2} fill="#4f628b" />
      <rect x={8} y={52} width={20} height={5.8} rx={2.9} fill="#4258f0" />
      <Pane x={74} y={18} w={38} h={40} r={10} fill="#fff" op={0.6} edge="#fff" edgeOp={1} />
      <rect x={77} y={21} width={32} height={34} rx={7} fill="#b9c8e6" />
      <Pane x={8} y={63} w={32} h={16} r={7} fill="#fff" op={0.6} edge="#fff" edgeOp={1} />
      <Pane x={44} y={63} w={32} h={16} r={7} fill="#fff" op={0.6} edge="#fff" edgeOp={1} />
      <Pane x={80} y={63} w={32} h={16} r={7} fill="#fff" op={0.6} edge="#fff" edgeOp={1} />
      <rect x={13} y={67} width={14} height={4} rx={1.5} fill="#4258f0" />
      <rect x={49} y={67} width={14} height={4} rx={1.5} fill="#4258f0" />
      <rect x={85} y={67} width={14} height={4} rx={1.5} fill="#4258f0" />
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
