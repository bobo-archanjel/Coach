// FitPilot — AI blok, Krok 4: orchestrácia AI chatu klienta ("AI Kouč").
// Volá sa zo server action (app/portal/.../actions.ts), vždy pod session
// prihláseného klienta — RLS na ai_conversations/ai_messages (0014) a messages
// (0008) platí automaticky.
//
// Poradie krokov pri každej správe (zámerne v tomto poradí, nie inak):
// 1. zdravotný pre-filter (lib/ai/healthFilter.ts) — ak zasiahne, END. Žiadne
//    volanie Claude (nulové náklady), pevná odpoveď, eskalácia do messages.
// 2. denný rate limit (lib/ai/rateLimit.ts) — ak vyčerpaný, END bez volania.
// 3. deterministický kontext (lib/ai/macroContext.ts) — čísla dopočítané v kóde.
// 4. Claude (Haiku) dostane kontext + posledných pár správ a len naformuluje
//    odpoveď zo skutočných dát — nevymýšľa makrá ani čas.

import type { SupabaseClient } from "@supabase/supabase-js";
import { getAnthropicClient, AI_MODEL, isAiConfigured } from "./client";
import { logAiUsage } from "./logUsage";
import { getMacroContext } from "./macroContext";
import {
  needsHealthEscalation,
  hasExerciseSwapIntent,
  HEALTH_ESCALATION_REPLY,
  buildEscalationNoticeForTrainer,
  buildSoftExerciseNoticeForTrainer,
} from "./healthFilter";
import { findExerciseAlternatives, type ExerciseCandidate } from "./exerciseAlternatives";
import { getFoodCandidates, formatFoodCandidates } from "./foodContext";
import { isChatRateLimited, AI_CHAT_DAILY_LIMIT } from "./rateLimit";

const HISTORY_WINDOW = 12; // posledných N správ poslaných modelu — nie celá história (minimalizácia dát + náklady)
const MAX_REPLY_TOKENS = 500;

export type SendChatResult =
  /** `escalated` na "ok" = mäkké FYI trénerovi (bežná výmena cviku kvôli nepohodliu), nie hard block. */
  | { status: "ok"; reply: string; escalated?: boolean }
  /** hard block — akútna zdravotná téma bez žiadosti o náhradu cviku, žiadne volanie modelu. */
  | { status: "escalated"; reply: string }
  | { status: "rate_limited"; reply: string }
  | { status: "not_configured"; reply: string }
  | { status: "error"; reply: string };

function buildSystemPrompt(exerciseSwapGuard: boolean): string {
  const lines = [
    "Si AI Kouč vo fitness aplikácii FitPilot. Rozprávaš sa priamo s klientom trénera, po slovensky, stručne a vecne.",
    "Tvoja úloha: pomôcť s výživou (čo a koľko zjesť podľa cieľa) a s tréningom (napr. alternatívy cvikov) — VÝHRADNE na základe dát, ktoré ti pošle appka v tejto správe. Nikdy si nevymýšľaj čísla makier, potraviny ani cviky, ktoré ti neboli poskytnuté.",
    "Keď navrhuješ konkrétne jedlo, VYBERAJ VÝHRADNE z 'Knižnica potravín' nižšie (ak je priložená) a napíš aj gramáž tak, aby sedela na zostávajúce makrá — nikdy nenavrhuj potravinu mimo tohto zoznamu a nikdy nehovor klientovi, že mu nevieš pomôcť s jedlom, keď je zoznam priložený.",
    "Zdravotné témy (bolesť, zranenie, diagnóza, čo s tým robiť) NIKDY neriešiš — appka väčšinu zachytáva skôr, než sa k tebe dostanú, ale ak by sa aj tak objavila zmienka o bolesti/zranení bez žiadosti o náhradu cviku, okamžite odporuč konzultáciu s trénerom a nič k tomu neradíš.",
    "Neradíš nič mimo fitness/výživy tejto appky. Odpovedaj krátko (2-5 viet), konkrétne, bez dlhých úvodov.",
  ];
  if (exerciseSwapGuard) {
    lines.push(
      "Klient spomenul nepohodlie/bolesť SPOLU so žiadosťou o náhradu konkrétneho cviku — to SMIEŠ vybaviť: navrhni 2-3 alternatívy VÝHRADNE zo zoznamu skutočných cvikov nižšie, nič iné si nevymýšľaj. Samotnú bolesť/jej príčinu/závažnosť vôbec nekomentuj a nediagnostikuj — len jednou vetou odporuč, nech dá vedieť trénerovi, ak nepohodlie pretrváva.",
    );
  }
  return lines.join("\n");
}

