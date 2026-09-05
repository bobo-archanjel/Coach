// FitPilot — export dát (feature/export-dat): spoločná PDF infraštruktúra.
// pdf-lib negeneruje layout z HTML/CSS — kreslí sa manuálne (súradnice), ale pre
// tabuľkový obsah (plán/progres) to stačí a beží čisto na serveri (Route Handler),
// žiadny headless prehliadač netreba.
//
// Vizuál kopíruje brand kit appky (PRODUCT.md "Brand Commitments") — na výslovnú
// žiadosť užívateľa CELÝ dokument vrátane tmavého pozadia každej strany, nie len
// akcentové farby na svetlom podklade. Fonty: pdf-lib defaultne pozná len 14
// štandardných PDF fontov (Helvetica a pod.), tie nemajú slovenské/české
// diakritiky (ľ, š, č, ž...) — vlastný TrueType font cez fontkit. Noto Sans
// (OFL licencia, plné pokrytie Unicode vrátane Latin Extended-A) je v
// `assets/fonts/`, stiahnutý raz pri zakladaní tejto vetvy.

import { readFileSync } from "fs";
import path from "path";
import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

let regularBytes: Buffer | null = null;
let boldBytes: Buffer | null = null;
let logoBytes: Buffer | null = null;

function assetBytes(...segments: string[]): Buffer {
  return readFileSync(path.join(process.cwd(), ...segments));
}

export const PAGE_WIDTH = 595.28; // A4 v pt (72 dpi)
export const PAGE_HEIGHT = 841.89;
export const MARGIN = 48;
const HEADER_H = 64;
const TABLE_ROW_H = 22;

// Brand kit (PRODUCT.md) — presne tie isté hex hodnoty ako CSS custom properties v appke.
export const BG = hex("#121110"); // Almost Black
export const CARD = hex("#1E1917"); // Card Ember
export const PAPER = hex("#F3EFE6"); // Warm Paper Text
export const PAPER_DIM = mix(PAPER, BG, 0.45); // približne --paper-faint (appka ho počíta cez color-mix)
export const ACCENT = hex("#E0402A"); // Signal Coral
export const AMBER = hex("#E6B23A"); // Amber Dot Accent
export const LINE = mix(PAPER, BG, 0.14); // jemná deliaca čiara — --steel-line ekvivalent

function hex(h: string): RGB {
  const n = parseInt(h.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}
function mix(a: RGB, b: RGB, t: number): RGB {
  return rgb(a.red + (b.red - a.red) * t, a.green + (b.green - a.green) * t, a.blue + (b.blue - a.blue) * t);
}

export interface PdfContext {
  doc: PDFDocument;
  regular: PDFFont;
  bold: PDFFont;
  logo: PDFImage | null;
}

export async function createPdfContext(): Promise<PdfContext> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  regularBytes ??= assetBytes("assets", "fonts", "NotoSans-Regular.ttf");
  boldBytes ??= assetBytes("assets", "fonts", "NotoSans-Bold.ttf");
  logoBytes ??= assetBytes("public", "brand", "logo-wordmark.png");
  const [regular, bold, logo] = await Promise.all([
    doc.embedFont(regularBytes, { subset: true }),
    doc.embedFont(boldBytes, { subset: true }),
    doc.embedPng(logoBytes).catch(() => null),
  ]);
  return { doc, regular, bold, logo };
}

export interface TableColumn {
  text: string;
  width: number;
  align?: "left" | "right";
}

/**
 * Jednoduchý "tečúci" writer — kreslí riadky zhora nadol, sám založí novú stranu
 * (s rovnakou tmavou hlavičkou/pozadím), keď sa už nezmestí. Netreba plnohodnotný
 * layout engine na obsah, ktorý je v podstate nadpisy + tabuľky.
 */
export class PdfWriter {
  private page!: PDFPage;
  private y = 0;
  /** Ak sa práve kreslí tabuľka, jej hlavička sa zopakuje pri zalome na novú stranu. */
  private activeTableHeader: TableColumn[] | null = null;

  constructor(private ctx: PdfContext) {
    this.newPage();
  }

  private newPage() {
    this.page = this.ctx.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.page.drawRectangle({ x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT, color: BG });
    this.page.drawRectangle({ x: 0, y: PAGE_HEIGHT - HEADER_H, width: PAGE_WIDTH, height: HEADER_H, color: CARD });
    this.page.drawRectangle({ x: 0, y: PAGE_HEIGHT - HEADER_H - 3, width: PAGE_WIDTH, height: 3, color: ACCENT });

    if (this.ctx.logo) {
      const logoH = 20;
      const scale = logoH / this.ctx.logo.height;
      this.page.drawImage(this.ctx.logo, {
        x: MARGIN,
        y: PAGE_HEIGHT - HEADER_H / 2 - logoH / 2,
        width: this.ctx.logo.width * scale,
        height: logoH,
      });
    } else {
      this.page.drawText("FitPilot", { x: MARGIN, y: PAGE_HEIGHT - HEADER_H / 2 - 6, size: 15, font: this.ctx.bold, color: PAPER });
    }

    this.y = PAGE_HEIGHT - HEADER_H - 3 - 32;

    // Tabuľka rozbehnutá spred zalomu pokračuje na novej strane so zopakovanou hlavičkou.
    if (this.activeTableHeader) this.drawTableHeaderRow(this.activeTableHeader);
  }

