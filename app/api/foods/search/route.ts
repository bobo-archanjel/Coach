// Živé vyhľadávanie potravín (Open Food Facts) pre denník klienta (feature/faster-app).
// Predtým server action `searchOnlineFoodAction` — tie idú cez jednu frontu, takže
// pomalé vyhľadávanie (OFF timeout 6 s) zdržalo aj "Pridať jedlo" a navigácia počas
// neho vynútila ďalší plný refresh stránky. GET handler beží súbežne, prehliadač ho
// pri ďalšom písaní zruší (AbortController) a výsledky OFF sa cachujú (viď
// searchOpenFoodFactsCached). Session sa overí lokálne cez getClaims.
//
// feature/security: len prihlásený, obmedzená dĺžka a throttle — inak by server
// slúžil ako otvorený proxy na Open Food Facts (vyčerpanie fair-use kvóty).

import { tErr } from "@/lib/i18n/serverErrors";
import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/supabase/server";
import { searchOpenFoodFactsCached } from "@/lib/openFoodFacts";
import { allowWithinWindow } from "@/lib/rateLimitMemory";

export async function GET(request: NextRequest) {
  const {
    data: { user },
  } = await getUser();
  if (!user) return NextResponse.json({ error: await tErr("notSignedIn"), results: [] }, { status: 401 });

  const query = request.nextUrl.searchParams.get("q") ?? "";
  if (query.length > 80) return NextResponse.json({ error: await tErr("api.queryTooLong"), results: [] });
  if (!allowWithinWindow(`off:${user.id}`, 20, 60_000)) {
    return NextResponse.json({ error: await tErr("api.tooManySearches"), results: [] });
  }

  try {
    const results = await searchOpenFoodFactsCached(query);
    return NextResponse.json({ error: null, results });
  } catch (err) {
    console.error("foods/search:", err);
    return NextResponse.json({ error: await tErr("api.searchFailed"), results: [] });
  }
}
