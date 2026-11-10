// Dáta zvončeka upozornení KLIENTA (feature/AIupgrade, mirror lib/dashboard/
// attentionData.ts). GET route namiesto server action — rovnaký dôvod ako u
// trénera: načítava sa po hydratácii, pri fokuse/zmene trasy, nemá čakať vo
// fronte server actions spolu so zápismi (napr. odoslanie správy v chate).

import "server-only";
import { createClient, getUser } from "@/lib/supabase/server";
import { getActivePortalDismissals } from "@/lib/portal/dismissals";
import {
  applyPortalDismissals,
  apptDismissKey,
  mealDismissKey,
  planDismissKey,
  APPOINTMENT_REMINDER_HOURS,
  NEW_PLAN_WINDOW_DAYS,
  type PortalAttentionData,
} from "@/lib/portal/attention";

const DEV_NO_SESSION = process.env.NODE_ENV === "development";

// DEV bez session (rovnaký princíp ako v lib/dashboard/attentionData.ts) — vzorové
// dáta, nech sa dá zvonček pozerať bez prihlásenia. V produkcii sa nikdy nepoužije.
const PREVIEW_DATA: PortalAttentionData = {
  unread: 1,
  newPlans: [{ id: "p1", name: "Hypertrofia — 4 dni/týždeň", key: planDismissKey("p1") }],
  newMealPlans: [],
  appointments: [
    { id: "a1", title: "Konzultácia", startsAt: new Date(Date.now() + 20 * 3_600_000).toISOString(), key: apptDismissKey("a1") },
  ],
};

/** `null` = nepodarilo sa načítať (UI ponechá posledný známy stav, nič nehlási). */
export async function loadPortalAttention(): Promise<PortalAttentionData | null> {
  const {
    data: { user },
  } = await getUser();
  if (!user) return DEV_NO_SESSION ? PREVIEW_DATA : null;

  const supabase = await createClient();

  const { data: client, error: clientErr } = await supabase
    .from("clients")
    .select("id, trainer_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (clientErr) return null;
  if (!client) return { unread: 0, newPlans: [], newMealPlans: [], appointments: [] };

  const nowIso = new Date().toISOString();
  const reminderUntilIso = new Date(Date.now() + APPOINTMENT_REMINDER_HOURS * 3_600_000).toISOString();
  const newPlanSinceIso = new Date(Date.now() - NEW_PLAN_WINDOW_DAYS * 86_400_000).toISOString();

  // Klient bez trénera chat nemá (Chat ukáže „Zatiaľ bez trénera“) — systémové správy
  // (napr. GDPR zmazanie/zrušenie) by sa ukazovali ako „neprečítané správy od trénera“,
  // ktoré nemá kde prečítať. Počítajú sa len pri prepojenom trénerovi.
  const noMessages = Promise.resolve({ count: 0, error: null });
  const [{ count: unread, error: unreadErr }, plans, meals, appts, dismissed] = await Promise.all([
    client.trainer_id
      ? supabase
          .from("messages")
          .select("id", { count: "exact", head: true })
          .eq("client_id", client.id)
          .in("sender", ["trainer", "system"])
          .is("read_at", null)
      : noMessages,
    supabase
      .from("workout_plans")
      .select("id, name")
      .eq("client_id", client.id)
      .eq("published", true)
      .gte("created_at", newPlanSinceIso)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("meal_plans")
      .select("id, name")
      .eq("client_id", client.id)
      .eq("published", true)
      .gte("created_at", newPlanSinceIso)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("appointments")
      .select("id, title, starts_at")
      .eq("client_id", client.id)
      .gte("starts_at", nowIso)
      .lte("starts_at", reminderUntilIso)
      .order("starts_at", { ascending: true }),
    getActivePortalDismissals(supabase, client.id),
  ]);
  if (unreadErr || plans.error || meals.error || appts.error) return null;

  return applyPortalDismissals(
    {
      unread: unread ?? 0,
      newPlans: (plans.data ?? []).map((p) => ({ id: p.id, name: p.name, key: planDismissKey(p.id) })),
      newMealPlans: (meals.data ?? []).map((p) => ({ id: p.id, name: p.name, key: mealDismissKey(p.id) })),
      appointments: (appts.data ?? []).map((a) => ({
        id: a.id,
        title: a.title,
        startsAt: a.starts_at,
        key: apptDismissKey(a.id),
      })),
    },
    dismissed,
  );
}
