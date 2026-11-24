import { cookies } from "next/headers";
import { getMyClient, getUser } from "@/lib/supabase/server";
import { loadBrandingByInviteSlug } from "@/lib/branding/server";
import { INVITE_COOKIE, parseInviteCookie } from "@/lib/invite/pending";
import { InviteCard } from "./InviteCard";

/* Domovská obrazovka portálu: ak si klient bez trénera prišiel cez odkaz pozvánky (cookie
   `fp_invite`, nastavuje middleware), ponúkne mu „Pripojiť sa“. Karta sa ukáže len keď odkaz
   ešte ukazuje na platnú pozývaciu stránku (značka Business) a klient nemá trénera; inak nič
   (cookie ostane a vyprší, nič sa nedeje). Spárovanie robí až claimInviteAction. */
export async function InvitePrompt() {
  const slug = parseInviteCookie((await cookies()).get(INVITE_COOKIE)?.value);
  if (!slug) return null;

  const {
    data: { user },
  } = await getUser();
  if (!user) return null;

  const { data: client } = await getMyClient(user.id);
  if (client?.trainer_id) return null;

  const branding = await loadBrandingByInviteSlug(slug);
  if (!branding) return null;

  return <InviteCard brandName={branding.brandName || null} />;
}
