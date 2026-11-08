"use server";

// Skrývanie upozornení zvončeka a "prečítané" (feature/funkcionalita). Načítanie dát
// zvončeka je GET /api/dashboard/attention (lib/dashboard/attentionData.ts) — čítanie
// nemá čakať vo fronte server actions spolu so zápismi. RLS scopuje všetko na
// klientov/riadky tohto trénera; explicitné trainer_id filtre sú len pre istotu/index.

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient, getUser } from "@/lib/supabase/server";
import { isValidDismissKey } from "@/lib/dashboard/attention";

const DEV_NO_SESSION = process.env.NODE_ENV === "development";

const DAY_MS = 86_400_000;
const PRUNE_AFTER_DAYS = 90;

/**
 * Skryje upozornenia. `days` = na koľko dní (null = kým sa nezmení situácia — kľúč
 * nesie jej identitu, viď lib/dashboard/attention.ts). Kľúče sa validujú, server
 * neprijme ľubovoľný reťazec.
 */
/**
 * `revalidate: false` — skrytie po kliknutí na klienta v zvončeku: tréner je už na
 * inej stránke, revalidácia by zbytočne znova vyrenderovala práve otvorený detail
 * klienta (všetky jeho dopyty druhýkrát). /dashboard je dynamická trasa, pri ďalšej
 * návšteve sa načíta čerstvo aj tak.
 */
export async function dismissNotificationsAction(
  keys: string[],
  days: number | null,
  revalidate = true,
): Promise<{ ok: boolean }> {
  if (!Array.isArray(keys) || keys.length === 0 || keys.length > 200 || !keys.every(isValidDismissKey)) {
    return { ok: false };
  }
  if (days !== null && !(Number.isInteger(days) && days >= 1 && days <= 90)) return { ok: false };

  const {
    data: { user },
  } = await getUser();
  if (!user) return { ok: DEV_NO_SESSION }; // dev náhľad: nič sa neukladá, UI skrýva optimisticky

  const supabase = await createClient();
  const now = Date.now();
  const until = days == null ? null : new Date(now + days * DAY_MS).toISOString();

  const { error } = await supabase.from("notification_dismissals").upsert(
    keys.map((key) => ({
      trainer_id: user.id,
      key,
      dismissed_until: until,
      created_at: new Date(now).toISOString(),
    })),
    { onConflict: "trainer_id,key" },
  );
  if (error) {
    console.error("dismissNotificationsAction:", error.message);
    return { ok: false };
  }

  // Poriadok: kľúče staršie než 90 dní už nikdy nebudú relevantné (klient mal medzitým iný `since`).
  // Až po odoslaní odpovede (after) — skrytie na ňu nemusí čakať.
  after(async () => {
    await supabase
      .from("notification_dismissals")
      .delete()
      .eq("trainer_id", user.id)
      .lt("created_at", new Date(now - PRUNE_AFTER_DAYS * DAY_MS).toISOString());
  });

  if (revalidate) revalidatePath("/dashboard");
  return { ok: true };
}

/**
 * "Označiť všetko ako prečítané" — nastaví SKUTOČNÉ read_at (mark_messages_read
 * RPC, 0008; tréner nemá UPDATE na messages), takže zmizne aj odznak pri "Správy"
 * a pri klientoch. Neskrýva len upozornenie — stav v appke ostáva pravdivý.
 */
export async function markAllMessagesReadAction(): Promise<{ ok: boolean }> {
  const {
    data: { user },
  } = await getUser();
  if (!user) return { ok: DEV_NO_SESSION };

  const supabase = await createClient();
  const { data: rows, error } = await supabase
    .from("messages")
    .select("client_id")
    .eq("sender", "client")
    .is("read_at", null);
  if (error) return { ok: false };

  const clientIds = [...new Set((rows ?? []).map((r) => r.client_id as string))];
  const results = await Promise.all(clientIds.map((id) => supabase.rpc("mark_messages_read", { p_client_id: id })));
  if (results.some((r) => r.error)) return { ok: false };

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/spravy");
  return { ok: true };
}