  private ensureSpace(need: number) {
    if (this.y - need < MARGIN) this.newPage();
  }

  /** Veľký titulok reportu (názov plánu / "Progres — meno klienta"). */
  heading(text: string) {
    this.ensureSpace(30);
    this.page.drawText(text, { x: MARGIN, y: this.y, size: 19, font: this.ctx.bold, color: PAPER });
    this.y -= 28;
  }

  /** Metadáta pod titulkom (klient, dátum) — tlmené. */
  meta(text: string) {
    this.ensureSpace(16);
    this.page.drawText(text, { x: MARGIN, y: this.y, size: 10.5, font: this.ctx.regular, color: PAPER_DIM });
    this.y -= 15;
  }

  /** Nadpis sekcie — coral akcent, s odsadením nad aj pod (vizuálne oddelenie sekcií). */
  section(text: string) {
    this.ensureSpace(34);
    this.y -= 10;
    this.page.drawText(text.toUpperCase(), { x: MARGIN, y: this.y, size: 11.5, font: this.ctx.bold, color: ACCENT });
    this.y -= 8;
    this.page.drawLine({ start: { x: MARGIN, y: this.y }, end: { x: PAGE_WIDTH - MARGIN, y: this.y }, thickness: 0.75, color: LINE });
    this.y -= 16;
  }

  text(text: string, opts?: { dim?: boolean; size?: number }) {
    const size = opts?.size ?? 11;
    this.ensureSpace(size + 6);
    this.page.drawText(text, { x: MARGIN, y: this.y, size, font: this.ctx.regular, color: opts?.dim ? PAPER_DIM : PAPER });
    this.y -= size + 6;
  }

  subtext(text: string) {
    this.ensureSpace(24);
    this.y -= 8;
    this.page.drawText(text, { x: MARGIN, y: this.y, size: 12, font: this.ctx.bold, color: PAPER });
    this.y -= 16;
  }

  private drawTableHeaderRow(cols: TableColumn[]) {
    this.page.drawRectangle({ x: MARGIN, y: this.y - TABLE_ROW_H + 6, width: PAGE_WIDTH - MARGIN * 2, height: TABLE_ROW_H, color: CARD });
    let x = MARGIN + 8;
    for (const col of cols) {
      this.drawCell(col.text, x, col.width, this.ctx.bold, ACCENT, 9.5, col.align);
      x += col.width;
    }
    this.y -= TABLE_ROW_H;
  }

  private drawCell(text: string, x: number, width: number, font: PDFFont, color: RGB, size: number, align?: "left" | "right") {
    const textWidth = font.widthOfTextAtSize(text, size);
    const drawX = align === "right" ? x + width - 8 - textWidth : x;
    // Baseline zarovnaná na stred TABLE_ROW_H pásu (rovnaké pre hlavičku aj telo,
    // nech zebra pruh aj text sedia presne na seba bez ohľadu na veľkosť fontu).
    this.page.drawText(text, { x: drawX, y: this.y - TABLE_ROW_H + 7, size, font, color });
  }

  /**
   * Celá tabuľka naraz — hlavička (Card Ember pozadie) + telo so zebra pruhovaním
   * (jemný Card Ember tón na párnych riadkoch), automaticky sa zalomí na novú
   * stranu a zopakuje hlavičku, ak sa nezmestí celá.
   */
  table(columns: TableColumn[], rows: string[][]) {
    this.ensureSpace(30);
    this.activeTableHeader = columns;
    this.drawTableHeaderRow(columns);

    rows.forEach((cells, i) => {
      this.ensureSpace(TABLE_ROW_H);
      if (i % 2 === 1) {
        this.page.drawRectangle({
          x: MARGIN,
          y: this.y - TABLE_ROW_H + 6,
          width: PAGE_WIDTH - MARGIN * 2,
          height: TABLE_ROW_H,
          color: CARD,
          opacity: 0.5,
        });
      }
      let x = MARGIN + 8;
      cells.forEach((cellText, colIdx) => {
        const col = columns[colIdx];
        this.drawCell(cellText, x, col.width, this.ctx.regular, PAPER, 10, col.align);
        x += col.width;
      });
      this.y -= TABLE_ROW_H;
    });

    this.activeTableHeader = null;
    this.y -= 14;
  }

  bullet(text: string) {
    this.ensureSpace(16);
    this.page.drawText(`–  ${text}`, { x: MARGIN + 6, y: this.y, size: 10.5, font: this.ctx.regular, color: PAPER });
    this.y -= 16;
  }

  spacer(h = 10) {
    this.y -= h;
  }

  async bytes(): Promise<Uint8Array> {
    return this.ctx.doc.save();
  }
}

/** Zaokráti text tak, aby sa nerozbil layout pri veľmi dlhých názvoch (žiadny word-wrap, len skrátenie). */
export function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
