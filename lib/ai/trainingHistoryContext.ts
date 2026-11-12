// i18n-ignore-file: podklad pre AI model (interné dáta v prompte); jazyk odpovede určuje outputLanguageRule
// FitPilot — AI blok, feature/AIupgrade: história tréningu klienta pre AI
// generátor plánov. Doteraz generátor poznal len cieľ/skúsenosť/vybavenie/
// telesné údaje (planClientContext.ts) — každý nový plán vznikal "od nuly",
// bez ohľadu na to, čo klient už reálne odcvičil. Tento modul znovupoužíva TIE
// ISTÉ dáta, čo už tréner vidí na `/dashboard/klienti/[id]` (graf sily,
// `lib/dashboard/bodyMetrics.ts`) a `lib/dashboard/adherence.ts` — žiadna nová
// logika výpočtu, len výber a formulácia pre prompt.
//
// Pridáva sa do `PlanGeneratorInput.clientContext` (rovnaké pole ako
// planClientContextLines), nie ako samostatný blok — model tak dostane
// históriu v tom istom zozname "Údaje o klientovi", na ktorý už má inštrukciu
// prispôsobiť výber cvikov a objem.

import { getAllStrengthProgress } from "@/lib/dashboard/bodyMetrics";
import { getTrainingAdherence } from "@/lib/dashboard/adherence";
import type { StrengthPoint } from "@/lib/dashboard/bodyMetrics";

/** Koľko nedávno trénovaných cvikov sa pošle modelu — dosť na kontext, nie celá história. */
const RECENT_EXERCISES_LIMIT = 10;
/** Koľko posledných PR sa spomenie. */
const RECENT_PR_LIMIT = 5;

/**
 * Váha/opakovania na cviku stagnujú, keď posledný záznam nie je lepší než ten
 * spred 3 tréningov (rovnaká "séria" dĺžky ako bežná progresia preťaženia —
 * kratšie okno by reagovalo na bežný výkyv jedného zlého dňa). Vyžaduje aspoň
 * 4 záznamy, inak nie je z čoho porovnávať.
 */
function isPlateaued(points: StrengthPoint[]): boolean {
  if (points.length < 4) return false;
  const last = points[points.length - 1];
  const earlier = points[points.length - 4];
  return last.bestWeightKg <= earlier.bestWeightKg;
}

/**
 * Riadky "História tréningu" do `clientContext` — nikdy nehádže, pri chybe
 * vráti prázdne pole (generátor jednoducho nedostane históriu, nič nespadne).
 */
export async function getTrainingHistoryLines(clientId: string): Promise<string[]> {
  try {
    const [progress, adherence] = await Promise.all([
      getAllStrengthProgress(clientId),
      getTrainingAdherence(clientId),
    ]);

    const lines: string[] = [];

    if (adherence) {
      const { trainedDays, totalDays, pct } = adherence.window30;
      lines.push(`- História tréningu: za posledných 30 dní cvičil ${trainedDays}/${totalDays} dní (${pct} %).`);
    }

    if (progress && progress.names.length > 0) {
      const withLast = progress.names
        .map((name) => {
          const points = progress.byExercise[name];
          return { name, last: points[points.length - 1], plateau: isPlateaued(points) };
        })
        .sort((a, b) => b.last.date.localeCompare(a.last.date))
        .slice(0, RECENT_EXERCISES_LIMIT);

      lines.push(
        "- Nedávno trénované cviky (posledná zaznamenaná váha — ak cvik z tohto zoznamu do nového plánu zaradíš, nastav záťaž/opakovania aspoň na tejto úrovni, nie nižšie; pri stagnujúcom cviku buď skús vyššiu záťaž/opakovania, alebo ho nahraď iným cvikom na rovnakú partiu):",
      );
      for (const { name, last, plateau } of withLast) {
        const stall = plateau ? " — POZOR: váha/opakovania posledné tréningy stagnujú" : "";
        lines.push(`  • ${name}: ${last.bestWeightKg} kg × ${last.reps} opak. (naposledy ${last.date})${stall}`);
      }

      if (progress.prs.length > 0) {
        const prList = progress.prs
          .slice(0, RECENT_PR_LIMIT)
          .map((p) => `${p.exercise} ${p.bestWeightKg} kg`)
          .join(", ");
        lines.push(`- Nedávne osobné maximá (klient je na vzostupe, netreba spomaľovať): ${prList}.`);
      }
    } else if (progress) {
      lines.push("- História tréningu: klient zatiaľ nemá zaznamenaný žiadny odcvičený tréning s váhou.");
    }

    return lines;
  } catch (err) {
    console.error("getTrainingHistoryLines:", err instanceof Error ? err.message : err);
    return [];
  }
}
