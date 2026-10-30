import { NextResponse } from "next/server";
import { DASH_SKIN_COOKIE } from "../theme";

/* /v6design/dashboard — zapne nový dizajn trénerovho dashboardu pre tento prehliadač
   (cookie) a otvorí /dashboard. Funkcie aj adresy dashboardu ostávajú tie isté.
   Relatívny Location (nie new URL(…, request.url)): v `next dev` je request.url vždy
   localhost, takže mobil otvorený cez LAN IP by skončil na localhost (= sám na sebe). */
export function GET() {
  const response = new NextResponse(null, { status: 307, headers: { Location: "/dashboard" } });
  response.cookies.set(DASH_SKIN_COOKIE, "v6", { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  return response;
}
