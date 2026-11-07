import { NextResponse } from "next/server";
import { DASH_SKIN_COOKIE } from "../../theme";

/* Návrat na pôvodný dizajn dashboardu (Nastavenia → "Pôvodný dizajn").
   Relatívny Location z rovnakého dôvodu ako v ../route.ts (LAN IP v dev). */
export function GET() {
  const response = new NextResponse(null, { status: 307, headers: { Location: "/dashboard/nastavenia" } });
  response.cookies.delete(DASH_SKIN_COOKIE);
  return response;
}
