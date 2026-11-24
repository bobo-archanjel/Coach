// FitPilot — vektorové grafy do PDF reportov (pdf-lib, žiadny raster ani knižnica). Kreslia sa do
// obdĺžnika `box` z PdfWriter.chartCard: čiarový graf s časovou osou a stĺpcový graf s voliteľnou
// vodiacou čiarou. Farby sú z tokenov PDF (COLORS), rovnaký jazyk ako grafy v appke — žiadne osi,
// len jemná mriežka, najnižšia/najvyššia hodnota a krajné dátumy.

import type { PDFFont, PDFPage, RGB } from "pdf-lib";
import { COLORS } from "./document";

export interface ChartBox {
  x: number;
  /** horná hrana obdĺžnika (kreslí sa smerom nadol) */
  yTop: number;
  width: number;
  height: number;
}

interface ChartFonts {
  regular: PDFFont;
  semibold: PDFFont;
}

const LABEL = 8;
const GUTTER = 38;

function text(page: PDFPage, s: string, x: number, y: number, font: PDFFont, size: number, color: RGB, align: "left" | "right" | "center" = "left") {
  const w = font.widthOfTextAtSize(s, size);
  page.drawText(s, { x: align === "right" ? x - w : align === "center" ? x - w / 2 : x, y, size, font, color });
}

/** Čiarový graf (dátum → hodnota) s časovo úmernou osou x. */
export function drawLineChart(
  page: PDFPage,
  box: ChartBox,
  points: { date: string; value: number }[],
  o: ChartFonts & { color?: RGB; fmtValue: (v: number) => string; fmtDate: (iso: string) => string },
) {
  if (points.length === 0) return;
  const color = o.color ?? COLORS.accent;
  const plotL = box.x + GUTTER;
  const plotR = box.x + box.width - 8;
  const plotT = box.yTop - 8;
  const plotB = box.yTop - box.height + 16;

  const values = points.map((p) => p.value);
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  if (lo === hi) {
    lo -= 1;
    hi += 1;
  }
  const pad = (hi - lo) * 0.08;
  lo -= pad;
  hi += pad;
  const t0 = new Date(`${points[0].date}T12:00:00Z`).getTime();
  const t1 = new Date(`${points[points.length - 1].date}T12:00:00Z`).getTime();
  const xOf = (iso: string) => (t1 === t0 ? (plotL + plotR) / 2 : plotL + ((new Date(`${iso}T12:00:00Z`).getTime() - t0) / (t1 - t0)) * (plotR - plotL));
  const yOf = (v: number) => plotB + ((v - lo) / (hi - lo)) * (plotT - plotB);

  // mriežka: dolná, stredná a horná čiara + popisky skutočného rozsahu
  for (const frac of [0, 0.5, 1]) {
    const y = plotB + frac * (plotT - plotB);
    page.drawLine({ start: { x: plotL, y }, end: { x: plotR, y }, thickness: 0.6, color: COLORS.line });
  }
  text(page, o.fmtValue(Math.max(...values)), plotL - 6, plotT - 3, o.regular, LABEL, COLORS.faint, "right");
  text(page, o.fmtValue(Math.min(...values)), plotL - 6, plotB - 3, o.regular, LABEL, COLORS.faint, "right");

  const xy = points.map((p) => ({ x: xOf(p.date), y: yOf(p.value) }));
  for (let i = 1; i < xy.length; i++) {
    page.drawLine({ start: xy[i - 1], end: xy[i], thickness: 1.8, color, lineCap: 1 });
  }
  const dots = points.length <= 40;
  xy.forEach((p, i) => {
    if (dots || i === xy.length - 1) page.drawCircle({ x: p.x, y: p.y, size: i === xy.length - 1 ? 3.2 : 2, color });
  });

  // krajné dátumy
  text(page, o.fmtDate(points[0].date), plotL, box.yTop - box.height + 3, o.regular, LABEL, COLORS.faint, "left");
  if (points.length > 1) text(page, o.fmtDate(points[points.length - 1].date), plotR, box.yTop - box.height + 3, o.regular, LABEL, COLORS.faint, "right");
}

export interface PdfBar {
  label: string;
  value: number | null;
}

/** Stĺpcový graf; `refLine` = vodorovná prerušovaná vodiaca čiara (cieľ). */
export function drawBarChart(
  page: PDFPage,
  box: ChartBox,
  bars: PdfBar[],
  o: ChartFonts & { color?: RGB; max?: number; refLine?: { value: number; label: string }; fmtValue: (v: number) => string },
) {
  if (bars.length === 0) return;
  const color = o.color ?? COLORS.accent;
  const plotL = box.x + 4;
  const plotR = box.x + box.width - 4;
  const plotT = box.yTop - 14;
  const plotB = box.yTop - box.height + 16;
  const top = Math.max(o.max ?? 0, o.refLine?.value ?? 0, ...bars.map((b) => b.value ?? 0), 1);
  const yOf = (v: number) => plotB + (v / top) * (plotT - plotB);
  const slot = (plotR - plotL) / bars.length;
  const barW = Math.max(2, slot * 0.66);
  const labelEvery = bars.length <= 12 ? 1 : Math.ceil(bars.length / 10);
  const showValues = bars.length <= 14;

  page.drawLine({ start: { x: plotL, y: plotB }, end: { x: plotR, y: plotB }, thickness: 0.8, color: COLORS.line });
  bars.forEach((b, i) => {
    const cx = plotL + slot * (i + 0.5);
    if (b.value != null && b.value > 0) {
      const h = Math.max(1.5, yOf(b.value) - plotB);
      page.drawRectangle({ x: cx - barW / 2, y: plotB, width: barW, height: h, color });
      if (showValues) text(page, o.fmtValue(b.value), cx, plotB + h + 3, o.semibold, 7.5, COLORS.dim, "center");
    }
    if (i % labelEvery === 0) text(page, b.label, cx, box.yTop - box.height + 3, o.regular, 7.5, COLORS.faint, "center");
  });
  if (o.refLine) {
    const y = yOf(o.refLine.value);
    page.drawLine({ start: { x: plotL, y }, end: { x: plotR, y }, thickness: 0.9, color: COLORS.faint, dashArray: [3, 3] });
    text(page, o.refLine.label, plotR, y + 3, o.regular, 7.5, COLORS.faint, "right");
  }
}
