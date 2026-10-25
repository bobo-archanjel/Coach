// Chat polling (feature/faster-app) — ID poslednej správy vlákna pre ChatThread.
// Predtým to bola server action (getClient/TrainerChatMarkerAction), lenže všetky
// server actions jednej stránky idú cez jednu frontu: 12 s poll tak zdržal
// odoslanie správy či uloženie a navigácia počas pollu vynútila ďalší plný
// refresh stránky. GET route handler beží súbežne, dá sa zrušiť (AbortController)
// a session overí lokálne cez getClaims (getUser z lib/supabase/server) namiesto
// sieťového auth.getUser() pri každom tiku.
//
// `?client=<id>` = trénerove vlákno s daným klientom. Bez parametra = vlákno
// prihláseného klienta (jeho najstarší clients riadok, ako všade v portáli).
// Obe vetvy obmedzuje RLS messages_select (0008/0046) — rovnaké riadky, aké
// stránka vykreslí, takže marker sa zhoduje s poslednou zobrazenou správou.

import { NextResponse, type NextRequest } from "next/server";
import { createClient, getUser } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const {
    data: { user },
  } = await getUser();
  if (!user) return NextResponse.json({ marker: null }, { status: 401 });

  const supabase = await createClient();
  const clientId = request.nextUrl.searchParams.get("client");

  if (clientId) {
    const { data } = await supabase
      .from("messages")
      .select("id")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return NextResponse.json({ marker: data?.id ?? null });
  }

  // Klient: vlastný clients riadok + jeho posledná správa jedným dopytom (embed s
  // limitom na rodiča) namiesto dvoch round-tripov za sebou.
  const { data } = await supabase
    .from("clients")
    .select("id, messages(id)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .order("created_at", { referencedTable: "messages", ascending: false })
    .limit(1)
    .limit(1, { referencedTable: "messages" })
    .maybeSingle();
  const last = (data?.messages as { id: string }[] | undefined)?.[0];
  return NextResponse.json({ marker: last?.id ?? null });
}
