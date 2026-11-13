// FitPilot — export dát: spoločná PDF infraštruktúra (tréningový plán, jedálniček, progres).
// pdf-lib negeneruje layout z HTML/CSS — kreslí sa manuálne (súradnice), beží čisto na
// serveri (Route Handler), žiadny headless prehliadač netreba.
//
// Vizuál = nový dizajn appky v6 (app/v6design/styles/tokens.module.css, svetlá téma):
// teplé svetlé pozadie s jemnou terakotovou žiarou, biele „sklenené“ karty so zaoblením,
// terakotový akcent, tlmené popisky veľkými písmenami a písmo Inter ako v appke.
// Svetlé pozadie je zároveň šetrné k tlači (predtým celá strana tmavá).
// Fonty: štandardné PDF fonty nemajú slovenské diakritiky — vlastný TrueType cez fontkit.
// Inter (OFL, assets/fonts/Inter-LICENSE.txt) — statické rezy z oficiálneho vydania v4.1.

import { createTranslator } from "next-intl";
import { intlLocale, type Locale } from "@/lib/i18n/locales";
import skPdf from "@/messages/sk/pdf.json";
import csPdf from "@/messages/cs/pdf.json";
import { readFileSync } from "fs";
import path from "path";
import { PDFDocument, rgb, setCharacterSpacing, type PDFFont, type PDFImage, type PDFPage, type RGB } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

const fontCache = new Map<string, Buffer>();
function assetBytes(...segments: string[]): Buffer {
  const key = segments.join("/");
  let bytes = fontCache.get(key);
  if (!bytes) {
    bytes = readFileSync(path.join(process.cwd(), ...segments));
    fontCache.set(key, bytes);
  }
  return bytes;
}

export const PAGE_WIDTH = 595.28; // A4 v pt (72 dpi)
export const PAGE_HEIGHT = 841.89;
export const MARGIN = 44;
const CONTENT_W = PAGE_WIDTH - MARGIN * 2;
/** prvý riadok obsahu pod hlavičkou strany */
const CONTENT_TOP = PAGE_HEIGHT - 84;
/** obsah nesmie ísť nižšie (pätička s číslom strany) */
const CONTENT_BOTTOM = 56;

const CARD_PAD = 16;
const CARD_RADIUS = 16;
const CARD_GAP = 12;
const TITLE_ROW_H = 26;
const HEAD_ROW_H = 22;
const ROW_H = 22;
const GROUP_ROW_H = 24;
const FOOTER_ROW_H = 34;

