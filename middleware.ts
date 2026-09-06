import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  // Predtým bežalo na takmer každej ceste vrátane landing page a /prihlasenie
  // — teda Supabase Auth API round-trip (updateSession volá auth.getUser())
  // pri KAŽDEJ návšteve verejnej marketingovej stránky, aj bez akejkoľvek
  // session. Refresh cookies má zmysel len tam, kde appka reálne beží dlhšie
  // v prihlásenom stave (/dashboard, /portal) — auth guard pre samotný
  // prístup rieši aj tak vlastný getUser() v ich layout.tsx, nie middleware.
  matcher: ["/dashboard/:path*", "/portal/:path*"],
};
