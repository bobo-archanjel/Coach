import { createClient, getUser } from "@/lib/supabase/server";
import { SignOutButton } from "../../components/SignOutButton";
import { DeleteAccountSection } from "./DeleteAccountSection";
import { TrainerConnection } from "./TrainerConnection";
import styles from "../portal.module.css";

type ProfilView = {
  code: string | null;
  trainerName: string | null;
  deletionRequestedAt: string | null;
  deletionRequestedBy: "trainer" | "client" | null;
};

/** DEV: ?preview=has_trainer|no_trainer|deletion — profil bez session/DB. */
function previewView(kind: string): ProfilView | null {
  if (process.env.NODE_ENV === "production") return null;
  const code = "FP-4A9F2C7E1B8D6035AC12";
  switch (kind) {
    case "has_trainer":
      return { code, trainerName: "Marek Novák", deletionRequestedAt: null, deletionRequestedBy: null };
    case "no_trainer":
      return { code, trainerName: null, deletionRequestedAt: null, deletionRequestedBy: null };
    case "deletion":
      return {
        code,
        trainerName: "Marek Novák",
        deletionRequestedAt: new Date(Date.now() - 4 * 86_400_000).toISOString(),
        deletionRequestedBy: "client",
      };
    default:
      return null;
  }
}

export default async function ProfilPage({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  const { preview } = await searchParams;

  let view = preview ? previewView(preview) : null;

  if (!view) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await getUser();

    let code: string | null = null;
    let trainerName: string | null = null;
    let deletionRequestedAt: string | null = null;
    let deletionRequestedBy: "trainer" | "client" | null = null;

    if (user) {
      const { data: client } = await supabase
        .from("clients")
        .select("invite_code, trainer_id, deletion_requested_at, deletion_requested_by")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (client) {
        code = client.invite_code;
        deletionRequestedAt = client.deletion_requested_at;
        deletionRequestedBy = client.deletion_requested_by;
        if (client.trainer_id) {
          const { data: trainer } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("id", client.trainer_id)
            .maybeSingle();
          trainerName = trainer?.full_name ?? "tvoj tréner";
        }
      }
    }

    view = { code, trainerName, deletionRequestedAt, deletionRequestedBy };
  }

  return (
    <div className={styles.profilePage}>
      <div className={styles.profileHead}>
        <h1>Profil</h1>
        <p>Kód pre trénera, stav prepojenia a nastavenia účtu.</p>
      </div>

      <div className={styles.profileStack}>
        <TrainerConnection code={view.code} trainerName={view.trainerName} />

        <div className={styles.panel}>
          <p className={styles.panelLabel}>Osobné údaje</p>
          <p className={styles.codeHint} style={{ marginTop: 0 }}>
            Vek, výška, váha, ciele a alergie z onboardingu si tu doplníš onedlho — potom uvidíš aj svoj progres v čase.
          </p>
        </div>

        <DeleteAccountSection requestedAt={view.deletionRequestedAt} requestedBy={view.deletionRequestedBy} />

        {/* Nad 880px je odhlásenie už v sidebari (PortalNav .navFoot) — tu netreba duplicitu. */}
        <div className={styles.profileSignOut}>
          <SignOutButton />
        </div>
      </div>
    </div>
  );
}
