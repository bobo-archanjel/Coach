// FitPilot — vzhľad zdieľacej karty (story 1080×1920) pre next/og (satori). Satori podporuje len
// podmnožinu CSS (flexbox, inline štýly), preto je vzhľad samostatne a bez CSS modulov.
// Texty prichádzajú hotové z route handlera (jazyk používateľa); tu sa nič neprekladá.

import type { ReactElement } from "react";
import { SHARE_H, SHARE_W, type ShareBrand, type ShareKind } from "./shareCard";

export interface ShareCardText {
  kicker: string;
  headline: string;
  sub: string;
  /** krátke štatistiky (týždenný súhrn): [hodnota, popis] */
  stats: [string, string][];
  /** „Jana · 24. 11. 2026“ */
  who: string;
  /** spodný riadok (napr. „Vytvorené vo FitPilot“) */
  footer: string;
}

const ICONS: Record<ShareKind, string> = {
  pr: "M8 4h8v5a4 4 0 0 1-8 0V4zM8 6H5v1.5A3 3 0 0 0 8 10.5M16 6h3v1.5a3 3 0 0 1-3 3M12 13v4M8.5 20h7M10 17h4",
  badge: "M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.1 5.9-.8L12 3.5z",
  challenge: "M5 21V4M5 5h12l-2.5 4L17 13H5",
  weekly: "M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5v-11zM4 9.5h16M8 3v3M16 3v3M8.5 14.5l2.2 2.2 4.8-4.8",
};

const BG = "#15110f";
const INK = "#fbf7f2";
const INK_DIM = "#b9aea5";

export function shareCardElement(kind: ShareKind, text: ShareCardText, brand: ShareBrand, logoDataUrl: string | null): ReactElement {
  const accent = brand.accent;
  return (
    <div
      style={{
        width: SHARE_W,
        height: SHARE_H,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "120px 88px 112px",
        background: `radial-gradient(circle at 85% 18%, ${accent}38 0%, ${accent}00 55%), linear-gradient(165deg, ${BG} 0%, #231a16 62%, ${BG} 100%)`,
        color: INK,
        fontFamily: "Inter",
      }}
    >
      {/* značka (logo + názov) */}
      <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
        {logoDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoDataUrl} width={104} height={104} style={{ borderRadius: 26, objectFit: "contain" }} alt="" />
        ) : (
          <div
            style={{
              width: 104,
              height: 104,
              borderRadius: 26,
              background: accent,
              color: brand.onAccent,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 56,
              fontWeight: 700,
            }}
          >
            {brand.name.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div style={{ display: "flex", fontSize: 54, fontWeight: 700, letterSpacing: -1 }}>{brand.name}</div>
      </div>

      {/* hlavný obsah */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 40 }}>
        <div
          style={{
            width: 220,
            height: 220,
            borderRadius: 110,
            background: accent,
            color: brand.onAccent,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg width="120" height="120" viewBox="0 0 24 24" fill="none" stroke={brand.onAccent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d={ICONS[kind]} />
          </svg>
        </div>
        <div style={{ display: "flex", fontSize: 44, fontWeight: 600, color: accent, letterSpacing: 3, textTransform: "uppercase" }}>{text.kicker}</div>
        <div style={{ display: "flex", fontSize: 96, fontWeight: 700, lineHeight: 1.05, letterSpacing: -2 }}>{text.headline}</div>
        {text.sub ? <div style={{ display: "flex", fontSize: 44, color: INK_DIM, lineHeight: 1.3 }}>{text.sub}</div> : null}
        {text.stats.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 22, marginTop: 8, width: "100%" }}>
            {text.stats.map(([value, label]) => (
              <div
                key={label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "26px 34px",
                  borderRadius: 28,
                  background: "rgba(255,255,255,0.07)",
                  border: "2px solid rgba(255,255,255,0.08)",
                }}
              >
                <div style={{ display: "flex", fontSize: 40, color: INK_DIM }}>{label}</div>
                <div style={{ display: "flex", fontSize: 56, fontWeight: 700 }}>{value}</div>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {/* podpis */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14, paddingTop: 40, borderTop: "2px solid rgba(255,255,255,0.1)" }}>
        <div style={{ display: "flex", fontSize: 48, fontWeight: 600 }}>{text.who}</div>
        <div style={{ display: "flex", fontSize: 32, color: INK_DIM }}>{text.footer}</div>
      </div>
    </div>
  );
}
