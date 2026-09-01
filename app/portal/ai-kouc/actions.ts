"use server";

// FitPilot — AI blok, Krok 4b: server action pre AI Kouč (klientský AI chat).
// Vždy pod session prihláseného klienta — RLS na ai_conversations/ai_messages
// (0014) a insert_ai_escalation_message() (0015) platí automaticky. Konverzácia
// sa zakladá lazy, pri prvej odoslanej správe (unique client_id na 0014).

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sendAiChatMessage } from "@/lib/ai/chat";

export interface AiKoucActionState {
  error: string | null;
}
const ok: AiKoucActionState = { error: null };

const HISTORY_FETCH_LIMIT = 40; // trocha viac než HISTORY_WINDOW v lib/ai/chat.ts, nech je z čoho orezávať

export async function sendAiKoucMessageAction(
  _prevState: AiKoucActionState,
  formData: FormData,
): Promise<AiKoucActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Nie si prihlásený." };

  const body = ((formData.get("body") as string | null) ?? "").trim();
  if (!body) return { error: "Prázdna správa." };
  if (body.length > 4000) return { error: "Správa je príliš dlhá (max 4000 znakov)." };

  const { data: client, error: clientErr } = await supabase
    .from("clients")
    .select("id, trainer_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (clientErr) return { error: clientErr.message };
  if (!client) return { error: "Tvoj účet nie je prepojený s trénerom." };
  if (!client.trainer_id) return { error: "AI Kouč je zatiaľ dostupný len klientom s prideleným trénerom." };

  // nájsť alebo založiť konverzáciu (unique client_id — insert zlyhá na duplicite, potom len dočítať)
  let conversationId: string | null = null;
  const { data: existingConv } = await supabase
    .from("ai_conversations")
    .select("id")
    .eq("client_id", client.id)
    .maybeSingle();
  if (existingConv) {
    conversationId = existingConv.id;
  } else {
    const { data: newConv, error: convErr } = await supabase
      .from("ai_conversations")
      .insert({ client_id: client.id })
      .select("id")
      .single();
    if (convErr) return { error: convErr.message };
    conversationId = newConv.id;
  }
  if (!conversationId) return { error: "Nepodarilo sa založiť konverzáciu." };

  const { data: historyRows, error: historyErr } = await supabase
    .from("ai_messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(HISTORY_FETCH_LIMIT);
  if (historyErr) return { error: historyErr.message };

  const history = (historyRows ?? []).map((r) => ({ role: r.role as "user" | "assistant", content: r.content }));

  const { error: insertUserErr } = await supabase
    .from("ai_messages")
    .insert({ conversation_id: conversationId, role: "user", content: body });
  if (insertUserErr) return { error: insertUserErr.message };

  const result = await sendAiChatMessage(supabase, {
    trainerId: client.trainer_id,
    clientId: client.id,
    conversationId,
    userText: body,
    history,
  });

  const { error: insertAssistantErr } = await supabase.from("ai_messages").insert({
    conversation_id: conversationId,
    role: "assistant",
    content: result.reply,
    escalated: result.status === "escalated",
  });
  if (insertAssistantErr) return { error: insertAssistantErr.message };

  revalidatePath("/portal/ai-kouc");
  return ok;
}
