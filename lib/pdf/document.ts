// FitPilot — export dát (feature/export-dat): spoločná PDF infraštruktúra.
// pdf-lib negeneruje layout z HTML/CSS — kreslí sa manuálne (súradnice), ale pre
// tabuľkový obsah (plán/progres) to stačí a beží čisto na serveri (Route Handler),
// žiadny headless prehliadač netreba.
//
// Fonty: pdf-lib defaultne pozná len 14 štandardných PDF fontov (Helvetica a pod.),
// tie nemajú slovenské/české diakritiky (ľ, š, č, ž...) — treba vlastný TrueType
// font cez fontkit. Noto Sans (OFL licencia, plné pokrytie Unicode vrátane Latin
// Extended-A) je v `assets/fonts/`, stiahnutý raz pri zakladaní tejto vetvy.

import { readFileSync } from "fs";
import path from "path";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

let regularBytes: Buffer | null = null;
let boldBytes: Buffer | null = null;

function fontBytes(name: "NotoSans-Regular.ttf" | "NotoSans-Bold.ttf"): Buffer {
  return readFileSync(path.join(process.cwd(), "assets", "fonts", name));
}

export const PAGE_WIDTH = 595.28; // A4 v pt (72 dpi)
export const PAGE_HEIGHT = 841.89;
export const MARGIN = 48;

export const INK = rgb(0.07, 0.07, 0.06); // ~#121110, Almost Black z brand kitu
export const PAPER_DIM = rgb(0.4, 0.39, 0.37);
export const ACCENT = rgb(0.878, 0.251, 0.165); // Signal Coral #E0402A

export interface PdfContext {
  doc: PDFDocument;
  regular: PDFFont;
  bold: PDFFont;
}

export async function createPdfContext(): Promise<PdfContext> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  regularBytes ??= fontBytes("NotoSans-Regular.ttf");
  boldBytes ??= fontBytes("NotoSans-Bold.ttf");
  const [regular, bold] = await Promise.all([
    doc.embedFont(regularBytes, { subset: true }),
    doc.embedFont(boldBytes, { subset: true }),
  ]);
  return { doc, regular, bold };
}

/**
 * Jednoduchý "tečúci" writer — kreslí riadky zhora nadol, sám založí novú stranu,
 * keď sa už nezmestí. Netreba plnohodnotný layout engine na obsah, ktorý je
 * v podstate nadpisy + zoznamy + jednoduché tabuľky.
 */
export class PdfWriter {
  private page: PDFPage;
  private y: number;

  constructor(
    private ctx: PdfContext,
    private title: string,
  ) {
    this.page = ctx.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.y = PAGE_HEIGHT - MARGIN;
  }

  private ensureSpace(need: number) {
    if (this.y - need < MARGIN) {
      this.page = this.ctx.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      this.y = PAGE_HEIGHT - MARGIN;
    }
  }

  heading(text: string) {
    this.ensureSpace(28);
    this.page.drawText(text, { x: MARGIN, y: this.y, size: 18, font: this.ctx.bold, color: INK });
    this.y -= 26;
  }

  subheading(text: string) {
    this.ensureSpace(22);
    this.page.drawText(text, { x: MARGIN, y: this.y, size: 13, font: this.ctx.bold, color: ACCENT });
    this.y -= 20;
  }

  text(text: string, opts?: { dim?: boolean; size?: number }) {
    const size = opts?.size ?? 11;
    this.ensureSpace(size + 6);
    this.page.drawText(text, {
      x: MARGIN,
      y: this.y,
      size,
      font: this.ctx.regular,
      color: opts?.dim ? PAPER_DIM : INK,
    });
    this.y -= size + 6;
  }

  bullet(text: string) {
    this.ensureSpace(17);
    this.page.drawText(`–  ${text}`, { x: MARGIN + 6, y: this.y, size: 10.5, font: this.ctx.regular, color: INK });
    this.y -= 16;
  }

  /** Riadok tabuľky — `cols` = [{ text, width }], zľava doprava od MARGIN. */
  row(cols: { text: string; width: number; bold?: boolean }[], opts?: { size?: number; dim?: boolean }) {
    const size = opts?.size ?? 10;
    this.ensureSpace(size + 8);
    let x = MARGIN;
    for (const col of cols) {
      this.page.drawText(col.text, {
        x,
        y: this.y,
        size,
        font: col.bold ? this.ctx.bold : this.ctx.regular,
        color: opts?.dim ? PAPER_DIM : INK,
      });
      x += col.width;
    }
    this.y -= size + 8;
  }

  spacer(h = 10) {
    this.y -= h;
  }

  divider() {
    this.ensureSpace(12);
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: PAGE_WIDTH - MARGIN, y: this.y },
      thickness: 0.5,
      color: PAPER_DIM,
    });
    this.y -= 14;
  }

  async bytes(): Promise<Uint8Array> {
    return this.ctx.doc.save();
  }
}

/** Zaokrúhli text tak, aby sa nerozbil layout pri veľmi dlhých názvoch (žiadny word-wrap, len skrátenie). */
export function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

// StandardFonts sa v tejto appke nepoužíva (kvôli diakritike), export len pre prípadné budúce použitie/testy.
export { StandardFonts };
