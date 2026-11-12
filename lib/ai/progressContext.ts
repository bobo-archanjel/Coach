// i18n-ignore-file: podklad pre AI model (interné dáta v prompte); jazyk odpovede určuje outputLanguageRule v chat.ts
// FitPilot — AI blok, feature/AIupgrade: objektívny kontext progresu pre AI
// Kouča. Doteraz AI Kouč videl len ŠTRUKTÚRU aktuálneho plánu (trainingContext.ts)
// a DNEŠNÉ makrá (macroContext.ts) — na otázky typu "ako mi to ide"/"som na
// dobrej ceste" tak vedel len opísať plán, nie objektívne zhodnotiť progres.
// Tento modul znovupoužíva TIE ISTÉ metriky, čo už tréner vidí na
// `/dashboard/klienti/[id]` a `/dashboard/analytika` (lib/dashboard/adherence.ts,
// bodyMetrics.ts) — žiadna nová logika výpočtu, len nové skladanie do textu pre
// model. RLS na food_logs/workout_logs/body_metrics dovoľuje klientovi čítať
// vlastné dáta (portál ich už číta pod tou istou session), takže funkcie sa dajú
// zavolať priamo s `clientId` bez zmeny ich signatúry.

import { getNutritionAdherence, getTrainingAdherence } from "@/lib/dashboard/adherence";
import { getBodyMetrics } from "@/lib/dashboard/bodyMetrics";
import { createClient } from "@/lib/supabase/server";

type NutritionGoalDirection = "chudnutie" | "udrzanie" | "naberanie";

const GOAL_LABEL: Record<NutritionGoalDirection, string> = {
  chudnutie: "schudnúť",
  udrzanie: "udržať si váhu",
  naberanie: "pribrať (naberanie svalovej hmoty)",
};

/** Len goal smer (chudnutie/udrzanie/naberanie) — zvyšok makro cieľa už nesie macroContext.ts. */
async function getNutritionGoalDirection(clientId: string): Promise<NutritionGoalDirection | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("nutrition_profiles")
    .select("goal")
    .eq("client_id", clientId)
    .maybeSingle();
  return (data?.goal as NutritionGoalDirection | undefined) ?? null;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Objektívny blok progresu: tréningová aj nutričná adherencia za 30/90 dní +
 * trend telesnej váhy vs. nutričný cieľ (smer). Nikdy nehádže — pri chybe vráti
 * prázdny reťazec (chat.ts blok jednoducho vynechá, zvyšok kontextu funguje ďalej).
 */
export async function getProgressContextBlock(clientId: string): Promise<string> {
  try {
    const [training, nutrition, metrics, goalDirection] = await Promise.all([
      getTrainingAdherence(clientId),
      getNutritionAdherence(clientId),
      getBodyMetrics(clientId),
      getNutritionGoalDirection(clientId),
    ]);

    const lines: string[] = [
      "Objektívny progres klienta (skutočné dáta za posledné týždne, NIE len aktuálny plán) — použi ich, keď sa klient pýta ako mu to ide / či je na dobrej ceste / aký má progres:",
    ];

    if (training) {
      const { window30 } = training;
      lines.push(
        `Tréningová adherencia: za posledných 30 dní cvičil ${window30.trainedDays}/${window30.totalDays} dní (${window30.pct} %).`,
      );
      const completion30 = training.planCompletion.window30;
      if (completion30.pct != null) {
        lines.push(
          `Plnenie predpisu plánu (séria/opakovania/váha) na odcvičených tréningoch za 30 dní: ${completion30.pct} % v priemere (${completion30.sessionsScored} ohodnotených tréningov).`,
        );
      }
    } else {
      lines.push("Tréningová adherencia: dáta sa nepodarilo načítať.");
    }

    if (nutrition?.hasGoal) {
      const { window30 } = nutrition;
      lines.push(
        window30.pct != null
          ? `Nutričná adherencia: za posledných 30 dní bol príjem v pásme cieľa (${window30.onTrackDays}/${window30.totalDays} dní, ${window30.pct} %).`
          : "Nutričná adherencia: zatiaľ nedosť záznamov na 30-dňový trend.",
      );
    } else if (nutrition) {
      lines.push("Nutričná adherencia: klient nemá nastavený makro cieľ.");
    }

    const weighed = (metrics ?? []).filter((m) => m.weightKg != null);
    if (weighed.length >= 2) {
      const first = weighed[0];
      const last = weighed[weighed.length - 1];
      const deltaKg = round1((last.weightKg as number) - (first.weightKg as number));
      const direction = deltaKg < 0 ? "klesá" : deltaKg > 0 ? "stúpa" : "je bez zmeny";
      lines.push(
        `Trend telesnej váhy: od ${first.measuredOn} do ${last.measuredOn} ${direction} o ${Math.abs(deltaKg)} kg (${first.weightKg} kg → ${last.weightKg} kg).`,
      );
      if (goalDirection && goalDirection !== "udrzanie") {
        const wantsDown = goalDirection === "chudnutie";
        const matches = wantsDown ? deltaKg <= 0 : deltaKg >= 0;
        lines.push(
          `Cieľ klienta je ${GOAL_LABEL[goalDirection]} — tento trend váhy s cieľom ${matches ? "SÚHLASÍ" : "NESÚHLASÍ (uprozorni na to, ak sa pýta na progres)"}.`,
        );
      }
    } else if (weighed.length === 1) {
      lines.push(`Telesná váha: len jedno meranie zatiaľ (${weighed[0].weightKg} kg), na trend treba viac záznamov.`);
    } else {
      lines.push("Telesná váha: klient si zatiaľ nezapísal žiadne meranie.");
    }

    return lines.join("\n");
  } catch (err) {
    console.error("getProgressContextBlock:", err instanceof Error ? err.message : err);
    return "";
  }
}
