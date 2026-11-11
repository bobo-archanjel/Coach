"use server";

import { tErr } from "@/lib/i18n/serverErrors";
// FitPilot — AI blok, Krok 4b: server action pre AI Kouč (klientský AI chat).
// Vždy pod session prihláseného klienta — RLS na ai_conversations/ai_messages
// (0014) a insert_ai_escalation_message() (0015) platí automaticky. Konverzácia
// sa zakladá lazy, pri prvej odoslanej správe (unique client_id na 0014).

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { tryCreateAdminClient } from "@/lib/supabase/admin";
import { sendAiChatMessage } from "@/lib/ai/chat";
import { needsHealthEscalation } from "@/lib/ai/healthFilter";
import { classifyTopic } from "@/lib/ai/topicClassify";
import { dbErr } from "@/lib/dbError";

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
  if (!user) return { error: await tErr("notSignedIn") };

  const body = ((formData.get("body") as string | null) ?? "").trim();
  if (!body) return { error: await tErr("emptyMessage") };
  if (body.length > 4000) return { error: await tErr("messageTooLong") };

  const { data: client, error: clientErr } = await supabase
    .from("clients")
    .select("id, trainer_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (clientErr) return { error: await dbErr(clientErr, "actions") };
  if (!client) return { error: await tErr("client.notLinkedTrainer") };
  if (!client.trainer_id) return { error: await tErr("client.aiCoachTrainerOnly") };

  // Konverzácia aj jej história jedným dopytom (predtým dva za sebou); založí sa lazy
  // pri prvej správe (unique client_id). História = POSLEDNÝCH N správ (zostupne +
  // otočiť) — predtým vzostupne s limitom, čiže pri dlhej konverzácii najstaršie
  // správy a model ako "nedávnu" históriu dostával dávno staré výmeny.
  let conversationId: string | null = null;
  let historyRows: { role: string; content: string; created_at: string }[] = [];
  const { data: existingConv, error: existingErr } = await supabase
    .from("ai_conversations")
    .select("id, ai_messages(role, content, created_at)")
    .eq("client_id", client.id)
    .order("created_at", { referencedTable: "ai_messages", ascending: false })
    .limit(HISTORY_FETCH_LIMIT, { referencedTable: "ai_messages" })
    .maybeSingle();
  if (existingErr) return { error: await dbErr(existingErr, "actions") };
  if (existingConv) {
    conversationId = existingConv.id;
    historyRows = [...((existingConv.ai_messages as typeof historyRows | null) ?? [])].reverse();
  } else {
    const { data: newConv, error: convErr } = await supabase
      .from("ai_conversations")
      .insert({ client_id: client.id })
      .select("id")
      .single();
    if (convErr) return { error: await dbErr(convErr, "actions") };
    conversationId = newConv.id;
  }
  if (!conversationId) return { error: await tErr("client.conversationFailed") };

  const history = historyRows.map((r) => ({ role: r.role as "user" | "assistant", content: r.content }));

  // Téma pre agregované insighty trénera (migrácia 0033, get_ai_topic_insights)
  // — pevná kategória, nikdy obsah správy. Tréner ju nikdy nevidí per-klient,
  // len ako súčet naprieč ≥3 klientmi (k-anonymita v RPC), viď lib/ai/topicClassify.ts.
  const topic = classifyTopic(body, needsHealthEscalation(body));

  // Uloženie správy klienta a príprava odpovede AI naraz — história pre model je už
  // načítaná vyššie, správa ide modelu zvlášť (userText), takže na zápis čakať netreba.
  const [{ error: insertUserErr }, result] = await Promise.all([
    supabase.from("ai_messages").insert({ conversation_id: conversationId, role: "user", content: body, topic }),
    sendAiChatMessage(supabase, {
      trainerId: client.trainer_id,
      clientId: client.id,
      conversationId,
      userText: body,
      history,
    }),
  ]);
  if (insertUserErr) return { error: await dbErr(insertUserErr, "actions") };

  // Odpoveď asistenta zapisuje SERVER (service role), nie session klienta — od migrácie
  // 0036 klient smie vkladať len vlastné (user) správy, inak by si vedel podvrhnúť
  // "asistentove" odpovede, ktoré sa posielajú modelu ako história (obchvat zdravotných
  // hraníc). `conversationId` je overené vyššie cez klientovu vlastnú session (RLS).
  // Bez service role kľúča (prechodne, pred nasadením 0036) sa zapisuje ako doteraz.
  const writer = tryCreateAdminClient() ?? supabase;
  const { error: insertAssistantErr } = await writer.from("ai_messages").insert({
    conversation_id: conversationId,
    role: "assistant",
    content: result.reply,
    escalated: result.status === "escalated" || (result.status === "ok" && result.escalated === true),
    // Cviky, ktoré AI naozaj spomenula pri náhrade (lib/ai/chat.ts) — appka k nim
    // vie priložiť klikateľný detail s fotkami. null, keď žiadne (väčšina správ).
    exercise_refs: result.status === "ok" && result.exercises && result.exercises.length > 0 ? result.exercises : null,
  });
  if (insertAssistantErr) {
    console.error("sendAiKoucMessageAction (assistant insert):", insertAssistantErr.message);
    return { error: await tErr("client.replySaveFailed") };
  }

  revalidatePath("/portal/ai-kouc");
  return ok;
}

/**
 * Vymaže celú AI konverzáciu klienta (cascade zmaže aj ai_messages, 0014) a
 * začne odznova. Bežná potreba ("chcem čistý začiatok") aj GDPR právo na
 * vymazanie (Art. 17) — klient má vlastnú kontrolu bez nutnosti žiadať podporu.
 */
export async function resetAiKoucConversationAction(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: client } = await supabase
    .from("clients")
    .select("id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!client) return;

  const { error } = await supabase.from("ai_conversations").delete().eq("client_id", client.id);
  if (error) console.error("resetAiKoucConversationAction:", error.message);

  revalidatePath("/portal/ai-kouc");
}
