// FitPilot — AI blok: zápis do ai_usage (0013_ai_usage.sql) po každom volaní
// Claude API. Základ pre budúci rate-limit podľa monetizačného plánu — teraz
// sa nič nekontroluje, len sa loguje, nech to netreba dorábať spätne.

import { createClient } from "@/lib/supabase/server";

export type AiUsageKind = "plan_gen" | "meal_gen" | "progress_summary" | "chat";

export async function logAiUsage(params: {
  trainerId: string;
  clientId?: string | null;
  kind: AiUsageKind;
  model: string;
  inputTokens: number;
  outputTokens: number;
}): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("ai_usage").insert({
    trainer_id: params.trainerId,
    client_id: params.clientId ?? null,
    kind: params.kind,
    model: params.model,
    input_tokens: params.inputTokens,
    output_tokens: params.outputTokens,
  });
  // Logovanie nesmie zhodiť samotnú AI funkciu — len nahlásiť do konzoly.
  if (error) console.error("logAiUsage:", error.message);
}
