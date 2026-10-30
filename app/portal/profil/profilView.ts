import { createClient, getMyClient, getUser, MY_CLIENT_COLUMNS } from "@/lib/supabase/server";

/* Údaje stránky Profil — zdieľané /portal/profil a /v6design/portal/profil
   (dizajnový experiment), nech oba vzhľady načítavajú presne rovnako. */

export type ProfilView = {
  code: string | null;
  hasTrainer: boolean;
  /** Meno trénera na zobrazenie — null aj keď hasTrainer je true (meno sa
   * nepodarilo zistiť), nikdy fallback reťazec ako "tvoj tréner" (viedlo k
   * "Prepojený/á s trénerom tvoj tréner" / "Odpojiť sa od trénera tvoj tréner?"). */
  trainerName: string | null;
  deletionRequestedAt: string | null;
  deletionRequestedBy: "trainer" | "client" | null;
};

/** DEV: ?preview=has_trainer|no_trainer|deletion — profil bez session/DB. */
function previewView(kind: string): ProfilView | null {
  if (process.env.NODE_ENV !== "development") return null;
  const code = "FP-4A9F2C7E1B8D6035AC12";
  switch (kind) {
    case "has_trainer":
      return { code, hasTrainer: true, trainerName: "Marek Novák", deletionRequestedAt: null, deletionRequestedBy: null };
    case "no_trainer":
      return { code, hasTrainer: false, trainerName: null, deletionRequestedAt: null, deletionRequestedBy: null };
    case "deletion":
      return {
        code,
        hasTrainer: true,
        trainerName: "Marek Novák",
        deletionRequestedAt: new Date(Date.now() - 4 * 86_400_000).toISOString(),
        deletionRequestedBy: "client",
      };
    default:
      return null;
  }
}

export async function loadProfilView(preview: string | undefined): Promise<ProfilView> {
  let view = preview ? previewView(preview) : null;

  if (!view) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await getUser();

    let code: string | null = null;
    let hasTrainer = false;
    let trainerName: string | null = null;
    let deletionRequestedAt: string | null = null;
    let deletionRequestedBy: "trainer" | "client" | null = null;

    if (user) {
      // getMyClient je request-cache-ovaný (layout /portal ho už načítal) a nesie aj
      // meno trénera embedom — predtým dva ďalšie dopyty za sebou (klient → tréner).
      let { data: client } = await getMyClient(user.id);

      // Poistka: klient bez riadku/kódu (starší účet, alebo vytvorený mimo appky) —
      // dovytvor ho hneď, idempotentné (feature/registracia-update). Nový dopyt, nie
      // cache — ten by vrátil stav spred RPC.
      if (!client || !client.invite_code) {
        await supabase.rpc("ensure_self_client");
        ({ data: client } = await supabase
          .from("clients")
          .select(MY_CLIENT_COLUMNS)
          .eq("user_id", user.id)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle());
      }

      if (client) {
        code = client.invite_code;
        deletionRequestedAt = client.deletion_requested_at;
        deletionRequestedBy = client.deletion_requested_by;
        if (client.trainer_id) {
          hasTrainer = true;
          trainerName = (client.trainer as unknown as { full_name: string | null } | null)?.full_name ?? null;
        }
      }
    }

    view = { code, hasTrainer, trainerName, deletionRequestedAt, deletionRequestedBy };
  }
  return view;
}
