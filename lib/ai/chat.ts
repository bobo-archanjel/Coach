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
import { needsHealthEscalation, HEALTH_ESCALATION_REPLY, buildEscalationNoticeForTrainer } from "./healthFilter";
import { isChatRateLimited, AI_CHAT_DAILY_LIMIT } from "./rateLimit";

const HISTORY_WINDOW = 12; // posledných N správ poslaných modelu — nie celá história (minimalizácia dát + náklady)
const MAX_REPLY_TOKENS = 500;

export type SendChatResult =
  | { status: "ok"; reply: string }
  | { status: "escalated"; reply: string }
  | { status: "rate_limited"; reply: string }
  | { status: "not_configured"; reply: string }
  | { status: "error"; reply: string };

function buildSystemPrompt(): string {
  return [
    "Si AI Kouč vo fitness aplikácii FitPilot. Rozprávaš sa priamo s klientom trénera, po slovensky, stručne a vecne.",
    "Tvoja úloha: pomôcť s výživou (čo a koľko zjesť podľa cieľa) a s tréningom (napr. alternatívy cvikov) — VÝHRADNE na základe dát, ktoré ti pošle appka v tejto správe. Nikdy si nevymýšľaj čísla makier, potraviny ani cviky, ktoré ti neboli poskytnuté.",
    "Zdravotné témy (bolesť, zranenie, diagnóza) NIKDY neriešiš — appka ich zachytáva skôr, než sa k tebe dostanú, ale ak by sa aj tak objavila zmienka o bolesti/zranení, okamžite odporuč konzultáciu s trénerom a nič neradenie k tomu nepridávaj.",
    "Neradíš nič mimo fitness/výživy tejto appky. Odpovedaj krátko (2-5 viet), konkrétne, bez dlhých úvodov.",
  ].join("\n");
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
  if (needsHealthEscalation(userText)) {
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

  const anthropic = getAnthropicClient();
  const recent = history.slice(-HISTORY_WINDOW);

  try {
    const response = await anthropic.messages.create({
      model: AI_MODEL.CHAT,
      max_tokens: MAX_REPLY_TOKENS,
      system: `${buildSystemPrompt()}\n\n${contextBlock}\n${timeBlock}`,
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

    return { status: "ok", reply };
  } catch (err) {
    console.error("sendAiChatMessage (Claude call):", err instanceof Error ? err.message : err);
    return { status: "error", reply: "Nastala chyba pri odpovedi AI. Skús to prosím znova." };
  }
}