interface ChatMessageRow {
  role: "user" | "assistant";
  content: string;
}

/**
 * Odošle správu klienta do AI chatu a vráti odpoveď. Server action volajúci
 * túto funkciu je zodpovedný za: overenie session, založenie/nájdenie
 * ai_conversations riadku, a uloženie oboch správ (user + assistant) do
 * ai_messages — táto funkcia len rozhoduje o obsahu odpovede a loguje usage.
 */
export async function sendAiChatMessage(
  supabase: SupabaseClient,
  params: { trainerId: string; clientId: string; conversationId: string; userText: string; history: ChatMessageRow[] },
): Promise<SendChatResult> {
  const { trainerId, clientId, userText, history } = params;

  // ---------- 1. zdravotný pre-filter ----------
  const healthTrigger = needsHealthEscalation(userText);
  const swapIntent = hasExerciseSwapIntent(userText);

  // Akútna zdravotná téma BEZ žiadosti o náhradu cviku → hard block, žiadne
  // volanie modelu. So žiadosťou o náhradu → mäkká cesta nižšie (bod 3b).
  if (healthTrigger && !swapIntent) {
    const { error } = await supabase.rpc("insert_ai_escalation_message", {
      p_client_id: clientId,
      p_body: buildEscalationNoticeForTrainer(userText),
    });
    if (error) console.error("insert_ai_escalation_message:", error.message);
    return { status: "escalated", reply: HEALTH_ESCALATION_REPLY };
  }

  // ---------- 2. rate limit ----------
  if (await isChatRateLimited(supabase, clientId)) {
    return {
      status: "rate_limited",
      reply: `Dosiahol/a si dnešný limit AI správ (${AI_CHAT_DAILY_LIMIT()}). Skús to znova zajtra, alebo napíš priamo trénerovi.`,
    };
  }

  if (!isAiConfigured()) {
    return { status: "not_configured", reply: "AI chat zatiaľ nie je nastavený. Skús to prosím neskôr." };
  }

  // ---------- 3. deterministický kontext ----------
  const { context, error: ctxError } = await getMacroContext(supabase, clientId);
  if (ctxError || !context) {
    return { status: "error", reply: "Nepodarilo sa načítať tvoje dáta. Skús to prosím znova." };
  }

  const contextBlock = context.hasGoal
    ? [
        `Dnešný cieľ klienta: ${context.goal!.caloriesTarget} kcal, ${context.goal!.proteinG} g bielkovín, ${context.goal!.carbsG} g sacharidov, ${context.goal!.fatG} g tukov.`,
        `Doteraz dnes zjedol: ${context.consumedToday.kcal} kcal, ${context.consumedToday.proteinG} g bielkovín, ${context.consumedToday.carbsG} g sacharidov, ${context.consumedToday.fatG} g tukov.`,
        `Zostáva mu dnes: ${context.remainingToday!.kcal} kcal, ${context.remainingToday!.proteinG} g bielkovín, ${context.remainingToday!.carbsG} g sacharidov, ${context.remainingToday!.fatG} g tukov (záporné číslo = cieľ je už prekročený, povedz to narovinu).`,
      ].join("\n")
    : "Klient nemá zatiaľ nastavený nutričný profil/makro cieľ — ak sa pýta na jedlo/makrá, jasne mu povedz, nech sa opýta trénera, a nič si k tomu nedopočítavaj.";

  const timeBlock = context.currentMealSlotLabel
    ? `Aktuálny čas zodpovedá jedlu dňa: ${context.currentMealSlotLabel} (hodina ${context.currentHour}).`
    : `Aktuálna hodina: ${context.currentHour} — mimo bežných časov jedla.`;

  // ---------- 3a. reálne potraviny z knižnice, ak má klient makro cieľ (Krok 6) ----------
  // Knižnica má len ~80-100 položiek — pošle sa celá vždy, keď má zmysel (klient
  // môže potrebovať jedlo v ktorejkoľvek správe), nie len pri detegovanej "food" téme.
  let foodBlock = "";
  if (context.hasGoal) {
    try {
      const foods = await getFoodCandidates(supabase, trainerId);
      if (foods.length > 0) {
        foodBlock = `Knižnica potravín (vyber VÝHRADNE z tohto zoznamu, uveď aj gramáž):\n${formatFoodCandidates(foods)}`;
      }
    } catch (err) {
      console.error("getFoodCandidates:", err instanceof Error ? err.message : err);
    }
  }

  // ---------- 3b. reálne cviky z knižnice, ak klient žiada náhradu (Krok 5) ----------
  let exerciseBlock = "";
  if (swapIntent) {
    let candidates: { matched: ExerciseCandidate | null; alternatives: ExerciseCandidate[] };
    try {
      candidates = await findExerciseAlternatives(supabase, userText);
    } catch (err) {
      console.error("findExerciseAlternatives:", err instanceof Error ? err.message : err);
      candidates = { matched: null, alternatives: [] };
    }
    const { matched, alternatives } = candidates;
    const nameOf = (c: ExerciseCandidate) => c.nameSk?.trim() || c.name;
    if (matched && alternatives.length > 0) {
      exerciseBlock =
        `Klient pravdepodobne myslí cvik "${nameOf(matched)}" (svalová partia: ${matched.muscleGroup}). ` +
        `Skutočné cviky rovnakej partie z knižnice — vyber 2-3 najvhodnejšie, NIKDY nenavrhuj cvik mimo tohto zoznamu:\n` +
        alternatives.map((a) => `- ${nameOf(a)}`).join("\n");
    } else if (matched) {
      exerciseBlock = `Klient pravdepodobne myslí cvik "${nameOf(matched)}", ale appka nenašla iné cviky rovnakej partie — priznaj to a odporuč spýtať sa trénera na konkrétnu alternatívu.`;
    } else {
      exerciseBlock =
        "Klient žiada o náhradu cviku, ale appka si nie je istá, ktorý cvik myslí — opýtaj sa ho, ktorý presne cvik chce nahradiť, nič nehádaj.";
    }
  }

  const anthropic = getAnthropicClient();
  const recent = history.slice(-HISTORY_WINDOW);
  const softEscalation = healthTrigger && swapIntent;

  try {
    const response = await anthropic.messages.create({
      model: AI_MODEL.CHAT,
      max_tokens: MAX_REPLY_TOKENS,
      system: [buildSystemPrompt(softEscalation), contextBlock, timeBlock, foodBlock, exerciseBlock].filter(Boolean).join("\n\n"),
      messages: [...recent.map((m) => ({ role: m.role, content: m.content })), { role: "user" as const, content: userText }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    const reply = textBlock && textBlock.type === "text" ? textBlock.text.trim() : "Prepáč, nepodarilo sa mi odpovedať.";

    await logAiUsage({
      trainerId,
      clientId,
      kind: "chat",
      model: AI_MODEL.CHAT,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    });

    // mäkké FYI trénerovi — bežná výmena cviku kvôli nepohodliu, nie alarm (viď healthFilter.ts)
    if (softEscalation) {
      const { error } = await supabase.rpc("insert_ai_escalation_message", {
        p_client_id: clientId,
        p_body: buildSoftExerciseNoticeForTrainer(userText),
      });
      if (error) console.error("insert_ai_escalation_message (soft):", error.message);
    }

    return { status: "ok", reply, escalated: softEscalation };
  } catch (err) {
    console.error("sendAiChatMessage (Claude call):", err instanceof Error ? err.message : err);
    return { status: "error", reply: "Nastala chyba pri odpovedi AI. Skús to prosím znova." };
  }
}
