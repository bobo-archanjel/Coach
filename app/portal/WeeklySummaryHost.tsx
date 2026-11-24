import { createClient, getMyClient, getUser } from "@/lib/supabase/server";
import { loadDueWeeklySummary, loadWeeklySummary } from "@/lib/gamification/weeklyServer";
import { summaryWeekFor } from "@/lib/gamification/weekly";
import { todayIso } from "@/lib/reports/period";
import { WeeklySummaryCard } from "./WeeklySummaryCard";

/* Týždenný súhrn klienta (všetky tarify, len v appke). `due` = karta na Dnes, ktorá sa ukáže
   raz za týždeň (nedeľa–streda); `always` = na stránke Úspechy vždy posledný týždeň bez zatvorenia.
   Dáta robí jedna funkcia (loadWeeklySummary), takže ich neskôr použije aj push/e-mail. */
export async function WeeklySummaryHost({ mode }: { mode: "due" | "always" }) {
  const {
    data: { user },
  } = await getUser();
  if (!user) return null;
  const { data: client } = await getMyClient(user.id);
  if (!client) return null;
  const supabase = await createClient();
  const ctx = { clientId: client.id, activePlanId: client.active_plan_id ?? null };
  const today = todayIso();
  const summary =
    mode === "due" ? await loadDueWeeklySummary(supabase, ctx, today) : await loadWeeklySummary(supabase, ctx, summaryWeekFor(today), today);
  if (!summary || !summary.hasActivity) return null;
  return <WeeklySummaryCard summary={summary} dismissible={mode === "due"} />;
}