function hex(h: string): RGB {
  const n = parseInt(h.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/** Tokeny v6 (svetlá téma), priehľadné farby predpočítané nad kartou — tlač ich nemieša. */
export const COLORS = {
  bg: hex("#F2ECE6"), // --v6-bg
  card: hex("#FBF8F6"), // --card-bg (biele sklo) nad pozadím
  cardEdge: hex("#FFFFFF"), // --surface-border
  line: hex("#ECE5DE"), // --hairline na karte
  fill: hex("#F2EEEC"), // --fill na karte
  text: hex("#1F1A17"), // --paper
  dim: hex("#574D47"), // --paper-dim
  faint: hex("#7D726A"), // --paper-faint
  accent: hex("#D9694A"), // --accent
  accentText: hex("#B4492D"), // --accent-text
  accentSoft: hex("#F7E5DF"), // --accent-soft nad kartou
  moss: hex("#2F7D52"), // --moss (tuky, splnené)
  mossSoft: hex("#E3E9E2"),
  amber: hex("#A46B10"), // --plate-yellow (sacharidy)
  amberSoft: hex("#F6E9D7"),
  glowA: hex("#EA7C5C"), // --v6-glow-a
  shadow: hex("#46281A"),
};

/** Farby makier ako v appke (MacroChips, makro pruhy): bielkoviny terakota, sacharidy jantár, tuky mach. */
export const MACRO_COLORS = { protein: COLORS.accent, carbs: COLORS.amber, fat: COLORS.moss };

/* Texty PDF — vlastný translator nad menným priestorom `pdf` (čistý modul bez next/headers,
   generovanie beží aj v unit testoch); jazyk dodá route handler (getUserLocale). */
const PDF_MESSAGES: Record<Locale, typeof skPdf> = { sk: skPdf, cs: csPdf };

function pdfTranslator(locale: Locale) {
  return createTranslator({ locale, messages: { pdf: PDF_MESSAGES[locale] }, namespace: "pdf" });
}

export interface PdfContext {
  /** jazyk a texty dokumentu (messages/<jazyk>/pdf.json) — podľa jazyka používateľa */
  locale: Locale;
  t: ReturnType<typeof pdfTranslator>;
  doc: PDFDocument;
  regular: PDFFont;
  semibold: PDFFont;
  bold: PDFFont;
  logo: PDFImage | null;
}

export async function createPdfContext(locale: Locale = "sk"): Promise<PdfContext> {
  const t = pdfTranslator(locale);
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const [regular, semibold, bold, logo] = await Promise.all([
    doc.embedFont(assetBytes("assets", "fonts", "Inter-Regular.ttf"), { subset: true }),
    doc.embedFont(assetBytes("assets", "fonts", "Inter-SemiBold.ttf"), { subset: true }),
    doc.embedFont(assetBytes("assets", "fonts", "Inter-Bold.ttf"), { subset: true }),
    // značka loga (wordmark je raster so svetlým textom — na svetlom pozadí by zmizol)
    // then(): readFileSync hádže synchrónne — bez neho by .catch chýbajúce logo nezachytil
    // a padol by celý export namiesto PDF bez loga
    Promise.resolve()
      .then(() => doc.embedPng(assetBytes("public", "brand", "logo-mark.png")))
      .catch(() => null),
  ]);
  return { locale, t, doc, regular, semibold, bold, logo };
}

export interface TableColumn {
  text: string;
  /** pomerná šírka — stĺpce sa roztiahnu na šírku karty */
  width: number;
  align?: "left" | "right";
  /** prvý stĺpec je predvolene tučnejší (názov cviku/potraviny); false = obyčajný (dátum) */
  strong?: boolean;
}

/** riadok tabuľky, alebo podnadpis skupiny (napr. jedlo dňa „Raňajky“) */
export type TableRow = { cells: string[] } | { group: string };

export interface Chip {
  text: string;
  /** farebná bodka pred textom (makrá) */
  dot?: RGB;
  /** zvýraznený (terakotový) čip, napr. kcal dňa */
  accent?: boolean;
}

export interface TableCardInput {
  title: string;
  /** vpravo v hlavičke karty, tlmene (napr. „5 cvikov“) */
  aside?: string;
  /** tlmená veta pod nadpisom karty */
  subtitle?: string;
  columns: TableColumn[];
  rows: TableRow[];
  /** text namiesto tabuľky, keď nie sú riadky */
  empty?: string;
  /** spodok karty — čipy (súčet dňa) a poznámka vpravo */
  footer?: { chips: Chip[]; note?: string };
}

export interface Tile {
  label: string;
  value: string;
  sub?: string;
  dot?: RGB;
}

/** SVG cesta zaobleného obdĺžnika s ľavým horným rohom v (0, 0) — pdf-lib ju kreslí s osou y nadol. */
function roundedRectPath(w: number, h: number, r: number): string {
  const rr = Math.min(r, w / 2, h / 2);
  return [
    `M ${rr} 0`,
    `H ${w - rr}`,
    `A ${rr} ${rr} 0 0 1 ${w} ${rr}`,
    `V ${h - rr}`,
    `A ${rr} ${rr} 0 0 1 ${w - rr} ${h}`,
    `H ${rr}`,
    `A ${rr} ${rr} 0 0 1 0 ${h - rr}`,
    `V ${rr}`,
    `A ${rr} ${rr} 0 0 1 ${rr} 0`,
    "Z",
  ].join(" ");
}

/** Text skrátený tak, aby sa zmestil do šírky (meria sa skutočným fontom, nie počtom znakov). */
export function fitText(text: string, font: PDFFont, size: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (font.widthOfTextAtSize(`${text.slice(0, mid).trimEnd()}…`, size) <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return `${text.slice(0, lo).trimEnd()}…`;
}

/** Zalomí text na riadky do šírky (po slovách); posledný riadok skráti, ak ich je viac ako `maxLines`. */
function wrapText(text: string, font: PDFFont, size: number, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const word of words) {
    const next = cur ? `${cur} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth || !cur) cur = next;
    else {
      lines.push(cur);
      cur = word;
    }
  }
  if (cur) lines.push(cur);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = fitText(lines.slice(maxLines - 1).join(" "), font, size, maxWidth);
  return kept;
}

/**
 * „Tečúci“ writer — kreslí bloky zhora nadol a sám založí novú stranu (s rovnakým
 * pozadím a hlavičkou), keď sa blok nezmestí. Karta s tabuľkou sa pri zalome rozdelí
 * na viac kariet a hlavička stĺpcov sa zopakuje. Pätičku s číslom strany doplní `bytes()`.
 */
export class PdfWriter {
  private page!: PDFPage;
  private y = 0;

  constructor(
    private ctx: PdfContext,
    /** druh dokumentu do hlavičky každej strany („Tréningový plán“, „Jedálniček“, …) */
    private kind: string,
  ) {
    this.newPage();
  }

  private get atPageTop(): boolean {
    return this.y >= CONTENT_TOP - 0.5;
  }

  private newPage() {
    this.page = this.ctx.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    const p = this.page;
    p.drawRectangle({ x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT, color: COLORS.bg });
    // jemná terakotová žiara ako pozadie appky — veľa tenkých priehľadných vrstiev
    // namiesto gradientu (pdf-lib ho nevie), nech nevznikajú viditeľné pásy
    const layers = 28;
    for (let i = 0; i < layers; i++) {
      const t = 1 - i / layers;
      p.drawEllipse({ x: PAGE_WIDTH + 10, y: PAGE_HEIGHT + 30, xScale: 310 * t, yScale: 240 * t, color: COLORS.glowA, opacity: 0.0075 });
      p.drawEllipse({ x: -40, y: -20, xScale: 270 * t, yScale: 210 * t, color: COLORS.glowA, opacity: 0.0055 });
    }

    // hlavička: značka + FitPilot vľavo (ako bočný panel v6), druh dokumentu vpravo
    const logoSize = 22;
    const top = PAGE_HEIGHT - 34;
    let x = MARGIN;
    if (this.ctx.logo) {
      p.drawImage(this.ctx.logo, { x, y: top - logoSize / 2, width: logoSize, height: logoSize });
      x += logoSize + 8;
    }
    p.drawText("FitPilot", { x, y: top - 5.5, size: 15, font: this.ctx.bold, color: COLORS.text });
    // na prvej strane je druh dokumentu v štítku nad názvom — vpravo až od druhej strany
    if (this.ctx.doc.getPageCount() > 1) this.label(this.kind.toUpperCase(), PAGE_WIDTH - MARGIN, top - 3.5, 8, COLORS.faint, "right");

    this.y = CONTENT_TOP;
  }

  /** malý popisok veľkými písmenami s rozostupom (ako .cardSubhead / .infoLabel v appke) */
  private label(text: string, x: number, y: number, size: number, color: RGB, align: "left" | "right" = "left", spacing = 0.6) {
    const font = this.ctx.semibold;
    const width = font.widthOfTextAtSize(text, size) + spacing * Math.max(0, text.length - 1);
    this.page.pushOperators(setCharacterSpacing(spacing));
    this.page.drawText(text, { x: align === "right" ? x - width : x, y, size, font, color });
    this.page.pushOperators(setCharacterSpacing(0));
  }

  private labelWidth(text: string, size: number, spacing = 0.6): number {
    return this.ctx.semibold.widthOfTextAtSize(text, size) + spacing * Math.max(0, text.length - 1);
  }

  private ensureSpace(need: number) {
    if (this.y - need < CONTENT_BOTTOM && !this.atPageTop) this.newPage();
  }

  /** biela sklenená karta s jemným tieňom; `yTop` = horná hrana */
  private card(yTop: number, height: number, x = MARGIN, width = CONTENT_W, radius = CARD_RADIUS) {
    const shape = roundedRectPath(width, height, radius);
    this.page.drawSvgPath(shape, { x, y: yTop - 2.5, color: COLORS.shadow, opacity: 0.05 });
    this.page.drawSvgPath(shape, { x, y: yTop, color: COLORS.card, borderColor: COLORS.cardEdge, borderWidth: 1 });
  }

  /** pilulka s textom; vráti šírku */
  private pill(text: string, x: number, yTop: number, opts: { fill: RGB; color: RGB; dot?: RGB; size?: number; upper?: boolean }): number {
    const size = opts.size ?? 9.5;
    const h = size + 10;
    const padX = 9;
    const dotW = opts.dot ? 11 : 0;
    const textW = opts.upper ? this.labelWidth(text, size, 0.5) : this.ctx.semibold.widthOfTextAtSize(text, size);
    const w = padX * 2 + dotW + textW;
    this.page.drawSvgPath(roundedRectPath(w, h, h / 2), { x, y: yTop, color: opts.fill });
    if (opts.dot) this.page.drawCircle({ x: x + padX + 3.5, y: yTop - h / 2, size: 3.5, color: opts.dot });
    const baseline = yTop - h / 2 - size * 0.36;
    if (opts.upper) this.label(text, x + padX + dotW, baseline, size, opts.color, "left", 0.5);
    else this.page.drawText(text, { x: x + padX + dotW, y: baseline, size, font: this.ctx.semibold, color: opts.color });
    return w;
  }

  /** Úvod dokumentu: štítok druhu, veľký názov (max. 2 riadky) a metadáta pod ním. */
  title(input: { title: string; meta: string[] }) {
    this.pill(this.kind.toUpperCase(), MARGIN, this.y, { fill: COLORS.accentSoft, color: COLORS.accentText, size: 8, upper: true });
    this.y -= 18 + 30;
    const lines = wrapText(input.title, this.ctx.bold, 25, CONTENT_W, 2);
    for (const line of lines) {
      this.page.drawText(line, { x: MARGIN, y: this.y, size: 25, font: this.ctx.bold, color: COLORS.text });
      this.y -= 30;
    }
    this.y += 8;
    for (const m of input.meta) {
      this.page.drawText(fitText(m, this.ctx.regular, 10.5, CONTENT_W), { x: MARGIN, y: this.y, size: 10.5, font: this.ctx.regular, color: COLORS.faint });
      this.y -= 15;
    }
    this.y -= 14;
  }

  /** Rad súhrnných dlaždíc (makro cieľ, adherencia…) — max. 4 vedľa seba. */
  tiles(items: Tile[]) {
    if (items.length === 0) return;
    const h = items.some((t) => t.sub) ? 66 : 56;
    this.ensureSpace(h + CARD_GAP);
    const gap = 10;
    const w = (CONTENT_W - gap * (items.length - 1)) / items.length;
    items.forEach((t, i) => {
      const x = MARGIN + i * (w + gap);
      this.card(this.y, h, x, w, 14);
      let lx = x + 14;
      if (t.dot) {
        this.page.drawCircle({ x: lx + 3, y: this.y - 17.5, size: 3, color: t.dot });
        lx += 10;
      }
      this.label(fitText(t.label.toUpperCase(), this.ctx.semibold, 7.5, w - 28 - (t.dot ? 10 : 0)), lx, this.y - 20, 7.5, COLORS.faint, "left", 0.5);
      this.page.drawText(fitText(t.value, this.ctx.bold, 17, w - 28), { x: x + 14, y: this.y - 41, size: 17, font: this.ctx.bold, color: COLORS.text });
      if (t.sub) {
        this.page.drawText(fitText(t.sub, this.ctx.regular, 8.5, w - 28), { x: x + 14, y: this.y - 55, size: 8.5, font: this.ctx.regular, color: COLORS.faint });
      }
    });
    this.y -= h + CARD_GAP + 4;
  }

  /** Popisok skupiny kariet (napr. „Silový progres“) — nezostane sám na spodku strany. */
  section(text: string) {
    this.ensureSpace(150);
    this.y -= 4;
    this.label(text.toUpperCase(), MARGIN + 4, this.y - 9, 8, COLORS.faint, "left", 0.7);
    this.y -= 22;
  }

  /**
   * Karta s nadpisom a tabuľkou. Nezmestí sa celá → rozdelí sa na viac kariet cez strany
   * (hlavička stĺpcov sa zopakuje, nadpis s „pokračovanie“); podnadpis skupiny
   * nezostane osamote na konci strany.
   */
  tableCard(input: TableCardInput) {
    const innerW = CONTENT_W - CARD_PAD * 2;
    const totalWeight = input.columns.reduce((s, c) => s + c.width, 0) || 1;
    const colW = input.columns.map((c) => (c.width / totalWeight) * innerW);
    const rowH = (r: TableRow) => ("group" in r ? GROUP_ROW_H : ROW_H);
    const subtitleLines = input.subtitle ? wrapText(input.subtitle, this.ctx.regular, 9, innerW, 3) : [];
    const subtitleH = subtitleLines.length * 13;
    const footerH = input.footer ? FOOTER_ROW_H : 0;

    if (input.rows.length === 0) {
      const h = CARD_PAD + TITLE_ROW_H + subtitleH + (input.empty ? ROW_H : 0) + CARD_PAD - 6;
      this.ensureSpace(h + CARD_GAP);
      this.card(this.y, h);
      this.drawCardTitle(input.title, input.aside, false);
      let y = this.y - CARD_PAD - TITLE_ROW_H;
      y = this.drawSubtitle(subtitleLines, y);
      if (input.empty) {
        this.page.drawText(input.empty, { x: MARGIN + CARD_PAD, y: y - 14, size: 10, font: this.ctx.regular, color: COLORS.faint });
      }
      this.y -= h + CARD_GAP;
      return;
    }

    let i = 0;
    let first = true;
    while (i < input.rows.length) {
      const fixed = CARD_PAD + TITLE_ROW_H + (first ? subtitleH : 0) + HEAD_ROW_H + CARD_PAD;
      const available = this.y - CONTENT_BOTTOM - CARD_GAP;
      let h = fixed;
      let j = i;
      while (j < input.rows.length) {
        const extra = rowH(input.rows[j]) + (j === input.rows.length - 1 ? footerH : 0);
        if (h + extra > available) break;
        h += extra;
        j++;
      }
      // podnadpis skupiny (Raňajky…) nemá zostať posledný na strane bez položiek
      if (j < input.rows.length && j - 1 > i && "group" in input.rows[j - 1]) {
        j--;
        h -= GROUP_ROW_H;
      }
      // začiatok karty aspoň so 4 riadkami (pokračovanie aspoň s 2), inak radšej nová strana
      const minRows = Math.min(first ? 4 : 2, input.rows.length - i);
      if (j - i < minRows) {
        if (!this.atPageTop) {
          this.newPage();
          continue;
        }
        j = i + minRows; // ani na prázdnej strane sa nezmestí — nakresli aspoň niečo
        h = fixed + input.rows.slice(i, j).reduce((s, r) => s + rowH(r), 0);
      }
      const last = j >= input.rows.length;

      this.card(this.y, h);
      this.drawCardTitle(input.title, first ? input.aside : this.ctx.t("continued"), !first);
      let y = this.y - CARD_PAD - TITLE_ROW_H;
      if (first) y = this.drawSubtitle(subtitleLines, y);
      y = this.drawHeaderRow(input.columns, colW, y);
      for (let k = i; k < j; k++) {
        y = this.drawRow(input.rows[k], input.columns, colW, y, k > i && !("group" in input.rows[k]) && !("group" in input.rows[k - 1]));
      }
      if (last && input.footer) this.drawFooter(input.footer, y);

      this.y -= h + CARD_GAP;
      i = j;
      first = false;
      if (!last) this.newPage();
    }
  }

  private drawCardTitle(title: string, aside: string | undefined, continued: boolean) {
    const x = MARGIN + CARD_PAD;
    const baseline = this.y - CARD_PAD - 13;
    const asideW = aside ? this.ctx.semibold.widthOfTextAtSize(aside, 9) + 12 : 0;
    const t = fitText(title, this.ctx.bold, 13, CONTENT_W - CARD_PAD * 2 - asideW);
    this.page.drawText(t, { x, y: baseline, size: 13, font: this.ctx.bold, color: continued ? COLORS.dim : COLORS.text });
    if (aside) {
      const w = this.ctx.semibold.widthOfTextAtSize(aside, 9);
      this.page.drawText(aside, { x: MARGIN + CONTENT_W - CARD_PAD - w, y: baseline + 1, size: 9, font: this.ctx.semibold, color: COLORS.faint });
    }
  }

  private drawSubtitle(lines: string[], y: number): number {
    for (const line of lines) {
      this.page.drawText(line, { x: MARGIN + CARD_PAD, y: y - 4, size: 9, font: this.ctx.regular, color: COLORS.faint });
      y -= 13;
    }
    return y;
  }

  private cellX(colW: number[], idx: number): number {
    return MARGIN + CARD_PAD + colW.slice(0, idx).reduce((s, w) => s + w, 0);
  }

  private drawHeaderRow(columns: TableColumn[], colW: number[], y: number): number {
    const baseline = y - HEAD_ROW_H + 8;
    columns.forEach((col, idx) => {
      const text = col.text.toUpperCase();
      const x = this.cellX(colW, idx);
      if (col.align === "right") this.label(text, x + colW[idx], baseline, 7.5, COLORS.faint, "right", 0.5);
      else this.label(text, x, baseline, 7.5, COLORS.faint, "left", 0.5);
    });
    const lineY = y - HEAD_ROW_H + 2;
    this.page.drawLine({ start: { x: MARGIN + CARD_PAD, y: lineY }, end: { x: MARGIN + CONTENT_W - CARD_PAD, y: lineY }, thickness: 0.8, color: COLORS.line });
    return y - HEAD_ROW_H;
  }

  private drawRow(row: TableRow, columns: TableColumn[], colW: number[], y: number, separator: boolean): number {
    const left = MARGIN + CARD_PAD;
    const right = MARGIN + CONTENT_W - CARD_PAD;
    if ("group" in row) {
      // podnadpis skupiny — terakotová bodka + popisok (ako jedlá dňa v builderi)
      const baseline = y - GROUP_ROW_H + 8;
      this.page.drawCircle({ x: left + 3, y: baseline + 2.8, size: 2.6, color: COLORS.accent });
      this.label(row.group.toUpperCase(), left + 11, baseline, 7.5, COLORS.accentText, "left", 0.5);
      return y - GROUP_ROW_H;
    }
    if (separator) {
      this.page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.6, color: COLORS.line });
    }
    const baseline = y - ROW_H / 2 - 3.4;
    row.cells.forEach((cell, idx) => {
      const col = columns[idx];
      if (!col) return;
      const strong = idx === 0 && col.strong !== false;
      const font = strong ? this.ctx.semibold : this.ctx.regular;
      const color = idx === 0 ? COLORS.text : cell === "—" ? COLORS.faint : COLORS.dim;
      const text = fitText(cell, font, 9.5, colW[idx] - 8);
      const x = this.cellX(colW, idx);
      const w = font.widthOfTextAtSize(text, 9.5);
      this.page.drawText(text, { x: col.align === "right" ? x + colW[idx] - w : x, y: baseline, size: 9.5, font, color });
    });
    return y - ROW_H;
  }

  private drawFooter(footer: { chips: Chip[]; note?: string }, y: number) {
    const left = MARGIN + CARD_PAD;
    const right = MARGIN + CONTENT_W - CARD_PAD;
    this.page.drawLine({ start: { x: left, y: y - 2 }, end: { x: right, y: y - 2 }, thickness: 0.8, color: COLORS.line });
    let x = left;
    const top = y - 10;
    for (const chip of footer.chips) {
      x += this.pill(chip.text, x, top, {
        fill: chip.accent ? COLORS.accentSoft : COLORS.fill,
        color: chip.accent ? COLORS.accentText : COLORS.text,
        dot: chip.dot,
        size: 9,
      });
      x += 6;
    }
    if (footer.note) {
      const w = this.ctx.regular.widthOfTextAtSize(footer.note, 9);
      this.page.drawText(footer.note, { x: right - w, y: top - 13, size: 9, font: this.ctx.regular, color: COLORS.faint });
    }
  }

  /** Doplní pätičku na každú stranu (dátum vygenerovania, číslo strany) a vráti PDF. */
  async bytes(): Promise<Uint8Array> {
    const pages = this.ctx.doc.getPages();
    pages.forEach((p, i) => {
      const generatedOn = new Date().toLocaleDateString(intlLocale(this.ctx.locale), { timeZone: "Europe/Bratislava" });
      const left = this.ctx.t("generated", { date: generatedOn });
      p.drawText(left, { x: MARGIN, y: 28, size: 8, font: this.ctx.regular, color: COLORS.faint });
      const right = this.ctx.t("page", { page: i + 1, total: pages.length });
      const w = this.ctx.regular.widthOfTextAtSize(right, 8);
      p.drawText(right, { x: PAGE_WIDTH - MARGIN - w, y: 28, size: 8, font: this.ctx.regular, color: COLORS.faint });
    });
    return this.ctx.doc.save();
  }
}

/** ISO dátum (YYYY-MM-DD) → „6. 11. 2026“. */
export function skDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d}. ${m}. ${y}`;
}

/** Kladné s „+“, záporné s typografickým mínusom (−150 kcal). */
export function signed(n: number): string {
  return n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0";
}
