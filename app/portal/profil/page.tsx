import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "../../components/SignOutButton";
import { ComingSoon } from "../ComingSoon";
import { ProfileIcon } from "../icons";
import { DeleteAccountSection } from "./DeleteAccountSection";
import styles from "../portal.module.css";

export default async function ProfilPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let deletion: { requestedAt: string | null; requestedBy: "trainer" | "client" | null } | null = null;
  if (user) {
    const { data: client } = await supabase
      .from("clients")
      .select("deletion_requested_at, deletion_requested_by")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (client) {
      deletion = { requestedAt: client.deletion_requested_at, requestedBy: client.deletion_requested_by };
    }
  }

  return (
    <>
      <ComingSoon icon={<ProfileIcon />} title="Tvoj profil">
        Onedlho si tu doplníš vek, výšku, váhu, ciele a alergie z onboardingu a uvidíš svoj progres
        v čase. Zatiaľ portál beží na ukážkových dátach.
      </ComingSoon>
      {deletion && <DeleteAccountSection requestedAt={deletion.requestedAt} requestedBy={deletion.requestedBy} />}
      {/* Nad 880px je odhlásenie už v sidebari (PortalNav .navFoot) — tu netreba duplicitu. */}
      <div className={styles.profileSignOut}>
        <SignOutButton />
      </div>
    </>
  );
}
