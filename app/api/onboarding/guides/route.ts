// Sprievodcovia sekcií — zoznam videných v účte (migrácia 0060, profiles.guides_seen cez RPC).
// Route handler namiesto server action: čítanie aj zápis bežia súbežne s navigáciou a
// ukladaním na stránke, nečakajú vo fronte server actions (rovnaký dôvod ako zvonček,
// app/api/dashboard/attention). Session lokálne cez getUser (getClaims).
//
// GET    → { auto, seen }  auto=false: sprievodcovia sa sami nespúšťajú (bez session, bez
//                          migrácie 0060, alebo cookie fitpilot_guides_seen=all — E2E testy)
// POST   { id } → označí sprievodcu ako videného
// DELETE → vynuluje zoznam („Spustiť návod znova“)

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient, getUser } from "@/lib/supabase/server";
import { GUIDE_IDS } from "@/lib/onboarding/guides";

const OFF_COOKIE = "fitpilot_guides_seen";
const OFF = { auto: false, seen: [] as string[] };

export async function GET() {
  if ((await cookies()).get(OFF_COOKIE)?.value === "all") return NextResponse.json(OFF);
  const {
    data: { user },
  } = await getUser();
  if (!user) return NextResponse.json(OFF);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_guides_seen");
  if (error || !Array.isArray(data)) return NextResponse.json(OFF);
  return NextResponse.json({ auto: true, seen: data as string[] });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { id?: unknown } | null;
  const id = body?.id;
  if (typeof id !== "string" || !GUIDE_IDS.has(id)) return NextResponse.json({ ok: false }, { status: 400 });
  const {
    data: { user },
  } = await getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_guide_seen", { p_guide: id });
  if (error) console.error("mark_guide_seen:", error.message);
  return NextResponse.json({ ok: !error });
}

export async function DELETE() {
  const {
    data: { user },
  } = await getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  const supabase = await createClient();
  const { error } = await supabase.rpc("reset_guides_seen");
  if (error) console.error("reset_guides_seen:", error.message);
  return NextResponse.json({ ok: !error });
}
