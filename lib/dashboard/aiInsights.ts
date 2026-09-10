import type { SupabaseClient } from "@supabase/supabase-js";
import { TOPIC_LABELS } from "@/lib/ai/topicClassify";

// Agregované AI Kouč insighty pre trénera (feature/AI) — "5 klientov sa tento
// týždeň pýtalo na bolesť kolena" ako skorý varovný signál, BEZ prístupu k
// obsahu konverzácie (GDPR — AI Kouč je súkromný chat, 0017). Číta výhradne cez
// get_ai_topic_insights() (migrácia 0033): SECURITY DEFINER RPC, ktorá sama
// vynucuje trainer_id = auth.uid() a k-anonymitu (≥3 rôzni klienti na tému) —
// táto vrstva len sformátuje výsledok, nič nefiltruje navyše ani nedovidí nič,
// čo by RPC už neobmedzila.

export interface AiTopicInsight {
  topic: string;
  label: string;
  clientCount: number;
}

export async function getAiTopicInsights(supabase: SupabaseClient, days = 7): Promise<AiTopicInsight[] | null> {
  const { data, error } = await supabase.rpc("get_ai_topic_insights", { p_days: days });
  if (error) {
    console.error("getAiTopicInsights:", error.message);
    return null;
  }
  return (data ?? []).map((r: { topic: string; client_count: number }) => ({
    topic: r.topic,
    label: TOPIC_LABELS[r.topic] ?? r.topic,
    clientCount: r.client_count,
  }));
}
