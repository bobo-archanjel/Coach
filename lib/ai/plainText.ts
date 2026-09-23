// FitPilot — AI odpovede sa v chate zobrazujú ako čistý text (bublina zachová
// len riadkovanie). Bez importov, aby sa dalo použiť aj pri zobrazení histórie.

/**
 * Poistka k inštrukcii "bez markdownu" v prompte — bublina zobrazuje čistý text,
 * takže akýkoľvek markdown, ktorý model aj tak pošle, by klient videl surovo.
 */
export function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1") // **tučné**
    .replace(/__(.+?)__/g, "$1") // __tučné__
    .replace(/^#{1,6}\s+/gm, "") // # nadpisy
    .replace(/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/gm, "") // --- oddeľovače
    .replace(/^(\s*)[-*]\s+/gm, "$1• ") // - odrážky → •
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
