// i18n-ignore-file: pokyn modelu pri vyčerpaní kôl nástrojov (interné)
// FitPilot — AI Kouč: ohraničená slučka tool use (manuálna, nie SDK tool runner — treba
// pevný strop kôl, sčítanie spotreby a vstrekovateľný klient pre testy bez volania API).
//
// Tvar podľa dokumentácie SDK: kým stop_reason === "tool_use", pripoj odpoveď asistenta
// (celý response.content, vrátane prípadných thinking blokov) a v JEDNEJ user správe pošli
// všetky tool_result bloky (paralelné volania). Po strope kôl model dostane poslednú šancu
// odpovedať bez nástrojov (tool_choice: none) — nikdy nezostane visieť tool_use bez odpovede.

import type Anthropic from "@anthropic-ai/sdk";

export const MAX_TOOL_ROUNDS = 4;

export type CreateMessage = (params: Anthropic.MessageCreateParamsNonStreaming) => Promise<Anthropic.Message>;

export interface ToolLoopParams {
  create: CreateMessage;
  /** model, max_tokens, system, tools, … (bez messages) */
  base: Omit<Anthropic.MessageCreateParamsNonStreaming, "messages">;
  messages: Anthropic.MessageParam[];
  runTool: (name: string, input: unknown) => Promise<{ content: string; isError?: boolean }>;
  maxRounds?: number;
}

export interface ToolLoopResult {
  /** text finálnej odpovede (všetky text bloky posledného volania) — prázdny reťazec, ak model žiadny nevrátil */
  text: string;
  /** súčet spotreby cez všetky volania; vstup zahŕňa aj cache zápis/čítanie */
  inputTokens: number;
  outputTokens: number;
  /** koľko volaní modelu prebehlo */
  calls: number;
  /** true = došlo ku stropu kôl a finálna odpoveď sa vyžiadala bez nástrojov */
  hitRoundCap: boolean;
  stopReason: Anthropic.Message["stop_reason"];
}

function addUsage(acc: { in: number; out: number }, u: Anthropic.Message["usage"]) {
  acc.in += u.input_tokens + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
  acc.out += u.output_tokens;
}

function textOf(m: Anthropic.Message): string {
  return m.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

export async function runToolLoop(p: ToolLoopParams): Promise<ToolLoopResult> {
  const maxRounds = p.maxRounds ?? MAX_TOOL_ROUNDS;
  const messages = [...p.messages];
  const usage = { in: 0, out: 0 };
  let calls = 0;

  for (let round = 0; ; round++) {
    const response = await p.create({ ...p.base, messages });
    calls++;
    addUsage(usage, response.usage);

    const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (response.stop_reason !== "tool_use" || toolUses.length === 0) {
      return { text: textOf(response), inputTokens: usage.in, outputTokens: usage.out, calls, hitRoundCap: false, stopReason: response.stop_reason };
    }

    messages.push({ role: "assistant", content: response.content });

    // Strop kôl: tool_use bloky musia dostať tool_result, ale už ich nevykonávame —
    // model dostane pokyn odpovedať z toho, čo má, a tool_choice: none zakáže ďalšie volania.
    if (round + 1 >= maxRounds) {
      messages.push({
        role: "user",
        content: [
          ...toolUses.map(
            (t): Anthropic.ToolResultBlockParam => ({
              type: "tool_result",
              tool_use_id: t.id,
              content: "Limit vyhľadávaní je vyčerpaný.",
              is_error: true,
            }),
          ),
          { type: "text", text: "Limit vyhľadávaní je vyčerpaný. Odpovedz klientovi teraz z toho, čo si už našiel — bez ďalších nástrojov, a bez vymýšľania cvikov či potravín, ktoré si nenašiel." },
        ],
      });
      const last = await p.create({ ...p.base, messages, tool_choice: { type: "none" } });
      calls++;
      addUsage(usage, last.usage);
      return { text: textOf(last), inputTokens: usage.in, outputTokens: usage.out, calls, hitRoundCap: true, stopReason: last.stop_reason };
    }

    // paralelné volania: všetky výsledky v jednej user správe
    const results = await Promise.all(
      toolUses.map(async (t): Promise<Anthropic.ToolResultBlockParam> => {
        const out = await p.runTool(t.name, t.input);
        return { type: "tool_result", tool_use_id: t.id, content: out.content, ...(out.isError ? { is_error: true } : {}) };
      }),
    );
    messages.push({ role: "user", content: results });
  }
}
