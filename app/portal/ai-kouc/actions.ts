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
import { trainerAllowsCoach } from "@/lib/billing/server";
import { applySwapToEntries, splitExerciseRefs } from "@/lib/ai/exerciseSwap";

export interface AiKoucActionState {
  error: string | null;
}
const ok: AiKoucActionState = { error: null };

function packExerciseRefs(result: Awaited<ReturnType<typeof sendAiChatMessage>>): unknown[] | null {
  if (result.status !== "ok") return null;
  const refs: unknown[] = [...(result.exercises ?? []), ...(result.swaps ?? []).map((swap) => ({ swap }))];
  return refs.length > 0 ? refs : null;
}

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
  // AI Kouč je súčasť tarify trénera (Pro/Business); pri vypršanom predplatnom je vypnutý
  if (!(await trainerAllowsCoach(client.trainer_id))) return { error: await tErr("billing.coachLocked") };

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
    // Overené výmeny cviku (tlačidlo "Vymeniť v pláne") ležia v tom istom jsonb poli ako položky
    // { swap: {...} } — bez ďalšieho stĺpca/migrácie; čítanie ich rozdelí (lib/portal/data.ts).
    exercise_refs: packExerciseRefs(result),
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

export interface ApplySwapState {
  error: string | null;
  /** true = výmena je v pláne (aj keď ju spravil predošlý klik) */
  applied?: boolean;
}

/**
 * Tlačidlo "Vymeniť v pláne" pod odpoveďou AI Kouča. Z klienta chodí len ID správy a poradie
 * výmeny — samotná výmena (deň, cviky) sa vždy načíta zo správy uloženej na serveri a znova
 * overí: správa patrí tomuto klientovi, deň je vo VLASTNOM pláne (trainer_id null), starý
 * cvik v ňom ešte je, nový existuje v knižnici. Z cviku sa mení len exercise_id + názov,
 * série/opakovania/záťaž/tempo/pauza ostávajú. Opakovaný klik je bezpečný (už vymenené = ok).
 */
export async function applyAiExerciseSwapAction(messageId: string, swapIndex: number): Promise<ApplySwapState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: await tErr("notSignedIn") };
  if (typeof messageId !== "string" || !Number.isInteger(swapIndex) || swapIndex < 0) {
    return { error: await tErr("client.swapFailed") };
  }

  const { data: client } = await supabase
    .from("clients")
    .select("id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!client) return { error: await tErr("client.swapFailed") };

  // správa + jej konverzácia (RLS ukáže len klientove; vlastníctvo overujeme aj explicitne)
  const { data: msg } = await supabase
    .from("ai_messages")
    .select("id, role, exercise_refs, conversation_id, ai_conversations!inner(client_id)")
    .eq("id", messageId)
    .maybeSingle();
  const convClient = (msg?.ai_conversations as unknown as { client_id: string } | null)?.client_id;
  if (!msg || msg.role !== "assistant" || convClient !== client.id) return { error: await tErr("client.swapFailed") };

  const swap = splitExerciseRefs(msg.exercise_refs).swaps?.[swapIndex];
  if (!swap) return { error: await tErr("client.swapFailed") };

  const { data: day } = await supabase
    .from("workout_days")
    .select("id, exercises, workout_plans!inner(client_id, trainer_id)")
    .eq("id", swap.dayId)
    .maybeSingle();
  const plan = day?.workout_plans as unknown as { client_id: string; trainer_id: string | null } | null;
  if (!day || !plan || plan.client_id !== client.id || plan.trainer_id !== null) {
    return { error: await tErr("client.swapPlanChanged") };
  }

  const { data: exists } = await supabase.from("exercises").select("id").eq("id", swap.newId).maybeSingle();
  if (!exists) return { error: await tErr("client.swapFailed") };

  const result = applySwapToEntries(day.exercises, swap);
  if (!result) return { error: await tErr("client.swapPlanChanged") };

  if (result.changed) {
    const { error } = await supabase.from("workout_days").update({ exercises: result.entries }).eq("id", swap.dayId);
    if (error) return { error: await dbErr(error, "actions") };
  }

  // Poznačí výmenu ako vykonanú, aby tlačidlo po obnovení stránky ostalo vypnuté. Zápis robí
  // service role (klient ai_messages upravovať nesmie, 0036) — best-effort, bez neho je
  // opakovaný klik aj tak bezpečný (idempotentné).
  const writer = tryCreateAdminClient();
  if (writer) {
    const marked = ((msg.exercise_refs as unknown[] | null) ?? []).map((item) => {
      const w = (item as { swap?: Record<string, unknown> } | null)?.swap;
      return w && w.dayId === swap.dayId && w.oldId === swap.oldId && w.newId === swap.newId
        ? { swap: { ...w, applied: true } }
        : item;
    });
    const { error } = await writer.from("ai_messages").update({ exercise_refs: marked }).eq("id", msg.id);
    if (error) console.error("applyAiExerciseSwapAction (mark applied):", error.message);
  }

  revalidatePath("/portal", "layout");
  return { error: null, applied: true };
}
