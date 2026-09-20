// FitPilot — AI blok: zápis do ai_usage (0013_ai_usage.sql) po každom volaní
// Claude API. Od migrácie 0036 píše do ai_usage VÝHRADNE server so service role —
// predtým smel priamo vkladať aj klient/tréner, takže si vedel podvrhnúť riadky a
// vyčerpať limity svojho trénera. Bežný tok je: reserveAiSlot() PRED volaním modelu
// (lib/ai/rateLimit.ts, atomicky) → volanie → logAiUsage({ reservationId }) dopíše tokeny.

import { tryCreateAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type AiUsageKind = "plan_gen" | "meal_gen" | "progress_summary" | "roster_summary" | "chat";

export async function logAiUsage(params: {
  trainerId: string;
  clientId?: string | null;
  kind: AiUsageKind;
  model: string;
  inputTokens: number;
  outputTokens: number;
  /** ID z reserveAiSlot() — riadok sa len dokončí (tokeny), nevytvára sa nový. */
  reservationId?: string | null;
}): Promise<void> {
  const admin = tryCreateAdminClient();

  if (admin && params.reservationId) {
    const { error } = await admin.rpc("finalize_ai_call", {
      p_id: params.reservationId,
      p_input: params.inputTokens,
      p_output: params.outputTokens,
    });
    if (error) console.error("finalize_ai_call:", error.message);
    return;
  }

  const row = {
    trainer_id: params.trainerId,
    client_id: params.clientId ?? null,
    kind: params.kind,
    model: params.model,
    input_tokens: params.inputTokens,
    output_tokens: params.outputTokens,
  };

  // Logovanie nesmie zhodiť samotnú AI funkciu — len nahlásiť do konzoly.
  if (admin) {
    const { error } = await admin.from("ai_usage").insert(row);
    if (error) console.error("logAiUsage:", error.message);
    return;
  }

  // Prechodné správanie, kým v prostredí chýba SUPABASE_SERVICE_ROLE_KEY (alebo pred
  // migráciou 0036): zápis pod session používateľa ako doteraz. Po 0036 ho RLS odmietne.
  const supabase = await createClient();
  const { error } = await supabase.from("ai_usage").insert(row);
  if (error) console.error("logAiUsage (fallback):", error.message);
}
